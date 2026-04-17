"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const MAX_BODY = 300;

async function loadOwnedProjectIntegration(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  projectIntegrationId: string,
): Promise<{ id: string; project_id: string } | null> {
  const { data: pi } = await supabase
    .from("project_integrations")
    .select("id, project_id")
    .eq("id", projectIntegrationId)
    .maybeSingle();

  if (!pi) return null;

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", pi.project_id)
    .eq("owner_id", userId)
    .maybeSingle();

  if (!project) return null;
  return pi;
}

async function revalidateIntegrationPaths(projectId: string, projectIntegrationId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/integrations/${projectIntegrationId}`);
}

function parseBody(formData: FormData): { ok: true; body: string } | { ok: false; error: string } {
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { ok: false, error: "Update text is required" };
  if (body.length > MAX_BODY) return { ok: false, error: `Updates are limited to ${MAX_BODY} characters` };
  return { ok: true, body };
}

export async function createIntegrationUpdate(
  projectIntegrationId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const pi = await loadOwnedProjectIntegration(supabase, user.id, projectIntegrationId);
  if (!pi) return { error: "Not found" };

  const parsed = parseBody(formData);
  if (!parsed.ok) return { error: parsed.error };

  const { error } = await supabase.from("integration_updates").insert({
    project_integration_id: projectIntegrationId,
    body: parsed.body,
  });

  if (error) return { error: error.message };

  await revalidateIntegrationPaths(pi.project_id, projectIntegrationId);
  return {};
}

export async function updateIntegrationUpdate(
  updateId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: row } = await supabase
    .from("integration_updates")
    .select("id, project_integration_id")
    .eq("id", updateId)
    .maybeSingle();

  if (!row) return { error: "Not found" };

  const pi = await loadOwnedProjectIntegration(supabase, user.id, row.project_integration_id);
  if (!pi) return { error: "Not found" };

  const parsed = parseBody(formData);
  if (!parsed.ok) return { error: parsed.error };

  const { error } = await supabase
    .from("integration_updates")
    .update({
      body: parsed.body,
      updated_at: new Date().toISOString(),
    })
    .eq("id", updateId);

  if (error) return { error: error.message };

  await revalidateIntegrationPaths(pi.project_id, row.project_integration_id);
  return {};
}

export async function deleteIntegrationUpdate(updateId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: row } = await supabase
    .from("integration_updates")
    .select("id, project_integration_id")
    .eq("id", updateId)
    .maybeSingle();

  if (!row) return { error: "Not found" };

  const pi = await loadOwnedProjectIntegration(supabase, user.id, row.project_integration_id);
  if (!pi) return { error: "Not found" };

  const { error } = await supabase.from("integration_updates").delete().eq("id", updateId);

  if (error) return { error: error.message };

  await revalidateIntegrationPaths(pi.project_id, row.project_integration_id);
  return {};
}
