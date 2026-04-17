"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const ENTRY_TYPES = ["task", "meeting"] as const;
export type ManualEffortEntryType = (typeof ENTRY_TYPES)[number];

function isEntryType(v: string): v is ManualEffortEntryType {
  return (ENTRY_TYPES as readonly string[]).includes(v);
}

function isOnQuarterHour(d: Date): boolean {
  const ms = d.getTime();
  if (Number.isNaN(ms)) return false;
  return ms % (15 * 60_000) === 0;
}

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

function revalidateIntegrationPaths(projectId: string, projectIntegrationId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/integrations/${projectIntegrationId}`);
}

export async function createIntegrationManualEffortEntry(
  projectIntegrationId: string,
  payload: {
    entry_type: ManualEffortEntryType;
    title: string;
    started_at: string;
    finished_at: string;
    work_accomplished: string | null;
  },
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const pi = await loadOwnedProjectIntegration(supabase, user.id, projectIntegrationId);
  if (!pi) return { error: "Not found" };

  if (!isEntryType(String(payload.entry_type))) return { error: "Invalid entry type" };

  const title = String(payload.title ?? "").trim();
  if (!title) return { error: "Title is required" };

  const started = new Date(payload.started_at);
  if (Number.isNaN(started.getTime())) return { error: "Invalid start time" };
  const finished = new Date(payload.finished_at);
  if (Number.isNaN(finished.getTime())) return { error: "Invalid end time" };
  if (finished.getTime() <= started.getTime()) return { error: "End time must be after start time" };

  if (!isOnQuarterHour(started) || !isOnQuarterHour(finished)) {
    return { error: "Times must be in 15-minute increments" };
  }

  const duration_hours = (finished.getTime() - started.getTime()) / 3_600_000;
  const q = Math.round(duration_hours * 4) / 4;
  if (!Number.isFinite(duration_hours) || duration_hours <= 0) return { error: "Invalid duration" };
  if (Math.abs(duration_hours - q) > 1e-6) return { error: "Duration must be in 15-minute increments" };

  const work_accomplished = payload.work_accomplished?.trim() ? payload.work_accomplished.trim() : null;

  const { error } = await supabase.from("integration_manual_effort_entries").insert({
    project_integration_id: projectIntegrationId,
    entry_type: payload.entry_type,
    title,
    started_at: started.toISOString(),
    finished_at: finished.toISOString(),
    duration_hours: q,
    work_accomplished,
  });

  if (error) return { error: error.message };

  revalidateIntegrationPaths(pi.project_id, projectIntegrationId);
  return {};
}

export async function updateIntegrationManualEffortEntry(
  projectIntegrationId: string,
  manualEntryId: string,
  payload: {
    entry_type: ManualEffortEntryType;
    title: string;
    started_at: string;
    finished_at: string;
    work_accomplished: string | null;
  },
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const pi = await loadOwnedProjectIntegration(supabase, user.id, projectIntegrationId);
  if (!pi) return { error: "Not found" };

  if (!manualEntryId || typeof manualEntryId !== "string") return { error: "Not found" };
  if (!isEntryType(String(payload.entry_type))) return { error: "Invalid entry type" };

  const title = String(payload.title ?? "").trim();
  if (!title) return { error: "Title is required" };

  const started = new Date(payload.started_at);
  if (Number.isNaN(started.getTime())) return { error: "Invalid start time" };
  const finished = new Date(payload.finished_at);
  if (Number.isNaN(finished.getTime())) return { error: "Invalid end time" };
  if (finished.getTime() <= started.getTime()) return { error: "End time must be after start time" };

  if (!isOnQuarterHour(started) || !isOnQuarterHour(finished)) {
    return { error: "Times must be in 15-minute increments" };
  }

  const duration_hours = (finished.getTime() - started.getTime()) / 3_600_000;
  const q = Math.round(duration_hours * 4) / 4;
  if (!Number.isFinite(duration_hours) || duration_hours <= 0) return { error: "Invalid duration" };
  if (Math.abs(duration_hours - q) > 1e-6) return { error: "Duration must be in 15-minute increments" };

  const work_accomplished = payload.work_accomplished?.trim() ? payload.work_accomplished.trim() : null;

  const { data: updated, error } = await supabase
    .from("integration_manual_effort_entries")
    .update({
      entry_type: payload.entry_type,
      title,
      started_at: started.toISOString(),
      finished_at: finished.toISOString(),
      duration_hours: q,
      work_accomplished,
    })
    .eq("id", manualEntryId)
    .eq("project_integration_id", projectIntegrationId)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!updated) return { error: "Not found" };

  revalidateIntegrationPaths(pi.project_id, projectIntegrationId);
  return {};
}

