"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_ACTIVITY_SUMMARY_DAY,
  DEFAULT_FORECAST_REVIEW_DAY,
  isValidIanaTimezone,
  isWeekdayValue,
  normalizeTimezone,
  type UserPreferences,
} from "@/lib/user-preferences";

type UserPreferencesRow = {
  timezone: string | null;
  activity_summary_day: string;
  forecast_review_day: string;
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
  };
}

export async function loadUserPreferences(): Promise<{ preferences: UserPreferences; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { preferences: defaults(), error: "Not signed in" };

  const { data, error } = await supabase
    .from("user_preferences")
    .select("timezone, activity_summary_day, forecast_review_day")
    .eq("user_id", user.id)
    .maybeSingle<UserPreferencesRow>();
  if (error) return { preferences: defaults(), error: error.message };
  return { preferences: toPreferences(data) };
}

export async function saveUserPreferences(
  _prev: SavePreferencesState | void,
  formData: FormData,
): Promise<SavePreferencesState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const timezoneRaw = String(formData.get("timezone") ?? "");
  const activitySummaryRaw = String(formData.get("activity_summary_day") ?? "").toLowerCase().trim();
  const forecastReviewRaw = String(formData.get("forecast_review_day") ?? "").toLowerCase().trim();
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

  const { error } = await supabase.from("user_preferences").upsert(
    {
      user_id: user.id,
      timezone,
      activity_summary_day: activitySummaryRaw,
      forecast_review_day: forecastReviewRaw,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/projects");
  revalidatePath("/work");
  revalidatePath("/tasks");
  return { success: true };
}
