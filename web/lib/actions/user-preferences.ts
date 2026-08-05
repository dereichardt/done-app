"use server";

import { revalidatePath } from "next/cache";
import { cache } from "react";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import {
  DEFAULT_ACTIVITY_SUMMARY_DAY,
  DEFAULT_DEPLOYMENT_EFFORT_BY_PHASE,
  DEFAULT_EFFORT_QUARTER_START_MONTH,
  DEFAULT_FORECAST_REVIEW_DAY,
  DEFAULT_WEEKLY_CAPACITY_HOURS,
  isValidIanaTimezone,
  isWeekdayValue,
  normalizeTimezone,
  parseDeploymentEffortByPhase,
  parseDeploymentEffortByPhaseFromFormData,
  parseEffortQuarterStartMonth,
  parseWeeklyCapacityHours,
  type UserPreferences,
} from "@/lib/user-preferences";

type UserPreferencesRow = {
  timezone: string | null;
  activity_summary_day: string;
  forecast_review_day: string;
  effort_quarter_start_month: number;
  deployment_effort_by_phase: unknown;
  weekly_capacity_hours: number | null;
};

type SavePreferencesState = {
  error?: string;
  success?: boolean;
};

function defaults(): UserPreferences {
  return {
    timezone: null,
    activity_summary_day: DEFAULT_ACTIVITY_SUMMARY_DAY,
    forecast_review_day: DEFAULT_FORECAST_REVIEW_DAY,
    effort_quarter_start_month: DEFAULT_EFFORT_QUARTER_START_MONTH,
    deployment_effort_by_phase: { ...DEFAULT_DEPLOYMENT_EFFORT_BY_PHASE },
    weekly_capacity_hours: DEFAULT_WEEKLY_CAPACITY_HOURS,
  };
}

function toPreferences(row: UserPreferencesRow | null | undefined): UserPreferences {
  if (!row) return defaults();
  return {
    timezone: normalizeTimezone(row.timezone),
    activity_summary_day: isWeekdayValue(row.activity_summary_day)
      ? row.activity_summary_day
      : DEFAULT_ACTIVITY_SUMMARY_DAY,
    forecast_review_day: isWeekdayValue(row.forecast_review_day)
      ? row.forecast_review_day
      : DEFAULT_FORECAST_REVIEW_DAY,
    effort_quarter_start_month:
      parseEffortQuarterStartMonth(row.effort_quarter_start_month) ??
      DEFAULT_EFFORT_QUARTER_START_MONTH,
    deployment_effort_by_phase: parseDeploymentEffortByPhase(row.deployment_effort_by_phase),
    weekly_capacity_hours:
      parseWeeklyCapacityHours(row.weekly_capacity_hours) ?? DEFAULT_WEEKLY_CAPACITY_HOURS,
  };
}

const loadUserPreferencesCached = cache(
  async (): Promise<{ preferences: UserPreferences; error?: string }> => {
    const user = await getCurrentUser();
    if (!user) return { preferences: defaults(), error: "Not signed in" };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("user_preferences")
      .select(
        "timezone, activity_summary_day, forecast_review_day, effort_quarter_start_month, deployment_effort_by_phase, weekly_capacity_hours",
      )
      .eq("user_id", user.id)
      .maybeSingle<UserPreferencesRow>();
    if (error) return { preferences: defaults(), error: error.message };
    return { preferences: toPreferences(data) };
  },
);

/** Preferences for the signed-in user, memoized for the current request. */
export async function loadUserPreferences(): Promise<{
  preferences: UserPreferences;
  error?: string;
}> {
  return loadUserPreferencesCached();
}

export async function saveUserPreferences(
  _prev: SavePreferencesState | void,
  formData: FormData,
): Promise<SavePreferencesState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in" };

  const supabase = await createClient();
  const timezoneRaw = String(formData.get("timezone") ?? "");
  const activitySummaryRaw = String(formData.get("activity_summary_day") ?? "").toLowerCase().trim();
  const forecastReviewRaw = String(formData.get("forecast_review_day") ?? "").toLowerCase().trim();
  const effortQuarterStartMonth = parseEffortQuarterStartMonth(
    formData.get("effort_quarter_start_month"),
  );
  const deploymentEffortByPhase = parseDeploymentEffortByPhaseFromFormData(formData);
  const weeklyCapacityHours = parseWeeklyCapacityHours(formData.get("weekly_capacity_hours"));
  const timezone = normalizeTimezone(timezoneRaw);

  if (timezone && !isValidIanaTimezone(timezone)) {
    return { error: "Enter a valid IANA timezone (for example, America/New_York)." };
  }
  if (!isWeekdayValue(activitySummaryRaw)) {
    return { error: "Select a valid Activity summary day." };
  }
  if (!isWeekdayValue(forecastReviewRaw)) {
    return { error: "Select a valid Forecast review day." };
  }
  if (effortQuarterStartMonth === null) {
    return { error: "Select a valid Quarter start month." };
  }
  if (deploymentEffortByPhase === null) {
    return {
      error:
        "Deployment effort by stage must use multiples of 5% that total exactly 100%.",
    };
  }
  if (weeklyCapacityHours === null) {
    return {
      error: "Weekly capacity must be between 1 and 80 hours (in 0.25 hour steps).",
    };
  }

  const { error } = await supabase.from("user_preferences").upsert(
    {
      user_id: user.id,
      timezone,
      activity_summary_day: activitySummaryRaw,
      forecast_review_day: forecastReviewRaw,
      effort_quarter_start_month: effortQuarterStartMonth,
      deployment_effort_by_phase: deploymentEffortByPhase,
      weekly_capacity_hours: weeklyCapacityHours,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/projects");
  revalidatePath("/work");
  revalidatePath("/tasks");
  revalidatePath("/timesheet");
  revalidatePath("/home");
  revalidatePath("/forecast");
  revalidatePath("/utilization");
  revalidatePath("/internal");
  return { success: true };
}
