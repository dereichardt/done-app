"use client";

import { useState } from "react";

import { HomeVarianceTrendsDialog } from "@/components/home-variance-trends-dialog";
import {
  type HomeActualsVsForecastDTO,
  type HomeWeekTotals,
  hasForecastHours,
  makeWeekTotals,
  variancePercentLabel,
} from "@/lib/home-actuals-vs-forecast";
import { formatEffortHoursLabel } from "@/lib/integration-effort-buckets";
import { InitiativeIcpPill } from "@/components/initiative-icp-pill";

type WeekMode = "this" | "prior";

const SEG_WIDTH = 96;
/** Matches Tailwind `gap-3` (0.75rem); four slots → three gaps across the full row. */
const SLOT_GAP = "0.75rem";

function formatBarHours(hours: number): string {
  if (!Number.isFinite(hours) || hours === 0) return "0h";
  const q = Math.round(hours * 4) / 4;
  const s = Number.isInteger(q) ? String(q) : String(parseFloat(q.toFixed(2)));
  return `${s}h`;
}

function WeekModeToggle({
  mode,
  onChange,
}: {
  mode: WeekMode;
  onChange: (mode: WeekMode) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Week selection"
      className="relative inline-flex overflow-visible rounded-[10px] border"
      style={{ borderColor: "var(--app-border)", background: "var(--app-surface-alt)" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-y-px left-0 z-[1] rounded-[10px]"
        style={{
          width: SEG_WIDTH,
          transform: `translateX(${mode === "prior" ? SEG_WIDTH : 0}px)`,
          transition: "transform 180ms cubic-bezier(0.2, 0, 0.2, 1)",
          background: "#1f2937",
          boxShadow: "0 0 0 2px color-mix(in oklab, var(--app-border) 70%, white)",
        }}
      />
      <button
        type="button"
        role="tab"
        aria-selected={mode === "this"}
        className={[
          "relative z-[2] inline-flex h-8 items-center justify-center whitespace-nowrap px-3 text-center text-xs transition-colors cursor-pointer rounded-l-[10px]",
          mode === "this"
            ? "font-semibold text-[#f3f5f8]"
            : "font-normal text-muted-canvas hover:text-[var(--app-text)]",
        ].join(" ")}
        style={{ width: SEG_WIDTH }}
        onClick={() => onChange("this")}
      >
        This week
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "prior"}
        className={[
          "relative z-[2] inline-flex h-8 items-center justify-center whitespace-nowrap px-3 text-center text-xs transition-colors cursor-pointer rounded-r-[10px]",
          mode === "prior"
            ? "font-semibold text-[#f3f5f8]"
            : "font-normal text-muted-canvas hover:text-[var(--app-text)]",
        ].join(" ")}
        style={{ width: SEG_WIDTH }}
        onClick={() => onChange("prior")}
      >
        Prior week
      </button>
    </div>
  );
}

export function VarianceCard({
  title,
  totals,
  isIcp = false,
}: {
  title: string;
  totals: HomeWeekTotals;
  isIcp?: boolean;
}) {
  const hasForecast = hasForecastHours(totals.forecast);
  const pct = hasForecast ? variancePercentLabel(totals.forecast, totals.variance) : null;
  const fillPct =
    hasForecast && totals.actual > 0
      ? Math.min(100, (totals.actual / totals.forecast) * 100)
      : 0;
  const showActualInBar = totals.actual > 0 && fillPct > 0;

  return (
    <article
      className="card-canvas flex min-h-[10.5rem] w-full flex-col px-4 py-4"
      aria-label={
        hasForecast
          ? `${title}: forecast ${formatEffortHoursLabel(totals.forecast)}, actuals ${formatEffortHoursLabel(totals.actual)}, remaining ${formatEffortHoursLabel(totals.variance)}${pct ? ` (${pct})` : ""}`
          : `${title}: forecast ${formatEffortHoursLabel(totals.forecast)}, actuals ${formatEffortHoursLabel(totals.actual)}, remaining not available`
      }
    >
      <div className="flex shrink-0 items-start gap-2">
        <h3
          className="min-w-0 text-sm font-medium leading-snug text-[var(--app-text)]"
          title={title}
        >
          <span className="line-clamp-2">{title}</span>
        </h3>
        {isIcp ? <InitiativeIcpPill className="mt-0.5" /> : null}
      </div>

      <div className="mt-1 flex min-h-0 flex-1 flex-col justify-center">
        <span className="mb-1.5 self-end text-xs font-medium tabular-nums leading-none text-[var(--app-text)]">
          {formatBarHours(totals.forecast)}
        </span>
        <div
          className="relative h-8 w-full overflow-hidden rounded-full"
          style={{ background: "var(--app-border)" }}
          aria-hidden
        >
          {showActualInBar ? (
            <div
              className="absolute inset-y-0 left-0 flex items-center overflow-hidden rounded-full px-2.5"
              style={{
                width: `${fillPct}%`,
                background: "var(--app-cta-dark-fill)",
              }}
            >
              <span className="text-[0.7rem] font-medium leading-none tabular-nums text-[var(--app-cta-dark-fg)]">
                {formatBarHours(totals.actual)}
              </span>
            </div>
          ) : null}
        </div>

        <p className="mt-4 text-xs font-medium tabular-nums text-[var(--app-text)]">
          {hasForecast ? (
            <>
              <span>{formatEffortHoursLabel(totals.variance)} remaining</span>
              {pct ? (
                <span className="font-normal text-muted-canvas">
                  {" · "}
                  {pct}
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-muted-canvas">—</span>
          )}
        </p>
      </div>
    </article>
  );
}

export function HomeActualsVsForecast({
  data,
}: {
  data: HomeActualsVsForecastDTO;
}) {
  const [mode, setMode] = useState<WeekMode>("this");
  const [trendsOpen, setTrendsOpen] = useState(false);

  const currentSunday = data.weeks[data.weeks.length - 1] ?? "";
  const priorSunday =
    data.weeks.length >= 2 ? data.weeks[data.weeks.length - 2]! : currentSunday;
  const weekKey = mode === "this" ? currentSunday : priorSunday;

  const totals = mode === "this" ? data.thisWeek : data.priorWeek;
  const projectTotals = data.projects.map((p) => ({
    id: p.id,
    name: p.name,
    isIcp: p.isIcp,
    totals: p.byWeek[weekKey] ?? makeWeekTotals(0, 0),
  }));

  /** One of four equal slots across the row (accounting for three gaps). */
  const totalSlotWidth = `calc((100% - 3 * ${SLOT_GAP}) / 4)`;
  /** Three equal cards in the scroll viewport (accounting for two gaps between them). */
  const projectCardWidth = `calc((100% - 2 * ${SLOT_GAP}) / 3)`;

  return (
    <>
      <section aria-label="Actuals vs forecast" className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-heading">Actuals vs Forecast</h2>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn-cta-tertiary"
              onClick={() => setTrendsOpen(true)}
            >
              Variance Trends
            </button>
            <WeekModeToggle mode={mode} onChange={setMode} />
          </div>
        </div>

        <div
          className="mt-3 flex items-start gap-3"
          aria-label={mode === "this" ? "This week by project" : "Prior week by project"}
        >
          <div className="shrink-0 pb-2" style={{ width: totalSlotWidth }}>
            <VarianceCard title="Total" totals={totals} />
          </div>

          <div className="flex min-w-0 flex-1 items-start gap-3 overflow-x-auto pb-2">
            {projectTotals.map((p) => (
              <div
                key={p.id}
                className="min-w-0 shrink-0"
                style={{ flex: `0 0 ${projectCardWidth}`, width: projectCardWidth }}
              >
                <VarianceCard title={p.name} totals={p.totals} isIcp={p.isIcp} />
              </div>
            ))}

            {projectTotals.length === 0 ? (
              <p className="flex items-center text-sm text-muted-canvas">No active projects</p>
            ) : null}
          </div>
        </div>
      </section>

      {trendsOpen ? (
        <HomeVarianceTrendsDialog data={data} onClose={() => setTrendsOpen(false)} />
      ) : null}
    </>
  );
}
