import { loadUserPreferences } from "@/lib/actions/user-preferences";
import {
  formatDeliveryProgressLabel,
  formatIntegrationDefinitionDisplayName,
  formatIntegrationStateLabel,
} from "@/lib/integration-metadata";
import { loadProjectActivity, type ActivityEvent } from "@/lib/project-activity";
import {
  formatPhaseDate,
  formatPhaseDaysRemainingLabel,
  resolvePhaseStatus,
  todayISO,
  type PhaseForStatus,
} from "@/lib/project-phase-status";
import { createClient } from "@/lib/supabase/server";

const MAX_PROJECTS = 18;
const ACTIVITY_SINCE_DAYS = 7;
const LIMIT_PER_SOURCE = 25;
const MAX_OPEN_TASKS_TOTAL = 450;
const MAX_OPEN_TASKS_PER_PROJECT = 36;

type TaskRow = {
  id: string;
  title: string;
  due_date: string | null;
  status: string;
  priority: string | null;
  project_track_id: string;
  project_tracks: {
    project_id: string;
    project_integration_id: string | null;
    kind: string;
    name: string;
  };
};

function formatEventLine(e: ActivityEvent): string {
  const who = e.entity ? `${e.summary} — ${e.entity}` : e.summary;
  const tail = e.secondary ? ` (${e.secondary})` : "";
  return `${e.occurredAt}\t${e.kind}\t${who}${tail}`;
}

function addCalendarDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return ymd;
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  return t.toISOString().slice(0, 10);
}

type IntegMeta = {
  integration_code: string | null;
  integrating_with: string | null;
  name: string | null;
  direction: string | null;
};

function integrationDisplayName(meta: IntegMeta | null): string {
  if (!meta) return "Integration";
  const s = formatIntegrationDefinitionDisplayName({
    integration_code: meta.integration_code,
    integrating_with: meta.integrating_with,
    name: meta.name,
    direction: meta.direction,
  }).trim();
  return s || (meta.name ?? "").trim() || "Integration";
}

function compareTaskDue(a: TaskRow, b: TaskRow): number {
  const ad = a.due_date;
  const bd = b.due_date;
  if (ad == null && bd == null) return 0;
  if (ad == null) return 1;
  if (bd == null) return -1;
  return ad.localeCompare(bd);
}

export type CrossProjectInsightsBundle = {
  contextBlock: string;
  projectCount: number;
  /** True when phases, integrations, tasks, or activity give integration-relevant signal. */
  hasIntegrationSignal: boolean;
};

/**
 * Loads capped cross-project activity plus **phases**, **integration snapshots**, and **open tasks**
 * for Home AI (authorized projects only).
 */
