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

function isMissingProjectTrackColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  const mentionsColumn = message.includes("project_track_id");
  const missingColumn =
    message.includes("does not exist") ||
    message.includes("could not find") ||
    error.code === "42703";
  return mentionsColumn && missingColumn;
}

async function loadOwnedIntegrationTrack(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  projectIntegrationId: string,
): Promise<{ project_id: string; project_track_id: string } | null> {
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
  const { data: track } = await supabase
    .from("project_tracks")
    .select("id")
    .eq("project_integration_id", projectIntegrationId)
    .eq("kind", "integration")
    .maybeSingle();
  if (!track) return null;
  return { project_id: pi.project_id, project_track_id: track.id };
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

  const track = await loadOwnedIntegrationTrack(supabase, user.id, projectIntegrationId);
  if (!track) return { error: "Not found" };

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

  const createRes = await supabase.from("integration_manual_effort_entries").insert({
    project_track_id: track.project_track_id,
    project_integration_id: projectIntegrationId,
    entry_type: payload.entry_type,
    title,
    started_at: started.toISOString(),
    finished_at: finished.toISOString(),
    duration_hours: q,
    work_accomplished,
  });

  if (isMissingProjectTrackColumn(createRes.error)) {
    const legacyRes = await supabase.from("integration_manual_effort_entries").insert({
      project_integration_id: projectIntegrationId,
      entry_type: payload.entry_type,
      title,
      started_at: started.toISOString(),
      finished_at: finished.toISOString(),
      duration_hours: q,
      work_accomplished,
    });
    if (legacyRes.error) return { error: legacyRes.error.message };
  } else if (createRes.error) {
    return { error: createRes.error.message };
  }

  revalidateIntegrationPaths(track.project_id, projectIntegrationId);
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

  const track = await loadOwnedIntegrationTrack(supabase, user.id, projectIntegrationId);
  if (!track) return { error: "Not found" };

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

  const updateRes = await supabase
    .from("integration_manual_effort_entries")
    .update({
      project_track_id: track.project_track_id,
      project_integration_id: projectIntegrationId,
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

  if (isMissingProjectTrackColumn(updateRes.error)) {
    const legacyUpdate = await supabase
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
    if (legacyUpdate.error) return { error: legacyUpdate.error.message };
    if (!legacyUpdate.data) return { error: "Not found" };
  } else {
    if (updateRes.error) return { error: updateRes.error.message };
    if (!updateRes.data) return { error: "Not found" };
  }

  revalidateIntegrationPaths(track.project_id, projectIntegrationId);
  return {};
}

