"use client";

import { useEffect, useRef } from "react";

import { DialogCloseButton } from "@/components/dialog-close-button";
import { InitiativeIcpPill } from "@/components/initiative-icp-pill";
import {
  type HomeActualsVsForecastDTO,
  type HomeActualsVsForecastProject,
  type HomeWeekTotals,
  hasForecastHours,
  isVarianceWithinPercent,
  sumWeekTotals,
  variancePercentAbs,
  variancePercentLabel,
  varianceTrendWeeks,
} from "@/lib/home-actuals-vs-forecast";
import { formatEffortHoursLabel } from "@/lib/integration-effort-buckets";
import { formatSundayWeekLabel } from "@/lib/project-weekly-effort";

/** Narrow label column; week + total columns share remaining width equally. */
const PROJECT_COL_WIDTH = "minmax(4.75rem, 6.25rem)";
const CELL_PAD_TOP_PX = 8;
const FA_BLOCK_PX = 20;
const LABEL_BAND_PX = 36;
const PLOT_HEIGHT_PX = 96;
const BAR_MAX_HALF_PX = PLOT_HEIGHT_PX / 2 - 1;
/** Vertical center of chart band — shared baseline across week columns in a row. */
const BASELINE_FROM_ROW_TOP_PX =
  CELL_PAD_TOP_PX + FA_BLOCK_PX + 2 + LABEL_BAND_PX + PLOT_HEIGHT_PX / 2;
const ROW_MIN_PX =
  CELL_PAD_TOP_PX +
  FA_BLOCK_PX +
  2 +
  LABEL_BAND_PX +
  PLOT_HEIGHT_PX +
  LABEL_BAND_PX +
  8;
const ON_TARGET_EPS = 0.001;
const TOTAL_COL_SURFACE = "var(--app-surface-alt)";

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

function VarianceSparkCell({
  totals,
  withinFivePercent,
}: {
  totals: HomeWeekTotals;
  withinFivePercent: boolean;
}) {
  const hasForecast = hasForecastHours(totals.forecast);
  const onTarget = !hasForecast || Math.abs(totals.variance) < ON_TARGET_EPS;
  /** Over forecast → bar up; under forecast → bar down. */
  const isOver = hasForecast && totals.variance < -ON_TARGET_EPS;
  const isUnder = hasForecast && totals.variance > ON_TARGET_EPS;
  const pctAbs = hasForecast ? variancePercentAbs(totals.forecast, totals.variance) : null;
  const pctLabel = hasForecast ? variancePercentLabel(totals.forecast, totals.variance) : null;
  const barHeightPx =
    pctAbs != null && !onTarget
      ? Math.min(BAR_MAX_HALF_PX, Math.max(2, (Math.min(pctAbs, 100) / 100) * BAR_MAX_HALF_PX))
      : 0;

  return (
    <div
      className="flex h-full min-h-0 flex-col items-center px-0.5 text-center"
      style={{
        paddingTop: CELL_PAD_TOP_PX,
        paddingBottom: 8,
        ...(withinFivePercent ? { background: "var(--app-state-active-surface)" } : undefined),
      }}
    >
      <div
        className="flex w-full shrink-0 items-center justify-center"
        style={{ height: FA_BLOCK_PX }}
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
        style={{ height: LABEL_BAND_PX }}
      >
        {isOver ? <VarianceLabel variance={totals.variance} pctLabel={pctLabel} /> : null}
      </div>

      <div
        className="relative w-full shrink-0"
        style={{ height: PLOT_HEIGHT_PX }}
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
        style={{ height: LABEL_BAND_PX }}
      >
        {isUnder ? <VarianceLabel variance={totals.variance} pctLabel={pctLabel} /> : null}
      </div>
    </div>
  );
}

