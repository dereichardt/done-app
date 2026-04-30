"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { isDeliveryProgress, isIntegrationState } from "@/lib/integration-metadata";

const MAX_BODY = 300;

export type ProvideUpdateEntry = {
  projectIntegrationId: string;
  delivery_progress: string;
  integration_state: string;
  /** Pass null or empty string when not applicable. */
  integration_state_reason: string | null;
  /** Empty string means no update text to create. */
  update_body: string;
};

export type SubmitProvideUpdateBatchResult = {
  error?: string;
  /** IDs of project integrations that were successfully saved before any error. */
  savedProjectIntegrationIds: string[];
};

export async function submitProvideUpdateBatch(
  projectId: string,
  entries: ProvideUpdateEntry[],
): Promise<SubmitProvideUpdateBatchResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in", savedProjectIntegrationIds: [] };

  // Verify the project is owned by this user.
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!project) return { error: "Project not found", savedProjectIntegrationIds: [] };

  // Verify all submitted integration IDs belong to this project.
  const piIds = entries.map((e) => e.projectIntegrationId);
  if (piIds.length === 0) return { savedProjectIntegrationIds: [] };

  const { data: piRows } = await supabase
    .from("project_integrations")
    .select("id")
    .eq("project_id", projectId)
    .in("id", piIds);

  const validIds = new Set((piRows ?? []).map((r) => r.id));

  const savedProjectIntegrationIds: string[] = [];

  for (const entry of entries) {
    if (!validIds.has(entry.projectIntegrationId)) {
      return {
        error: `Integration not found: ${entry.projectIntegrationId}`,
        savedProjectIntegrationIds,
      };
    }

    const dp = String(entry.delivery_progress ?? "").trim();
    const st = String(entry.integration_state ?? "").trim();
    const reasonRaw = entry.integration_state_reason;
    const reason = reasonRaw == null ? "" : String(reasonRaw).trim();

    if (!isDeliveryProgress(dp)) {
      return { error: "Invalid delivery progress value", savedProjectIntegrationIds };
    }
    if (!isIntegrationState(st)) {
      return { error: "Invalid integration state value", savedProjectIntegrationIds };
    }

    // Always patch status — the caller only submits entries that are on the form.
    const { error: patchError } = await supabase
      .from("project_integrations")
      .update({
        delivery_progress: dp,
        integration_state: st,
        integration_state_reason: st === "active" ? null : reason || null,
      })
      .eq("id", entry.projectIntegrationId);

    if (patchError) {
      return { error: patchError.message, savedProjectIntegrationIds };
    }

    // Create a written update only when the user entered text.
    const body = entry.update_body.trim();
    if (body.length > 0) {
      if (body.length > MAX_BODY) {
        return {
          error: `Update text exceeds ${MAX_BODY} characters`,
          savedProjectIntegrationIds,
        };
      }
      const { error: insertError } = await supabase.from("integration_updates").insert({
        project_integration_id: entry.projectIntegrationId,
        body,
      });
      if (insertError) {
        return { error: insertError.message, savedProjectIntegrationIds };
      }
    }

    savedProjectIntegrationIds.push(entry.projectIntegrationId);
  }

  revalidatePath(`/projects/${projectId}`);
  return { savedProjectIntegrationIds };
}
