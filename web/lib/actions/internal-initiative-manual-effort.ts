"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const ENTRY_TYPES = ["task", "meeting"] as const;
export type InternalInitiativeManualEntryType = (typeof ENTRY_TYPES)[number];

function isEntryType(v: string): v is InternalInitiativeManualEntryType {
  return (ENTRY_TYPES as readonly string[]).includes(v);
}

function isOnQuarterHour(d: Date): boolean {
  const ms = d.getTime();
  if (Number.isNaN(ms)) return false;
  return ms % (15 * 60_000) === 0;
}

function revalidateInitiativeEffortPaths(initiativeId: string) {
  revalidatePath("/internal");
  revalidatePath(`/internal/initiatives/${initiativeId}`);
  revalidatePath("/work");
  revalidatePath("/tasks");
}

async function assertOwnedInitiative(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  initiativeId: string,
): Promise<boolean> {
  const { data: row } = await supabase
    .from("internal_initiatives")
    .select("id")
    .eq("id", initiativeId)
    .eq("owner_id", userId)
    .maybeSingle();
  return Boolean(row);
}

export async function createInternalInitiativeManualEffortEntry(
  initiativeId: string,
  payload: {
    entry_type: InternalInitiativeManualEntryType;
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

  const owned = await assertOwnedInitiative(supabase, user.id, initiativeId);
  if (!owned) return { error: "Not found" };

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

  const { error } = await supabase.from("internal_initiative_manual_effort_entries").insert({
    internal_initiative_id: initiativeId,
    entry_type: payload.entry_type,
    title,
    started_at: started.toISOString(),
    finished_at: finished.toISOString(),
    duration_hours: q,
    work_accomplished,
  });

  if (error) return { error: error.message };

  revalidateInitiativeEffortPaths(initiativeId);
  return {};
}

export async function updateInternalInitiativeManualEffortEntry(
  initiativeId: string,
  manualEntryId: string,
  payload: {
    entry_type: InternalInitiativeManualEntryType;
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

  const owned = await assertOwnedInitiative(supabase, user.id, initiativeId);
  if (!owned) return { error: "Not found" };

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
    .from("internal_initiative_manual_effort_entries")
    .update({
      entry_type: payload.entry_type,
      title,
      started_at: started.toISOString(),
      finished_at: finished.toISOString(),
      duration_hours: q,
      work_accomplished,
    })
    .eq("id", manualEntryId)
    .eq("internal_initiative_id", initiativeId)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!updated) return { error: "Not found" };

  revalidateInitiativeEffortPaths(initiativeId);
  return {};
}
