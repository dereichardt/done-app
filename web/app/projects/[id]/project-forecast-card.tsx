"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ForecastBankedSummaryPanel } from "@/components/forecast-banked-summary";
import { GenerateForecastDialog } from "@/components/generate-forecast-dialog";
import {
  formatLocalYmd,
  formatEffortHoursLabel,
  parseLocalYmd,
} from "@/lib/integration-effort-buckets";
import {
  computeForecastBankedSummary,
  currentSundayWeekYmd,
  forecastPrerequisites,
  projectTotalsByWeek,
  DEFAULT_FORECAST_PM_PERCENT,
} from "@/lib/project-forecast";
import { formatSundayWeekLabel } from "@/lib/project-weekly-effort";
import type { ForecastProjectDTO } from "@/lib/forecast-data";
import type { DeploymentEffortByPhase } from "@/lib/user-preferences";

const PREVIEW_WEEK_COUNT = 12;

function sundayWeeksFrom(startSundayYmd: string, count: number): string[] {
  const start = parseLocalYmd(startSundayYmd);
  if (Number.isNaN(start.getTime()) || count <= 0) return [];
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i * 7);
    out.push(formatLocalYmd(d));
  }
  return out;
}

function formatSummaryHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "0h";
  return formatEffortHoursLabel(hours).replace(/\s*hr$/, "h");
}

