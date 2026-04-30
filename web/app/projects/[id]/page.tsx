import { ProjectIntegrationsSection } from "@/components/project-integrations-section";
import { loadActiveWorkSessionIndicator } from "@/lib/actions/integration-tasks";
import {
  fetchProjectTrackTaskSnapshot,
  type ActiveWorkSessionDTO,
} from "@/lib/actions/integration-tasks";
import {
  IntegrationTasksPanel,
  type IntegrationTaskRow,
  type IntegrationTaskWorkSessionRow,
} from "@/components/integration-tasks-panel";
import { createClient } from "@/lib/supabase/server";
import { serializeProjectIntegrationRow } from "@/lib/project-integration-row";
import { resolvePhaseStatus, todayISO } from "@/lib/project-phase-status";
import { loadProjectActivity } from "@/lib/project-activity";
import { notFound } from "next/navigation";
import { ProjectDetailHeader } from "./project-detail-header";
import { ProjectQuickActionsBar } from "./project-quick-actions-bar";
import { ProjectSummaryStrip } from "./project-summary-strip";
import { ProjectTimeline } from "./project-timeline";
import { ProjectActivityFeed } from "./project-activity-feed";
import { normalizeProjectColorKey, type ProjectColorKey } from "@/lib/project-colors";
import { loadUserPreferences } from "@/lib/actions/user-preferences";

type PageProps = { params: Promise<{ id: string }> };

