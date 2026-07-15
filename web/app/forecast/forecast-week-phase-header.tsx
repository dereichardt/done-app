"use client";

import type { ForecastPhaseWeekSegment } from "@/lib/project-forecast";
import { formatSundayWeekLabel } from "@/lib/project-weekly-effort";

const WEEK_COL_PX = 76;

export function ForecastWeekPhaseHeader({
  segments,
  currentSunday,
  scrollTargetWeekYmd,
  onScroll,
  heightPx,
}: {
  segments: ForecastPhaseWeekSegment[];
  currentSunday: string;
  scrollTargetWeekYmd: string | null;
  onScroll: (source: HTMLDivElement) => void;
  heightPx: number;
}) {
  const totalWidth = segments.reduce((sum, s) => sum + s.weeks.length * WEEK_COL_PX, 0);

  return (
    <div
      data-forecast-week-scroll
      className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
      style={{ height: heightPx }}
      onScroll={(e) => onScroll(e.currentTarget)}
    >
      {/* Padding lives on each segment so phase dividers extend through the scrollbar gutter */}
      <div className="flex" style={{ width: Math.max(totalWidth, WEEK_COL_PX), minHeight: heightPx }}>
        {segments.map((seg, segIdx) => {
          const segWidth = seg.weeks.length * WEEK_COL_PX;
          return (
            <div
              key={`${seg.phaseKey ?? "gap"}-${seg.weeks[0] ?? segIdx}`}
              className={`relative flex shrink-0 flex-col justify-start pb-3 box-border ${
                segIdx > 0
                  ? "border-l-2 border-[color-mix(in_oklab,var(--app-text)_22%,var(--app-border))]"
                  : ""
              }`}
              style={{ width: segWidth, minHeight: heightPx }}
            >
              {seg.label ? (
                <div className="pointer-events-none sticky left-0 top-0 z-[2] w-max max-w-full">
                  <span
                    className="inline-block max-w-[7rem] truncate rounded-br-md border border-[var(--app-border)] border-l-0 border-t-0 bg-[var(--app-surface-muted-solid)] px-1.5 py-0.5 text-[10px] font-medium leading-tight text-[var(--app-text)]"
                    title={seg.label}
                  >
                    {seg.label}
                  </span>
                </div>
              ) : (
                <div className="h-[18px]" aria-hidden />
              )}

              <div
                className="grid items-end"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(seg.weeks.length, 1)}, ${WEEK_COL_PX}px)`,
                }}
              >
                {seg.weeks.map((w) => (
                  <div
                    key={w}
                    className={`px-1 pb-0.5 pt-0.5 text-center text-[10px] font-medium text-[var(--app-text-muted)] ${
                      w === currentSunday || w === scrollTargetWeekYmd
                        ? "bg-[var(--app-info-surface)]"
                        : ""
                    }`}
                  >
                    {formatSundayWeekLabel(w)}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
