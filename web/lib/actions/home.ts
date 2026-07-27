"use server";

import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { serializeProjectIntegrationRow } from "@/lib/project-integration-row";
import type { SerializedProjectIntegrationRow } from "@/lib/project-integration-row";

export type HomeProjectPickerRow = {
  id: string;
  customer_name: string;
  integration_count: number;
  integrations_enabled: boolean;
};

export async function loadHomeProjectPickerRows(): Promise<HomeProjectPickerRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createClient();

  const { data: projects } = await supabase
    .from("projects")
    .select("id, customer_name, integrations_enabled")
    .eq("owner_id", user.id)
    .is("completed_at", null)
    .order("active_dashboard_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (!projects?.length) return [];

  const ids = projects.map((p) => p.id);
  const { data: counts } = await supabase
    .from("project_integrations")
    .select("project_id, integration_state")
    .in("project_id", ids);

  const countByProject = new Map<string, number>();
  for (const c of counts ?? []) {
    if (c.integration_state === "removed_from_scope") continue;
    countByProject.set(c.project_id, (countByProject.get(c.project_id) ?? 0) + 1);
  }

  return projects.map((p) => ({
    id: p.id,
    customer_name: (p.customer_name ?? "").trim() || "Untitled project",
    integration_count: countByProject.get(p.id) ?? 0,
    integrations_enabled: p.integrations_enabled !== false,
  }));
}

export async function loadHomeProjectIntegrationRows(
  projectId: string,
): Promise<{ rows?: SerializedProjectIntegrationRow[]; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (projectError) return { error: projectError.message };
  if (!project) return { error: "Project not found" };

  const { data: projectIntegrationRows, error: piError } = await supabase
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
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (piError) return { error: piError.message };

  const rows = (projectIntegrationRows ?? []).map((row) => serializeProjectIntegrationRow(row));
  return { rows };
}

export async function loadProjectBriefForOwner(
  projectId: string,
): Promise<{ customer_name?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: project, error } = await supabase
    .from("projects")
    .select("customer_name")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!project) return { error: "Project not found" };

  return { customer_name: (project.customer_name ?? "").trim() || "Untitled project" };
}