export default async function ProjectDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const prefsRes = await loadUserPreferences();
  const userTodayIso = todayISO(prefsRes.preferences.timezone);

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select(
      `
      id,
      customer_name,
      completed_at,
      project_type_id,
      primary_role_id,
      project_color_key,
      project_types ( name ),
      project_roles ( name )
    `,
    )
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (projectError || !project) notFound();

  const [{ data: projectTypes }, { data: projectRoles }] = await Promise.all([
    supabase
      .from("project_types")
      .select("id, name")
      .eq("owner_id", user.id)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("project_roles")
      .select("id, name")
      .eq("owner_id", user.id)
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  const { data: phases } = await supabase
    .from("project_phases")
    .select("id, name, sort_order, start_date, end_date")
    .eq("project_id", id)
    .order("sort_order");

  const { data: projectIntegrationRows } = await supabase
    .from("project_integrations")
    .select(
      `
      id,
      delivery_progress,
      integration_state,
      integration_id,
      integrations (
        id,
        name,
        integration_code,
        integrating_with,
        direction,
        catalog_visibility,
        integration_types ( name ),
        functional_areas ( name ),
        integration_domains ( name )
      )
    `,
    )
    .eq("project_id", id)
    .order("created_at", { ascending: true });

  const { data: pmTrack } = await supabase
    .from("project_tracks")
    .select("id, name")
    .eq("project_id", id)
    .eq("kind", "project_management")
    .maybeSingle();

  const piIds = (projectIntegrationRows ?? []).map((r) => r.id);

  const [{ data: latestUpdates }, { data: integrationTracks }] = await Promise.all([
    piIds.length === 0
      ? Promise.resolve({
          data: null as { project_integration_id: string; body: string; created_at: string }[] | null,
        })
      : supabase
          .from("integration_latest_updates")
          .select("project_integration_id, body, created_at")
          .in("project_integration_id", piIds),
    piIds.length === 0
      ? Promise.resolve({ data: null as { id: string; project_integration_id: string | null }[] | null })
      : supabase
          .from("project_tracks")
          .select("id, project_integration_id")
          .eq("kind", "integration")
          .in("project_integration_id", piIds),
  ]);

  const trackIds = (integrationTracks ?? []).map((row) => row.id);
  const { data: openTasks } =
    trackIds.length === 0
      ? { data: null as { project_track_id: string }[] | null }
      : await supabase
          .from("integration_tasks")
          .select("project_track_id")
          .eq("status", "open")
          .in("project_track_id", trackIds);

  const projectIntegrationIdByTrackId = new Map<string, string>();
  for (const track of integrationTracks ?? []) {
    if (track.project_integration_id) {
      projectIntegrationIdByTrackId.set(track.id, track.project_integration_id);
    }
  }

  const latestById = new Map<string, { body: string; created_at: string }>();
  for (const row of latestUpdates ?? []) {
    if (row.project_integration_id) {
      latestById.set(row.project_integration_id, {
        body: row.body ?? "",
        created_at: row.created_at ?? "",
      });
    }
  }

  const openTaskCountById = new Map<string, number>();
  for (const t of openTasks ?? []) {
    const pid = projectIntegrationIdByTrackId.get(t.project_track_id);
    if (!pid) continue;
    openTaskCountById.set(pid, (openTaskCountById.get(pid) ?? 0) + 1);
  }

  const typeName =
    project.project_types && typeof project.project_types === "object" && "name" in project.project_types
      ? (project.project_types as { name: string }).name
      : null;
  const roleName =
    project.project_roles && typeof project.project_roles === "object" && "name" in project.project_roles
      ? (project.project_roles as { name: string }).name
      : null;

  const projectColorKey: ProjectColorKey | null = normalizeProjectColorKey(project.project_color_key);

  const phaseStatus = resolvePhaseStatus(
    (phases ?? []).map((p) => ({
      name: p.name,
      sort_order: p.sort_order,
      start_date: p.start_date,
      end_date: p.end_date,
    })),
    userTodayIso,
  );

  const integrationRowsSerialized = (projectIntegrationRows ?? []).map((row) => {
    const base = serializeProjectIntegrationRow(row);
    const latest = latestById.get(row.id);
    return {
      ...base,
      latestUpdateBody: latest != null ? latest.body : null,
      latestUpdateCreatedAt:
        latest != null && latest.created_at.length > 0 ? latest.created_at : null,
      openTaskCount: openTaskCountById.get(row.id) ?? 0,
    };
  });

  const [activeIndicatorRes, initialActivity, pmSnapshotRes] = await Promise.all([
    loadActiveWorkSessionIndicator(),
    loadProjectActivity(id, { limitPerSource: 50 }),
    pmTrack ? fetchProjectTrackTaskSnapshot(pmTrack.id) : Promise.resolve({ snapshot: undefined, error: undefined }),
  ]);
  const initialActiveSessionIndicator =
    activeIndicatorRes.indicator != null && activeIndicatorRes.indicator.project_id === id
      ? activeIndicatorRes.indicator
      : null;
  const pmSnapshot = pmSnapshotRes.snapshot;
  const pmTrackLabel = (pmTrack?.name ?? "").trim() || "Project Management";

  return (
    <div>
      <ProjectDetailHeader
        projectId={id}
        customerName={project.customer_name}
        completedAt={project.completed_at ?? null}
        typeLabel={typeName}
        roleLabel={roleName}
        initialProjectTypeId={project.project_type_id}
        initialPrimaryRoleId={project.primary_role_id}
        initialProjectColorKey={projectColorKey}
        projectTypes={projectTypes ?? []}
        projectRoles={projectRoles ?? []}
      />

      <ProjectQuickActionsBar
        projectId={id}
        projectCustomerName={project.customer_name ?? ""}
        integrationRows={integrationRowsSerialized}
      />

      <ProjectSummaryStrip
        projectId={id}
        customerName={project.customer_name ?? null}
        completedAt={project.completed_at ?? null}
        phaseStatus={phaseStatus}
        integrationRows={integrationRowsSerialized}
      />

      <section className="mt-10">
        <ProjectTimeline
          projectId={id}
          todayIso={userTodayIso}
          initialPhases={(phases ?? []).map((p) => ({
            id: p.id,
            name: p.name,
            start_date: p.start_date,
            end_date: p.end_date,
          }))}
        />
      </section>

      <section className="mt-10">
        <ProjectIntegrationsSection
          key={
            initialActiveSessionIndicator?.integration_task_id ??
            `project-${id}-no-active-session`
          }
          projectId={id}
          rows={integrationRowsSerialized}
          todayIso={userTodayIso}
          projectCustomerName={project.customer_name ?? ""}
          initialActiveSessionIndicator={initialActiveSessionIndicator}
        />
      </section>

      <section className="mt-10">
        <div className="flex flex-col gap-2">
          <h2 className="section-heading">Project Management</h2>
          {pmTrack && pmSnapshot ? (
            <div className="h-[min(40rem,65vh)] max-h-[85vh] min-h-0 shrink-0">
              <IntegrationTasksPanel
                className="h-full min-h-0"
                projectTrackId={pmTrack.id}
                tasks={pmSnapshot.tasks as IntegrationTaskRow[]}
                workSessionsByTaskId={pmSnapshot.workSessionsByTaskId as Record<
                  string,
                  IntegrationTaskWorkSessionRow[]
                >}
                activeWorkSession={pmSnapshot.activeWorkSession as ActiveWorkSessionDTO | null}
                globalActiveWorkSession={pmSnapshot.globalActiveWorkSession as ActiveWorkSessionDTO | null}
                globalActiveWorkSessionTaskTitle={pmSnapshot.globalActiveWorkSessionTaskTitle ?? null}
                globalActiveWorkSessionIntegrationLabel={
                  pmSnapshot.globalActiveWorkSessionIntegrationLabel ?? null
                }
                globalActiveWorkSessionProjectName={pmSnapshot.globalActiveWorkSessionProjectName ?? null}
                finishSessionIntegrationLabel={pmTrackLabel}
                finishSessionProjectLabel={project.customer_name ?? ""}
                todayIso={userTodayIso}
              />
            </div>
          ) : (
            <div className="card-canvas p-4">
              <p
                className="text-sm"
                style={{
                  color: pmSnapshotRes.error ? "var(--app-danger)" : "var(--app-text-muted)",
                }}
              >
                {pmSnapshotRes.error ?? "Project Management track is not available yet."}
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="mt-10">
        <ProjectActivityFeed projectId={id} initialEvents={initialActivity} />
      </section>
    </div>
  );
}
