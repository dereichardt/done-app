import { ProjectsPageContent } from "@/components/projects-page-content";
import { loadActiveWorkSessionIndicator } from "@/lib/actions/integration-tasks";
import { loadProjectListSummariesById } from "@/lib/load-project-list-summaries";
import { createClient } from "@/lib/supabase/server";

export default async function ProjectsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: projects } = await supabase
    .from("projects")
    .select(
      `
      id,
      customer_name,
      created_at,
      completed_at,
      project_types ( name ),
      project_roles ( name )
    `,
    )
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  const rows = projects ?? [];
  const activeProjects = rows.filter((p) => p.completed_at == null);
  const completedProjects = [...rows.filter((p) => p.completed_at != null)].sort((a, b) => {
    const ta = a.completed_at ? new Date(a.completed_at).getTime() : 0;
    const tb = b.completed_at ? new Date(b.completed_at).getTime() : 0;
    return tb - ta;
  });

  const activeIndicatorRes = await loadActiveWorkSessionIndicator();

  const mapProjectRow = (p: (typeof rows)[number]) => ({
    id: p.id,
    customer_name: p.customer_name,
    project_types: p.project_types,
    project_roles: p.project_roles,
  });

  const projectIds = rows.map((p) => p.id);
  const summaryByProjectId = await loadProjectListSummariesById(supabase, projectIds);

  return (
    <div>
      <h1 className="heading-page">Projects</h1>

      <ProjectsPageContent
        activeProjects={activeProjects.map(mapProjectRow)}
        completedProjects={completedProjects.map(mapProjectRow)}
        summaryByProjectId={summaryByProjectId}
        initialActiveSessionIndicator={activeIndicatorRes.indicator ?? null}
      />
    </div>
  );
}
