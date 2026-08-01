"use server";

import { revalidatePath } from "next/cache";

import { resolveFiscalQuarter } from "@/lib/fiscal-quarter";
import { parseLocalYmd } from "@/lib/integration-effort-buckets";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { loadUserPreferences } from "@/lib/actions/user-preferences";
import { loadUtilizationQuarter, type UtilizationQuarterDTO } from "@/lib/utilization-data";
import { getUserTodayIso } from "@/lib/user-preferences";

export async function loadUtilizationPageData(
  quarterStartYmd?: string | null,
): Promise<{ data: UtilizationQuarterDTO | null; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { data: null, error: "Not signed in" };

  const prefsRes = await loadUserPreferences();
  const todayIso = getUserTodayIso(prefsRes.preferences.timezone);
  const quarterConfig = {
    startMonth: prefsRes.preferences.effort_quarter_start_month,
  };

  const supabase = await createClient();
  const data = await loadUtilizationQuarter(
    supabase,
    user.id,
    todayIso,
    quarterConfig,
    quarterStartYmd,
  );
  return { data };
}

export type SaveUtilizationTargetResult = {
  ok: boolean;
  error?: string;
  data?: UtilizationQuarterDTO;
};

export async function saveUtilizationQuarterTarget(input: {
  quarterStartYmd: string;
  targetHours: number;
}): Promise<SaveUtilizationTargetResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const ymd = String(input.quarterStartYmd ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    return { ok: false, error: "Invalid quarter start date." };
  }

  const hours = Number(input.targetHours);
  if (!Number.isFinite(hours) || hours < 0) {
    return { ok: false, error: "Target hours must be a non-negative number." };
  }
  // Cap to a sane upper bound (e.g. ~80h/week × 14 weeks).
  if (hours > 2000) {
    return { ok: false, error: "Target hours is too large." };
  }

  const prefsRes = await loadUserPreferences();
  const quarterConfig = {
    startMonth: prefsRes.preferences.effort_quarter_start_month,
  };
  const identity = resolveFiscalQuarter(parseLocalYmd(ymd), quarterConfig);
  if (identity.quarterStartYmd !== ymd) {
    // Normalize to canonical quarter start.
  }

  const supabase = await createClient();
  const { error } = await supabase.from("utilization_quarter_targets").upsert(
    {
      owner_id: user.id,
      quarter_start_date: identity.quarterStartYmd,
      fiscal_year: identity.fiscalYear,
      quarter: identity.quarter,
      target_hours: Math.round(hours * 4) / 4,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id,quarter_start_date" },
  );

  if (error) {
    console.error("[utilization] save target failed", error);
    return { ok: false, error: error.message };
  }

  revalidatePath("/utilization");

  const todayIso = getUserTodayIso(prefsRes.preferences.timezone);
  const data = await loadUtilizationQuarter(
    supabase,
    user.id,
    todayIso,
    quarterConfig,
    identity.quarterStartYmd,
  );
  return { ok: true, data };
}
