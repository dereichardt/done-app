import { formatIntegrationDefinitionDisplayName } from "@/lib/integration-metadata";
import { createClient } from "@/lib/supabase/server";

export type ActivityEventKind =
  | "lifecycle"
  | "phase"
  | "integration_linked"
  | "integration_state"
  | "update"
  | "task_created"
  | "task_completed"
  | "work_session"
  | "meeting"
  | "manual_task";

export type ActivityEvent = {
  id: string;
  kind: ActivityEventKind;
  occurredAt: string;
  /** Action label — normal weight, e.g. "Integration added" */
  summary: string;
  /** The subject name rendered in medium weight after the summary, e.g. the integration or task name */
  entity: string | null;
  secondary: string | null;
  integrationName: string | null;
  /** Relative path to a project-scoped detail page if there is a linkable entity */
  link: string | null;
};

type LoadOptions = {
  limitPerSource?: number;
  before?: string;
  /**
   * Inclusive lower bound on event `occurredAt`. When provided, time-series
   * tables (updates, work sessions, manual effort) filter at the query level;
   * point-in-time events (lifecycle, phase, integration state) are filtered
   * after normalization.
   */
  since?: string;
  /** Inclusive upper bound on event `occurredAt`. See `since`. */
  until?: string;
};

/** Format decimal hours as "Xh Ym" / "Xh" / "Ym" */
function formatDurationHours(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/**
 * Load project activity events from existing tables, normalized to a flat
 * reverse-chronological list. All queries run in parallel; no migrations required.
 *
 * Ownership: caller is responsible for verifying the user owns the project before
 * calling this function (RLS handles DB-level enforcement too).
 */
export async function loadProjectActivity(
  projectId: string,
  { limitPerSource = 50, before, since, until }: LoadOptions = {},
): Promise<ActivityEvent[]> {
  const supabase = await createClient();

  // Resolve integration name lookup once (all project_integrations for this project)
  const piMetaPromise = supabase
    .from("project_integrations")
    .select(
      `
      id,
      created_at,
      updated_at,
      delivery_progress,
      integration_state,
      integration_state_reason,
      integrations (
        integration_code,
        integrating_with,
        name,
        direction,
        catalog_visibility
      )
    `,
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limitPerSource);

  const projectPromise = supabase
    .from("projects")
    .select("id, created_at, completed_at")
    .eq("id", projectId)
    .maybeSingle();

  const phasesPromise = supabase
    .from("project_phases")
    .select("id, name, created_at, updated_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limitPerSource);

  const [piMetaRes, projectRes, phasesRes] = await Promise.all([
    piMetaPromise,
    projectPromise,
    phasesPromise,
  ]);

  const piRows = piMetaRes.data ?? [];
  const piIds = piRows.map((r) => r.id);

  // Build integration name + catalog flag lookup
  const integrationNameById = new Map<string, string>();
  const integrationFromCatalogById = new Map<string, boolean>();
  for (const r of piRows) {
    const integData = r.integrations as unknown as {
      integration_code: string | null;
      integrating_with: string | null;
      name: string | null;
      direction: string | null;
      catalog_visibility: string | null;
    } | null;
    if (!integData) continue;
    const displayName = formatIntegrationDefinitionDisplayName({
      integration_code: integData.integration_code,
      integrating_with: integData.integrating_with,
      name: integData.name,
      direction: integData.direction,
    });
    integrationNameById.set(r.id, displayName || "integration");
    integrationFromCatalogById.set(r.id, integData.catalog_visibility === "catalog");
  }

  const tracksRes = await supabase
    .from("project_tracks")
    .select("id, kind, name, project_integration_id")
    .eq("project_id", projectId);
  const trackRows = tracksRes.data ?? [];
  const trackCtxById = new Map<
    string,
    { label: string; project_integration_id: string | null; link: string | null }
  >();
  for (const track of trackRows) {
    if (track.kind === "integration" && track.project_integration_id) {
      const label = integrationNameById.get(track.project_integration_id) ?? "integration";
      trackCtxById.set(track.id, {
        label,
        project_integration_id: track.project_integration_id,
        link: `/projects/${projectId}/integrations/${track.project_integration_id}`,
      });
      continue;
    }
    trackCtxById.set(track.id, {
      label: track.name?.trim() || "Project Management",
      project_integration_id: null,
      link: `/projects/${projectId}`,
    });
  }

  const trackIds = trackRows.map((t) => t.id);

  // Fetch tasks first (needed both for events and to get task IDs for work sessions)
  const tasksRes =
    trackIds.length === 0
      ? { data: [] as Array<{ id: string; project_track_id: string; title: string; created_at: string; completed_at: string | null }> }
      : await supabase
          .from("integration_tasks")
          .select("id, project_track_id, title, created_at, completed_at")
          .in("project_track_id", trackIds)
          .order("created_at", { ascending: false })
          .limit(limitPerSource);

  const taskRows = tasksRes.data ?? [];
  const taskIds = taskRows.map((t) => t.id);
  // Build a lookup: taskId → { title, project_track_id }
  const taskById = new Map<string, { title: string; project_track_id: string }>();
  for (const t of taskRows) {
    taskById.set(t.id, { title: t.title, project_track_id: t.project_track_id });
  }

  // Now fetch remaining child tables in parallel
  const updatesQuery =
    piIds.length === 0
      ? Promise.resolve({ data: [] as Array<{ id: string; project_integration_id: string; body: string; created_at: string }> })
      : (() => {
          let q = supabase
            .from("integration_updates")
            .select("id, project_integration_id, body, created_at")
            .in("project_integration_id", piIds);
          if (since) q = q.gte("created_at", since);
          if (until) q = q.lte("created_at", until);
          return q.order("created_at", { ascending: false }).limit(limitPerSource);
        })();

  const workSessionsQuery =
    taskIds.length === 0
      ? Promise.resolve({ data: [] as Array<{ id: string; integration_task_id: string; duration_hours: number; work_accomplished: string | null; finished_at: string }> })
      : (() => {
          let q = supabase
            .from("integration_task_work_sessions")
            .select("id, integration_task_id, duration_hours, work_accomplished, finished_at")
            .in("integration_task_id", taskIds);
          if (since) q = q.gte("finished_at", since);
          if (until) q = q.lte("finished_at", until);
          return q.order("finished_at", { ascending: false }).limit(limitPerSource);
        })();

  const manualEffortQuery =
    trackIds.length === 0
      ? Promise.resolve({ data: [] as Array<{ id: string; project_track_id: string; entry_type: string; title: string; started_at: string; duration_hours: number; work_accomplished: string | null }> })
      : (() => {
          let q = supabase
            .from("integration_manual_effort_entries")
            .select("id, project_track_id, entry_type, title, started_at, duration_hours, work_accomplished")
            .in("project_track_id", trackIds);
          if (since) q = q.gte("started_at", since);
          if (until) q = q.lte("started_at", until);
          return q.order("started_at", { ascending: false }).limit(limitPerSource);
        })();

  const [updatesRes, workSessionsRes, manualEffortRes] = await Promise.all([
    updatesQuery,
    workSessionsQuery,
    manualEffortQuery,
  ]);
  let manualEffortLegacyMode = false;
  let manualEffortRows:
    | Array<{
        id: string;
        project_track_id: string;
        entry_type: string;
        title: string;
        started_at: string;
        duration_hours: number;
        work_accomplished: string | null;
      }>
    | Array<{
        id: string;
        project_integration_id: string;
        entry_type: string;
        title: string;
        started_at: string;
        duration_hours: number;
        work_accomplished: string | null;
      }> = manualEffortRes.data ?? [];
  const manualEffortErr =
    "error" in manualEffortRes ? manualEffortRes.error : null;
  if (
    (manualEffortErr?.message ?? "").toLowerCase().includes("project_track_id") &&
    ((manualEffortErr?.message ?? "").toLowerCase().includes("could not find") ||
      (manualEffortErr?.message ?? "").toLowerCase().includes("does not exist") ||
      manualEffortErr?.code === "42703")
  ) {
    manualEffortLegacyMode = true;
    const legacyRes = await supabase
      .from("integration_manual_effort_entries")
      .select("id, project_integration_id, entry_type, title, started_at, duration_hours, work_accomplished")
      .in("project_integration_id", piIds)
      .order("started_at", { ascending: false })
      .limit(limitPerSource);
    manualEffortRows = legacyRes.data ?? [];
  }

  const events: ActivityEvent[] = [];

  // --- Lifecycle ---
  if (projectRes.data) {
    const proj = projectRes.data;
    events.push({
      id: `lifecycle-created-${proj.id}`,
      kind: "lifecycle",
      occurredAt: proj.created_at,
      summary: "Project created",
      entity: null,
      secondary: null,
      integrationName: null,
      link: null,
    });
    if (proj.completed_at) {
      events.push({
        id: `lifecycle-completed-${proj.id}`,
        kind: "lifecycle",
        occurredAt: proj.completed_at,
        summary: "Project marked complete",
        entity: null,
        secondary: null,
        integrationName: null,
        link: null,
      });
    }
  }

  // --- Phases ---
  for (const phase of phasesRes.data ?? []) {
    events.push({
      id: `phase-created-${phase.id}`,
      kind: "phase",
      occurredAt: phase.created_at,
      summary: "Added phase:",
      entity: phase.name,
      secondary: null,
      integrationName: null,
      link: null,
    });
    // Only emit an "updated" event if it was meaningfully changed after creation
    if (phase.updated_at && phase.updated_at !== phase.created_at) {
      events.push({
        id: `phase-updated-${phase.id}`,
        kind: "phase",
        occurredAt: phase.updated_at,
      summary: "Updated phase:",
      entity: phase.name,
        secondary: null,
        integrationName: null,
        link: null,
      });
    }
  }

  // --- Integration added ---
  for (const pi of piRows) {
    const integName = integrationNameById.get(pi.id) ?? "integration";
    const fromCatalog = integrationFromCatalogById.get(pi.id) ?? false;
    events.push({
      id: `pi-linked-${pi.id}`,
      kind: "integration_linked",
      occurredAt: pi.created_at,
      summary: `Integration ${integName} has been assigned.`,
      entity: null,
      secondary: fromCatalog ? "Imported from integration catalog" : null,
      integrationName: integName,
      link: `/projects/${projectId}/integrations/${pi.id}`,
    });
    // Emit a state/progress update event if the integration was updated after it was created
    if (pi.updated_at && pi.updated_at !== pi.created_at) {
      const stateLabel = pi.integration_state
        ? pi.integration_state.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
        : null;
      const progressLabel = pi.delivery_progress
        ? pi.delivery_progress.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
        : null;
      const statusParts = [stateLabel, progressLabel].filter(Boolean).join(" · ");
      events.push({
        id: `pi-updated-${pi.id}`,
        kind: "integration_state",
        occurredAt: pi.updated_at,
        summary: "Updated",
        entity: integName,
        secondary: statusParts
          ? `Now: ${statusParts}${pi.integration_state_reason ? ` — ${pi.integration_state_reason}` : ""}`
          : pi.integration_state_reason ?? null,
        integrationName: integName,
        link: `/projects/${projectId}/integrations/${pi.id}`,
      });
    }
  }

  // --- Updates posted ---
  for (const u of updatesRes.data ?? []) {
    const integName = integrationNameById.get(u.project_integration_id) ?? "integration";
    events.push({
      id: `update-${u.id}`,
      kind: "update",
      occurredAt: u.created_at,
      summary: "Posted update on",
      entity: integName,
      secondary: u.body.length > 120 ? u.body.slice(0, 120).trimEnd() + "…" : u.body,
      integrationName: integName,
      link: `/projects/${projectId}/integrations/${u.project_integration_id}`,
    });
  }

  // --- Tasks created ---
  for (const t of taskRows) {
    const track = trackCtxById.get(t.project_track_id);
    const label = track?.label ?? "track";
    events.push({
      id: `task-created-${t.id}`,
      kind: "task_created",
      occurredAt: t.created_at,
      summary: "Created task:",
      entity: t.title,
      secondary: `On ${label}`,
      integrationName: track?.project_integration_id ? label : null,
      link: track?.link ?? `/projects/${projectId}`,
    });
  }

  // --- Tasks completed ---
  for (const t of taskRows) {
    if (!t.completed_at) continue;
    const track = trackCtxById.get(t.project_track_id);
    const label = track?.label ?? "track";
    events.push({
      id: `task-completed-${t.id}`,
      kind: "task_completed",
      occurredAt: t.completed_at,
      summary: "Completed task:",
      entity: t.title,
      secondary: `On ${label}`,
      integrationName: track?.project_integration_id ? label : null,
      link: track?.link ?? `/projects/${projectId}`,
    });
  }

  // --- Work sessions ---
  for (const ws of workSessionsRes.data ?? []) {
    const task = taskById.get(ws.integration_task_id);
    const track = task ? trackCtxById.get(task.project_track_id) ?? null : null;
    const piId = track?.project_integration_id ?? null;
    const integName = track?.label ?? null;
    const taskTitle = task?.title ?? null;
    const duration = formatDurationHours(Number(ws.duration_hours));
    events.push({
      id: `work-session-${ws.id}`,
      kind: "work_session",
      occurredAt: ws.finished_at,
      summary: `Worked for ${duration} on:`,
      entity: taskTitle ?? "working session",
      secondary: ws.work_accomplished && ws.work_accomplished.length > 0
        ? ws.work_accomplished.length > 120
          ? ws.work_accomplished.slice(0, 120).trimEnd() + "…"
          : ws.work_accomplished
        : null,
      integrationName: piId ? integName : null,
      link: track?.link ?? null,
    });
  }

  // --- Manual effort entries ---
  for (const me of manualEffortRows) {
    const track =
      manualEffortLegacyMode
        ? Array.from(trackCtxById.values()).find(
            (t) =>
              t.project_integration_id ===
              (me as { project_integration_id: string }).project_integration_id,
          ) ?? null
        : trackCtxById.get((me as { project_track_id: string }).project_track_id) ?? null;
    if (!track) continue;
    const duration = formatDurationHours(Number(me.duration_hours));
    const isMeeting = me.entry_type === "meeting";
    events.push({
      id: `manual-${me.id}`,
      kind: isMeeting ? "meeting" : "manual_task",
      occurredAt: me.started_at,
      summary: isMeeting ? `Met for ${duration}:` : `Worked for ${duration} on`,
      entity: me.title,
      secondary: me.work_accomplished && me.work_accomplished.length > 0
        ? me.work_accomplished.length > 120
          ? me.work_accomplished.slice(0, 120).trimEnd() + "…"
          : me.work_accomplished
        : null,
      integrationName: track.project_integration_id ? track.label : null,
      link: track.link,
    });
  }

  // Sort all events descending by occurredAt, filter by `before` cursor and
  // the optional time window. Time-series sources were already filtered at the
  // query level; this pass catches point-in-time events (lifecycle, phase,
  // integration_linked/state, task_created, task_completed) generated above.
  const sorted = events
    .filter((e) => {
      if (before && !(e.occurredAt < before)) return false;
      if (since && e.occurredAt < since) return false;
      if (until && e.occurredAt > until) return false;
      return true;
    })
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  return sorted;
}
