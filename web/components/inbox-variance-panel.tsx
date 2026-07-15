"use client";

import { useEffect, useMemo, useState } from "react";

import { loadInboxVarianceReview } from "@/lib/actions/home-inbox";
import {
  type HomeActualsVsForecastDTO,
  type HomeWeekTotals,
  hasForecastHours,
  makeWeekTotals,
  variancePercentLabel,
} from "@/lib/home-actuals-vs-forecast";
import { formatEffortHoursLabel } from "@/lib/integration-effort-buckets";
import { formatForecastSundayDate } from "@/lib/project-forecast";

function MetricRow({ label, totals }: { label: string; totals: HomeWeekTotals }) {
  const pct = variancePercentLabel(totals.forecast, totals.variance);
  return (
    <div
      className="flex flex-wrap items-baseline justify-between gap-2 rounded-[var(--app-radius)] border px-3 py-2"
      style={{ borderColor: "var(--app-border)", background: "var(--app-surface-alt)" }}
    >
      <span className="text-sm font-medium" style={{ color: "var(--app-text)" }}>
        {label}
      </span>
      <span className="text-sm text-muted-canvas">
        {formatEffortHoursLabel(totals.forecast)} forecast · {formatEffortHoursLabel(totals.actual)}{" "}
        actual
        {pct ? (
          <span className="ml-1 font-medium" style={{ color: "var(--app-text)" }}>
            ({pct})
          </span>
        ) : null}
      </span>
    </div>
  );
}

function portfolioWeekTotals(data: HomeActualsVsForecastDTO, weekStart: string): HomeWeekTotals {
  return data.projects.reduce((acc, p) => {
    const t = p.byWeek[weekStart] ?? makeWeekTotals(0, 0);
    return makeWeekTotals(acc.forecast + t.forecast, acc.actual + t.actual);
  }, makeWeekTotals(0, 0));
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

  const prior = data.priorWeek;
  const showPrior = hasForecastHours(prior.forecast) || prior.actual > 0;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-canvas">
        Portfolio forecast vs actual for last week, plus the prior 4-week trend.
      </p>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium" style={{ color: "var(--app-text)" }}>
          Last week
        </h3>
        {showPrior ? (
          <MetricRow label="Portfolio" totals={prior} />
        ) : (
          <p className="text-sm text-muted-canvas">No forecast or actuals for last week.</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium" style={{ color: "var(--app-text)" }}>
          Last 4 weeks
        </h3>
        {trendWeeks.length === 0 ? (
          <p className="text-sm text-muted-canvas">Not enough history yet.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {trendWeeks.map((w) => {
              const totals = portfolioWeekTotals(data, w);
              return (
                <li key={w}>
                  <MetricRow label={formatForecastSundayDate(w)} totals={totals} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