function sparkCellTitle(
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

function weekSparkWithinFive(
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

function ProjectVarianceRow({
  project,
  weeks,
  currentSunday,
  chartGridTemplate,
}: {
  project: HomeActualsVsForecastProject;
  weeks: string[];
  currentSunday: string | null;
  chartGridTemplate: string;
}) {
  const period = sumWeekTotals(project.byWeek, weeks);

  return (
    <>
      <div
        className="sticky left-0 z-[1] flex flex-col justify-center border-b border-r px-2 py-3"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-surface)",
          minHeight: ROW_MIN_PX,
        }}
        title={project.name}
      >
        <span className="flex items-start gap-1.5">
          <span className="min-w-0 break-words text-sm font-medium leading-snug text-[var(--app-text)]">
            {project.name}
          </span>
          {project.isIcp ? <InitiativeIcpPill className="mt-0.5 shrink-0" /> : null}
        </span>
      </div>
      <div
        className="relative grid min-w-0 border-b"
        style={{
          gridTemplateColumns: chartGridTemplate,
          borderColor: "var(--app-border)",
          minHeight: ROW_MIN_PX,
        }}
      >
        <div
          className="pointer-events-none absolute inset-x-0 z-[0] h-px"
          style={{
            top: BASELINE_FROM_ROW_TOP_PX,
            background: "var(--app-border)",
          }}
          aria-hidden
        />
        {weeks.map((week) => {
          const totals = project.byWeek[week] ?? {
            forecast: 0,
            actual: 0,
            variance: 0,
          };
          return (
            <div
              key={`${project.id}-${week}`}
              className="relative z-[1] min-h-0 min-w-0"
              title={sparkCellTitle(project.name, totals, formatSundayWeekLabel(week))}
            >
              <VarianceSparkCell
                totals={totals}
                withinFivePercent={weekSparkWithinFive(totals, week, currentSunday)}
              />
            </div>
          );
        })}
        <div
          className="relative z-[1] min-h-0 min-w-0 border-l"
          style={{
            borderColor: "var(--app-border)",
            background: TOTAL_COL_SURFACE,
          }}
          title={sparkCellTitle(project.name, period, "Total")}
        >
          <VarianceSparkCell
            totals={period}
            withinFivePercent={
              hasForecastHours(period.forecast) &&
              isVarianceWithinPercent(period.forecast, period.variance, 5)
            }
          />
        </div>
      </div>
    </>
  );
}

export function HomeVarianceTrendsDialog({
  data,
  onClose,
}: {
  data: HomeActualsVsForecastDTO;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const trendWeeks = varianceTrendWeeks(data.weeks);
  const weekCount = Math.max(trendWeeks.length, 1);
  const currentSunday = data.weeks[data.weeks.length - 1] ?? null;
  const chartGridTemplate = `repeat(${weekCount}, minmax(0, 1fr)) minmax(0, 1fr)`;

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="app-catalog-dialog fixed left-1/2 top-1/2 z-[215] -translate-x-1/2 -translate-y-1/2 overflow-hidden border-0 p-0 shadow-xl w-[calc(100vw-0.75rem)] max-w-[calc(100vw-0.75rem)]"
      style={{
        borderRadius: "12px",
        background: "var(--app-surface)",
        color: "var(--app-text)",
        height: "min(96dvh, calc(100vh - 0.75rem))",
        maxHeight: "min(96dvh, calc(100vh - 0.75rem))",
      }}
      onClose={onClose}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div
          className="flex shrink-0 items-start justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: "var(--app-border)" }}
        >
          <div className="min-w-0">
            <h2 className="text-lg font-medium leading-tight text-[var(--app-text)]">
              Variance Trends
            </h2>
            <p className="mt-1 text-sm text-muted-canvas">Last 12 weeks.</p>
          </div>
          <DialogCloseButton onClick={() => dialogRef.current?.close()} />
        </div>

        <div className="min-h-0 flex-1 px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
          {data.projects.length === 0 ? (
            <p className="text-sm text-muted-canvas">No active projects.</p>
          ) : (
            <div
              className="h-full overflow-x-hidden overflow-y-auto rounded-[10px] border"
              style={{ borderColor: "var(--app-border)" }}
            >
              <div
                className="w-full min-w-0"
                style={{
                  display: "grid",
                  gridTemplateColumns: `${PROJECT_COL_WIDTH} minmax(0, 1fr)`,
                }}
              >
                <div
                  className="sticky top-0 left-0 z-[3] border-b border-r px-2 py-2 text-xs font-medium text-muted-canvas"
                  style={{
                    borderColor: "var(--app-border)",
                    background: "var(--app-surface)",
                  }}
                >
                  Project
                </div>
                <div
                  className="sticky top-0 z-[2] grid min-w-0 border-b"
                  style={{
                    gridTemplateColumns: chartGridTemplate,
                    borderColor: "var(--app-border)",
                    background: "var(--app-surface)",
                  }}
                >
                  {trendWeeks.map((week) => (
                    <div
                      key={week}
                      className="min-w-0 px-0.5 py-2 text-center text-[0.65rem] font-medium leading-tight text-muted-canvas"
                    >
                      {formatSundayWeekLabel(week)}
                    </div>
                  ))}
                  <div
                    className="min-w-0 border-l px-0.5 py-2 text-center text-[0.65rem] font-medium leading-tight text-muted-canvas"
                    style={{
                      borderColor: "var(--app-border)",
                      background: TOTAL_COL_SURFACE,
                    }}
                  >
                    Total
                  </div>
                </div>

                {data.projects.map((p) => (
                  <ProjectVarianceRow
                    key={p.id}
                    project={p}
                    weeks={trendWeeks}
                    currentSunday={currentSunday}
                    chartGridTemplate={chartGridTemplate}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
