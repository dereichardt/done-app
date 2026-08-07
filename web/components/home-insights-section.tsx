import Link from "next/link";

import { HomeAvailabilityCard } from "@/components/home-availability-card";
import { HomeEffortBreakdownCards } from "@/components/home-effort-breakdown-cards";
import type { HomeInsightsDTO } from "@/lib/home-insights";
import type { UtilizationInsightStatus, UtilizationQuarterDTO } from "@/lib/utilization-data";
import {
  formatShortHours,
  paceDeltaLabel,
  quarterPulseMetrics,
} from "@/lib/utilization-data";

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
 * Pulse bar: all actuals incl. current week (dark) + remaining current-week
 * forecast + future forecasts (muted), capped at the quarter target.
 * Pace marker uses the same day-prorated pace-to-date as status.
 */
function quarterPulseFill(quarter: UtilizationQuarterDTO, targetHours: number) {
  const timeOffYmds = new Set(quarter.timeOffDays.map((d) => d.dayYmd));
  return quarterPulseMetrics({
    weeks: quarter.weeks,
    todayYmd: quarter.todayYmd,
    targetHours,
    endExclusiveYmd: quarter.endExclusiveYmd,
    timeOffYmds,
  });
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="min-w-0 rounded-[var(--app-radius)] border px-2 py-1.5"
      style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}
    >
      <p
        className="text-[0.65rem] font-medium leading-snug"
        style={{ color: "var(--app-text-muted)" }}
      >
        {label}
      </p>
      <p
        className="mt-1 truncate text-xs font-medium tabular-nums leading-none"
        style={{ color: "var(--app-text)" }}
      >
        {value}
      </p>
    </div>
  );
}

export function HomeInsightsSection({ data }: { data: HomeInsightsDTO }) {
  const { quarter, capacity, weeklyCapacityTarget } = data;
  const hasTarget = quarter.targetHours != null && quarter.targetHours > 0;
  const pulse = hasTarget ? quarterPulseFill(quarter, quarter.targetHours!) : null;
  const status = quarter.insight.status;
  const color = statusColor(status);
  const paceChip = pulse ? paceDeltaLabel(pulse.aheadBy) : null;

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
                <div className="group relative">
                  <div
                    className="relative h-8 w-full overflow-hidden rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)]"
                    style={{ background: "var(--app-surface-alt)" }}
                    role="meter"
                    tabIndex={0}
                    aria-label={`${quarter.label}: ${formatShortHours(pulse.allActualHours)} actuals including current week, ${formatShortHours(pulse.planForecastHours)} remaining forecast for current and future weeks, pace to date ${formatShortHours(pulse.paceToDateHours)}, of ${formatShortHours(quarter.targetHours!)} target. ${quarter.insight.message}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(
                      ((pulse.actualFill + pulse.forecastFill) / quarter.targetHours!) * 100,
                    )}
                    aria-describedby="quarter-pulse-stats"
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
                          {formatShortHours(pulse.planForecastHours)}
                        </span>
                      </div>
                    ) : null}
                    {pulse.actualPct > 0 ? (
                      <div
                        className="absolute inset-y-0 left-0 flex items-center overflow-hidden px-2.5 motion-safe:[transition:width_300ms_cubic-bezier(0.2,0,0.2,1)]"
                        style={{
                          width: `${pulse.actualPct}%`,
                          background: "var(--app-cta-dark-fill)",
                        }}
                      >
                        <span className="truncate text-[0.7rem] font-medium leading-none tabular-nums text-[var(--app-cta-dark-fg)]">
                          {formatShortHours(pulse.allActualHours)}
                        </span>
                      </div>
                    ) : null}
                    {pulse.pacePct > 0 ? (
                      <div
                        className="pointer-events-none absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 motion-safe:[transition:left_300ms_cubic-bezier(0.2,0,0.2,1)]"
                        style={{
                          left: `${pulse.pacePct}%`,
                          background: "var(--app-surface)",
                          boxShadow:
                            "0 0 0 1px color-mix(in oklab, var(--app-text) 18%, transparent)",
                        }}
                        aria-hidden
                      />
                    ) : null}
                  </div>

                  <div
                    id="quarter-pulse-stats"
                    role="tooltip"
                    className="pointer-events-none absolute bottom-[calc(100%+0.35rem)] left-1/2 z-20 w-max min-w-[9.5rem] -translate-x-1/2 rounded-[var(--app-radius)] border px-2.5 py-2 text-left opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
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
                      As of today
                    </p>
                    <dl className="mt-1 space-y-0.5 text-xs">
                      <div className="flex items-center justify-between gap-4">
                        <dt style={{ color: "var(--app-text-muted)" }}>Target</dt>
                        <dd className="tabular-nums font-medium">
                          {formatShortHours(quarter.targetHours!)}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <dt style={{ color: "var(--app-text-muted)" }}>Forecast</dt>
                        <dd className="tabular-nums font-medium">
                          {formatShortHours(pulse.planForecastHours)}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <dt style={{ color: "var(--app-text-muted)" }}>Pace</dt>
                        <dd className="tabular-nums font-medium">
                          {formatShortHours(pulse.paceToDateHours)}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <dt style={{ color: "var(--app-text-muted)" }}>Actuals</dt>
                        <dd className="tabular-nums font-medium">
                          {formatShortHours(pulse.allActualHours)}
                        </dd>
                      </div>
                    </dl>
                  </div>
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

          {hasTarget && pulse && paceChip ? (
            <div className="grid grid-cols-4 gap-1.5">
              <MetricChip label={paceChip.label} value={paceChip.value} />
              <MetricChip
                label="Projected Attainment"
                value={`${pulse.projectedAttainmentPct}%`}
              />
              <MetricChip
                label="Hours to reach target"
                value={formatShortHours(pulse.hoursLeftToTarget)}
              />
              <MetricChip
                label="Working Days Left"
                value={`${pulse.workingDaysLeft} day${pulse.workingDaysLeft === 1 ? "" : "s"}`}
              />
            </div>
          ) : status === "no_target" ? (
            <p className="text-sm leading-snug" style={{ color: "var(--app-text-muted)" }}>
              {quarter.insight.message}
            </p>
          ) : null}

          <Link
            href="/utilization"
            className="mt-auto inline-flex text-sm font-medium no-underline transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)]"
            style={{ color: "var(--app-action-emphasis)" }}
          >
            View utilization
          </Link>
        </div>

        <HomeAvailabilityCard
          capacity={capacity}
          weeklyCapacityTarget={weeklyCapacityTarget}
        />
      </div>

      <HomeEffortBreakdownCards data={data.breakdowns} />
    </section>
  );
}
