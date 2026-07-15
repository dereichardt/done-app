"use client";

import { useEffect, useState } from "react";

import { ForecastWeekCell, TARGET_WEEKLY_FORECAST_HOURS } from "@/app/forecast/forecast-week-cell";
import { loadInboxCapacityGaps } from "@/lib/actions/home-inbox";
import {
  TARGET_WEEKLY_CAPACITY_HOURS,
  type CapacityGapsSynthesis,
  type CapacityWeekGap,
} from "@/lib/home-capacity-gaps";
import { formatForecastSundayDate } from "@/lib/project-forecast";

function weeksFromMetadata(metadata: Record<string, unknown> | null | undefined): CapacityWeekGap[] | null {
  if (!metadata || !Array.isArray(metadata.weeks)) return null;
  const out: CapacityWeekGap[] = [];
  for (const row of metadata.weeks) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const weekStart = typeof r.weekStart === "string" ? r.weekStart : null;
    if (!weekStart) continue;
    out.push({
      weekStart,
      portfolioHours: Math.max(0, Math.round(Number(r.portfolioHours) || 0)),
      freeHours: Math.max(0, Math.round(Number(r.freeHours) || 0)),
    });
  }
  return out.length > 0 ? out : null;
}

export function InboxCapacityGapsPanel({
  fallbackBody,
  metadata,
}: {
  fallbackBody: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [synthesis, setSynthesis] = useState<CapacityGapsSynthesis | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadInboxCapacityGaps().then((res) => {
      if (cancelled) return;
      if (res.error || !res.synthesis) {
        const metaWeeks = weeksFromMetadata(metadata);
        if (metaWeeks) {
          setSynthesis({
            weeks: metaWeeks,
            body: fallbackBody ?? "",
            freeHoursPerWeek:
              typeof metadata?.freeHoursPerWeek === "number" ? metadata.freeHoursPerWeek : null,
            freeStartingWeek:
              typeof metadata?.freeStartingWeek === "string" ? metadata.freeStartingWeek : null,
          });
          setLoading(false);
          return;
        }
        setError(res.error ?? "Failed to load capacity.");
        setLoading(false);
        return;
      }
      setSynthesis(res.synthesis);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fallbackBody, metadata]);

  if (loading) {
    return <p className="text-sm text-muted-canvas">Checking capacity…</p>;
  }
  if (error || !synthesis) {
    return (
      <div className="flex flex-col gap-3">
        {fallbackBody ? <p className="text-sm text-muted-canvas whitespace-pre-wrap">{fallbackBody}</p> : null}
        <p className="text-sm" role="alert" style={{ color: "var(--app-danger)" }}>
          {error ?? "No capacity data."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-canvas whitespace-pre-wrap">{synthesis.body || fallbackBody}</p>
      <p className="text-xs text-muted-canvas">
        Target weekly load: {TARGET_WEEKLY_CAPACITY_HOURS}h (weeks 4–8 ahead).
      </p>

      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-3 pb-1">
          {synthesis.weeks.map((w) => (
            <div key={w.weekStart} className="flex w-[4.5rem] flex-col items-center gap-1">
              <span className="text-center text-[11px] leading-tight text-muted-canvas">
                {formatForecastSundayDate(w.weekStart)}
              </span>
              <ForecastWeekCell
                hours={w.portfolioHours}
                editable={false}
                locked
                capacityTint
                barScaleHours={TARGET_WEEKLY_FORECAST_HOURS}
                onCommitHours={() => {}}
              />
              <span className="text-center text-[11px] text-muted-canvas">
                {w.freeHours > 0 ? `${w.freeHours}h free` : "full"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
