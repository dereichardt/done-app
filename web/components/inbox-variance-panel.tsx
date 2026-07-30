"use client";

import { useEffect, useMemo, useState } from "react";

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
import { loadInboxVarianceReview } from "@/lib/actions/home-inbox";
import {
  type HomeActualsVsForecastDTO,
  type HomeActualsVsForecastProject,
  type HomeWeekTotals,
  hasForecastHours,
  isVarianceWithinPercent,
  makeWeekTotals,
  sumWeekTotals,
} from "@/lib/home-actuals-vs-forecast";
import { formatSundayWeekLabel } from "@/lib/project-weekly-effort";

function portfolioWeekTotals(data: HomeActualsVsForecastDTO, weekStart: string): HomeWeekTotals {
  return data.projects.reduce((acc, p) => {
    const t = p.byWeek[weekStart] ?? makeWeekTotals(0, 0);
    return makeWeekTotals(acc.forecast + t.forecast, acc.actual + t.actual);
  }, makeWeekTotals(0, 0));
}

function PortfolioVarianceRow({
  data,
  weeks,
  highlightWeek,
  currentSunday,
  chartGridTemplate,
}: {
  data: HomeActualsVsForecastDTO;
  weeks: string[];
  highlightWeek: string | null;
  currentSunday: string | null;
  chartGridTemplate: string;
}) {
  const byWeek: Record<string, HomeWeekTotals> = {};
  for (const week of weeks) {
    byWeek[week] = portfolioWeekTotals(data, week);
  }
  const period = sumWeekTotals(byWeek, weeks);

  return (
    <>
      <div
        className="sticky left-0 z-[1] flex flex-col justify-center border-b border-r px-2 py-3"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-surface)",
          minHeight: VARIANCE_ROW_MIN_PX,
        }}
      >
        <span className="text-sm font-medium leading-snug text-[var(--app-text)]">Portfolio</span>
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
          const totals = byWeek[week]!;
          const emphasized = week === highlightWeek;
          return (
            <div
              key={`portfolio-${week}`}
              className="relative z-[1] min-h-0 min-w-0"
              title={varianceSparkCellTitle("Portfolio", totals, formatSundayWeekLabel(week))}
            >
              <VarianceSparkCell
                totals={totals}
                withinFivePercent={weekSparkWithinFive(totals, week, currentSunday)}
                emphasized={emphasized}
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
          title={varianceSparkCellTitle("Portfolio", period, "Total")}
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

function ProjectVarianceRow({
  project,
  weeks,
  highlightWeek,
  currentSunday,
  chartGridTemplate,
}: {
  project: HomeActualsVsForecastProject;
  weeks: string[];
  highlightWeek: string | null;
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
          const emphasized = week === highlightWeek;
          return (
            <div
              key={`${project.id}-${week}`}
              className="relative z-[1] min-h-0 min-w-0"
              title={varianceSparkCellTitle(project.name, totals, formatSundayWeekLabel(week))}
            >
              <VarianceSparkCell
                totals={totals}
                withinFivePercent={weekSparkWithinFive(totals, week, currentSunday)}
                emphasized={emphasized}
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

export function InboxVariancePanel({ fallbackBody }: { fallbackBody: string | null }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<HomeActualsVsForecastDTO | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadInboxVarianceReview().then((res) => {
      if (cancelled) return;
      if (res.error || !res.data) {
        setError(res.error ?? "Failed to load variance.");
        setLoading(false);
        return;
      }
      setData(res.data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const trendWeeks = useMemo(() => {
    if (!data) return [] as string[];
    // Last 4 weeks before this week (completed weeks).
    return data.weeks.slice(-5, -1);
  }, [data]);

  const highlightWeek = trendWeeks.length > 0 ? trendWeeks[trendWeeks.length - 1]! : null;
  const currentSunday = data?.weeks[data.weeks.length - 1] ?? null;
  const weekCount = Math.max(trendWeeks.length, 1);
  const chartGridTemplate = `repeat(${weekCount}, minmax(0, 1fr)) minmax(0, 1fr)`;

  if (loading) {
    return <p className="text-sm text-muted-canvas">Loading variance…</p>;
  }
  if (error || !data) {
    return (
      <div className="flex flex-col gap-3">
        {fallbackBody ? <p className="text-sm text-muted-canvas whitespace-pre-wrap">{fallbackBody}</p> : null}
        <p className="text-sm" role="alert" style={{ color: "var(--app-danger)" }}>
          {error ?? "No variance data."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-canvas">
        Forecast vs actual for the last 4 completed weeks. Last week is highlighted.
      </p>

      {trendWeeks.length === 0 ? (
        <p className="text-sm text-muted-canvas">Not enough history yet.</p>
      ) : data.projects.length === 0 ? (
        <p className="text-sm text-muted-canvas">No active projects.</p>
      ) : (
        <div
          className="overflow-x-auto overflow-y-auto rounded-[10px] border"
          style={{ borderColor: "var(--app-border)", maxHeight: "min(70vh, 36rem)" }}
        >
          <div
            className="w-full min-w-[36rem]"
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
              {trendWeeks.map((week) => {
                const isLastWeek = week === highlightWeek;
                return (
                  <div
                    key={week}
                    className="min-w-0 px-0.5 py-2 text-center text-[0.65rem] font-medium leading-tight"
                    style={{
                      color: isLastWeek ? "var(--app-text)" : undefined,
                      background: isLastWeek
                        ? "color-mix(in oklab, var(--app-info-surface) 70%, var(--app-surface))"
                        : undefined,
                      boxShadow: isLastWeek ? "inset 3px 0 0 0 var(--app-info)" : undefined,
                    }}
                  >
                    <span className={isLastWeek ? "text-[var(--app-text)]" : "text-muted-canvas"}>
                      {isLastWeek ? "Last week" : formatSundayWeekLabel(week)}
                    </span>
                  </div>
                );
              })}
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

            <PortfolioVarianceRow
              data={data}
              weeks={trendWeeks}
              highlightWeek={highlightWeek}
              currentSunday={currentSunday}
              chartGridTemplate={chartGridTemplate}
            />
            {data.projects.map((p) => (
              <ProjectVarianceRow
                key={p.id}
                project={p}
                weeks={trendWeeks}
                highlightWeek={highlightWeek}
                currentSunday={currentSunday}
                chartGridTemplate={chartGridTemplate}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
