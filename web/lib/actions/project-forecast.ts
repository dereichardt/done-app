"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loadUserPreferences } from "@/lib/actions/user-preferences";
import {
  currentSundayWeekYmd,
  forecastStartSundayYmd,
  generateForecastHours,
  isForecastSpreadMode,
  type ForecastPhaseInput,
  type GenerateForecastResult,
  type ForecastSpreadMode,
  type ForecastStartMode,
} from "@/lib/project-forecast";
import { generateExpertAssistForecastHours } from "@/lib/expert-assist-forecast";
import {
  loadAllActiveForecastItems,
  loadForecastProjectDTO,
  type ForecastProjectDTO,
} from "@/lib/forecast-data";
import { getUserTodayIso } from "@/lib/user-preferences";

function isValidYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isSundayYmd(value: string): boolean {
  if (!isValidYmd(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.getUTCDay() === 0;
}

function isValidStartMode(value: unknown): value is ForecastStartMode {
  return value === "this_week" || value === "next_week";
}

export async function generateProjectForecast(
  projectId: string,
  input: {
    startMode: ForecastStartMode;
    spreadMode: ForecastSpreadMode;
    includePastPhaseHours?: boolean;
    todayIso: string;
  },
): Promise<{ error?: string; project?: NonNullable<Awaited<ReturnType<typeof loadForecastProjectDTO>>> }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const todayIso = String(input.todayIso ?? "").trim();
  const startMode = input.startMode;
  const spreadMode = input.spreadMode;
  const includePastPhaseHours = Boolean(input.includePastPhaseHours);

  if (!isValidYmd(todayIso)) return { error: "Invalid today date." };
  if (!isValidStartMode(startMode)) {
    return { error: "Choose This week or Next week." };
  }
  if (!isForecastSpreadMode(spreadMode)) {
    return { error: "Choose Even spread or Bell curve." };
  }

  const prefsRes = await loadUserPreferences();
  const actualsContext = {
    todayIso,
    timeZone: prefsRes.preferences.timezone,
  };
  const dto = await loadForecastProjectDTO(supabase, projectId, user.id, actualsContext);
  if (!dto) return { error: "Project not found" };

  let startDate = forecastStartSundayYmd(todayIso, startMode);

  // Completed actuals from prior Sunday–Saturday weeks reduce remaining hours.
  let generated: GenerateForecastResult;
  if (dto.forecastModel === "single_track") {
    const estimate = dto.integrations[0]?.estimatedEffortHours ?? 0;
    const allocation = generateExpertAssistForecastHours({
      startsOn: dto.timelineStartYmd ?? "",
      endsOn: dto.timelineEndYmd ?? "",
      estimatedEffortHours: estimate,
      actualHours: dto.actualHours,
      todayIso,
      startMode,
      lockedWeekStarts: dto.lockedWeekStarts,
      existingHoursByWeek: dto.hoursByWeek,
    });
    startDate = allocation.startDate;
    generated = allocation;
  } else {
    generated = generateForecastHours({
      phases: dto.phases as ForecastPhaseInput[],
      integrations: dto.integrations,
      deploymentEffortByPhase: prefsRes.preferences.deployment_effort_by_phase,
      startMode,
      spreadMode,
      includePastPhaseHours,
      todayIso,
      actualHours: dto.actualHours,
      lockedWeekStarts: dto.lockedWeekStarts,
      lockedHoursByWeek: dto.hoursByWeek,
    });
  }

  if (generated.error) return { error: generated.error };

  // Replace only unlocked weeks from the chosen start Sunday forward. Include
  // existing dates so stale values outside the newly generated timeline are removed.
  const lockedWeeks = new Set(dto.lockedWeekStarts);
  const replaceWeeks = Array.from(
    new Set([
      ...generated.weeks.map((week) => week.startYmd),
      ...dto.hours.map((cell) => cell.week_start_date),
    ]),
  ).filter((week) => week >= startDate && !lockedWeeks.has(week));
  const cells: Array<{
    week_start_date: string;
    hours: number;
  }> = [];

  for (const [week, hours] of Object.entries(generated.hoursByWeek)) {
    if (week < startDate || lockedWeeks.has(week)) continue;
    const h = Math.max(0, Math.round(hours));
    if (h === 0) continue;
    cells.push({
      week_start_date: week,
      hours: h,
    });
  }

  const now = new Date().toISOString();
  const { error: persistError } = await supabase.rpc("replace_project_forecast", {
    p_project_id: projectId,
    p_start_date: startDate,
    p_spread_mode: dto.forecastModel === "single_track" ? "even" : spreadMode,
    p_reserve_hours: generated.reserveHours,
    p_include_past_phases_in_spread:
      dto.forecastModel === "single_track" ? false : includePastPhaseHours,
    p_generated_at: now,
    p_replace_weeks: replaceWeeks,
    p_cells: cells,
  });
  if (persistError) return { error: persistError.message };

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/forecast");

  const project = await loadForecastProjectDTO(supabase, projectId, user.id, actualsContext);
  return { project: project ?? undefined };
}

export async function setProjectForecastWeekLock(
  projectId: string,
  input: { todayIso: string; weekStartDate: string; locked: boolean },
): Promise<{ error?: string; lockedWeekStarts?: string[] }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const todayIso = String(input.todayIso ?? "").trim();
  const weekStartDate = String(input.weekStartDate ?? "").trim();
  if (!isValidYmd(todayIso) || !isSundayYmd(weekStartDate)) {
    return { error: "Invalid forecast week." };
  }
  if (weekStartDate < currentSundayWeekYmd(todayIso)) {
    return { error: "Past weeks cannot be locked or unlocked." };
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!project) return { error: "Project not found" };

  if (input.locked) {
    const now = new Date().toISOString();
    const { error } = await supabase.from("project_forecast_week_locks").upsert(
      {
        project_id: projectId,
        week_start_date: weekStartDate,
        updated_at: now,
      },
      { onConflict: "project_id,week_start_date" },
    );
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("project_forecast_week_locks")
      .delete()
      .eq("project_id", projectId)
      .eq("week_start_date", weekStartDate);
    if (error) return { error: error.message };
  }

  const { data: locks, error: locksError } = await supabase
    .from("project_forecast_week_locks")
    .select("week_start_date")
    .eq("project_id", projectId)
    .order("week_start_date");
  if (locksError) return { error: locksError.message };

  revalidatePath("/forecast");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/home");
  return {
    lockedWeekStarts: (locks ?? []).map((row) =>
      String(row.week_start_date).slice(0, 10),
    ),
  };
}

