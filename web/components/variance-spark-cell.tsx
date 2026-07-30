"use client";

import {
  type HomeWeekTotals,
  hasForecastHours,
  isVarianceWithinPercent,
  variancePercentAbs,
  variancePercentLabel,
} from "@/lib/home-actuals-vs-forecast";
import { formatEffortHoursLabel } from "@/lib/integration-effort-buckets";

/** Narrow label column; week + total columns share remaining width equally. */
export const VARIANCE_PROJECT_COL_WIDTH = "minmax(4.75rem, 6.25rem)";
export const VARIANCE_CELL_PAD_TOP_PX = 8;
export const VARIANCE_FA_BLOCK_PX = 20;
export const VARIANCE_LABEL_BAND_PX = 36;
export const VARIANCE_PLOT_HEIGHT_PX = 96;
export const VARIANCE_BAR_MAX_HALF_PX = VARIANCE_PLOT_HEIGHT_PX / 2 - 1;
/** Vertical center of chart band — shared baseline across week columns in a row. */
export const VARIANCE_BASELINE_FROM_ROW_TOP_PX =
  VARIANCE_CELL_PAD_TOP_PX +
  VARIANCE_FA_BLOCK_PX +
  2 +
  VARIANCE_LABEL_BAND_PX +
  VARIANCE_PLOT_HEIGHT_PX / 2;
export const VARIANCE_ROW_MIN_PX =
  VARIANCE_CELL_PAD_TOP_PX +
  VARIANCE_FA_BLOCK_PX +
  2 +
  VARIANCE_LABEL_BAND_PX +
  VARIANCE_PLOT_HEIGHT_PX +
  VARIANCE_LABEL_BAND_PX +
  8;
export const VARIANCE_ON_TARGET_EPS = 0.001;
export const VARIANCE_TOTAL_COL_SURFACE = "var(--app-surface-alt)";

function formatCompactHours(hours: number): string {
  if (!Number.isFinite(hours) || Math.abs(hours) < 0.001) return "0";
  const q = Math.round(hours * 4) / 4;
  return Number.isInteger(q) ? String(q) : String(parseFloat(q.toFixed(2)));
}

function formatAbsVarianceHours(variance: number): string {
  if (!Number.isFinite(variance) || Math.abs(variance) < 0.001) return "0";
  return formatCompactHours(Math.abs(variance));
}

function VarianceLabel({
  variance,
  pctLabel,
}: {
  variance: number;
  pctLabel: string | null;
}) {
  return (
    <div className="flex w-full flex-col items-center justify-center">
      <span className="text-[0.7rem] font-medium tabular-nums leading-tight text-[var(--app-text)]">
        {formatAbsVarianceHours(variance)} hrs
      </span>
      {pctLabel ? (
        <span className="text-[0.625rem] font-normal leading-tight tabular-nums text-muted-canvas">
          {pctLabel}
        </span>
      ) : null}
    </div>
  );
}

export function VarianceSparkCell({
  totals,
  withinFivePercent,
  emphasized = false,
}: {
  totals: HomeWeekTotals;
  withinFivePercent: boolean;
  /** Emphasize the most recent completed week in inbox review. */
  emphasized?: boolean;
}) {
  const hasForecast = hasForecastHours(totals.forecast);
  const onTarget = !hasForecast || Math.abs(totals.variance) < VARIANCE_ON_TARGET_EPS;
  /** Over forecast → bar up; under forecast → bar down. */
  const isOver = hasForecast && totals.variance < -VARIANCE_ON_TARGET_EPS;
  const isUnder = hasForecast && totals.variance > VARIANCE_ON_TARGET_EPS;
  const pctAbs = hasForecast ? variancePercentAbs(totals.forecast, totals.variance) : null;
  const pctLabel = hasForecast ? variancePercentLabel(totals.forecast, totals.variance) : null;
  const barHeightPx =
    pctAbs != null && !onTarget
      ? Math.min(
          VARIANCE_BAR_MAX_HALF_PX,
          Math.max(2, (Math.min(pctAbs, 100) / 100) * VARIANCE_BAR_MAX_HALF_PX),
        )
      : 0;

  return (
    <div
      className="flex h-full min-h-0 flex-col items-center px-0.5 text-center"
      style={{
        paddingTop: VARIANCE_CELL_PAD_TOP_PX,
        paddingBottom: 8,
        ...(withinFivePercent && !emphasized
          ? { background: "var(--app-state-active-surface)" }
          : undefined),
        ...(emphasized
          ? {
              background: "color-mix(in oklab, var(--app-info-surface) 70%, var(--app-surface))",
              boxShadow: "inset 3px 0 0 0 var(--app-info)",
            }
          : undefined),
      }}
    >
      <div
        className="flex w-full shrink-0 items-center justify-center"
        style={{ height: VARIANCE_FA_BLOCK_PX }}
      >
        {hasForecast ? (
          <span className="text-[0.65rem] leading-tight text-muted-canvas tabular-nums">
            F {formatCompactHours(totals.forecast)} · A {formatCompactHours(totals.actual)}
          </span>
        ) : (
          <span className="text-sm font-medium leading-tight text-muted-canvas">—</span>
        )}
      </div>

      <div
        className="mt-0.5 flex w-full shrink-0 items-end justify-center"
        style={{ height: VARIANCE_LABEL_BAND_PX }}
      >
        {isOver ? <VarianceLabel variance={totals.variance} pctLabel={pctLabel} /> : null}
      </div>

      <div
        className="relative w-full shrink-0"
        style={{ height: VARIANCE_PLOT_HEIGHT_PX }}
        aria-hidden={!hasForecast}
      >
        {isOver ? (
          <div
            className="absolute left-1/2 w-7 -translate-x-1/2 rounded-sm bg-[var(--app-text)]"
            style={{
              bottom: "50%",
              height: barHeightPx,
            }}
          />
        ) : null}
        {isUnder ? (
          <div
            className="absolute left-1/2 w-7 -translate-x-1/2 rounded-sm bg-[var(--app-text)]"
            style={{
              top: "50%",
              height: barHeightPx,
            }}
          />
        ) : null}
      </div>

      <div
        className="flex w-full shrink-0 items-start justify-center"
        style={{ height: VARIANCE_LABEL_BAND_PX }}
      >
        {isUnder ? <VarianceLabel variance={totals.variance} pctLabel={pctLabel} /> : null}
      </div>
    </div>
  );
}

export function varianceSparkCellTitle(
  projectName: string,
  totals: HomeWeekTotals,
  label: string,
): string {
  const hasForecast = hasForecastHours(totals.forecast);
  const pctLabel = hasForecast ? variancePercentLabel(totals.forecast, totals.variance) : null;
  if (hasForecast) {
    return `${projectName} (${label}): variance ${formatEffortHoursLabel(totals.variance)}${
      pctLabel ? ` (${pctLabel})` : ""
    }, forecast ${formatEffortHoursLabel(totals.forecast)}, actual ${formatEffortHoursLabel(totals.actual)}`;
  }
  return `${projectName} (${label}): no forecast, actual ${formatEffortHoursLabel(totals.actual)}`;
}

export function weekSparkWithinFive(
  totals: HomeWeekTotals,
  week: string,
  currentSunday: string | null,
): boolean {
  const hasForecast = hasForecastHours(totals.forecast);
  const isPastWeek = currentSunday != null && week < currentSunday;
  return (
    hasForecast && isPastWeek && isVarianceWithinPercent(totals.forecast, totals.variance, 5)
  );
}
