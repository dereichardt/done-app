"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { loadUserPreferences } from "@/lib/actions/user-preferences";
import {
  capacityGapWeekStarts,
  synthesizeCapacityGaps,
  type CapacityGapsSynthesis,
} from "@/lib/home-capacity-gaps";
import { loadHomeActualsVsForecast, type HomeActualsVsForecastDTO } from "@/lib/home-actuals-vs-forecast";
import { syncHomeInboxRules } from "@/lib/home-inbox-rules";
import { currentSundayWeekYmd } from "@/lib/project-forecast";
import { getUserTodayIso } from "@/lib/user-preferences";

export async function markHomeInboxItemDone(itemId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { error } = await supabase
    .from("home_inbox_items")
    .update({ status: "done", resolved_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("owner_id", user.id)
    .eq("status", "open");

  if (error) return { error: error.message };
  revalidatePath("/home");
  return {};
}

export async function markHomeInboxItemRead(itemId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("home_inbox_items")
    .update({ read_at: now })
    .eq("id", itemId)
    .eq("owner_id", user.id)
    .eq("status", "open")
    .is("read_at", null);

  if (error) return { error: error.message };
  revalidatePath("/home");
  return {};
}

/** Soft-dismiss: keep the row so sync cannot recreate the same dedupe_key. */
export async function deleteHomeInboxItem(itemId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { error } = await supabase
    .from("home_inbox_items")
    .update({ status: "dismissed", resolved_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("owner_id", user.id)
    .eq("status", "open");

  if (error) return { error: error.message };
  revalidatePath("/home");
  return {};
}

export async function markAllHomeInboxItemsRead(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("home_inbox_items")
    .update({ read_at: now })
    .eq("owner_id", user.id)
    .eq("status", "open")
    .is("read_at", null);

  if (error) return { error: error.message };
  revalidatePath("/home");
  return {};
}

export async function markAllHomeInboxItemsUnread(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { error } = await supabase
    .from("home_inbox_items")
    .update({ read_at: null })
    .eq("owner_id", user.id)
    .eq("status", "open")
    .not("read_at", "is", null);

  if (error) return { error: error.message };
  revalidatePath("/home");
  return {};
}

/** Soft-dismiss all open inbox items (preserves dedupe keys). */
export async function deleteAllHomeInboxItems(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { error } = await supabase
    .from("home_inbox_items")
    .update({ status: "dismissed", resolved_at: new Date().toISOString() })
    .eq("owner_id", user.id)
    .eq("status", "open");

  if (error) return { error: error.message };
  revalidatePath("/home");
  return {};
}

/** Re-run inbox rule sync (stale integrations + eligible weekday reminders). */
export async function syncHomeInboxNow(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  try {
    await syncHomeInboxRules(supabase, user.id);
  } catch (err) {
    console.error("[home-inbox] syncHomeInboxNow failed", err);
    return { error: err instanceof Error ? err.message : "Failed to generate inbox actions." };
  }

  revalidatePath("/home");
  return {};
}

export async function loadInboxVarianceReview(): Promise<{
  error?: string;
  data?: HomeActualsVsForecastDTO;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const prefsRes = await loadUserPreferences();
  const todayIso = getUserTodayIso(prefsRes.preferences.timezone);
  const data = await loadHomeActualsVsForecast(supabase, user.id, todayIso);
  return { data };
}

export async function loadInboxCapacityGaps(): Promise<{
  error?: string;
  synthesis?: CapacityGapsSynthesis;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const prefsRes = await loadUserPreferences();
  const todayIso = getUserTodayIso(prefsRes.preferences.timezone);
  const currentSunday = currentSundayWeekYmd(todayIso);
  const gapWeeks = capacityGapWeekStarts(currentSunday);

  const { data: projects } = await supabase
    .from("projects")
    .select("id")
    .eq("owner_id", user.id)
    .is("completed_at", null);

  const projectIds = (projects ?? []).map((p) => p.id as string);
  if (projectIds.length === 0) {
    return {
      synthesis: synthesizeCapacityGaps({ weekHours: {}, weekStarts: gapWeeks }),
    };
  }

  const gapStart = gapWeeks[0]!;
  const gapEnd = gapWeeks[gapWeeks.length - 1]!;
  const { data: hoursRows } = await supabase
    .from("project_forecast_hours")
    .select("week_start_date, hours")
    .in("project_id", projectIds)
    .gte("week_start_date", gapStart)
    .lte("week_start_date", gapEnd);

  const weekHours: Record<string, number> = {};
  for (const w of gapWeeks) weekHours[w] = 0;
  for (const row of hoursRows ?? []) {
    const week = String(row.week_start_date).slice(0, 10);
    if (!(week in weekHours)) continue;
    weekHours[week] = (weekHours[week] ?? 0) + Math.max(0, Math.round(Number(row.hours) || 0));
  }

  return { synthesis: synthesizeCapacityGaps({ weekHours, weekStarts: gapWeeks }) };
}