export async function setAllActiveForecastWeekLocks(input: {
  todayIso: string;
  weekStartDate: string;
  locked: boolean;
}): Promise<{ error?: string; projectIds?: string[] }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const todayIso = String(input.todayIso ?? "").trim();
  const weekStartDate = String(input.weekStartDate ?? "").trim();
  if (!isValidYmd(todayIso) || !isSundayYmd(weekStartDate)) {
    return { error: "Invalid forecast week." };
  }
  if (weekStartDate < currentSundayWeekYmd(todayIso)) {
    return { error: "Past weeks cannot be locked or unlocked." };
  }

  const [{ data: activeProjects, error: projectsError }, { data: activeInitiatives, error: initiativesError }] =
    await Promise.all([
      supabase
        .from("projects")
        .select("id")
        .eq("owner_id", user.id)
        .is("completed_at", null),
      supabase
        .from("internal_initiatives")
        .select("id")
        .eq("owner_id", user.id)
        .eq("include_in_forecast", true)
        .is("completed_at", null),
    ]);
  if (projectsError) return { error: projectsError.message };
  if (initiativesError) return { error: initiativesError.message };

  const projectIds = (activeProjects ?? []).map((project) => project.id);
  const initiativeIds = (activeInitiatives ?? []).map((initiative) => initiative.id);
  if (projectIds.length === 0 && initiativeIds.length === 0) return { projectIds: [] };

  if (input.locked) {
    const now = new Date().toISOString();
    if (projectIds.length > 0) {
      const { error } = await supabase.from("project_forecast_week_locks").upsert(
        projectIds.map((projectId) => ({
          project_id: projectId,
          week_start_date: weekStartDate,
          updated_at: now,
        })),
        { onConflict: "project_id,week_start_date" },
      );
      if (error) return { error: error.message };
    }
    if (initiativeIds.length > 0) {
      const { error } = await supabase.from("initiative_forecast_week_locks").upsert(
        initiativeIds.map((initiativeId) => ({
          initiative_id: initiativeId,
          week_start_date: weekStartDate,
          updated_at: now,
        })),
        { onConflict: "initiative_id,week_start_date" },
      );
      if (error) return { error: error.message };
    }
  } else {
    if (projectIds.length > 0) {
      const { error } = await supabase
        .from("project_forecast_week_locks")
        .delete()
        .in("project_id", projectIds)
        .eq("week_start_date", weekStartDate);
      if (error) return { error: error.message };
    }
    if (initiativeIds.length > 0) {
      const { error } = await supabase
        .from("initiative_forecast_week_locks")
        .delete()
        .in("initiative_id", initiativeIds)
        .eq("week_start_date", weekStartDate);
      if (error) return { error: error.message };
    }
  }

  revalidatePath("/forecast");
  revalidatePath("/home");
  return { projectIds: [...projectIds, ...initiativeIds] };
}

