"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ForecastEstimateVariancePanel } from "@/components/forecast-estimate-variance";
import {
  formatLocalYmd,
  formatEffortHoursLabel,
  parseLocalYmd,
} from "@/lib/integration-effort-buckets";
import {
  actualsWithLockedForecastHours,
  computeEstimateVariance,
  computeForecastPastPhaseSummary,
  currentSundayWeekYmd,
  projectTotalsByWeek,
  sumActualsConsumedHours,
  sumEstimatedRoundedHours,
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

  const estimatedTotal = useMemo(
    () => sumEstimatedRoundedHours(project.integrations),
    [project.integrations],
  );

  const actualsTotal = useMemo(
    () => sumActualsConsumedHours(project.integrations, project.actualsByRowKey),
    [project.integrations, project.actualsByRowKey],
  );

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

  const variance = useMemo(
    () =>
      computeEstimateVariance({
        estimated: estimatedTotal,
        actuals: actualsTotal,
        forecastTotal: forecastRemainingTotal,
      }),
    [estimatedTotal, actualsTotal, forecastRemainingTotal],
  );

  const pastPhaseSummary = useMemo(() => {
    if (!hasForecast) return null;
    return computeForecastPastPhaseSummary({
      phases: project.phases,
      integrations: project.integrations,
      deploymentEffortByPhase,
      pmPercent: project.forecast?.pm_percent ?? DEFAULT_FORECAST_PM_PERCENT,
      startMode: "this_week",
      todayIso,
      actualsByRowKey: actualsWithLockedForecastHours({
        actualsByRowKey: project.actualsByRowKey,
        lockedWeekStarts: project.lockedWeekStarts,
        lockedHoursByRow: project.hoursByRow,
        currentSunday,
      }),
    });
  }, [
    hasForecast,
    project.phases,
    project.integrations,
    project.forecast?.pm_percent,
    project.actualsByRowKey,
    project.lockedWeekStarts,
    project.hoursByRow,
    deploymentEffortByPhase,
    currentSunday,
    todayIso,
  ]);

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="section-heading">Forecast</h2>
        <Link href={`/forecast?project=${project.id}`} className="btn-cta-tertiary">
          Open Forecast Studio
        </Link>
      </div>

      <div className="card-canvas mt-3 p-4">
        {!hasForecast ? (
          <p className="text-sm text-[var(--app-text-muted)]">
            No forecast yet. Open Forecast Studio to generate one from the timeline and integration
            estimates.
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
                  {variance.kind === "under"
                    ? "Under estimate"
                    : variance.kind === "over"
                      ? "Over estimate"
                      : "Estimate"}
                </span>
                <div className="flex items-center gap-1">
                  <span
                    className={`text-sm font-medium tabular-nums ${
                      variance.kind === "over"
                        ? "text-[var(--app-warning)]"
                        : "text-[var(--app-text)]"
                    }`}
                    title={variance.label}
                  >
                    {variance.kind === "on" ? "0h" : formatSummaryHours(variance.absHours)}
                  </span>
                  {pastPhaseSummary && pastPhaseSummary.pastPhaseHours > 0 ? (
                    <ForecastEstimateVariancePanel
                      summary={pastPhaseSummary}
                      inline
                      valueOnly
                      hideValue
                    />
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

    </section>
  );
}
