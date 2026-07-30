"use client";

import { useEffect, useRef } from "react";

import { DialogCloseButton } from "@/components/dialog-close-button";
import { InitiativeIcpPill } from "@/components/initiative-icp-pill";
import {
  VARIANCE_BASELINE_FROM_ROW_TOP_PX,
  VARIANCE_PROJECT_COL_WIDTH,
  VARIANCE_ROW_MIN_PX,
  VARIANCE_TOTAL_COL_SURFACE,
  VarianceSparkCell,
  varianceSparkCellTitle,
  weekSparkWithinFive,
} from "@/components/variance-spark-cell";
import {
  type HomeActualsVsForecastDTO,
  type HomeActualsVsForecastProject,
  hasForecastHours,
  isVarianceWithinPercent,
  sumWeekTotals,
  varianceTrendWeeks,
} from "@/lib/home-actuals-vs-forecast";
import { formatSundayWeekLabel } from "@/lib/project-weekly-effort";

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
          minHeight: VARIANCE_ROW_MIN_PX,
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
          minHeight: VARIANCE_ROW_MIN_PX,
        }}
      >
        <div
          className="pointer-events-none absolute inset-x-0 z-[0] h-px"
          style={{
            top: VARIANCE_BASELINE_FROM_ROW_TOP_PX,
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
              title={varianceSparkCellTitle(project.name, totals, formatSundayWeekLabel(week))}
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
            background: VARIANCE_TOTAL_COL_SURFACE,
          }}
          title={varianceSparkCellTitle(project.name, period, "Total")}
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
                  gridTemplateColumns: `${VARIANCE_PROJECT_COL_WIDTH} minmax(0, 1fr)`,
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
                      background: VARIANCE_TOTAL_COL_SURFACE,
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
