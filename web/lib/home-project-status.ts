import type { HomeWeekTotals } from "@/lib/home-actuals-vs-forecast";
import {
  isDeliveryProgress,
  PROJECT_DELIVERY_PROGRESS_VALUES,
  type ProjectDeliveryProgress,
} from "@/lib/integration-metadata";
import type { PhaseForStatus } from "@/lib/project-phase-status";
import { calendarDaysFromTo, resolvePhaseStatus } from "@/lib/project-phase-status";

export type HomeProjectStatusPhase = {
  name: string;
  sort_order: number;
  start_date: string | null;
  end_date: string | null;
};

export type HomeProjectStatusIntegration = {
  id: string;
  title: string;
  delivery_progress: string;
  deliveryProgressLabel: string;
  deliveryProgressIndex: number;
  estimatedHours: number | null;
  actualHours: number;
};

export type HomeProjectForecastStats = {
  estimatedHours: number;
  actualHours: number;
  forecastedHours: number | null;
  varianceKind: "under" | "over" | "on" | "unavailable";
  varianceHours: number | null;
  varianceLabel: string;
};

export type HomeProjectStatusPayload = {
  todayYmd: string;
  phases: HomeProjectStatusPhase[];
  projectTotals: {
    actualHours: number;
    estimatedHours: number;
  };
  integrations: HomeProjectStatusIntegration[];
  /** This-week actuals vs forecast for the selected project. */
  actualsVsForecast: HomeWeekTotals;
  projectForecastStats: HomeProjectForecastStats;
};

export type TimelineModel =
  | {
      kind: "dated";
      spanStart: string;
      spanEnd: string;
      fillRatio: number;
      /** Phase end dates as ratio 0..1 on span */
      phaseEndMarkers: { ratio: number; name: string }[];
    }
  | {
      kind: "undated";
      segmentCount: number;
      fillRatio: number;
      /** Boundaries between segments i/i+1 at (i+1)/n */
      segmentMarkers: { ratio: number; name: string }[];
    }
  | { kind: "empty" };

function dateOnly(iso: string | null | undefined): string | null {
  if (iso == null) return null;
  const t = String(iso).trim();
  if (t.length < 10) return null;
  return t.slice(0, 10);
}

/** Earliest start and latest end across phases (YYYY-MM-DD). */
function phaseDateSpan(phases: HomeProjectStatusPhase[]): { start: string; end: string } | null {
  let minStart: string | null = null;
  let maxEnd: string | null = null;
  for (const p of phases) {
    const s = dateOnly(p.start_date);
    const e = dateOnly(p.end_date);
    if (s && (!minStart || s < minStart)) minStart = s;
    if (e && (!maxEnd || e > maxEnd)) maxEnd = e;
  }
  if (minStart && maxEnd && minStart <= maxEnd) return { start: minStart, end: maxEnd };
  return null;
}

/**
 * Build timeline fill + markers for the status meters.
 * Prefer calendar span when enough dates exist; otherwise equal segments from phase order + `resolvePhaseStatus`.
 */
