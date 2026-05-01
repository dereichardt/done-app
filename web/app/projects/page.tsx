import { ProjectsPageContent } from "@/components/projects-page-content";
import { loadActiveWorkSessionIndicator } from "@/lib/actions/integration-tasks";
import { loadProjectListSummariesById } from "@/lib/load-project-list-summaries";
import { createClient } from "@/lib/supabase/server";
import { loadUserPreferences } from "@/lib/actions/user-preferences";
import { todayISO } from "@/lib/project-phase-status";

export default async function ProjectsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const prefsRes = await loadUserPreferences();
  const userTodayIso = todayISO(prefsRes.preferences.timezone);

  const { data: projects } = await supabase
    .from("projects")
    .select(
      `
      id,
      customer_name,
      created_at,
      completed_at,
      active_dashboard_order,
      project_types ( name ),
      project_roles ( name )
    `,
    )
    .eq("owner_id", user.id)
    .order("active_dashboard_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  const rows = projects ?? [];
  const activeProjects = rows.filter((p) => p.completed_at == null);
  const completedProjects = rows
    .filter((p) => p.completed_at != null)
    .sort((a, b) => {
      const ta = a.completed_at ? new Date(a.completed_at).getTime() : 0;
      const tb = b.completed_at ? new Date(b.completed_at).getTime() : 0;
      return tb - ta;
    });

  const activeIndicatorRes = await loadActiveWorkSessionIndicator();
  const activeSessionIndicatorForProjectsList =
    activeIndicatorRes.indicator?.scope === "integration" ? activeIndicatorRes.indicator : null;

  const mapProjectRow = (p: (typeof rows)[number]) => ({
    id: p.id,
    customer_name: p.customer_name,
    completed_at: p.completed_at ?? null,
    project_types: p.project_types,
    project_roles: p.project_roles,
  });

  const projectIds = rows.map((p) => p.id);
  const summaryByProjectId = await loadProjectListSummariesById(supabase, projectIds, userTodayIso);

  return (
    <div>
      <h1 className="heading-page">Projects</h1>

      <ProjectsPageContent
        activeProjects={activeProjects.map(mapProjectRow)}
        completedProjects={completedProjects.map(mapProjectRow)}
        summaryByProjectId={summaryByProjectId}
        initialActiveSessionIndicator={activeSessionIndicatorForProjectsList}
      />
    </div>
  );
}