export async function buildCrossProjectInsightsContext(
  ownerId: string,
  now: Date = new Date(),
): Promise<CrossProjectInsightsBundle> {
  const supabase = await createClient();
  const prefsRes = await loadUserPreferences();
  const tz = prefsRes.preferences.timezone;
  const userTodayIso = todayISO(tz);
  const userTomorrowIso = addCalendarDaysYmd(userTodayIso, 1);

  const { data: projects, error: projErr } = await supabase
    .from("projects")
    .select("id, customer_name")
    .eq("owner_id", ownerId)
    .is("completed_at", null)
    .order("active_dashboard_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(MAX_PROJECTS);

  if (projErr || !projects?.length) {
    return {
      contextBlock:
        "**Cross-project data**\nNo active projects were found for this account in the authorized scope.",
      projectCount: 0,
      hasIntegrationSignal: false,
    };
  }

  const projectIds = projects.map((p) => p.id);

  const [{ data: allPhases }, { data: allPi }, { data: allTracks }] = await Promise.all([
    supabase
      .from("project_phases")
      .select("project_id, name, sort_order, start_date, end_date, phase_key")
      .in("project_id", projectIds)
      .order("sort_order"),
    supabase
      .from("project_integrations")
      .select(
        `
      id,
      project_id,
      delivery_progress,
      integration_state,
      integrations (
        integration_code,
        integrating_with,
        name,
        direction
      )
    `,
      )
      .in("project_id", projectIds)
      .order("created_at", { ascending: true }),
    supabase
      .from("project_tracks")
      .select("id, project_id, kind, name, project_integration_id")
      .in("project_id", projectIds),
  ]);

  const trackIds = (allTracks ?? []).map((t) => t.id as string);

  let rawTasks: TaskRow[] = [];
  if (trackIds.length > 0) {
    const { data, error } = await supabase
      .from("integration_tasks")
      .select(
        `
        id,
        title,
        due_date,
        status,
        priority,
        project_track_id,
        project_tracks!inner (
          project_id,
          project_integration_id,
          kind,
          name
        )
      `,
      )
      .in("project_track_id", trackIds)
      .neq("status", "done")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(MAX_OPEN_TASKS_TOTAL);
    if (error) {
      console.error("[home-insights] open tasks load failed", error);
    } else {
      rawTasks = (data ?? []) as unknown as TaskRow[];
    }
  }

  const phasesByProject = new Map<string, PhaseForStatus[]>();
  for (const row of allPhases ?? []) {
    const pid = row.project_id as string;
    const list = phasesByProject.get(pid) ?? [];
    list.push({
      name: row.name as string,
      sort_order: Number(row.sort_order ?? 0),
      start_date: (row.start_date as string | null) ?? null,
      end_date: (row.end_date as string | null) ?? null,
    });
    phasesByProject.set(pid, list);
  }

  const displayNameByPiId = new Map<string, string>();
  for (const row of allPi ?? []) {
    const meta = row.integrations as unknown as IntegMeta | null;
    displayNameByPiId.set(row.id as string, integrationDisplayName(meta));
  }

  const tasksByProject = new Map<string, TaskRow[]>();
  for (const task of rawTasks) {
    const tr = task.project_tracks;
    if (!tr?.project_id) continue;
    const pid = tr.project_id;
    const arr = tasksByProject.get(pid) ?? [];
    arr.push(task);
    tasksByProject.set(pid, arr);
  }
  for (const [pid, arr] of tasksByProject) {
    arr.sort(compareTaskDue);
    tasksByProject.set(pid, arr.slice(0, MAX_OPEN_TASKS_PER_PROJECT));
  }

  const since = new Date(now.getTime() - ACTIVITY_SINCE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const until = now.toISOString();

  const blocks: string[] = [];
  let hasIntegrationSignal = false;

  if ((allPi ?? []).length > 0) hasIntegrationSignal = true;

  for (const p of projects) {
    const name = ((p.customer_name ?? "").trim() || "Untitled project");
    const pid = p.id;

    const phases = phasesByProject.get(pid) ?? [];
    if (phases.length) hasIntegrationSignal = true;

    const phaseLines =
      phases.length === 0
        ? "_No phases configured._"
        : phases
            .map((ph) => {
              const start = ph.start_date ? formatPhaseDate(ph.start_date) : "—";
              const end = ph.end_date ? formatPhaseDate(ph.end_date) : "—";
              return `- ${ph.name} (sort ${ph.sort_order}): ${start} → ${end}`;
            })
            .join("\n");

    const phaseStatus = resolvePhaseStatus(phases, userTodayIso);
    let phaseSummary = "";
    if (phaseStatus.kind === "active") {
      phaseSummary = `**Current phase (as of ${userTodayIso}):** ${phaseStatus.name} — ends ${formatPhaseDate(phaseStatus.endDate)} (${formatPhaseDaysRemainingLabel(phaseStatus.daysRemaining)}).`;
    } else if (phaseStatus.kind === "upcoming") {
      phaseSummary = `**Next phase window:** ${phaseStatus.name} — ends ${formatPhaseDate(phaseStatus.endDate)} (${formatPhaseDaysRemainingLabel(phaseStatus.daysUntilEnd)} until end).`;
    } else if (phaseStatus.kind === "complete") {
      phaseSummary = `**Timeline:** last recorded phase ended ${formatPhaseDate(phaseStatus.endedDate)} (${phaseStatus.name}).`;
    } else if (phaseStatus.kind === "empty") {
      phaseSummary = "**Timeline:** no phases on this project.";
    } else {
      phaseSummary = "**Timeline:** phase dates are incomplete or unset for clear status.";
    }

    const piForProject = (allPi ?? []).filter((r) => (r.project_id as string) === pid);
    const integrationLines =
      piForProject.length === 0
        ? "_No integrations linked._"
        : piForProject
            .map((row) => {
              const label = displayNameByPiId.get(row.id as string) ?? "Integration";
              const prog = formatDeliveryProgressLabel(String(row.delivery_progress ?? ""));
              const st = formatIntegrationStateLabel(row.integration_state as string | null);
              return `- **${label}** — delivery: ${prog}; state: ${st}`;
            })
            .join("\n");

    const projTasks = tasksByProject.get(pid) ?? [];
    if (projTasks.some((t) => t.project_tracks?.kind === "integration")) hasIntegrationSignal = true;

    const taskLines =
      projTasks.length === 0
        ? "_No open tasks on project tracks._"
        : projTasks
            .map((t) => {
              const tr = t.project_tracks;
              const due = t.due_date ?? "(no due date)";
              const pr = (t.priority ?? "").trim() || "—";
              let bucket: string;
              if (tr.kind === "project_management") {
                bucket = `PM: ${(tr.name ?? "").trim() || "Project Management"}`;
              } else if (tr.project_integration_id) {
                bucket = displayNameByPiId.get(tr.project_integration_id) ?? "Integration";
              } else {
                bucket = "Integration";
              }
              return `- due **${due}** · priority ${pr} · ${bucket} · ${t.title}`;
            })
            .join("\n");

    const events = await loadProjectActivity(pid, {
      limitPerSource: LIMIT_PER_SOURCE,
      since,
      until,
    });

    const lines = events
      .filter((e) => e.kind !== "task_created")
      .map(formatEventLine)
      .slice(0, 200);

    for (const e of events) {
      if (e.integrationName && e.kind !== "task_created") {
        hasIntegrationSignal = true;
        break;
      }
    }

    const activitySection =
      lines.length > 0
        ? lines.join("\n")
        : `_No qualifying activity events in the last ${String(ACTIVITY_SINCE_DAYS)} days._`;

    blocks.push(
      `### Project: ${name} (id: ${pid})\n` +
        `#### Timeline (phases)\n${phaseLines}\n${phaseSummary}\n\n` +
        `#### Integrations (current snapshot)\n${integrationLines}\n\n` +
        `#### Open tasks (not done; due_date is calendar YYYY-MM-DD)\n${taskLines}\n\n` +
        `#### Recent activity (${ACTIVITY_SINCE_DAYS}d, capped)\n${activitySection}`,
    );
  }

  const tzLabel = tz ?? "UTC (no saved preference; comparisons use stored calendar dates)";
  const contextBlock =
    `**Cross-project workspace context**\n` +
    `- **Today (user calendar):** ${userTodayIso}\n` +
    `- **Tomorrow:** ${userTomorrowIso}\n` +
    `- **Timezone note:** ${tzLabel}. Task \`due_date\` values are plain calendar dates from the database (not timestamps).\n` +
    `- **Activity window:** last ${ACTIVITY_SINCE_DAYS} days through server as-of ${until}.\n\n` +
    `Use **Timeline**, **Integrations**, and **Open tasks** together when the user asks what needs attention, what is due soon (including **tomorrow**), or how delivery lines up with phases. ` +
    `Only cite tasks and phases that appear below. If tasks lack due dates, say that limits due-specific answers.\n\n` +
    blocks.join("\n\n---\n\n");

  return {
    contextBlock,
    projectCount: projects.length,
    hasIntegrationSignal,
  };
}

export const HOME_INSIGHTS_SYSTEM_PROMPT = `You are an assistant for a consultant-style project manager tracking Workday integration delivery across **multiple client projects** in one workspace.

You answer from the injected **Cross-project workspace context** (phases, integration snapshots, open tasks with due dates, and a short activity window) plus the **user messages** in this chat. Never invent clients, dates, integrations, tasks, or outcomes that are not grounded in that context. If data is missing (e.g. no due dates, no phases), say so plainly — do not fabricate.

**Relative dates:** When the user asks about "tomorrow", "this week", or similar, use the **Today** and **Tomorrow** calendar lines in the context header together with each task's \`due_date\` and phase start/end dates. Compare calendar strings (YYYY-MM-DD) on the same basis as the app.

**Insights-only policy (strict):** You do **not** perform or propose concrete write operations (no creating tasks, projects, integrations, or updates; no API or database actions). You may describe what the data suggests and where in the app the user might act, but never claim you executed a change.

Tone: concise, neutral, specific. Prefer short paragraphs or tight bullet lists. When comparing projects or integrations, use the exact names from the context.

Formatting: Markdown is allowed (**bold**, lists); do not use # headings. No HTML, no fenced code blocks.`;
