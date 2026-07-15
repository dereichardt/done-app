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

type WeekMode = "this" | "prior";

const SEG_WIDTH = 96;
/** Matches Tailwind `gap-3` (0.75rem); four slots → three gaps across the full row. */
const SLOT_GAP = "0.75rem";

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

function MetricPair({
  label,
  value,
  align,
}: {
  label: string;
  value: string;
  align: "start" | "end";
}) {
  return (
    <div
      className={`flex min-w-0 flex-1 flex-col ${
        align === "start" ? "items-end text-right" : "items-start text-left"
      }`}
    >
      <span className="text-xs font-medium text-muted-canvas">{label}</span>
      <span className="mt-0.5 text-base font-medium tabular-nums text-[var(--app-text)]">
        {value}
      </span>
    </div>
  );
}

export function VarianceCard({ title, totals }: { title: string; totals: HomeWeekTotals }) {
  const hasForecast = hasForecastHours(totals.forecast);
  const pct = hasForecast ? variancePercentLabel(totals.forecast, totals.variance) : null;

  return (
    <article
      className="card-canvas flex min-h-[10.5rem] w-full flex-col px-4 py-4"
      aria-label={
        hasForecast
          ? `${title}: forecast ${formatEffortHoursLabel(totals.forecast)}, actuals ${formatEffortHoursLabel(totals.actual)}, variance ${formatEffortHoursLabel(totals.variance)}${pct ? ` (${pct})` : ""}`
          : `${title}: forecast ${formatEffortHoursLabel(totals.forecast)}, actuals ${formatEffortHoursLabel(totals.actual)}, variance not available`
      }
    >
      <h3
        className="shrink-0 text-sm font-medium leading-snug text-[var(--app-text)]"
        title={title}
      >
        <span className="line-clamp-2">{title}</span>
      </h3>

      <div className="flex min-h-0 flex-1 items-center justify-center py-3">
        <div className="flex w-full max-w-[18rem] items-center gap-8">
          <MetricPair
            label="Forecast"
            value={formatEffortHoursLabel(totals.forecast)}
            align="start"
          />
          <div
            className="h-9 w-px shrink-0"
            style={{ background: "var(--app-border)" }}
            aria-hidden
          />
          <MetricPair
            label="Actuals"
            value={formatEffortHoursLabel(totals.actual)}
            align="end"
          />
        </div>
      </div>

      <div
        className="shrink-0 border-t pt-3 text-center"
        style={{ borderColor: "var(--app-border)" }}
      >
        {hasForecast ? (
          <>
            <p className="text-base font-medium tabular-nums text-[var(--app-text)]">
              {formatEffortHoursLabel(totals.variance)}
            </p>
            {pct ? (
              <p className="mt-0.5 text-xs font-normal text-muted-canvas">{pct}</p>
            ) : null}
          </>
        ) : (
          <p className="text-base font-medium text-muted-canvas">—</p>
        )}
      </div>
    </article>
  );
}

export function HomeActualsVsForecast({ data }: { data: HomeActualsVsForecastDTO }) {
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
                <VarianceCard title={p.name} totals={p.totals} />
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