export function buildTimelineModel(
  phases: HomeProjectStatusPhase[],
  todayYmd: string,
): TimelineModel {
  const sorted = [...phases].sort((a, b) => a.sort_order - b.sort_order);
  if (sorted.length === 0) return { kind: "empty" };

  const span = phaseDateSpan(sorted);
  if (span) {
    const totalDays = Math.max(1, calendarDaysFromTo(span.start, span.end));
    const elapsed = calendarDaysFromTo(span.start, todayYmd);
    const fillRatio = Math.min(1, Math.max(0, elapsed / totalDays));

    const phaseEndMarkers: { ratio: number; name: string }[] = [];
    for (const p of sorted) {
      const e = dateOnly(p.end_date);
      if (!e) continue;
      if (e < span.start || e > span.end) continue;
      const dayFromStart = calendarDaysFromTo(span.start, e);
      phaseEndMarkers.push({
        ratio: Math.min(1, Math.max(0, dayFromStart / totalDays)),
        name: p.name,
      });
    }

    return { kind: "dated", spanStart: span.start, spanEnd: span.end, fillRatio, phaseEndMarkers };
  }

  const segmentCount = sorted.length;
  const asPhasesForStatus: PhaseForStatus[] = sorted.map((p) => ({
    name: p.name,
    sort_order: p.sort_order,
    start_date: p.start_date,
    end_date: p.end_date,
  }));
  const status = resolvePhaseStatus(asPhasesForStatus, todayYmd);

  let fillRatio = 0;
  if (status.kind === "active") {
    const idx = sorted.findIndex((p) => p.name === status.name && dateOnly(p.end_date) === status.endDate);
    if (idx >= 0) fillRatio = (idx + 1) / segmentCount;
    else fillRatio = Math.min(1, 1 / segmentCount);
  } else if (status.kind === "upcoming") {
    fillRatio = 0.02;
  } else if (status.kind === "complete") {
    fillRatio = 1;
  } else if (status.kind === "unset" || status.kind === "empty") {
    fillRatio = 0;
  }

  const segmentMarkers: { ratio: number; name: string }[] = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    segmentMarkers.push({
      ratio: (i + 1) / segmentCount,
      name: sorted[i].name,
    });
  }

  return {
    kind: "undated",
    segmentCount,
    fillRatio: Math.min(1, Math.max(0, fillRatio)),
    segmentMarkers,
  };
}

export function deliveryProgressIndex(deliveryProgress: string): number {
  const values = PROJECT_DELIVERY_PROGRESS_VALUES as readonly string[];
  const idx = values.indexOf(deliveryProgress);
  if (idx >= 0) return idx;
  if (isDeliveryProgress(deliveryProgress)) return values.indexOf(deliveryProgress);
  return 0;
}

export function deliveryFillRatio(index: number): number {
  const values = PROJECT_DELIVERY_PROGRESS_VALUES;
  if (values.length <= 1) return 0;
  return Math.min(1, Math.max(0, index / (values.length - 1)));
}

export function hoursFillRatio(actual: number, estimated: number | null): { fill: number; overEstimate: boolean } {
  const a = Number.isFinite(actual) && actual > 0 ? actual : 0;
  const e =
    estimated != null && Number.isFinite(estimated) && estimated > 0 ? estimated : null;
  if (e == null) {
    return a > 0 ? { fill: 1, overEstimate: false } : { fill: 0, overEstimate: false };
  }
  if (a <= e) return { fill: a / e, overEstimate: false };
  return { fill: 1, overEstimate: true };
}

export function formatStatusHours(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return "0 hr";
  const rounded = Math.round(h * 100) / 100;
  if (rounded === Math.floor(rounded)) return `${rounded} hr`;
  return `${rounded} hr`;
}

/** Remaining hours vs estimate; remaining is 0 when over. */
export function hoursRemaining(
  actual: number,
  estimated: number | null,
): { remaining: number | null; overEstimate: boolean; overage: number } {
  const e =
    estimated != null && Number.isFinite(estimated) && estimated > 0 ? estimated : null;
  if (e == null) {
    return { remaining: null, overEstimate: false, overage: 0 };
  }
  const a = Number.isFinite(actual) && actual > 0 ? actual : 0;
  if (a > e) {
    return { remaining: 0, overEstimate: true, overage: a - e };
  }
  return { remaining: e - a, overEstimate: false, overage: 0 };
}

/** Bucket integrations into delivery-progress columns (all stages present, may be empty). */
export function groupIntegrationsByDeliveryProgress(
  integrations: HomeProjectStatusIntegration[],
): Record<ProjectDeliveryProgress, HomeProjectStatusIntegration[]> {
  const out = Object.fromEntries(
    PROJECT_DELIVERY_PROGRESS_VALUES.map((v) => [v, [] as HomeProjectStatusIntegration[]]),
  ) as Record<ProjectDeliveryProgress, HomeProjectStatusIntegration[]>;

  for (const integ of integrations) {
    const key: ProjectDeliveryProgress = isDeliveryProgress(integ.delivery_progress)
      ? integ.delivery_progress
      : "not_started";
    out[key].push(integ);
  }
  return out;
}
