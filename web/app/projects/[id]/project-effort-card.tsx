"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  formatEffortHoursLabel,
  formatLocalYmd,
  parseLocalYmd,
  startOfLocalWeekSunday,
} from "@/lib/integration-effort-buckets";
import {
  buildProjectEffortPeriodTotals,
  buildWeeklyEffortMatrix,
  DEFAULT_EFFORT_QUARTER_CONFIG,
  type EffortQuarterConfig,
  type ProjectEffortRowDef,
  type ProjectEffortSessionInput,
} from "@/lib/project-weekly-effort";

const HOURS_EPS = 0.001;
const TRACK_COL_DEFAULT_PX = 176;
const TRACK_COL_MIN_PX = 72;
const TRACK_COL_MAX_PX = 360;
const METRIC_COL_PX = 88;
const WEEK_COL_PX = 88;
/** Gutter between frozen and week columns; line is centered with breathing room either side. */
const DIVIDER_GUTTER_PX = 20;
const DIVIDER_LINE_PX = 2;

function formatCellHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= HOURS_EPS) return "—";
  return formatEffortHoursLabel(hours);
}

function formatEstimatedHours(hours: number | null | undefined): string {
  if (hours == null || !Number.isFinite(hours)) return "—";
  return formatEffortHoursLabel(hours);
}

function sumRowHours(hoursByWeekYmd: Record<string, number>): number {
  let sum = 0;
  for (const v of Object.values(hoursByWeekYmd)) {
    if (Number.isFinite(v)) sum += v;
  }
  return sum;
}

const stickyShadow =
  "shadow-[4px_0_8px_-4px_color-mix(in_oklab,var(--app-text)_14%,transparent)]";

/** Row hairline via inset shadow so it can't paint through the frozen/week divider gutter. */
const rowHairlineBottom: CSSProperties = {
  boxShadow: "inset 0 -1px 0 0 var(--app-border)",
};
const rowHairlineTop: CSSProperties = {
  boxShadow: "inset 0 1px 0 0 var(--app-border)",
};