export function ProjectForecastCard({
  project,
  todayIso,
  deploymentEffortByPhase,
}: {
  project: ForecastProjectDTO;
  todayIso: string;
  deploymentEffortByPhase: DeploymentEffortByPhase;
}) {
  const router = useRouter();
  const [showGenerate, setShowGenerate] = useState(false);

  const prereq = useMemo(
    () =>
      forecastPrerequisites({
        phases: project.phases,
        integrations: project.integrations,
      }),
    [project.phases, project.integrations],
  );

  const hasForecast = project.forecast != null;
  const currentSunday = useMemo(() => currentSundayWeekYmd(todayIso), [todayIso]);

  const previewWeeks = useMemo(
    () => sundayWeeksFrom(currentSunday, PREVIEW_WEEK_COUNT),
    [currentSunday],
  );

  const forecastByWeek = useMemo(
    () => projectTotalsByWeek(project.hoursByRow, previewWeeks),
    [project.hoursByRow, previewWeeks],
  );

  const estimatedTotal = useMemo(() => {
    let sum = 0;
    for (const integ of project.integrations) {
      const h = Number(integ.estimatedEffortHours);
      if (Number.isFinite(h) && h > 0) sum += h;
    }
    return sum;
  }, [project.integrations]);

  const actualsTotal = useMemo(() => {
    let sum = 0;
    for (const v of Object.values(project.actualsByRowKey)) {
      if (Number.isFinite(v) && v > 0) sum += v;
    }
    return sum;
  }, [project.actualsByRowKey]);

  const forecastRemainingTotal = useMemo(() => {
    let sum = 0;
    for (const row of Object.values(project.hoursByRow)) {
      for (const [week, hours] of Object.entries(row)) {
        if (week < currentSunday) continue;
        if (Number.isFinite(hours) && hours > 0) sum += hours;
      }
    }
    return Math.round(sum);
  }, [project.hoursByRow, currentSunday]);

  const bankedSummary = useMemo(() => {
    if (!hasForecast) return null;
    return computeForecastBankedSummary({
      phases: project.phases,
      integrations: project.integrations,
      deploymentEffortByPhase,
      pmPercent: project.forecast?.pm_percent ?? DEFAULT_FORECAST_PM_PERCENT,
      startMode: "this_week",
      todayIso,
      actualsByRowKey: project.actualsByRowKey,
    });
  }, [
    hasForecast,
    project.phases,
    project.integrations,
    project.forecast?.pm_percent,
    project.actualsByRowKey,
    deploymentEffortByPhase,
    todayIso,
  ]);

  const bankedHours = bankedSummary?.bankedHours ?? 0;

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="section-heading">Forecast</h2>
        <div className="flex flex-wrap items-center gap-2">
          {hasForecast ? (
            <Link href={`/forecast?project=${project.id}`} className="btn-cta-tertiary">
              Open Forecast Studio
            </Link>
          ) : null}
          <button
            type="button"
            className="btn-cta-dark"
            disabled={!prereq.ok}
            title={!prereq.ok ? prereq.reason : undefined}
            onClick={() => setShowGenerate(true)}
          >
            {hasForecast ? "Regenerate Forecast" : "Generate Forecast"}
          </button>
        </div>
      </div>

      {!prereq.ok ? (
        <p className="mt-3 text-sm text-[var(--app-text-muted)]">{prereq.reason}</p>
      ) : null}

      <div className="card-canvas mt-3 p-4">
        {!hasForecast ? (
          <p className="text-sm text-[var(--app-text-muted)]">
            No forecast yet. Generate one from the timeline and integration estimates, then refine
            hours in Forecast Studio.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="overflow-x-auto pb-1">
              <div className="flex min-w-min gap-2">
                {previewWeeks.map((w) => {
                  const hours = forecastByWeek[w] ?? 0;
                  const isCurrent = w === currentSunday;
                  return (
                    <div
                      key={w}
                      className={
                        isCurrent
                          ? "flex w-[5.5rem] shrink-0 flex-col items-center rounded-lg border border-[var(--app-action)] bg-[var(--app-info-surface)] px-2 py-2"
                          : "flex w-[5.5rem] shrink-0 flex-col items-center rounded-lg border border-[var(--app-border)] px-2 py-2"
                      }
                    >
                      <span
                        className={
                          isCurrent
                            ? "text-[0.65rem] font-medium text-[var(--app-action)]"
                            : "text-[0.65rem] font-medium text-[var(--app-text-muted)]"
                        }
                      >
                        {isCurrent ? "This week" : formatSundayWeekLabel(w)}
                      </span>
                      <span className="mt-1 text-sm font-medium tabular-nums text-[var(--app-text)]">
                        {hours > 0 ? formatEffortHoursLabel(hours) : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-stretch gap-0 border-t border-[var(--app-border)] pt-3">
              <div className="flex min-w-[6.5rem] flex-1 flex-col gap-0.5 px-3 first:pl-0">
                <span className="text-xs font-medium text-[var(--app-text-muted)]">Estimated</span>
                <span className="text-sm font-medium tabular-nums text-[var(--app-text)]">
                  {formatSummaryHours(estimatedTotal)}
                </span>
              </div>
              <div className="flex min-w-[6.5rem] flex-1 flex-col gap-0.5 border-l border-[var(--app-border)] px-3">
                <span className="text-xs font-medium text-[var(--app-text-muted)]">Actuals</span>
                <span className="text-sm font-medium tabular-nums text-[var(--app-text)]">
                  {formatSummaryHours(actualsTotal)}
                </span>
              </div>
              <div className="flex min-w-[6.5rem] flex-1 flex-col gap-0.5 border-l border-[var(--app-border)] px-3">
                <span className="text-xs font-medium text-[var(--app-text-muted)]">Forecast</span>
                <span className="text-sm font-medium tabular-nums text-[var(--app-text)]">
                  {formatSummaryHours(forecastRemainingTotal)}
                </span>
              </div>
              <div className="flex min-w-[6.5rem] flex-1 flex-col gap-0.5 border-l border-[var(--app-border)] px-3 last:pr-0">
                <span className="text-xs font-medium text-[var(--app-text-muted)]">
                  Banked Hours
                </span>
                {bankedHours > 0 ? (
                  <ForecastBankedSummaryPanel summary={bankedSummary} inline valueOnly />
                ) : (
                  <span className="text-sm font-medium tabular-nums text-[var(--app-text)]">0h</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {showGenerate ? (
        <GenerateForecastDialog
          projectId={project.id}
          projectLabel={project.customer_name}
          phases={project.phases}
          integrations={project.integrations}
          actualsByRowKey={project.actualsByRowKey}
          deploymentEffortByPhase={deploymentEffortByPhase}
          defaultPmPercent={project.forecast?.pm_percent ?? DEFAULT_FORECAST_PM_PERCENT}
          defaultSpreadMode={project.forecast?.spread_mode ?? "even"}
          hasExistingForecast={project.forecast != null}
          todayIso={todayIso}
          onClose={() => setShowGenerate(false)}
          onGenerated={() => {
            setShowGenerate(false);
            router.refresh();
          }}
        />
      ) : null}
    </section>
  );
}
