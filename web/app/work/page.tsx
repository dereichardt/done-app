import { TasksPageClient } from "../tasks/tasks-page-client";
import { loadTasksPageSnapshot } from "@/lib/actions/tasks-page";
import { loadUserPreferences } from "@/lib/actions/user-preferences";
import {
  loadHomeActualsVsForecast,
  makeWeekTotals,
  type HomeActualsVsForecastDTO,
} from "@/lib/home-actuals-vs-forecast";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getUserTodayIso } from "@/lib/user-preferences";
import {
  loadWorkForecastTrackActuals,
  type WorkForecastTrackActual,
} from "@/lib/work-forecast-track-actuals";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

const EMPTY_FORECAST: HomeActualsVsForecastDTO = {
  thisWeek: makeWeekTotals(0, 0),
  priorWeek: makeWeekTotals(0, 0),
  weeks: [],
  projects: [],
};

export default async function WorkPage() {
  const user = await getCurrentUser();
  const { snapshot, error } = await loadTasksPageSnapshot();

  if (error || !snapshot) {
    return (
      <div>
        <h1 className="heading-page">Tasks</h1>
        <p className="subheading-page mt-2" style={{ color: "var(--app-danger)" }}>
          {error ?? "Could not load tasks."}
        </p>
      </div>
    );
  }

  if (snapshot.projects.length === 0) {
    return (
      <div>
        <h1 className="heading-page">Tasks</h1>
        <p className="subheading-page mt-2">
          You don&apos;t have any active projects yet. Create a project to start tracking tasks here, or use{" "}
          <a href="/internal" className="font-medium hover:underline" style={{ color: "var(--app-action)" }}>
            Internal
          </a>{" "}
          for Admin, Development, and initiative work.
        </p>
      </div>
    );
  }

  let actualsVsForecast: HomeActualsVsForecastDTO = EMPTY_FORECAST;
  let trackActuals: WorkForecastTrackActual[] = [];

  if (user) {
    const supabase = await createClient();
    const prefsRes = await loadUserPreferences();
    const todayIso = getUserTodayIso(prefsRes.preferences.timezone);
    const [forecast, tracks] = await Promise.all([
      loadHomeActualsVsForecast(supabase, user.id, todayIso),
      loadWorkForecastTrackActuals(supabase, user.id, todayIso),
    ]);
    actualsVsForecast = forecast;
    trackActuals = tracks;
  }

  return (
    <Suspense>
      <TasksPageClient
        initialSnapshot={snapshot}
        actualsVsForecast={actualsVsForecast}
        trackActuals={trackActuals}
      />
    </Suspense>
  );
}
