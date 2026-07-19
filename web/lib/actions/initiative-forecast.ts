"use server";

import { revalidatePath } from "next/cache";

import { loadUserPreferences } from "@/lib/actions/user-preferences";
import { loadForecastInitiativeDTO } from "@/lib/forecast-data";
import {
  generateInitiativeForecastHours,
  INITIATIVE_FORECAST_ROW_KEY,
} from "@/lib/initiative-forecast";
import {
  currentSundayWeekYmd,
  type ForecastStartMode,
} from "@/lib/project-forecast";
import { createClient } from "@/lib/supabase/server";
import { getUserTodayIso } from "@/lib/user-preferences";

function isValidYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isSundayYmd(value: string): boolean {
  if (!isValidYmd(value)) return false;
  return new Date(`${value}T00:00:00Z`).getUTCDay() === 0;
}

function revalidateInitiativeForecast(initiativeId: string) {
  revalidatePath("/forecast");
  revalidatePath("/home");
  revalidatePath(`/internal/initiatives/${initiativeId}`);
}

export async function generateInitiativeForecast(
  initiativeId: string,
  input?: { todayIso?: string; startMode?: ForecastStartMode },
): Promise<{ error?: string; initiative?: Awaited<ReturnType<typeof loadForecastInitiativeDTO>> }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const prefs = await loadUserPreferences();
  const todayIso = String(input?.todayIso ?? getUserTodayIso(prefs.preferences.timezone)).trim();
  if (!isValidYmd(todayIso)) return { error: "Invalid today date." };
  const startMode = input?.startMode ?? "this_week";
  if (startMode !== "this_week" && startMode !== "next_week") {
    return { error: "Choose This week or Next week." };
  }

  const dto = await loadForecastInitiativeDTO(supabase, initiativeId, user.id, {
    todayIso,
    timeZone: prefs.preferences.timezone,
  });
  if (!dto) return { error: "Initiative not found or not included in forecast." };

  const generated = generateInitiativeForecastHours({
    startsOn: dto.timelineStartYmd ?? "",
    endsOn: dto.timelineEndYmd ?? "",
    estimatedEffortHours: dto.integrations[0]?.estimatedEffortHours ?? 0,
    actualHours: dto.actualHours,
    todayIso,
    startMode,
    lockedWeekStarts: dto.lockedWeekStarts,
    existingHoursByWeek: dto.hoursByWeek,
  });
  if (generated.error) return { error: generated.error };

  const now = new Date().toISOString();
  const { error: headerError } = await supabase.from("initiative_forecasts").upsert(
    {
      initiative_id: initiativeId,
      start_date: generated.startDate,
      generated_at: now,
      updated_at: now,
    },
    { onConflict: "initiative_id" },
  );
  if (headerError) return { error: headerError.message };

  const locked = new Set(dto.lockedWeekStarts);
  const replaceWeeks = Array.from(
    new Set([...generated.weeks, ...dto.hours.map((cell) => cell.week_start_date)]),
  ).filter((week) => week >= generated.startDate && !locked.has(week));
  if (replaceWeeks.length > 0) {
    const { error } = await supabase
      .from("initiative_forecast_hours")
      .delete()
      .eq("initiative_id", initiativeId)
      .in("week_start_date", replaceWeeks);
    if (error) return { error: error.message };
  }

  const cells = Object.entries(generated.hoursByWeek)
    .filter(([week, hours]) => !locked.has(week) && hours > 0)
    .map(([week_start_date, hours]) => ({
      initiative_id: initiativeId,
      week_start_date,
      hours,
      updated_at: now,
    }));
  if (cells.length > 0) {
    const { error } = await supabase.from("initiative_forecast_hours").upsert(cells, {
      onConflict: "initiative_id,week_start_date",
    });
    if (error) return { error: error.message };
  }

  revalidateInitiativeForecast(initiativeId);
  return {
    initiative: await loadForecastInitiativeDTO(supabase, initiativeId, user.id, {
      todayIso,
      timeZone: prefs.preferences.timezone,
    }),
  };
}

