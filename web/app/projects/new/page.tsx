import { createClient } from "@/lib/supabase/server";
import { CreateProjectForm } from "./create-project-form";

export default async function NewProjectPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

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

  return (
    <div>
      <h1 className="heading-page">New Project</h1>
      <div className="mt-8">
        <CreateProjectForm
          projectTypes={projectTypes ?? []}
          projectRoles={projectRoles ?? []}
        />
      </div>
    </div>
  );
}
