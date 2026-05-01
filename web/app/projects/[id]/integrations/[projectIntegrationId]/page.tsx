import { ensureDefaultLookups } from "@/lib/actions/ensure-lookups";
import { createClient } from "@/lib/supabase/server";
import { buildFunctionalAreaLookupData } from "@/lib/functional-area-grouping";
import { todayISO } from "@/lib/project-phase-status";
import { loadUserPreferences } from "@/lib/actions/user-preferences";
import {
  buildIntegrationTypeSelectOptions,
  formatIntegrationDefinitionDisplayName,
} from "@/lib/integration-metadata";
import { notFound } from "next/navigation";
import type { IntegrationLookupOptions } from "../../integration-definition-fields";
import {
  IntegrationTasksPanel,
  type IntegrationTaskRow,
  type IntegrationTaskWorkSessionRow,
} from "@/components/integration-tasks-panel";
import {
  loadGlobalActiveIntegrationTaskFinishContext,
  type ActiveWorkSessionDTO,
} from "@/lib/actions/integration-tasks";
import {
  type IntegrationUpdateRow,
} from "./integration-updates-panel";
import { IntegrationEffortSection } from "@/components/integration-effort-section";
import type { EffortSessionInput } from "@/lib/integration-effort-buckets";
import { ProjectIntegrationDetailHeader } from "./project-integration-detail-header";
import { IntegrationStatusAndProgressSection } from "./integration-status-and-progress-section";
import type { DeliveryProgressTransitionRow } from "./integration-status-and-progress-section";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string; projectIntegrationId: string }> };

function lookupName(row: unknown): string | null {
  if (row && typeof row === "object" && "name" in row && typeof (row as { name: unknown }).name === "string") {
    return (row as { name: string }).name;
  }
  return null;
}