export async function saveInitiativeForecastDraft(
  initiativeId: string,
  input: {
    todayIso: string;
    cells: Array<{ rowKey: string; weekStartDate: string; hours: number }>;
  },
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };
  if (!isValidYmd(input.todayIso)) return { error: "Invalid today date." };

  const { data: initiative } = await supabase
    .from("internal_initiatives")
    .select("id")
    .eq("id", initiativeId)
    .eq("owner_id", user.id)
    .eq("include_in_forecast", true)
    .maybeSingle();
  if (!initiative) return { error: "Initiative not found" };

  const currentSunday = currentSundayWeekYmd(input.todayIso);
  const editedWeeks = input.cells.map((cell) => String(cell.weekStartDate ?? "").trim());
  if (editedWeeks.length > 0) {
    const { data: locks, error } = await supabase
      .from("initiative_forecast_week_locks")
      .select("week_start_date")
      .eq("initiative_id", initiativeId)
      .in("week_start_date", editedWeeks);
    if (error) return { error: error.message };
    if ((locks ?? []).length > 0) return { error: "Locked forecast weeks cannot be edited." };
  }

  const now = new Date().toISOString();
  for (const cell of input.cells) {
    const week = String(cell.weekStartDate ?? "").trim();
    const hours = Math.round(Number(cell.hours));
    if (
      cell.rowKey !== INITIATIVE_FORECAST_ROW_KEY ||
      !isSundayYmd(week) ||
      week < currentSunday ||
      !Number.isFinite(hours) ||
      hours < 0
    ) {
      return { error: "Invalid forecast cell." };
    }
    if (hours === 0) {
      const { error } = await supabase
        .from("initiative_forecast_hours")
        .delete()
        .eq("initiative_id", initiativeId)
        .eq("week_start_date", week);
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase.from("initiative_forecast_hours").upsert(
        { initiative_id: initiativeId, week_start_date: week, hours, updated_at: now },
        { onConflict: "initiative_id,week_start_date" },
      );
      if (error) return { error: error.message };
    }
  }

  await supabase
    .from("initiative_forecasts")
    .update({ updated_at: now })
    .eq("initiative_id", initiativeId);
  revalidateInitiativeForecast(initiativeId);
  return {};
}

export async function setInitiativeForecastWeekLock(
  initiativeId: string,
  input: { todayIso: string; weekStartDate: string; locked: boolean },
): Promise<{ error?: string; lockedWeekStarts?: string[] }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };
  const week = String(input.weekStartDate ?? "").trim();
  if (!isValidYmd(input.todayIso) || !isSundayYmd(week) || week < currentSundayWeekYmd(input.todayIso)) {
    return { error: "Invalid forecast week." };
  }
  const { data: initiative } = await supabase
    .from("internal_initiatives")
    .select("id")
    .eq("id", initiativeId)
    .eq("owner_id", user.id)
    .eq("include_in_forecast", true)
    .maybeSingle();
  if (!initiative) return { error: "Initiative not found" };

  const query = supabase.from("initiative_forecast_week_locks");
  const { error } = input.locked
    ? await query.upsert(
        { initiative_id: initiativeId, week_start_date: week, updated_at: new Date().toISOString() },
        { onConflict: "initiative_id,week_start_date" },
      )
    : await query.delete().eq("initiative_id", initiativeId).eq("week_start_date", week);
  if (error) return { error: error.message };

  const { data: locks, error: locksError } = await supabase
    .from("initiative_forecast_week_locks")
    .select("week_start_date")
    .eq("initiative_id", initiativeId)
    .order("week_start_date");
  if (locksError) return { error: locksError.message };
  revalidateInitiativeForecast(initiativeId);
  return {
    lockedWeekStarts: (locks ?? []).map((row) => String(row.week_start_date).slice(0, 10)),
  };
}