export async function saveProjectForecastDraft(
  projectId: string,
  input: {
    todayIso: string;
    cells: Array<{ weekStartDate: string; hours: number }>;
    reserveHours?: number;
  },
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const todayIso = String(input.todayIso ?? "").trim();
  if (!isValidYmd(todayIso)) return { error: "Invalid today date." };

  const currentSunday = currentSundayWeekYmd(todayIso);
  const now = new Date().toISOString();
  const upserts: Array<{
    week_start_date: string;
    hours: number;
  }> = [];
  const zeroDeletes: string[] = [];

  for (const cell of input.cells ?? []) {
    const weekStartDate = String(cell.weekStartDate ?? "").trim();
    const hours = Math.round(Number(cell.hours));
    if (!isValidYmd(weekStartDate)) {
      return { error: "Invalid forecast cell." };
    }
    if (weekStartDate < currentSunday) {
      return { error: "Past weeks cannot be edited." };
    }
    if (!Number.isFinite(hours) || hours < 0) {
      return { error: "Hours must be a non-negative integer." };
    }
    if (hours === 0) {
      zeroDeletes.push(weekStartDate);
    } else {
      upserts.push({
        week_start_date: weekStartDate,
        hours,
      });
    }
  }

  let reserveHours: number | null = null;
  if (input.reserveHours != null) {
    const reserve = Math.round(Number(input.reserveHours));
    if (!Number.isFinite(reserve) || reserve < 0) {
      return { error: "Reserve hours must be a non-negative integer." };
    }
    reserveHours = reserve;
  }

  const { error: persistError } = await supabase.rpc("save_project_forecast_draft", {
    p_project_id: projectId,
    p_cells: upserts,
    p_delete_weeks: zeroDeletes,
    p_reserve_hours: reserveHours,
    p_updated_at: now,
  });
  if (persistError) return { error: persistError.message };

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/forecast");
  revalidatePath("/home");
  return {};
}

/** Active projects + initiatives + today for the inbox forecast review panel. */
export async function loadInboxForecastReviewProjects(): Promise<{
  error?: string;
  todayIso?: string;
  projects?: ForecastProjectDTO[];
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const prefsRes = await loadUserPreferences();
  const todayIso = getUserTodayIso(prefsRes.preferences.timezone);
  const projects = await loadAllActiveForecastItems(supabase, user.id, {
    todayIso,
    timeZone: prefsRes.preferences.timezone,
  });
  return { todayIso, projects };
}
