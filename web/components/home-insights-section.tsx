import Link from "next/link";

import type { HomeInsightsDTO } from "@/lib/home-insights";
import type { UtilizationInsightStatus, UtilizationWeekRow } from "@/lib/utilization-data";
import { formatShortHours } from "@/lib/utilization-data";

function formatWeekLabel(weekStartYmd: string): string {
  const [y, m, d] = weekStartYmd.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return weekStartYmd;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

function statusLabel(status: UtilizationInsightStatus): string {
  switch (status) {
    case "on_track":
      return "On track";
    case "ahead":
      return "Ahead";
    case "at_risk":
      return "At risk";
    case "shortfall":
      return "Shortfall";
    case "no_target":
      return "No target";
  }
}

function statusColor(status: UtilizationInsightStatus): string {
  switch (status) {
    case "on_track":
    case "ahead":
      return "var(--app-success)";
    case "at_risk":
      return "var(--app-warning)";
    case "shortfall":
      return "var(--app-danger)";
    case "no_target":
      return "var(--app-info)";
  }
}

function statusSurface(status: UtilizationInsightStatus): string {
  switch (status) {
    case "on_track":
    case "ahead":
      return "color-mix(in oklab, var(--app-success) 12%, var(--app-surface))";
    case "at_risk":
      return "color-mix(in oklab, var(--app-warning) 14%, var(--app-surface))";
    case "shortfall":
      return "color-mix(in oklab, var(--app-danger) 12%, var(--app-surface))";
    case "no_target":
      return "color-mix(in oklab, var(--app-info) 12%, var(--app-surface))";
  }
}

/**
 * Pulse bar segments: past-week actuals (black) + current/future forecast (grey),
 * capped at the quarter target.
 */
function quarterPulseFill(weeks: UtilizationWeekRow[], targetHours: number) {
  let pastActual = 0;
  let planForecast = 0;
  for (const w of weeks) {
    if (w.relative === "past") pastActual += w.actualHours;
    else planForecast += w.forecastHours;
  }
  const actualFill = Math.min(targetHours, Math.max(0, pastActual));
  const forecastFill = Math.min(Math.max(0, targetHours - actualFill), Math.max(0, planForecast));
  const covered = Math.max(0, pastActual) + Math.max(0, planForecast);
  return {
    pastActual: Math.max(0, pastActual),
    planForecast: Math.max(0, planForecast),
    actualFill,
    forecastFill,
    covered,
    actualPct: targetHours > 0 ? (actualFill / targetHours) * 100 : 0,
    forecastPct: targetHours > 0 ? (forecastFill / targetHours) * 100 : 0,
  };
}

/** Capacity window weeks are offsets +4…+8 from the current Sunday. */
function availabilityHorizonLabel(capacity: HomeInsightsDTO["capacity"]): string {
  if (capacity.freeStartingWeek == null) {
    const hasForecast = capacity.weeks.some((w) => w.portfolioHours > 0);
    return hasForecast ? "No open capacity soon" : "No forecast yet";
  }
  const idx = capacity.weeks.findIndex((w) => w.weekStart === capacity.freeStartingWeek);
  if (idx < 0) return "No open capacity soon";
  const weeksOut = 4 + idx;
  return weeksOut === 1 ? "in 1 week" : `in ${weeksOut} weeks`;
}

export function HomeInsightsSection({ data }: { data: HomeInsightsDTO }) {
  const { quarter, capacity, weeklyCapacityTarget } = data;
  const hasTarget = quarter.targetHours != null && quarter.targetHours > 0;
  const pulse = hasTarget
    ? quarterPulseFill(quarter.weeks, quarter.targetHours!)
    : null;
  const status = quarter.insight.status;
  const color = statusColor(status);
  const availabilityWhen = availabilityHorizonLabel(capacity);
  const insightLines = [
    quarter.insight.message,
    ...(quarter.insight.detail ? [quarter.insight.detail] : []),
  ];

  return (
    <section aria-label="Insights" className="mt-10">
      <h2 className="section-heading">Insights</h2>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {/* Quarter pulse */}
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
                Quarter pulse
              </p>
              <p className="mt-0.5 text-sm font-medium" style={{ color: "var(--app-text)" }}>
                {quarter.label}
              </p>
            </div>
            <span
              className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium"
              style={{
                color,
                background: statusSurface(status),
              }}
            >
              {statusLabel(status)}
            </span>
          </div>

          <div className="min-w-0">
            {hasTarget && pulse ? (
              <>
                <div className="mb-1.5 flex justify-end">
                  <span className="text-xs font-medium tabular-nums leading-none text-muted-canvas">
                    {formatShortHours(quarter.targetHours!)}
                  </span>
                </div>
                <div
                  className="relative h-8 w-full overflow-hidden rounded-full"
                  style={{ background: "var(--app-surface-alt)" }}
                  role="meter"
                  aria-label={`${quarter.label}: ${formatShortHours(pulse.pastActual)} past actuals, ${formatShortHours(pulse.planForecast)} forecast for current and future weeks, of ${formatShortHours(quarter.targetHours!)} target. ${quarter.insight.message}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(
                    ((pulse.actualFill + pulse.forecastFill) / quarter.targetHours!) * 100,
                  )}
                >
                  {pulse.forecastPct > 0 ? (
                    <div
                      className="absolute inset-y-0 flex items-center justify-end overflow-hidden px-2.5 motion-safe:[transition:left_300ms_cubic-bezier(0.2,0,0.2,1),width_300ms_cubic-bezier(0.2,0,0.2,1)]"
                      style={{
                        left: `${pulse.actualPct}%`,
                        width: `${pulse.forecastPct}%`,
                        background: "var(--app-border)",
                      }}
                    >
                      <span className="truncate text-[0.7rem] font-medium leading-none tabular-nums text-[var(--app-text)]">
                        {formatShortHours(pulse.planForecast)}
                      </span>
                    </div>
                  ) : null}
                  {pulse.actualPct > 0 ? (
                    <div
                      className="absolute inset-y-0 left-0 motion-safe:[transition:width_300ms_cubic-bezier(0.2,0,0.2,1)]"
                      style={{
                        width: `${pulse.actualPct}%`,
                        background: "var(--app-cta-dark-fill)",
                      }}
                    />
                  ) : null}
                </div>
                <div className="relative mt-1.5 h-4">
                  <span
                    className="absolute top-0 text-xs font-medium tabular-nums leading-none text-muted-canvas -translate-x-1/2"
                    style={{
                      left: `${Math.min(100, pulse.actualPct + pulse.forecastPct)}%`,
                    }}
                  >
                    {`${Math.round(((pulse.actualFill + pulse.forecastFill) / quarter.targetHours!) * 1000) / 10}%`}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-xs font-medium text-muted-canvas">
                Set a target to track attainment
              </p>
            )}
          </div>

          <ul
            className="list-disc space-y-1 pl-4 text-sm leading-snug"
            style={{ color: "var(--app-text-muted)" }}
          >
            {insightLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>

          <Link
            href="/utilization"
            className="mt-auto inline-flex text-sm font-medium no-underline transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)]"
            style={{ color: "var(--app-action-emphasis)" }}
          >
            View utilization
          </Link>
        </div>

        {/* Availability */}
        <div
          className="flex min-w-0 flex-col gap-3 rounded-[var(--app-radius)] border p-4"
          style={{
            borderColor: "var(--app-border)",
            background: "var(--app-surface)",
          }}
        >
          <div className="min-w-0">
            <p className="text-xs font-medium" style={{ color: "var(--app-text-muted)" }}>
              Availability
            </p>
            <p className="mt-0.5 text-sm font-medium" style={{ color: "var(--app-text)" }}>
              {availabilityWhen}
            </p>
          </div>

          <div
            className="flex items-end gap-1.5"
            role="img"
            aria-label={`Forecast versus open capacity by week. Weekly target ${weeklyCapacityTarget} hours.`}
          >
            {capacity.weeks.map((week) => {
              const booked = Math.min(week.portfolioHours, weeklyCapacityTarget);
              const gap = week.freeHours;
              const bookedPct = Math.round((booked / weeklyCapacityTarget) * 100);
              const gapPct = Math.round((gap / weeklyCapacityTarget) * 100);
              const isOpen = gap > 0;
              const weekLabel = formatWeekLabel(week.weekStart);
              return (
                <div
                  key={week.weekStart}
                  className="group relative flex min-w-0 flex-1 flex-col items-center gap-1"
                >
                  <span
                    className="tabular-nums text-[0.65rem] font-medium"
                    style={{ color: isOpen ? "var(--app-success)" : "var(--app-text-muted)" }}
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
                    {/* Forecast booked hours sit at the bottom */}
                    <div
                      className="absolute bottom-0 left-0 right-0 motion-safe:[transition:height_300ms_cubic-bezier(0.2,0,0.2,1)]"
                      style={{
                        height: `${bookedPct}%`,
                        background: "var(--app-border)",
                      }}
                    />
                    {/* Open gap sits above forecast */}
                    {gapPct > 0 ? (
                      <div
                        className="absolute left-0 right-0 motion-safe:[transition:bottom_300ms_cubic-bezier(0.2,0,0.2,1),height_300ms_cubic-bezier(0.2,0,0.2,1)]"
                        style={{
                          bottom: `${bookedPct}%`,
                          height: `${gapPct}%`,
                          background: "color-mix(in oklab, var(--app-success) 55%, var(--app-surface-alt))",
                        }}
                      />
                    ) : null}
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
                    <p className="text-[0.65rem] font-medium" style={{ color: "var(--app-text-muted)" }}>
                      {weekLabel}
                    </p>
                    <dl className="mt-1 space-y-0.5 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <dt style={{ color: "var(--app-text-muted)" }}>Forecast</dt>
                        <dd className="tabular-nums font-medium">{week.portfolioHours}h</dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt style={{ color: "var(--app-text-muted)" }}>Available</dt>
                        <dd
                          className="tabular-nums font-medium"
                          style={{ color: isOpen ? "var(--app-success)" : "var(--app-text)" }}
                        >
                          {gap}h
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-sm leading-snug" style={{ color: "var(--app-text-muted)" }}>
            {capacity.body}
          </p>

          <Link
            href="/forecast"
            className="mt-auto inline-flex text-sm font-medium no-underline transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)]"
            style={{ color: "var(--app-action-emphasis)" }}
          >
            Open forecast
          </Link>
        </div>
      </div>
    </section>
  );
}