export function ProjectEffortCard({
  rows,
  sessions,
  timelineStartYmd,
  timelineEndYmd,
  todayIso,
  quarterConfig = DEFAULT_EFFORT_QUARTER_CONFIG,
}: {
  rows: ProjectEffortRowDef[];
  sessions: ProjectEffortSessionInput[];
  timelineStartYmd: string | null;
  timelineEndYmd: string | null;
  /** User-local calendar day `YYYY-MM-DD` for highlighting / scrolling to the current week. */
  todayIso: string;
  /** Quarter calendar (default Feb-start). Will be wired to Settings later. */
  quarterConfig?: EffortQuarterConfig;
}) {
  const matrix = useMemo(
    () =>
      buildWeeklyEffortMatrix({
        rows,
        sessions,
        timelineStartYmd,
        timelineEndYmd,
      }),
    [rows, sessions, timelineStartYmd, timelineEndYmd],
  );

  const periodTotals = useMemo(
    () => buildProjectEffortPeriodTotals(sessions, todayIso, quarterConfig),
    [sessions, todayIso, quarterConfig],
  );

  const currentWeekStartYmd = useMemo(() => {
    const anchor = todayIso.trim() ? parseLocalYmd(todayIso.trim()) : new Date();
    if (Number.isNaN(anchor.getTime())) {
      return formatLocalYmd(startOfLocalWeekSunday(new Date()));
    }
    return formatLocalYmd(startOfLocalWeekSunday(anchor));
  }, [todayIso]);

  /** Prefer exact current week; else nearest prior week; else first week. */
  const scrollTargetWeekYmd = useMemo(() => {
    const weeks = matrix.weeks;
    if (weeks.length === 0) return null;
    if (weeks.some((w) => w.startYmd === currentWeekStartYmd)) return currentWeekStartYmd;
    let prior: string | null = null;
    for (const w of weeks) {
      if (w.startYmd <= currentWeekStartYmd) prior = w.startYmd;
      else break;
    }
    return prior ?? weeks[0].startYmd;
  }, [matrix.weeks, currentWeekStartYmd]);

  const estimatedByKey = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const row of rows) {
      map.set(row.key, row.estimatedEffortHours ?? null);
    }
    return map;
  }, [rows]);

  const estimatedGrandTotal = useMemo(() => {
    let sum = 0;
    let any = false;
    for (const row of rows) {
      const h = row.estimatedEffortHours;
      if (h == null || !Number.isFinite(h)) continue;
      sum += h;
      any = true;
    }
    return any ? sum : null;
  }, [rows]);

  const rowTotals = useMemo(() => {
    const byKey: Record<string, number> = {};
    for (const row of matrix.rows) {
      byKey[row.key] = sumRowHours(row.hoursByWeekYmd);
    }
    return byKey;
  }, [matrix.rows]);

  const grandTotal = useMemo(
    () => Object.values(matrix.totalsByWeekYmd).reduce((a, b) => a + b, 0),
    [matrix.totalsByWeekYmd],
  );

  const [trackColPx, setTrackColPx] = useState(TRACK_COL_DEFAULT_PX);
  const [isResizing, setIsResizing] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLSpanElement>) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = { startX: e.clientX, startWidth: trackColPx };
      setIsResizing(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [trackColPx],
  );

  const onResizePointerMove = useCallback((e: React.PointerEvent<HTMLSpanElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const next = Math.min(
      TRACK_COL_MAX_PX,
      Math.max(TRACK_COL_MIN_PX, drag.startWidth + (e.clientX - drag.startX)),
    );
    setTrackColPx(next);
  }, []);

  const onResizePointerUp = useCallback((e: React.PointerEvent<HTMLSpanElement>) => {
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

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollTargetWeekHeaderRef = useRef<HTMLTableCellElement>(null);

  const hasTimeline = Boolean(timelineStartYmd && timelineEndYmd);
  const showEmpty = matrix.weeks.length === 0;

  useLayoutEffect(() => {
    if (showEmpty) return;
    const scroller = scrollRef.current;
    const weekCell = scrollTargetWeekHeaderRef.current;
    if (!scroller || !weekCell) return;

    const alignTargetWeekToRight = () => {
      const target =
        weekCell.offsetLeft + weekCell.offsetWidth - scroller.clientWidth;
      scroller.scrollLeft = Math.max(0, target);
    };

    alignTargetWeekToRight();
    const ro = new ResizeObserver(alignTargetWeekToRight);
    ro.observe(scroller);
    return () => ro.disconnect();
  }, [scrollTargetWeekYmd, trackColPx, matrix.weeks.length, showEmpty]);

  const headBg = "var(--app-surface-muted-solid)";
  const bodyBg = "var(--app-surface)";
  // surface-alt is translucent (Canvas slate-a50); use muted-solid so sticky cells fully cover scrolled week values
  const totalBg = "var(--app-surface-muted-solid)";
  const currentWeekBg = "var(--app-info-surface)";

  const stickyLeftTrack = 0;
  const stickyLeftEstimated = trackColPx;
  const stickyLeftActuals = trackColPx + METRIC_COL_PX;
  const stickyLeftDivider = trackColPx + METRIC_COL_PX * 2;
  const pinnedWidth = stickyLeftDivider + DIVIDER_GUTTER_PX;

  const dividerCellStyle = (background: string): CSSProperties => ({
    left: stickyLeftDivider,
    width: DIVIDER_GUTTER_PX,
    minWidth: DIVIDER_GUTTER_PX,
    background,
  });

  const periodTiles: { label: string; hours: number }[] = [
    { label: "Today", hours: periodTotals.todayHours },
    { label: "This Week", hours: periodTotals.weekHours },
    { label: "This Month", hours: periodTotals.monthHours },
    { label: "This Quarter", hours: periodTotals.quarterHours },
  ];

  const periodLabel = "text-sm font-medium text-muted-canvas";
  const periodValue =
    "text-2xl font-semibold leading-tight tracking-tight tabular-nums sm:text-3xl";
  const periodCardShell =
    "card-canvas flex min-h-[7.5rem] flex-col px-4 py-4 sm:min-h-[8rem]";

  return (
    <section className="mt-10" aria-label="Project effort">
      <h2 className="section-heading">Effort</h2>

      <div
        className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-stretch xl:grid-cols-4"
        aria-label="Effort period totals"
      >
        {periodTiles.map((tile) => (
          <div key={tile.label} className={periodCardShell}>
            <div className="shrink-0 self-start text-left">
              <p className={periodLabel}>{tile.label}</p>
            </div>
            <div className="flex min-h-[2.5rem] flex-1 flex-col items-center justify-center px-1 text-center">
              <p className={periodValue} style={{ color: "var(--app-text)" }}>
                {formatEffortHoursLabel(tile.hours)}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="card-canvas mt-3 overflow-hidden p-0">
        {showEmpty ? (
          <p className="px-4 py-5 text-sm text-muted-canvas">
            {hasTimeline ? "No weeks in the project timeline." : "No effort recorded yet."}
          </p>
        ) : (
          <div ref={scrollRef} className="overflow-x-auto">
            <table
              className="w-max min-w-full border-separate text-sm"
              style={{
                tableLayout: "fixed",
                borderSpacing: 0,
                minWidth: `${pinnedWidth + matrix.weeks.length * WEEK_COL_PX}px`,
              }}
            >
              <colgroup>
                <col style={{ width: trackColPx }} />
                <col style={{ width: METRIC_COL_PX }} />
                <col style={{ width: METRIC_COL_PX }} />
                <col style={{ width: DIVIDER_GUTTER_PX }} />
                {matrix.weeks.map((week) => (
                  <col key={week.startYmd} style={{ width: WEEK_COL_PX }} />
                ))}
              </colgroup>
              <thead className="text-left text-xs text-muted-canvas">
                <tr>
                  <th
                    className={`sticky z-[3] relative px-3 py-2.5 pl-4 font-medium ${stickyShadow}`}
                    style={{
                      left: stickyLeftTrack,
                      width: trackColPx,
                      maxWidth: trackColPx,
                      background: headBg,
                      ...rowHairlineBottom,
                    }}
                    scope="col"
                  >
                    <span className="relative block truncate pr-1">Track</span>
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      aria-label="Resize track column"
                      tabIndex={0}
                      className="absolute inset-y-0 right-0 z-[4] w-2 translate-x-1/2 cursor-col-resize touch-none"
                      onPointerDown={onResizePointerDown}
                      onPointerMove={onResizePointerMove}
                      onPointerUp={onResizePointerUp}
                      onPointerCancel={onResizePointerUp}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowLeft") {
                          e.preventDefault();
                          setTrackColPx((w) => Math.max(TRACK_COL_MIN_PX, w - 8));
                        } else if (e.key === "ArrowRight") {
                          e.preventDefault();
                          setTrackColPx((w) => Math.min(TRACK_COL_MAX_PX, w + 8));
                        }
                      }}
                    >
                      <span
                        className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2"
                        style={{
                          background: isResizing
                            ? "var(--app-text-muted)"
                            : "color-mix(in oklab, var(--app-border) 70%, transparent)",
                        }}
                        aria-hidden
                      />
                    </span>
                  </th>
                  <th
                    className={`sticky z-[3] px-2 py-2.5 text-right font-medium tabular-nums ${stickyShadow}`}
                    style={{
                      left: stickyLeftEstimated,
                      width: METRIC_COL_PX,
                      background: headBg,
                      ...rowHairlineBottom,
                    }}
                    scope="col"
                  >
                    Estimated
                  </th>
                  <th
                    className={`sticky z-[3] px-2 py-2.5 text-right font-medium tabular-nums ${stickyShadow}`}
                    style={{
                      left: stickyLeftActuals,
                      width: METRIC_COL_PX,
                      background: headBg,
                      ...rowHairlineBottom,
                    }}
                    scope="col"
                  >
                    Actuals
                  </th>
                  <th
                    aria-hidden
                    className="sticky z-[40] relative p-0"
                    style={dividerCellStyle(headBg)}
                  >
                    <span
                      className="pointer-events-none absolute inset-y-0 left-1/2 z-[41] -translate-x-1/2"
                      style={{
                        width: DIVIDER_LINE_PX,
                        background: "var(--app-text)",
                      }}
                    />
                  </th>
                  {matrix.weeks.map((week) => {
                    const isCurrentWeek = week.startYmd === currentWeekStartYmd;
                    const isScrollTarget = week.startYmd === scrollTargetWeekYmd;
                    return (
                      <th
                        key={week.startYmd}
                        ref={isScrollTarget ? scrollTargetWeekHeaderRef : undefined}
                        className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums"
                        style={{
                          ...(isCurrentWeek
                            ? { background: currentWeekBg, color: "var(--app-info)" }
                            : { background: headBg }),
                          ...rowHairlineBottom,
                        }}
                        scope="col"
                        aria-current={isCurrentWeek ? "date" : undefined}
                      >
                        {week.label}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row) => (
                  <tr key={row.key}>
                    <th
                      className={`sticky z-[2] px-3 py-2.5 pl-4 text-left font-medium ${stickyShadow}`}
                      style={{
                        left: stickyLeftTrack,
                        width: trackColPx,
                        maxWidth: trackColPx,
                        background: bodyBg,
                        color: "var(--app-text)",
                        ...rowHairlineBottom,
                      }}
                      scope="row"
                      title={row.label}
                    >
                      <span className="block truncate">{row.label}</span>
                    </th>
                    <td
                      className={`sticky z-[2] px-2 py-2.5 text-right tabular-nums text-muted-canvas ${stickyShadow}`}
                      style={{
                        left: stickyLeftEstimated,
                        width: METRIC_COL_PX,
                        background: bodyBg,
                        ...rowHairlineBottom,
                      }}
                    >
                      {formatEstimatedHours(estimatedByKey.get(row.key))}
                    </td>
                    <td
                      className={`sticky z-[2] px-2 py-2.5 text-right font-medium tabular-nums ${stickyShadow}`}
                      style={{
                        left: stickyLeftActuals,
                        width: METRIC_COL_PX,
                        background: bodyBg,
                        color: "var(--app-text)",
                        ...rowHairlineBottom,
                      }}
                    >
                      {formatCellHours(rowTotals[row.key] ?? 0)}
                    </td>
                    <td
                      aria-hidden
                      className="sticky z-[40] relative p-0"
                      style={dividerCellStyle(bodyBg)}
                    >
                      <span
                        className="pointer-events-none absolute inset-y-0 left-1/2 z-[41] -translate-x-1/2"
                        style={{
                          width: DIVIDER_LINE_PX,
                          background: "var(--app-text)",
                        }}
                      />
                    </td>
                    {matrix.weeks.map((week) => {
                      const isCurrentWeek = week.startYmd === currentWeekStartYmd;
                      return (
                        <td
                          key={week.startYmd}
                          className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-muted-canvas"
                          style={{
                            background: isCurrentWeek ? currentWeekBg : bodyBg,
                            ...rowHairlineBottom,
                          }}
                        >
                          {formatCellHours(row.hoursByWeekYmd[week.startYmd] ?? 0)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <th
                    className={`sticky z-[2] px-3 py-2.5 pl-4 text-left font-medium ${stickyShadow}`}
                    style={{
                      left: stickyLeftTrack,
                      width: trackColPx,
                      maxWidth: trackColPx,
                      background: totalBg,
                      color: "var(--app-text)",
                      ...rowHairlineTop,
                    }}
                    scope="row"
                  >
                    <span className="block truncate">Total</span>
                  </th>
                  <td
                    className={`sticky z-[2] px-2 py-2.5 text-right font-medium tabular-nums ${stickyShadow}`}
                    style={{
                      left: stickyLeftEstimated,
                      width: METRIC_COL_PX,
                      background: totalBg,
                      color: "var(--app-text)",
                      ...rowHairlineTop,
                    }}
                  >
                    {formatEstimatedHours(estimatedGrandTotal)}
                  </td>
                  <td
                    className={`sticky z-[2] px-2 py-2.5 text-right font-medium tabular-nums ${stickyShadow}`}
                    style={{
                      left: stickyLeftActuals,
                      width: METRIC_COL_PX,
                      background: totalBg,
                      color: "var(--app-text)",
                      ...rowHairlineTop,
                    }}
                  >
                    {formatCellHours(grandTotal)}
                  </td>
                  <td
                    aria-hidden
                    className="sticky z-[40] relative p-0"
                    style={dividerCellStyle(totalBg)}
                  >
                    <span
                      className="pointer-events-none absolute inset-y-0 left-1/2 z-[41] -translate-x-1/2"
                      style={{
                        width: DIVIDER_LINE_PX,
                        background: "var(--app-text)",
                      }}
                    />
                  </td>
                  {matrix.weeks.map((week) => {
                    const isCurrentWeek = week.startYmd === currentWeekStartYmd;
                    return (
                      <td
                        key={week.startYmd}
                        className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums"
                        style={{
                          background: isCurrentWeek ? currentWeekBg : totalBg,
                          color: "var(--app-text)",
                          ...rowHairlineTop,
                        }}
                      >
                        {formatCellHours(matrix.totalsByWeekYmd[week.startYmd] ?? 0)}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
