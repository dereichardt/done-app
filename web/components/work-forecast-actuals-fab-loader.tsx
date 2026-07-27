import { WorkForecastActualsFab } from "@/components/work-forecast-actuals-overlay";
import {
  loadHomeActualsVsForecast,
  makeWeekTotals,
  type HomeActualsVsForecastDTO,
} from "@/lib/home-actuals-vs-forecast";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import {
  loadWorkForecastTrackActuals,
  type WorkForecastTrackActual,
} from "@/lib/work-forecast-track-actuals";
import type { TasksPageProject, TasksPageTrack } from "@/lib/tasks-page-shared";
import { devPerfDuration } from "@/lib/dev-perf-log";

const EMPTY_FORECAST: HomeActualsVsForecastDTO = {
  thisWeek: makeWeekTotals(0, 0),
  priorWeek: makeWeekTotals(0, 0),
  weeks: [],
  projects: [],
};

export async function WorkForecastActualsFabLoader({
  todayIso,
  projects,
  tracks,
}: {
  todayIso: string;
  projects: TasksPageProject[];
  tracks: TasksPageTrack[];
}) {
  const perfStart = typeof performance !== "undefined" ? performance.now() : 0;
  const user = await getCurrentUser();
  let actualsVsForecast: HomeActualsVsForecastDTO = EMPTY_FORECAST;
  let trackActuals: WorkForecastTrackActual[] = [];

  if (user) {
    const supabase = await createClient();
    const [forecast, tracksData] = await Promise.all([
      loadHomeActualsVsForecast(supabase, user.id, todayIso),
      loadWorkForecastTrackActuals(supabase, user.id, todayIso),
    ]);
    actualsVsForecast = forecast;
    trackActuals = tracksData;
  }

  devPerfDuration("WorkForecastActualsFabLoader", perfStart);

  return (
    <WorkForecastActualsFab
      data={actualsVsForecast}
      trackActuals={trackActuals}
      projects={projects}
      tracks={tracks}
    />
  );
}
