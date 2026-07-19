"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { DialogCloseButton } from "@/components/dialog-close-button";
import { InitiativeIcpPill } from "@/components/initiative-icp-pill";
import {
  type HomeActualsVsForecastDTO,
  type HomeWeekTotals,
  hasForecastHours,
  isVarianceWithinPercent,
  sumWeekTotals,
  variancePercentLabel,
} from "@/lib/home-actuals-vs-forecast";
import { formatEffortHoursLabel } from "@/lib/integration-effort-buckets";
import { formatSundayWeekLabel } from "@/lib/project-weekly-effort";

const PROJECT_COL_DEFAULT_PX = 200;
const PROJECT_COL_MIN_PX = 140;
const PROJECT_COL_MAX_PX = 420;
/** Fits 12 week columns + project col inside a near-full-viewport dialog. */
const WEEK_COL_MIN_PX = 92;
const ROW_MIN_PX = 96;

function formatCompactHours(hours: number): string {
  if (!Number.isFinite(hours) || Math.abs(hours) < 0.001) return "0";
  const q = Math.round(hours * 4) / 4;
  return Number.isInteger(q) ? String(q) : String(parseFloat(q.toFixed(2)));
}

function formatSignedVariance(variance: number): string {
  if (!Number.isFinite(variance) || Math.abs(variance) < 0.001) return "0";
  const abs = formatCompactHours(Math.abs(variance));
  if (variance > 0) return `+${abs}`;
  return `−${abs}`;
}

function CellContent({
  totals,
  withinFivePercent,
}: {
  totals: HomeWeekTotals;
  withinFivePercent: boolean;
}) {
  const hasForecast = hasForecastHours(totals.forecast);
  const pct = hasForecast ? variancePercentLabel(totals.forecast, totals.variance) : null;

  return (
    <div
      className="flex h-full flex-col items-center justify-center px-1.5 py-3.5 text-center"
      style={
        withinFivePercent
          ? { background: "var(--app-state-active-surface)" }
          : undefined
      }
    >
      {hasForecast ? (
        <>
          <span className="text-[0.8125rem] font-medium tabular-nums leading-tight text-[var(--app-text)]">
            {formatSignedVariance(totals.variance)} hrs
          </span>
          {pct ? (
            <span className="mt-0.5 text-[0.7rem] font-normal leading-tight tabular-nums text-muted-canvas">
              {pct}
            </span>
          ) : null}
        </>
      ) : (
        <span className="text-sm font-medium leading-tight text-muted-canvas">—</span>
      )}
      <div
        className="my-2 w-10 border-t"
        style={{ borderColor: "var(--app-border)" }}
        aria-hidden
      />
      <span className="text-xs leading-tight text-muted-canvas tabular-nums">
        F {formatCompactHours(totals.forecast)} · A {formatCompactHours(totals.actual)}
      </span>
    </div>
  );
}

