"use client";

import Link from "next/link";
import { useState } from "react";

import {
  capacityPocketBody,
  capacityPocketHeadline,
  capacityPocketRangeLabel,
  formatCapacityWeekLabel,
  type CapacityGapsSynthesis,
  type CapacityPocket,
  type CapacityWeekGap,
} from "@/lib/home-capacity-gaps";

function emptyHeadline(capacity: CapacityGapsSynthesis): string {
  const hasForecast = capacity.weeks.some((w) => w.portfolioHours > 0);
  if (capacity.weeks.length === 0) return `No weeks left in ${capacity.quarterLabel}`;
  if (!hasForecast) return "No forecast yet";
  return "No sustained open capacity";
}

/** Weeks to chart: selected pocket, or a short preview of the window when none. */
function chartWeeks(
  capacity: CapacityGapsSynthesis,
  pocket: CapacityPocket | null,
): CapacityWeekGap[] {
  if (pocket) return pocket.weeks;
  return capacity.weeks.slice(0, 5);
}

export function HomeAvailabilityCard({
  capacity,
  weeklyCapacityTarget,
}: {
  capacity: CapacityGapsSynthesis;
  weeklyCapacityTarget: number;
}) {
  const [pocketIndex, setPocketIndex] = useState(0);
  const pocketCount = capacity.pockets.length;
  const safeIndex = pocketCount > 0 ? Math.min(pocketIndex, pocketCount - 1) : 0;
  const pocket = pocketCount > 0 ? capacity.pockets[safeIndex]! : null;
  const weeks = chartWeeks(capacity, pocket);
  const headline = pocket ? capacityPocketHeadline(pocket) : emptyHeadline(capacity);
  const body = pocket ? capacityPocketBody(pocket, weeklyCapacityTarget) : capacity.body;

  return (
    <div
      className="flex min-w-0 flex-col gap-3 rounded-[var(--app-radius)] border p-4"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-surface)",
      }}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium" style={{ color: "var(--app-text-muted)" }}>
            Availability
          </p>
          <p className="mt-0.5 text-sm font-medium" style={{ color: "var(--app-text)" }}>
            {headline}
          </p>
        </div>
        {pocketCount > 1 ? (
          <div
            className="flex shrink-0 items-center gap-1"
            role="group"
            aria-label="Open capacity pockets"
          >
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-sm transition-colors cursor-pointer hover:bg-[var(--app-surface-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)] disabled:opacity-40"
              style={{ color: "var(--app-text-muted)" }}
              aria-label="Previous pocket"
              disabled={safeIndex <= 0}
              onClick={() => setPocketIndex((i) => Math.max(0, i - 1))}
            >
              ‹
            </button>
            <span
              className="min-w-[4.5rem] text-center text-[0.65rem] font-medium tabular-nums"
              style={{ color: "var(--app-text-muted)" }}
              aria-live="polite"
            >
              {safeIndex + 1}/{pocketCount}
              <span className="sr-only">
                {pocket ? `: ${capacityPocketRangeLabel(pocket)}` : ""}
              </span>
            </span>
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-sm transition-colors cursor-pointer hover:bg-[var(--app-surface-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)] disabled:opacity-40"
              style={{ color: "var(--app-text-muted)" }}
              aria-label="Next pocket"
              disabled={safeIndex >= pocketCount - 1}
              onClick={() => setPocketIndex((i) => Math.min(pocketCount - 1, i + 1))}
            >
              ›
            </button>
          </div>
        ) : null}
      </div>

      {pocketCount > 1 && pocket ? (
        <p className="text-xs font-medium" style={{ color: "var(--app-text-muted)" }}>
          {capacityPocketRangeLabel(pocket)}
          {" · "}
          ~{pocket.freeHoursPerWeek}h/week free
        </p>
      ) : null}

      {weeks.length > 0 ? (
        <div
          className="flex items-end gap-1.5"
          role="img"
          aria-label={
            pocket
              ? `Open capacity ${capacityPocketRangeLabel(pocket)}. Bars use each week's pace target.`
              : `Forecast versus open capacity by week. Bars use each week's pace target.`
          }
        >
          {weeks.map((week) => {
            const weekTarget = Math.max(week.targetHours, 1);
            const booked = Math.min(week.portfolioHours, week.targetHours);
            const gap = week.freeHours;
            const bookedPct =
              week.targetHours <= 0 ? 0 : Math.round((booked / weekTarget) * 100);
            const gapPct =
              week.targetHours <= 0 ? 0 : Math.round((gap / weekTarget) * 100);
            const isOpen = gap > 0;
            const weekLabel = formatCapacityWeekLabel(week.weekStart);
            return (
              <div
                key={week.weekStart}
                className="group relative flex min-w-0 flex-1 flex-col items-center gap-1"
              >
                <span
                  className="tabular-nums text-[0.65rem] font-medium"
                  style={{ color: isOpen ? "var(--app-action)" : "var(--app-text-muted)" }}
                >
                  {isOpen ? `${gap}h` : "—"}
                </span>
                <div
                  className="relative w-full cursor-default overflow-hidden rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)]"
                  style={{
                    height: "4.5rem",
                    background: "var(--app-surface-alt)",
                    boxShadow: "inset 0 0 0 1px var(--app-border)",
                  }}
                  tabIndex={0}
                  aria-label={`${weekLabel}: ${week.portfolioHours}h forecast, ${gap}h available`}
                >
                  <div
                    className="absolute bottom-0 left-0 right-0 motion-safe:[transition:height_300ms_cubic-bezier(0.2,0,0.2,1)]"
                    style={{
                      height: `${bookedPct}%`,
                      background: "var(--app-border)",
                    }}
                  />
                  {gapPct > 0 ? (
                    <div
                      className="absolute left-0 right-0 motion-safe:[transition:bottom_300ms_cubic-bezier(0.2,0,0.2,1),height_300ms_cubic-bezier(0.2,0,0.2,1)]"
                      style={{
                        bottom: `${bookedPct}%`,
                        height: `${gapPct}%`,
                        background:
                          "color-mix(in oklab, var(--app-action) 55%, var(--app-surface-alt))",
                      }}
                    />
                  ) : null}
                  <span
                    className="pointer-events-none absolute inset-x-0 bottom-1 z-[1] truncate px-0.5 text-center text-[0.6rem] font-medium leading-none tabular-nums"
                    style={{ color: "var(--app-text)" }}
                  >
                    {week.portfolioHours}h
                  </span>
                </div>
                <span
                  className="truncate text-[0.65rem]"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  {weekLabel}
                </span>

                <div
                  role="tooltip"
                  className="pointer-events-none absolute bottom-[calc(100%-0.25rem)] left-1/2 z-20 w-max min-w-[7.5rem] -translate-x-1/2 rounded-[var(--app-radius)] border px-2.5 py-2 text-left opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
                  style={{
                    borderColor: "var(--app-border)",
                    background: "var(--app-surface)",
                    boxShadow: "0 8px 24px color-mix(in oklab, var(--app-text) 12%, transparent)",
                    color: "var(--app-text)",
                  }}
                >
                  <p
                    className="text-[0.65rem] font-medium"
                    style={{ color: "var(--app-text-muted)" }}
                  >
                    {weekLabel}
                  </p>
                  <dl className="mt-1 space-y-0.5 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <dt style={{ color: "var(--app-text-muted)" }}>Available</dt>
                      <dd
                        className="tabular-nums font-medium"
                        style={{ color: isOpen ? "var(--app-action)" : "var(--app-text)" }}
                      >
                        {gap}h
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt style={{ color: "var(--app-text-muted)" }}>Forecast</dt>
                      <dd className="tabular-nums font-medium">{week.portfolioHours}h</dd>
                    </div>
                  </dl>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <p className="text-sm leading-snug" style={{ color: "var(--app-text-muted)" }}>
        {body}
      </p>

      <Link
        href="/forecast"
        className="mt-auto inline-flex text-sm font-medium no-underline transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)]"
        style={{ color: "var(--app-action-emphasis)" }}
      >
        Open forecast
      </Link>
    </div>
  );
}