export default async function ProjectIntegrationDetailPage({ params }: PageProps) {
  const { id: projectId, projectIntegrationId } = await params;
  await ensureDefaultLookups();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const prefsRes = await loadUserPreferences();
  const userTodayIso = todayISO(prefsRes.preferences.timezone);

  const { data: project } = await supabase
    .from("projects")
    .select("id, customer_name")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!project) notFound();

  const { data: row, error: rowError } = await supabase
    .from("project_integrations")
    .select("id, delivery_progress, integration_state, integration_state_reason, integration_id, estimated_effort_hours")
    .eq("id", projectIntegrationId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (rowError || !row) notFound();

  const { data: integrationTrack } = await supabase
    .from("project_tracks")
    .select("id")
    .eq("project_integration_id", projectIntegrationId)
    .eq("kind", "integration")
    .maybeSingle();
  if (!integrationTrack) notFound();

  const { data: integObj, error: integError } = await supabase
    .from("integrations")
    .select(
      `
      id,
      name,
      integration_code,
      internal_time_code,
      integrating_with,
      direction,
      catalog_visibility,
      integration_type_id,
      functional_area_id,
      domain_id,
      integration_types ( name ),
      functional_areas ( name ),
      integration_domains ( name )
    `,
    )
    .eq("id", row.integration_id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (integError || !integObj) notFound();

  const [
    { data: integrationTypes },
    { data: functionalAreas },
    { data: integrationDomains },
    { data: taskRows },
    { data: updateRows },
    { data: deliveryProgressTransitionRows },
  ] = await Promise.all([
    supabase
      .from("integration_types")
      .select("id, name")
      .eq("owner_id", user.id)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("functional_areas")
      .select("id, name, domain_id, is_active")
      .eq("owner_id", user.id)
      .order("sort_order"),
    supabase
      .from("integration_domains")
      .select("id, name, is_active")
      .eq("owner_id", user.id)
      .order("sort_order"),
    supabase
      .from("integration_tasks")
      .select("id, title, due_date, status, priority, completed_at")
      .eq("project_track_id", integrationTrack.id)
      .order("sort_order")
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("integration_updates")
      .select("id, body, created_at, updated_at")
      .eq("project_integration_id", projectIntegrationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("delivery_progress_transitions")
      .select("id, from_delivery_progress, to_delivery_progress, created_at")
      .eq("project_integration_id", projectIntegrationId)
      .order("created_at", { ascending: true }),
  ]);

  const faLookup = buildFunctionalAreaLookupData(functionalAreas ?? [], integrationDomains ?? []);

  const lookups: IntegrationLookupOptions = {
    integrationTypes: buildIntegrationTypeSelectOptions(integrationTypes ?? []),
    functionalAreas: faLookup.functionalAreas,
    functionalAreasByDomain: faLookup.functionalAreasByDomain,
    functionalAreaGroups: faLookup.functionalAreaGroups,
    areaDomainCodeById: faLookup.areaDomainCodeById,
    domains: faLookup.domains,
  };

  const tasks: IntegrationTaskRow[] = (taskRows ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    due_date: t.due_date,
    status: t.status,
    priority: t.priority,
    completed_at: t.completed_at ?? null,
  }));

  const taskIds = tasks.map((t) => t.id);
  let workSessionRows: IntegrationTaskWorkSessionRow[] = [];
  if (taskIds.length > 0) {
    const { data } = await supabase
      .from("integration_task_work_sessions")
      .select("id, integration_task_id, started_at, finished_at, duration_hours, work_accomplished")
      .in("integration_task_id", taskIds)
      .order("started_at", { ascending: false });
    workSessionRows = (data ?? []).map((row) => ({
      id: row.id,
      integration_task_id: row.integration_task_id,
      started_at: row.started_at,
      finished_at: row.finished_at,
      duration_hours: Number(row.duration_hours),
      work_accomplished: row.work_accomplished,
    }));
  }

  const manualRowsRes = await supabase
    .from("integration_manual_effort_entries")
    .select("id, entry_type, title, started_at, finished_at, duration_hours, work_accomplished")
    .eq("project_track_id", integrationTrack.id)
    .order("started_at", { ascending: false });
  const manualRows =
    ((manualRowsRes.error?.message ?? "").toLowerCase().includes("project_track_id") &&
      (((manualRowsRes.error?.message ?? "").toLowerCase().includes("could not find") ||
        (manualRowsRes.error?.message ?? "").toLowerCase().includes("does not exist") ||
        manualRowsRes.error?.code === "42703")))
      ? (
          await supabase
            .from("integration_manual_effort_entries")
            .select("id, entry_type, title, started_at, finished_at, duration_hours, work_accomplished")
            .eq("project_integration_id", projectIntegrationId)
            .order("started_at", { ascending: false })
        ).data
      : manualRowsRes.data;

  const workSessionsByTaskId: Record<string, IntegrationTaskWorkSessionRow[]> = {};
  for (const row of workSessionRows) {
    if (!workSessionsByTaskId[row.integration_task_id]) {
      workSessionsByTaskId[row.integration_task_id] = [];
    }
    workSessionsByTaskId[row.integration_task_id].push(row);
  }

  const taskTitleById = Object.fromEntries(tasks.map((t) => [t.id, t.title]));
  const taskEffortSessions: EffortSessionInput[] = workSessionRows
    .filter((w) => w.finished_at != null)
    .map((w) => ({
      source: "task_work_session",
      source_id: w.id,
      started_at: w.started_at,
      finished_at: w.finished_at as string,
      duration_hours: w.duration_hours,
      integration_task_id: w.integration_task_id,
      title: taskTitleById[w.integration_task_id]?.trim() || "Task",
      work_accomplished: w.work_accomplished ?? null,
    }));

  const manualEffortSessions: EffortSessionInput[] = (manualRows ?? []).map((m) => ({
    source: "manual",
    source_id: m.id,
    entry_type: m.entry_type === "meeting" ? "meeting" : "task",
    started_at: m.started_at,
    finished_at: m.finished_at,
    duration_hours: Number(m.duration_hours),
    integration_task_id: null,
    title: String(m.title ?? "").trim() || (m.entry_type === "meeting" ? "Meeting" : "Task"),
    work_accomplished: m.work_accomplished ?? null,
  }));

  const effortSessions: EffortSessionInput[] = [...taskEffortSessions, ...manualEffortSessions];

  const estimatedEffortHours =
    row.estimated_effort_hours != null && row.estimated_effort_hours !== ""
      ? Number(row.estimated_effort_hours)
      : null;
  const estimatedEffortHoursNorm =
    estimatedEffortHours != null && Number.isFinite(estimatedEffortHours) ? estimatedEffortHours : null;

  const { data: globalActiveRow } = await supabase
    .from("integration_task_active_work_sessions")
    .select("integration_task_id, started_at, paused_ms_accumulated, pause_started_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const taskIdSet = new Set(taskIds);
  let activeWorkSession: ActiveWorkSessionDTO | null = null;
  const globalActiveWorkSession: ActiveWorkSessionDTO | null = globalActiveRow
    ? {
        scope: "integration",
        task_id: globalActiveRow.integration_task_id,
        started_at: globalActiveRow.started_at,
        paused_ms_accumulated: Number(globalActiveRow.paused_ms_accumulated ?? 0),
        pause_started_at: globalActiveRow.pause_started_at,
      }
    : null;

  let globalActiveWorkSessionTaskTitle: string | null = null;
  let globalActiveWorkSessionIntegrationLabel: string | null = null;
  let globalActiveWorkSessionProjectName: string | null = null;
  if (globalActiveRow?.integration_task_id) {
    const ctx = await loadGlobalActiveIntegrationTaskFinishContext(globalActiveRow.integration_task_id);
    if (ctx) {
      globalActiveWorkSessionTaskTitle = ctx.title || null;
      globalActiveWorkSessionIntegrationLabel = ctx.integrationLabel || null;
      globalActiveWorkSessionProjectName = ctx.projectName || null;
    }
  }

  if (globalActiveWorkSession && taskIdSet.has(globalActiveWorkSession.task_id)) {
    activeWorkSession = globalActiveWorkSession;
  }

  const updates: IntegrationUpdateRow[] = (updateRows ?? []).map((u) => ({
    id: u.id,
    body: u.body,
    created_at: u.created_at,
    updated_at: u.updated_at,
  }));
  const deliveryProgressTransitions: DeliveryProgressTransitionRow[] = (deliveryProgressTransitionRows ?? []).map((row) => ({
    id: row.id,
    from_delivery_progress: row.from_delivery_progress,
    to_delivery_progress: row.to_delivery_progress,
    created_at: row.created_at,
  }));

  const integrationDisplayTitle =
    formatIntegrationDefinitionDisplayName({
      integration_code: integObj.integration_code,
      integrating_with: integObj.integrating_with,
      name: integObj.name,
      direction: integObj.direction,
    }) || integObj.name;

  const typeLabel = lookupName(integObj.integration_types);
  const functionalAreaLabel = lookupName(integObj.functional_areas);
  const domainLabel = lookupName(integObj.integration_domains);

  return (
    <div className="pb-72">
      <ProjectIntegrationDetailHeader
        projectId={projectId}
        projectIntegrationId={projectIntegrationId}
        projectCustomerName={project.customer_name}
        integrationDisplayTitle={integrationDisplayTitle}
        typeLabel={typeLabel}
        functionalAreaLabel={functionalAreaLabel}
        domainLabel={domainLabel}
        integrationId={integObj.id}
        lookups={lookups}
        integrationDefaults={{
          name: integObj.name,
          integration_code: integObj.integration_code,
          internal_time_code:
            integObj.internal_time_code != null && typeof integObj.internal_time_code === "string"
              ? integObj.internal_time_code
              : null,
          integrating_with: integObj.integrating_with,
          direction: integObj.direction,
          integration_type_id: integObj.integration_type_id,
          functional_area_id: integObj.functional_area_id,
          domain_id: integObj.domain_id,
        }}
        catalogVisibility={integObj.catalog_visibility}
        initialIntegrationState={row.integration_state}
        initialIntegrationStateReason={row.integration_state_reason}
      />

      <IntegrationStatusAndProgressSection
        projectIntegrationId={projectIntegrationId}
        deliveryProgress={row.delivery_progress}
        integrationState={row.integration_state}
        integrationStateReason={row.integration_state_reason}
        deliveryProgressTransitions={deliveryProgressTransitions}
        projectLabel={project.customer_name ?? ""}
        integrationDisplayTitle={integrationDisplayTitle}
        updates={updates}
      />

      <section className="mt-8">
        <div className="flex flex-col gap-2">
          <h2 className="section-heading">Tasks</h2>
          <div className="h-[min(40rem,65vh)] max-h-[85vh] min-h-0 shrink-0">
            <IntegrationTasksPanel
              className="h-full min-h-0"
              projectIntegrationId={projectIntegrationId}
              projectTrackId={integrationTrack.id}
              tasks={tasks}
              workSessionsByTaskId={workSessionsByTaskId}
              activeWorkSession={activeWorkSession}
              globalActiveWorkSession={globalActiveWorkSession}
              globalActiveWorkSessionTaskTitle={globalActiveWorkSessionTaskTitle}
              globalActiveWorkSessionIntegrationLabel={globalActiveWorkSessionIntegrationLabel}
              globalActiveWorkSessionProjectName={globalActiveWorkSessionProjectName}
              finishSessionIntegrationLabel={integrationDisplayTitle}
              finishSessionProjectLabel={project.customer_name ?? ""}
              todayIso={userTodayIso}
            />
          </div>
        </div>
      </section>

      <section className="mt-8 mb-12">
        <div className="flex flex-col gap-2">
          <h2 className="section-heading">Effort</h2>
          <div className="max-h-[85vh] min-h-[min(28rem,55vh)] shrink-0">
            <IntegrationEffortSection
              className="h-full min-h-0 overflow-y-auto"
              effortTarget={{
                kind: "project_integration",
                projectIntegrationId,
                projectLabel: project.customer_name ?? "",
                integrationLabel: integrationDisplayTitle,
              }}
              initialEstimatedEffortHours={estimatedEffortHoursNorm}
              sessions={effortSessions}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
