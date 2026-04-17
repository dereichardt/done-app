import { ProjectIntegrationsSection } from "@/components/project-integrations-section";
import { loadActiveWorkSessionIndicator } from "@/lib/actions/integration-tasks";
import { createClient } from "@/lib/supabase/server";
import { serializeProjectIntegrationRow } from "@/lib/project-integration-row";
import { resolvePhaseStatus, todayISO } from "@/lib/project-phase-status";
import { notFound } from "next/navigation";
import { ProjectDetailHeader } from "./project-detail-header";
import { ProjectSummaryStrip } from "./project-summary-strip";
import { ProjectTimeline } from "./project-timeline";
import { normalizeProjectColorKey, type ProjectColorKey } from "@/lib/project-colors";

type PageProps = { params: Promise<{ id: string }> };

export default async function ProjectDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select(
      `
      id,
      customer_name,
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

  const piIds = (projectIntegrationRows ?? []).map((r) => r.id);

  const [{ data: latestUpdates }, { data: openTasks }] = await Promise.all([
    piIds.length === 0
      ? Promise.resolve({
          data: null as { project_integration_id: string; body: string; created_at: string }[] | null,
        })
      : supabase
          .from("integration_latest_updates")
          .select("project_integration_id, body, created_at")
          .in("project_integration_id", piIds),
    piIds.length === 0
      ? Promise.resolve({ data: null as { project_integration_id: string }[] | null })
      : supabase
          .from("integration_tasks")
          .select("project_integration_id")
          .eq("status", "open")
          .in("project_integration_id", piIds),
  ]);

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
    const pid = t.project_integration_id;
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

  const activeIndicatorRes = await loadActiveWorkSessionIndicator();
  const initialActiveSessionIndicator =
    activeIndicatorRes.indicator != null && activeIndicatorRes.indicator.project_id === id
      ? activeIndicatorRes.indicator
      : null;

  return (
    <div>
      <ProjectDetailHeader
        projectId={id}
        customerName={project.customer_name}
        typeLabel={typeName}
        roleLabel={roleName}
        initialProjectTypeId={project.project_type_id}
        initialPrimaryRoleId={project.primary_role_id}
        initialProjectColorKey={projectColorKey}
        projectTypes={projectTypes ?? []}
        projectRoles={projectRoles ?? []}
      />

      <ProjectSummaryStrip projectId={id} phaseStatus={phaseStatus} integrationRows={integrationRowsSerialized} />

      <section className="mt-10">
        <ProjectTimeline
          projectId={id}
          todayIso={todayISO()}
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
          projectCustomerName={project.customer_name ?? ""}
          initialActiveSessionIndicator={initialActiveSessionIndicator}
        />
      </section>
    </div>
  );
}
