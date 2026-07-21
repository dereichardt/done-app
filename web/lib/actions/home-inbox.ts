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
import {
  loadOpenHomeInboxItems,
  syncHomeInboxRules,
  type HomeInboxItemRow,
} from "@/lib/home-inbox-rules";
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
  revalidateHomeInboxPaths();
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
  revalidateHomeInboxPaths();
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
  revalidateHomeInboxPaths();
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
  revalidateHomeInboxPaths();
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
  revalidateHomeInboxPaths();
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
  revalidateHomeInboxPaths();
  return {};
}

function revalidateHomeInboxPaths() {
  revalidatePath("/home");
  revalidatePath("/inbox");
}

/** Lightweight open-item count for the shell header badge (no rule sync). */
export async function loadOpenHomeInboxCount(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count, error } = await supabase
    .from("home_inbox_items")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", user.id)
    .eq("status", "open");

  if (error) return 0;
  return count ?? 0;
}

const HOME_INBOX_RULES_VERSION = 1;

export async function syncAndLoadHomeInbox(
  force = false,
): Promise<{ items?: HomeInboxItemRow[]; synced?: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: claimed, error: claimError } = await supabase.rpc("claim_home_inbox_sync", {
    p_rules_version: HOME_INBOX_RULES_VERSION,
    p_force: force,
  });
  if (claimError) return { error: claimError.message };

  try {
    if (claimed) await syncHomeInboxRules(supabase, user.id);
  } catch (err) {
    console.error("[home-inbox] syncAndLoadHomeInbox failed", err);
    if (claimed) {
      await supabase
        .from("user_preferences")
        .update({ home_inbox_last_synced_at: null })
        .eq("user_id", user.id);
    }
    return { error: err instanceof Error ? err.message : "Failed to generate inbox actions." };
  }

  const items = await loadOpenHomeInboxItems(supabase, user.id);
  return { items, synced: Boolean(claimed) };
}

/** Manually bypass freshness and regenerate eligible inbox actions. */
export async function syncHomeInboxNow(): Promise<{ items?: HomeInboxItemRow[]; error?: string }> {
  return syncAndLoadHomeInbox(true);
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
  const { data: initiatives } = await supabase
    .from("internal_initiatives")
    .select("id")
    .eq("owner_id", user.id)
    .eq("include_in_forecast", true)
    .is("completed_at", null);
  const initiativeIds = (initiatives ?? []).map((row) => row.id as string);
  if (projectIds.length === 0 && initiativeIds.length === 0) {
    return {
      synthesis: synthesizeCapacityGaps({ weekHours: {}, weekStarts: gapWeeks }),
    };
  }

  const gapStart = gapWeeks[0]!;
  const gapEnd = gapWeeks[gapWeeks.length - 1]!;
  const [{ data: hoursRows }, { data: initiativeHoursRows }] = await Promise.all([
    projectIds.length === 0
      ? Promise.resolve({ data: [] as Array<{ week_start_date: string; hours: number }> })
      : supabase
          .from("project_forecast_hours")
          .select("week_start_date, hours")
          .in("project_id", projectIds)
          .gte("week_start_date", gapStart)
          .lte("week_start_date", gapEnd),
    initiativeIds.length === 0
      ? Promise.resolve({ data: [] as Array<{ week_start_date: string; hours: number }> })
      : supabase
          .from("initiative_forecast_hours")
          .select("week_start_date, hours")
          .in("initiative_id", initiativeIds)
          .gte("week_start_date", gapStart)
          .lte("week_start_date", gapEnd),
  ]);

  const weekHours: Record<string, number> = {};
  for (const w of gapWeeks) weekHours[w] = 0;
  for (const row of [...(hoursRows ?? []), ...(initiativeHoursRows ?? [])]) {
    const week = String(row.week_start_date).slice(0, 10);
    if (!(week in weekHours)) continue;
    weekHours[week] = (weekHours[week] ?? 0) + Math.max(0, Math.round(Number(row.hours) || 0));
  }

  return { synthesis: synthesizeCapacityGaps({ weekHours, weekStarts: gapWeeks }) };
}