function ProjectPeriodSummary({ totals }: { totals: HomeWeekTotals }) {
  const hasForecast = hasForecastHours(totals.forecast);
  const pct = hasForecast ? variancePercentLabel(totals.forecast, totals.variance) : null;

  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="flex min-w-0 flex-col items-start text-left">
        {hasForecast ? (
          <>
            <span className="text-[0.8125rem] font-medium tabular-nums leading-tight text-[var(--app-text)]">
              {formatSignedVariance(totals.variance)} hrs
            </span>
            {pct ? (
              <span className="mt-0.5 text-[0.7rem] font-normal leading-tight tabular-nums text-muted-canvas">
                {pct}
              </span>
            ) : null}
          </>
        ) : (
          <span className="text-sm font-medium leading-tight text-muted-canvas">—</span>
        )}
      </div>
      <div
        className="h-8 w-px shrink-0 self-center"
        style={{ background: "var(--app-border)" }}
        aria-hidden
      />
      <span className="text-xs leading-tight text-muted-canvas tabular-nums whitespace-nowrap">
        F {formatCompactHours(totals.forecast)} · A {formatCompactHours(totals.actual)}
      </span>
    </div>
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const [projectColPx, setProjectColPx] = useState(PROJECT_COL_DEFAULT_PX);
  const [isResizing, setIsResizing] = useState(false);

  const weekCount = Math.max(data.weeks.length, 1);
  const currentSunday = data.weeks[data.weeks.length - 1] ?? null;
  const tableMinWidth = projectColPx + weekCount * WEEK_COL_MIN_PX;

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = { startX: e.clientX, startWidth: projectColPx };
      setIsResizing(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [projectColPx],
  );

  const onResizePointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const next = Math.min(
      PROJECT_COL_MAX_PX,
      Math.max(PROJECT_COL_MIN_PX, drag.startWidth + (e.clientX - drag.startX)),
    );
    setProjectColPx(next);
  }, []);

  const onResizePointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    dragRef.current = null;
    setIsResizing(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [isResizing]);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, el.scrollWidth - el.clientWidth);
  }, [data.weeks.length, data.projects.length, projectColPx]);

  return (
    <dialog
      ref={dialogRef}
      className="app-catalog-dialog fixed left-1/2 top-1/2 z-[215] -translate-x-1/2 -translate-y-1/2 overflow-hidden border-0 p-0 shadow-xl w-[min(100vw-1.5rem,96rem)] max-w-[calc(100vw-1.5rem)]"
      style={{
        borderRadius: "12px",
        background: "var(--app-surface)",
        color: "var(--app-text)",
        height: "min(92dvh, 44rem)",
        maxHeight: "min(92dvh, 56rem)",
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
            <p className="mt-1 text-sm text-muted-canvas">
              Forecast − Actual across active projects in the last 12 weeks. Variance is only
              calculated where a forecast exists. Variances within 5% are highlighted.
            </p>
          </div>
          <DialogCloseButton onClick={() => dialogRef.current?.close()} />
        </div>

        <div className="min-h-0 flex-1 px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
          {data.projects.length === 0 ? (
            <p className="text-sm text-muted-canvas">No active projects.</p>
          ) : (
            <div
              ref={scrollRef}
              className="h-full overflow-auto rounded-[10px] border"
              style={{ borderColor: "var(--app-border)" }}
            >
              <div
                className="min-w-full"
                style={{
                  display: "grid",
                  gridTemplateColumns: `${projectColPx}px repeat(${weekCount}, minmax(${WEEK_COL_MIN_PX}px, 1fr))`,
                  width: "100%",
                  minWidth: tableMinWidth,
                }}
              >
                <div
                  className="sticky top-0 left-0 z-[3] border-b border-r px-3 py-2 text-xs font-medium text-muted-canvas"
                  style={{
                    borderColor: "var(--app-border)",
                    background: "var(--app-surface)",
                  }}
                >
                  Project
                  <button
                    type="button"
                    aria-label="Resize project column"
                    className="absolute inset-y-0 -right-1 z-[4] w-2 cursor-col-resize border-0 bg-transparent p-0 hover:bg-[color-mix(in_oklab,var(--app-border)_55%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)]"
                    style={
                      isResizing
                        ? { background: "color-mix(in oklab, var(--app-border) 70%, transparent)" }
                        : undefined
                    }
                    onPointerDown={onResizePointerDown}
                    onPointerMove={onResizePointerMove}
                    onPointerUp={onResizePointerUp}
                    onPointerCancel={onResizePointerUp}
                  />
                </div>
                {data.weeks.map((week) => (
                  <div
                    key={week}
                    className="sticky top-0 z-[2] border-b px-1 py-2 text-center text-[0.65rem] font-medium leading-tight text-muted-canvas"
                    style={{
                      borderColor: "var(--app-border)",
                      background: "var(--app-surface)",
                    }}
                  >
                    {formatSundayWeekLabel(week)}
                  </div>
                ))}

                {data.projects.map((p) => {
                  const period = sumWeekTotals(p.byWeek, data.weeks);
                  return (
                    <div key={p.id} className="contents">
                      <div
                        className="sticky left-0 z-[1] flex flex-col justify-center border-b border-r px-3 py-3.5"
                        style={{
                          borderColor: "var(--app-border)",
                          background: "var(--app-surface)",
                          minHeight: ROW_MIN_PX,
                        }}
                        title={p.name}
                      >
                        <span className="flex items-start gap-2">
                          <span className="line-clamp-2 text-sm font-medium leading-snug text-[var(--app-text)]">
                            {p.name}
                          </span>
                          {p.isIcp ? <InitiativeIcpPill className="mt-0.5" /> : null}
                        </span>
                        <ProjectPeriodSummary totals={period} />
                      </div>
                      {data.weeks.map((week) => {
                        const totals = p.byWeek[week] ?? {
                          forecast: 0,
                          actual: 0,
                          variance: 0,
                        };
                        const hasForecast = hasForecastHours(totals.forecast);
                        const isPastWeek = currentSunday != null && week < currentSunday;
                        const withinFive =
                          hasForecast &&
                          isPastWeek &&
                          isVarianceWithinPercent(totals.forecast, totals.variance, 5);
                        const pctLabel = hasForecast
                          ? variancePercentLabel(totals.forecast, totals.variance)
                          : null;
                        return (
                          <div
                            key={`${p.id}-${week}`}
                            className="border-b border-r last:border-r-0"
                            style={{
                              borderColor: "var(--app-border)",
                              minHeight: ROW_MIN_PX,
                            }}
                            title={
                              hasForecast
                                ? `${p.name}: variance ${formatEffortHoursLabel(totals.variance)}${
                                    pctLabel ? ` (${pctLabel})` : ""
                                  }, forecast ${formatEffortHoursLabel(totals.forecast)}, actual ${formatEffortHoursLabel(totals.actual)}`
                                : `${p.name}: no forecast, actual ${formatEffortHoursLabel(totals.actual)}`
                            }
                          >
                            <CellContent totals={totals} withinFivePercent={withinFive} />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
