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
  type ForecastSpreadMode,
  type ForecastStartMode,
} from "@/lib/project-forecast";
import {
  loadAllActiveForecastProjects,
  loadForecastProjectDTO,
  type ForecastProjectDTO,
} from "@/lib/forecast-data";
import { getUserTodayIso } from "@/lib/user-preferences";

function isValidYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidPmPercent(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 100 && n % 5 === 0;
}

function isValidStartMode(value: unknown): value is ForecastStartMode {
  return value === "this_week" || value === "next_week";
}

export async function generateProjectForecast(
  projectId: string,
  input: {
    startMode: ForecastStartMode;
    pmPercent: number;
    spreadMode: ForecastSpreadMode;
    todayIso: string;
  },
): Promise<{ error?: string; project?: NonNullable<Awaited<ReturnType<typeof loadForecastProjectDTO>>> }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const todayIso = String(input.todayIso ?? "").trim();
  const pmPercent = Number(input.pmPercent);
  const startMode = input.startMode;
  const spreadMode = input.spreadMode;

  if (!isValidYmd(todayIso)) return { error: "Invalid today date." };
  if (!isValidStartMode(startMode)) {
    return { error: "Choose This week or Next week." };
  }
  if (!isValidPmPercent(pmPercent)) {
    return { error: "PM % must be a multiple of 5 between 0 and 100." };
  }
  if (!isForecastSpreadMode(spreadMode)) {
    return { error: "Choose Even spread or Bell curve." };
  }

  const dto = await loadForecastProjectDTO(supabase, projectId, user.id);
  if (!dto) return { error: "Project not found" };

  const startDate = forecastStartSundayYmd(todayIso, startMode);

  const prefsRes = await loadUserPreferences();
  // Fresh actuals from DTO (per integration + PM / project tracks) always reduce remaining hours.
  const generated = generateForecastHours({
    phases: dto.phases as ForecastPhaseInput[],
    integrations: dto.integrations,
    deploymentEffortByPhase: prefsRes.preferences.deployment_effort_by_phase,
    pmPercent,
    startMode,
    spreadMode,
    todayIso,
    actualsByRowKey: dto.actualsByRowKey,
  });

  if (generated.error) return { error: generated.error };

  const now = new Date().toISOString();
  const { error: upsertHeaderError } = await supabase.from("project_forecasts").upsert(
    {
      project_id: projectId,
      start_date: startDate,
      pm_percent: pmPercent,
      spread_mode: spreadMode,
      generated_at: now,
      updated_at: now,
    },
    { onConflict: "project_id" },
  );
  if (upsertHeaderError) return { error: upsertHeaderError.message };

  // Replace only from the chosen start Sunday forward (keeps earlier weeks, including
  // “this week” when regenerating for “next week”).
  const { error: deleteError } = await supabase
    .from("project_forecast_hours")
    .delete()
    .eq("project_id", projectId)
    .gte("week_start_date", startDate);
  if (deleteError) return { error: deleteError.message };

  const cells: Array<{
    project_id: string;
    row_key: string;
    week_start_date: string;
    hours: number;
    updated_at: string;
  }> = [];

  for (const row of generated.rows) {
    for (const [week, hours] of Object.entries(row.hoursByWeekYmd)) {
      if (week < startDate) continue;
      const h = Math.max(0, Math.round(hours));
      if (h === 0) continue;
      cells.push({
        project_id: projectId,
        row_key: row.rowKey,
        week_start_date: week,
        hours: h,
        updated_at: now,
      });
    }
  }

  if (cells.length > 0) {
    const { error: insertError } = await supabase.from("project_forecast_hours").upsert(cells, {
      onConflict: "project_id,row_key,week_start_date",
    });
    if (insertError) return { error: insertError.message };
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/forecast");

  const project = await loadForecastProjectDTO(supabase, projectId, user.id);
  return { project: project ?? undefined };
}

export async function saveProjectForecastDraft(
  projectId: string,
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

  const todayIso = String(input.todayIso ?? "").trim();
  if (!isValidYmd(todayIso)) return { error: "Invalid today date." };

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!project) return { error: "Project not found" };

  const { data: forecast } = await supabase
    .from("project_forecasts")
    .select("project_id")
    .eq("project_id", projectId)
    .maybeSingle();
  if (!forecast) return { error: "Generate a forecast before editing." };

  const currentSunday = currentSundayWeekYmd(todayIso);
  const now = new Date().toISOString();
  const upserts: Array<{
    project_id: string;
    row_key: string;
    week_start_date: string;
    hours: number;
    updated_at: string;
  }> = [];
  const zeroDeletes: Array<{ rowKey: string; weekStartDate: string }> = [];

  for (const cell of input.cells ?? []) {
    const weekStartDate = String(cell.weekStartDate ?? "").trim();
    const rowKey = String(cell.rowKey ?? "").trim();
    const hours = Math.round(Number(cell.hours));
    if (!rowKey || !isValidYmd(weekStartDate)) {
      return { error: "Invalid forecast cell." };
    }
    if (weekStartDate < currentSunday) {
      return { error: "Past weeks cannot be edited." };
    }
    if (!Number.isFinite(hours) || hours < 0) {
      return { error: "Hours must be a non-negative integer." };
    }
    if (hours === 0) {
      zeroDeletes.push({ rowKey, weekStartDate });
    } else {
      upserts.push({
        project_id: projectId,
        row_key: rowKey,
        week_start_date: weekStartDate,
        hours,
        updated_at: now,
      });
    }
  }

  if (upserts.length > 0) {
    const { error } = await supabase.from("project_forecast_hours").upsert(upserts, {
      onConflict: "project_id,row_key,week_start_date",
    });
    if (error) return { error: error.message };
  }

  for (const z of zeroDeletes) {
    const { error } = await supabase
      .from("project_forecast_hours")
      .delete()
      .eq("project_id", projectId)
      .eq("row_key", z.rowKey)
      .eq("week_start_date", z.weekStartDate);
    if (error) return { error: error.message };
  }

  await supabase
    .from("project_forecasts")
    .update({ updated_at: now })
    .eq("project_id", projectId);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/forecast");
  revalidatePath("/home");
  return {};
}

/** Active projects + today for the inbox slim forecast review panel. */
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
  const projects = await loadAllActiveForecastProjects(supabase, user.id);
  return { todayIso, projects };
}
