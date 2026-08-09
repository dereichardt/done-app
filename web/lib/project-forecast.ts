/**
 * Pure helpers for project weekly hour forecasts (generate + reserve-aware edits).
 */

import {
  formatLocalYmd,
  parseLocalYmd,
  startOfLocalWeekSunday,
} from "@/lib/integration-effort-buckets";
import {
  type DefaultPhaseKey,
  isDefaultPhaseKey,
} from "@/lib/project-phases";
import {
  formatSundayWeekLabel,
  sundayWeekStartsInclusive,
  timelineSpanFromPhases,
} from "@/lib/project-weekly-effort";
import {
  DEPLOYMENT_EFFORT_PHASES,
  type DeploymentEffortByPhase,
} from "@/lib/user-preferences";

export const DEFAULT_FORECAST_SPREAD_MODE = "even" as const;

export type ForecastStartMode = "this_week" | "next_week";
export type ForecastSpreadMode = "even" | "bell";

export function isForecastSpreadMode(value: unknown): value is ForecastSpreadMode {
  return value === "even" || value === "bell";
}

export type ForecastPhaseInput = {
  phase_key: string | null;
  start_date: string | null;
  end_date: string | null;
};

export type ForecastIntegrationInput = {
  /** project_integrations.id */
  key: string;
  label: string;
  estimatedEffortHours: number | null;
};

export type ForecastCell = {
  weekStartDate: string;
  hours: number;
};

export type GenerateForecastInput = {
  phases: ForecastPhaseInput[];
  integrations: ForecastIntegrationInput[];
  deploymentEffortByPhase: DeploymentEffortByPhase;
  /** This week or next week (Sunday of that week). */
  startMode: ForecastStartMode;
  /** Even peanut-butter vs per-phase bell curve. */
  spreadMode?: ForecastSpreadMode;
  /**
   * When true, past-phase hours are peanut-buttered across remaining writable weeks.
   * When false (default), they stay unallocated as reserve (under estimate).
   */
  includePastPhaseHours?: boolean;
  /** User-local today YYYY-MM-DD. */
  todayIso: string;
  /** Aggregate actual hours from completed past weeks. */
  actualHours: number;
  /** Project weeks whose existing values must be preserved during regeneration. */
  lockedWeekStarts?: string[];
  /** Existing forecast values used as actual-like consumption for locked weeks. */
  lockedHoursByWeek?: Record<string, number>;
};

export type GenerateForecastResult = {
  weeks: Array<{ startYmd: string; label: string }>;
  hoursByWeek: Record<string, number>;
  /** Hours held off the grid (past-phase under estimate). */
  reserveHours: number;
  error?: string;
};

/** estimated − actuals − forecastTotal. Positive = under estimate. */
export type EstimateVariance = {
  variance: number;
  /** Absolute hours away from estimate (0 when on estimate). */
  absHours: number;
  kind: "under" | "over" | "on";
  label: string;
};

export function computeEstimateVariance(input: {
  estimated: number;
  actuals: number;
  forecastTotal: number;
}): EstimateVariance {
  const variance =
    Math.round(input.estimated) -
    Math.round(input.actuals) -
    Math.round(input.forecastTotal);
  const absHours = Math.abs(variance);
  if (variance > 0) {
    return {
      variance,
      absHours,
      kind: "under",
      label: `Under estimate by ${absHours}h`,
    };
  }
  if (variance < 0) {
    return {
      variance,
      absHours,
      kind: "over",
      label: `Over estimate by ${absHours}h`,
    };
  }
  return { variance: 0, absHours: 0, kind: "on", label: "On estimate" };
}

/**
 * Display signed estimate variance: +Nh under, −Nh over, 0h on.
 * `formatAbsHours` formats the magnitude only (must not clamp negatives).
 */
export function formatSignedVarianceHours(
  varianceHours: number,
  formatAbsHours: (hours: number) => string = (h) => `${Math.round(h)}h`,
): string {
  const rounded = Math.round(varianceHours);
  if (!Number.isFinite(varianceHours) || rounded === 0) return "0h";
  const absText = formatAbsHours(Math.abs(rounded));
  return rounded > 0 ? `+${absText}` : `\u2212${absText}`;
}

function dateOnlyYmd(iso: string | null | undefined): string | null {
  if (iso == null || iso.trim() === "") return null;
  const s = iso.trim();
  return s.length >= 10 ? s.slice(0, 10) : s;
}

export function roundWholeHours(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

/** Sum of whole-hour estimates across integration and project-management rows. */
export function sumEstimatedRoundedHours(
  integrations: ForecastIntegrationInput[],
): number {
  let sum = 0;
  for (const integ of integrations) {
    sum += roundWholeHours(Number(integ.estimatedEffortHours ?? 0));
  }
  return sum;
}

/** Aggregate completed effort rounded once at the project boundary. */
export function sumActualsConsumedHours(actualHours: number): number {
  return actualsHoursConsumed(actualHours);
}

/** Actuals plus protected current/future project forecast hours. */
export function actualsWithLockedForecastHours(input: {
  actualHours: number;
  lockedWeekStarts: string[];
  lockedHoursByWeek: Record<string, number>;
  currentSunday: string;
  /** Existing weeks before this regeneration start are committed effort. */
  forecastStartDate?: string;
}): number {
  const lockedWeeks = new Set(input.lockedWeekStarts);
  const forecastStartDate = input.forecastStartDate ?? input.currentSunday;
  let committedHours = 0;
  for (const [week, hours] of Object.entries(input.lockedHoursByWeek)) {
    const beforeRegenerationStart =
      week >= input.currentSunday && week < forecastStartDate;
    if (
      beforeRegenerationStart ||
      (week >= forecastStartDate && lockedWeeks.has(week))
    ) {
      committedHours += Math.max(0, Math.round(hours));
    }
  }
  return Math.max(0, Number(input.actualHours) || 0) + committedHours;
}

/** Largest-remainder allocation of `total` across `weights` (non-negative). */
export function allocateByLargestRemainder(
  total: number,
  weights: number[],
): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const safeTotal = Math.max(0, Math.round(total));
  if (safeTotal === 0) return Array.from({ length: n }, () => 0);

  let weightSum = 0;
  for (const w of weights) weightSum += Math.max(0, w);
  if (weightSum <= 0) {
    const base = Math.floor(safeTotal / n);
    const rem = safeTotal - base * n;
    return weights.map((_, i) => base + (i < rem ? 1 : 0));
  }

  const exact = weights.map((w) => (safeTotal * Math.max(0, w)) / weightSum);
  const floors = exact.map((x) => Math.floor(x));
  const remaining = safeTotal - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - floors[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const out = [...floors];
  for (let k = 0; k < remaining; k++) {
    out[order[k % n].i] += 1;
  }
  return out;
}

/**
 * When `total` is thinner than the number of positive-weight slots, place unit
 * hours at evenly spaced indices (sparse 1h / 0h). Otherwise use largest-remainder.
 */
export function allocateSparseOrLargestRemainder(
  total: number,
  weights: number[],
): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const safeTotal = Math.max(0, Math.round(total));
  if (safeTotal === 0) return Array.from({ length: n }, () => 0);

  const positiveIndices = weights
    .map((w, i) => (w > 0 ? i : -1))
    .filter((i) => i >= 0);
  const indices = positiveIndices.length > 0 ? positiveIndices : weights.map((_, i) => i);

  if (safeTotal >= indices.length) {
    const effective =
      positiveIndices.length > 0 ? weights.map((w) => Math.max(0, w)) : weights.map(() => 1);
    return allocateByLargestRemainder(safeTotal, effective);
  }

  const out = Array.from({ length: n }, () => 0);
  const L = indices.length;
  if (safeTotal === 1) {
    out[indices[Math.floor(L / 2)]] = 1;
    return out;
  }
  for (let k = 0; k < safeTotal; k++) {
    const slot = Math.round((k * (L - 1)) / (safeTotal - 1));
    out[indices[slot]] = 1;
  }
  return out;
}

/** Relative intensity along phase progress t ∈ [0,1] for bell mode. */
export function phaseSpreadShapeFactor(
  phaseKey: DefaultPhaseKey,
  t: number,
  spreadMode: ForecastSpreadMode,
): number {
  if (spreadMode === "even") return 1;
  const x = Math.min(1, Math.max(0, t));
  if (phaseKey === "architect_configure") {
    // Peak middle–late (~0.65).
    const peak = 0.65;
    const sigma = 0.28;
    return Math.exp(-0.5 * ((x - peak) / sigma) ** 2);
  }
  if (phaseKey === "test") {
    // Peak near the start (~0.2).
    const peak = 0.2;
    const sigma = 0.22;
    return Math.exp(-0.5 * ((x - peak) / sigma) ** 2);
  }
  return 1;
}

function overlapDaysInclusive(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): number {
  const a0 = parseLocalYmd(aStart).getTime();
  const a1 = parseLocalYmd(aEnd).getTime();
  const b0 = parseLocalYmd(bStart).getTime();
  const b1 = parseLocalYmd(bEnd).getTime();
  if (
    Number.isNaN(a0) ||
    Number.isNaN(a1) ||
    Number.isNaN(b0) ||
    Number.isNaN(b1) ||
    a1 < a0 ||
    b1 < b0
  ) {
    return 0;
  }
  const start = Math.max(a0, b0);
  const end = Math.min(a1, b1);
  if (end < start) return 0;
  return Math.floor((end - start) / 86_400_000) + 1;
}

function weekEndYmd(weekStartYmd: string): string {
  const d = parseLocalYmd(weekStartYmd);
  d.setDate(d.getDate() + 6);
  return formatLocalYmd(d);
}

export function currentSundayWeekYmd(todayIso: string): string {
  const anchor = todayIso.trim() ? parseLocalYmd(todayIso.trim()) : new Date();
  if (Number.isNaN(anchor.getTime())) {
    return formatLocalYmd(startOfLocalWeekSunday(new Date()));
  }
  return formatLocalYmd(startOfLocalWeekSunday(anchor));
}

/** Sunday YYYY-MM-DD for “This week” or “Next week” relative to `todayIso`. */
export function forecastStartSundayYmd(
  todayIso: string,
  mode: ForecastStartMode,
): string {
  const thisSunday = currentSundayWeekYmd(todayIso);
  if (mode === "this_week") return thisSunday;
  const d = parseLocalYmd(thisSunday);
  d.setDate(d.getDate() + 7);
  return formatLocalYmd(d);
}

/** Display label for a Sunday week start, e.g. `Sun, Apr 6, 2025`. */
export function formatForecastSundayDate(weekStartYmd: string): string {
  const d = parseLocalYmd(weekStartYmd);
  if (Number.isNaN(d.getTime())) return weekStartYmd;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Hours already worked — ceil so any logged time reduces remaining forecast. */
export function actualsHoursConsumed(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.ceil(raw - 1e-9);
}

export function forecastPrerequisites(input: {
  phases: ForecastPhaseInput[];
  integrations: ForecastIntegrationInput[];
}): { ok: true } | { ok: false; reason: string } {
  const span = timelineSpanFromPhases(input.phases);
  if (!span) {
    return {
      ok: false,
      reason: "Set the project timeline (first phase start and last phase end) before generating a forecast.",
    };
  }
  const datedDefault = input.phases.some(
    (p) =>
      p.phase_key &&
      isDefaultPhaseKey(p.phase_key) &&
      dateOnlyYmd(p.start_date) &&
      dateOnlyYmd(p.end_date),
  );
  if (!datedDefault) {
    return {
      ok: false,
      reason: "Date at least one default stage (Plan through Hypercare) before generating a forecast.",
    };
  }
  const withEstimate = input.integrations.some(
    (i) => i.estimatedEffortHours != null && Number.isFinite(i.estimatedEffortHours) && i.estimatedEffortHours > 0,
  );
  if (!withEstimate) {
    return {
      ok: false,
      reason:
        "Add estimated effort to at least one integration or set Project Management Hours before generating a forecast.",
    };
  }
  return { ok: true };
}

function datedDefaultPhases(
  phases: ForecastPhaseInput[],
): Array<{ phase_key: DefaultPhaseKey; startYmd: string; endYmd: string }> {
  const out: Array<{ phase_key: DefaultPhaseKey; startYmd: string; endYmd: string }> = [];
  for (const p of phases) {
    const key = p.phase_key?.trim() ?? "";
    if (!isDefaultPhaseKey(key)) continue;
    const startYmd = dateOnlyYmd(p.start_date);
    const endYmd = dateOnlyYmd(p.end_date);
    if (!startYmd || !endYmd) continue;
    out.push({ phase_key: key, startYmd, endYmd });
  }
  return out;
}

const SHORT_PHASE_LABELS: Record<DefaultPhaseKey, string> = {
  plan: "Plan",
  architect_configure: "A&C",
  test: "Test",
  deploy: "Deploy",
  hypercare: "Hypercare",
};

export type ForecastPhaseWeekSegment = {
  phaseKey: string | null;
  label: string;
  weeks: string[];
};

/**
 * Contiguous week runs along `sharedWeeks`, labeled by whichever dated default
 * phase overlaps each Sunday week most. Empty label when no phase overlaps.
 */
export function buildForecastPhaseWeekSegments(
  sharedWeeks: string[],
  phases: ForecastPhaseInput[],
): ForecastPhaseWeekSegment[] {
  if (sharedWeeks.length === 0) return [];

  const dated = datedDefaultPhases(phases);
  const weekPhaseKeys: Array<string | null> = sharedWeeks.map((weekStart) => {
    const weekEnd = weekEndYmd(weekStart);
    let best: { key: DefaultPhaseKey; days: number } | null = null;
    for (const p of dated) {
      const days = overlapDaysInclusive(weekStart, weekEnd, p.startYmd, p.endYmd);
      if (days <= 0) continue;
      if (!best || days > best.days) best = { key: p.phase_key, days };
    }
    return best?.key ?? null;
  });

  const segments: ForecastPhaseWeekSegment[] = [];
  for (let i = 0; i < sharedWeeks.length; i++) {
    const key = weekPhaseKeys[i];
    const last = segments[segments.length - 1];
    if (last && last.phaseKey === key) {
      last.weeks.push(sharedWeeks[i]);
      continue;
    }
    segments.push({
      phaseKey: key,
      label:
        key && isDefaultPhaseKey(key)
          ? SHORT_PHASE_LABELS[key]
          : key
            ? key
            : "",
      weeks: [sharedWeeks[i]],
    });
  }
  return segments;
}

/**
 * Weeks that form the bank pool for hours from past stages.
 * Prefer Hypercare overlap weeks; else last still-active stage; else last writable week.
 * Banked hours are placed on the last week of this pool at generate time.
 */
export function forecastBankWeekStarts(
  writableWeeks: string[],
  phases: ForecastPhaseInput[],
): string[] {
  if (writableWeeks.length === 0) return [];

  const dated = datedDefaultPhases(phases);
  const weeksOverlapping = (phase: { startYmd: string; endYmd: string }) =>
    writableWeeks.filter((weekStart) => {
      const weekEnd = weekEndYmd(weekStart);
      return overlapDaysInclusive(weekStart, weekEnd, phase.startYmd, phase.endYmd) > 0;
    });

  const hypercare = dated.find((p) => p.phase_key === "hypercare");
  if (hypercare) {
    const inHypercare = weeksOverlapping(hypercare);
    if (inHypercare.length > 0) return inHypercare;
  }

  const active = dated.filter((phase) => weeksOverlapping(phase).length > 0);
  if (active.length > 0) {
    const last = [...active].sort((a, b) => a.endYmd.localeCompare(b.endYmd)).at(-1)!;
    const inLast = weeksOverlapping(last);
    if (inLast.length > 0) return inLast;
  }

  return [writableWeeks[writableWeeks.length - 1]];
}

export type SpreadRemainingResult = {
  hoursByWeekYmd: Record<string, number>;
  bankWeekStarts: string[];
  /** Hours belonging to stages past the writable window. */
  bankedHours: number;
  /** Past-phase hours not placed on the grid (when includePastPhaseHours is false). */
  unallocatedHours: number;
};

function weekWeightsForPhase(input: {
  writableWeeks: string[];
  phase: { phase_key: DefaultPhaseKey; startYmd: string; endYmd: string };
  spreadMode: ForecastSpreadMode;
}): number[] {
  const overlaps = input.writableWeeks.map((weekStart) => {
    const weekEnd = weekEndYmd(weekStart);
    return overlapDaysInclusive(weekStart, weekEnd, input.phase.startYmd, input.phase.endYmd);
  });
  const positive = overlaps
    .map((days, i) => (days > 0 ? i : -1))
    .filter((i) => i >= 0);
  if (positive.length === 0) return overlaps;

  // Even: true peanut-butter — every overlapping week gets equal weight (not overlap-day skew).
  if (input.spreadMode === "even") {
    return overlaps.map((days) => (days > 0 ? 1 : 0));
  }

  return overlaps.map((days, i) => {
    if (days <= 0) return 0;
    const rank = positive.indexOf(i);
    const t = positive.length <= 1 ? 0.5 : rank / (positive.length - 1);
    const shape = phaseSpreadShapeFactor(input.phase.phase_key, t, input.spreadMode);
    return days * shape;
  });
}

/**
 * Spread `remaining` whole hours across `writableWeeks` using deployment phase %.
 * Active stages keep their native settings % (not renormalized). Hours belonging to
 * stages already past the writable window are either peanut-buttered across the
 * remaining writable weeks (`includePastPhaseHours: true`) or returned as
 * `unallocatedHours` (default).
 */
export function spreadRemainingAcrossWeeks(input: {
  remaining: number;
  writableWeeks: string[];
  phases: ForecastPhaseInput[];
  deploymentEffortByPhase: DeploymentEffortByPhase;
  spreadMode?: ForecastSpreadMode;
  /** Default false — hold past-phase hours as unallocated reserve. */
  includePastPhaseHours?: boolean;
}): SpreadRemainingResult {
  const hoursByWeekYmd: Record<string, number> = {};
  for (const w of input.writableWeeks) hoursByWeekYmd[w] = 0;

  const spreadMode = input.spreadMode ?? DEFAULT_FORECAST_SPREAD_MODE;
  const includePast = input.includePastPhaseHours ?? false;
  const bankWeekStarts = forecastBankWeekStarts(input.writableWeeks, input.phases);
  const remaining = Math.max(0, Math.round(input.remaining));
  if (remaining === 0 || input.writableWeeks.length === 0) {
    return { hoursByWeekYmd, bankWeekStarts, bankedHours: 0, unallocatedHours: 0 };
  }

  const phases = datedDefaultPhases(input.phases);
  if (phases.length === 0) {
    const parts = allocateSparseOrLargestRemainder(
      remaining,
      input.writableWeeks.map(() => 1),
    );
    input.writableWeeks.forEach((w, i) => {
      hoursByWeekYmd[w] = parts[i] ?? 0;
    });
    return { hoursByWeekYmd, bankWeekStarts, bankedHours: 0, unallocatedHours: 0 };
  }

  const isActive = (phase: { startYmd: string; endYmd: string }) =>
    input.writableWeeks.some((weekStart) => {
      const weekEnd = weekEndYmd(weekStart);
      return overlapDaysInclusive(weekStart, weekEnd, phase.startYmd, phase.endYmd) > 0;
    });

  const allWeights = phases.map((p) => input.deploymentEffortByPhase[p.phase_key] ?? 0);
  const weightSum = allWeights.reduce((a, b) => a + b, 0);
  if (weightSum <= 0) {
    const parts = allocateSparseOrLargestRemainder(
      remaining,
      input.writableWeeks.map(() => 1),
    );
    input.writableWeeks.forEach((w, i) => {
      hoursByWeekYmd[w] = parts[i] ?? 0;
    });
    return { hoursByWeekYmd, bankWeekStarts, bankedHours: 0, unallocatedHours: 0 };
  }

  const allShares = allocateByLargestRemainder(remaining, allWeights);
  let bankedHours = 0;

  for (let pi = 0; pi < phases.length; pi++) {
    const share = allShares[pi] ?? 0;
    if (share <= 0) continue;
    const phase = phases[pi];

    if (!isActive(phase)) {
      bankedHours += share;
      continue;
    }

    const weights = weekWeightsForPhase({
      writableWeeks: input.writableWeeks,
      phase,
      spreadMode,
    });
    const parts = allocateSparseOrLargestRemainder(share, weights);
    input.writableWeeks.forEach((w, i) => {
      hoursByWeekYmd[w] = (hoursByWeekYmd[w] ?? 0) + (parts[i] ?? 0);
    });
  }

  if (bankedHours > 0 && includePast) {
    // Peanut-butter past-phase hours across the remaining project weeks.
    const parts = allocateSparseOrLargestRemainder(
      bankedHours,
      input.writableWeeks.map(() => 1),
    );
    input.writableWeeks.forEach((w, i) => {
      hoursByWeekYmd[w] = (hoursByWeekYmd[w] ?? 0) + (parts[i] ?? 0);
    });
  }

  return {
    hoursByWeekYmd,
    bankWeekStarts,
    bankedHours,
    unallocatedHours: includePast ? 0 : bankedHours,
  };
}

export type ForecastPastPhaseShare = {
  phase_key: DefaultPhaseKey;
  label: string;
  percent: number;
  hours: number;
};

/** @deprecated Prefer ForecastPastPhaseShare */
export type ForecastBankedPhaseShare = ForecastPastPhaseShare;

/**
 * Hours from stages that no longer overlap the forecast window.
 * Default generate holds these as reserve (under estimate); optional include
 * peanut-butters them across the remaining writable weeks.
 */
export type ForecastPastPhaseSummary = {
  remainingHours: number;
  /** Alias for pastPhaseHours (compat). */
  bankedHours: number;
  pastPhaseHours: number;
  /** Remaining − past-phase (native share of still-active stages). */
  activeNativeHours: number;
  bankedPhases: ForecastPastPhaseShare[];
  pastPhases: ForecastPastPhaseShare[];
  activePhases: ForecastPastPhaseShare[];
  /** Hypercare (or fallback) weeks used when including past phases in spread. */
  bankWeekStarts: string[];
};

/** @deprecated Prefer ForecastPastPhaseSummary */
export type ForecastBankedSummary = ForecastPastPhaseSummary;

function phaseLabel(phaseKey: DefaultPhaseKey): string {
  return DEPLOYMENT_EFFORT_PHASES.find((p) => p.phase_key === phaseKey)?.label ?? phaseKey;
}

export function computeForecastPastPhaseSummary(input: {
  phases: ForecastPhaseInput[];
  integrations: ForecastIntegrationInput[];
  deploymentEffortByPhase: DeploymentEffortByPhase;
  startMode: ForecastStartMode;
  todayIso: string;
  actualHours: number;
}): ForecastPastPhaseSummary | null {
  const span = timelineSpanFromPhases(input.phases);
  if (!span) return null;

  const startSunday = forecastStartSundayYmd(input.todayIso, input.startMode);
  const writableWeeks = sundayWeekStartsInclusive(startSunday, span.endYmd).filter(
    (w) => w >= startSunday,
  );
  if (writableWeeks.length === 0) return null;

  const remainingHours = Math.max(
    0,
    sumEstimatedRoundedHours(input.integrations) -
      sumActualsConsumedHours(input.actualHours),
  );
  const phases = datedDefaultPhases(input.phases);
  const bankWeekStarts = forecastBankWeekStarts(writableWeeks, input.phases);
  if (phases.length === 0 || remainingHours <= 0) {
    return {
      remainingHours,
      bankedHours: 0,
      pastPhaseHours: 0,
      activeNativeHours: remainingHours,
      bankedPhases: [],
      pastPhases: [],
      activePhases: [],
      bankWeekStarts,
    };
  }

  const isActive = (phase: { startYmd: string; endYmd: string }) =>
    writableWeeks.some((weekStart) => {
      const weekEnd = weekEndYmd(weekStart);
      return overlapDaysInclusive(weekStart, weekEnd, phase.startYmd, phase.endYmd) > 0;
    });

  const active = phases.filter(isActive);
  const past = phases.filter((p) => !isActive(p));

  const allWeights = phases.map((p) => input.deploymentEffortByPhase[p.phase_key] ?? 0);
  const allShares = allocateByLargestRemainder(remainingHours, allWeights);

  const pastPhases: ForecastPastPhaseShare[] = [];
  const activePhases: ForecastPastPhaseShare[] = [];
  let pastPhaseHours = 0;
  let activeNativeHours = 0;

  phases.forEach((p, i) => {
    const hours = allShares[i] ?? 0;
    const percent = input.deploymentEffortByPhase[p.phase_key] ?? 0;
    const entry = {
      phase_key: p.phase_key,
      label: phaseLabel(p.phase_key),
      percent,
      hours,
    };
    if (past.some((b) => b.phase_key === p.phase_key)) {
      pastPhases.push(entry);
      pastPhaseHours += hours;
    } else if (active.some((a) => a.phase_key === p.phase_key)) {
      activePhases.push(entry);
      activeNativeHours += hours;
    }
  });

  return {
    remainingHours,
    bankedHours: pastPhaseHours,
    pastPhaseHours,
    activeNativeHours,
    bankedPhases: pastPhases,
    pastPhases,
    activePhases,
    bankWeekStarts,
  };
}

/** @deprecated Prefer computeForecastPastPhaseSummary */
export function computeForecastBankedSummary(
  input: Parameters<typeof computeForecastPastPhaseSummary>[0],
): ForecastPastPhaseSummary | null {
  return computeForecastPastPhaseSummary(input);
}

export function generateForecastHours(input: GenerateForecastInput): GenerateForecastResult {
  const prereq = forecastPrerequisites(input);
  if (!prereq.ok) {
    return {
      weeks: [],
      hoursByWeek: {},
      reserveHours: 0,
      error: prereq.reason,
    };
  }

  const span = timelineSpanFromPhases(input.phases)!;
  const startSunday = forecastStartSundayYmd(input.todayIso, input.startMode);
  const writableWeeks = sundayWeekStartsInclusive(startSunday, span.endYmd).filter(
    (w) => w >= startSunday,
  );

  if (writableWeeks.length === 0) {
    return {
      weeks: [],
      hoursByWeek: {},
      reserveHours: 0,
      error: "No current or future weeks remain in the project timeline.",
    };
  }

  const spreadMode = input.spreadMode ?? DEFAULT_FORECAST_SPREAD_MODE;
  const includePastPhaseHours = input.includePastPhaseHours ?? false;
  const currentSunday = currentSundayWeekYmd(input.todayIso);
  const lockedWeeks = new Set(input.lockedWeekStarts ?? []);
  const allocationWeeks = writableWeeks.filter((week) => !lockedWeeks.has(week));
  const effectiveActualHours = actualsWithLockedForecastHours({
    actualHours: input.actualHours,
    lockedWeekStarts: input.lockedWeekStarts ?? [],
    lockedHoursByWeek: input.lockedHoursByWeek ?? {},
    currentSunday,
    forecastStartDate: startSunday,
  });
  const remainingHours = Math.max(
    0,
    sumEstimatedRoundedHours(input.integrations) -
      sumActualsConsumedHours(effectiveActualHours),
  );
  const hoursByWeek: Record<string, number> = {};
  for (const week of writableWeeks) {
    if (!lockedWeeks.has(week)) continue;
    const hours = Math.max(
      0,
      Math.round(input.lockedHoursByWeek?.[week] ?? 0),
    );
    if (hours > 0) hoursByWeek[week] = hours;
  }

  if (allocationWeeks.length === 0) {
    return {
      weeks: writableWeeks.map((startYmd) => ({
        startYmd,
        label: formatSundayWeekLabel(startYmd),
      })),
      hoursByWeek,
      reserveHours: remainingHours,
    };
  }

  const spread = spreadRemainingAcrossWeeks({
    remaining: remainingHours,
    writableWeeks: allocationWeeks,
    phases: input.phases,
    deploymentEffortByPhase: input.deploymentEffortByPhase,
    spreadMode,
    includePastPhaseHours,
  });
  for (const [week, hours] of Object.entries(spread.hoursByWeekYmd)) {
    if (hours > 0) hoursByWeek[week] = hours;
  }

  return {
    weeks: writableWeeks.map((startYmd) => ({
      startYmd,
      label: formatSundayWeekLabel(startYmd),
    })),
    hoursByWeek,
    reserveHours: spread.unallocatedHours,
  };
}

/**
 * Edit a single row week without redistributing across other weeks.
 * Increases draw from reserve first; decreases return to reserve when not over estimate.
 */
export function applyForecastRowEdit(input: {
  hoursByWeek: Record<string, number>;
  editedWeekStart: string;
  nextHours: number;
  currentSundayWeek: string;
  /** Ordered week starts (ascending). */
  weekStarts: string[];
  reserveHours: number;
  /** Project-level totals for variance (all rows, editable weeks). */
  projectForecastTotal: number;
  estimated: number;
  actuals: number;
}): { hoursByWeek: Record<string, number>; reserveHours: number } {
  const editable = input.weekStarts.filter((w) => w >= input.currentSundayWeek);
  if (editable.length === 0 || !editable.includes(input.editedWeekStart)) {
    return {
      hoursByWeek: { ...input.hoursByWeek },
      reserveHours: Math.max(0, Math.round(input.reserveHours)),
    };
  }

  const out: Record<string, number> = { ...input.hoursByWeek };
  for (const w of editable) {
    if (out[w] == null) out[w] = 0;
  }

  const desired = Math.max(0, Math.round(input.nextHours));
  const oldEdited = Math.max(0, Math.round(out[input.editedWeekStart] ?? 0));
  const delta = desired - oldEdited;
  let reserve = Math.max(0, Math.round(input.reserveHours));
  if (delta === 0) {
    return { hoursByWeek: out, reserveHours: reserve };
  }

  const varianceBefore = computeEstimateVariance({
    estimated: input.estimated,
    actuals: input.actuals,
    forecastTotal: input.projectForecastTotal,
  }).variance;

  out[input.editedWeekStart] = desired;

  if (delta > 0) {
    const fromReserve = Math.min(delta, reserve);
    reserve -= fromReserve;
  } else if (varianceBefore >= 0) {
    reserve += -delta;
  }

  return { hoursByWeek: out, reserveHours: reserve };
}

/**
 * @deprecated Prefer applyForecastRowEdit — conserved redistribution is no longer used in studio.
 */
export function redistributeForecastAfterEdit(input: {
  hoursByWeek: Record<string, number>;
  editedWeekStart: string;
  nextHours: number;
  currentSundayWeek: string;
  weekStarts: string[];
  bankWeekStarts?: string[];
}): Record<string, number> {
  // Thin wrapper: edit the week only (no cross-week conservation).
  return applyForecastRowEdit({
    hoursByWeek: input.hoursByWeek,
    editedWeekStart: input.editedWeekStart,
    nextHours: input.nextHours,
    currentSundayWeek: input.currentSundayWeek,
    weekStarts: input.weekStarts,
    reserveHours: 0,
    projectForecastTotal: 0,
    estimated: 0,
    actuals: 0,
  }).hoursByWeek;
}

export function diffForecastCells(
  baseline: Record<string, number>,
  draft: Record<string, number>,
): ForecastCell[] {
  const cells: ForecastCell[] = [];
  const weeks = new Set([...Object.keys(baseline), ...Object.keys(draft)]);
  for (const weekStartDate of weeks) {
    const baselineHours = Math.max(0, Math.round(baseline[weekStartDate] ?? 0));
    const draftHours = Math.max(0, Math.round(draft[weekStartDate] ?? 0));
    if (baselineHours !== draftHours) {
      cells.push({ weekStartDate, hours: draftHours });
    }
  }
  return cells;
}

export function cellsToHoursByWeek(cells: ForecastCell[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of cells) {
    out[c.weekStartDate] = c.hours;
  }
  return out;
}

/** Infer generate start mode from a stored forecast start_date vs today. */
export function forecastStartModeFromStartDate(
  startDate: string,
  todayIso: string,
): ForecastStartMode {
  const nextWeek = forecastStartSundayYmd(todayIso, "next_week");
  if (startDate === nextWeek) return "next_week";
  return "this_week";
}

/**
 * Summarize how bank-week hours moved after a redistribute.
 * Positive `drawnFromBank` means earlier weeks took hours from the Hypercare bank.
 */
export function summarizeBankHourDelta(
  beforeHoursByWeek: Record<string, number>,
  afterHoursByWeek: Record<string, number>,
  bankWeekStarts: string[],
): { drawnFromBank: number; returnedToBank: number; focusWeek: string | null } {
  let before = 0;
  let after = 0;
  let focusWeek: string | null = null;
  for (const w of bankWeekStarts) {
    const b = Math.max(0, Math.round(beforeHoursByWeek[w] ?? 0));
    const a = Math.max(0, Math.round(afterHoursByWeek[w] ?? 0));
    before += b;
    after += a;
    if (a !== b) focusWeek = w;
  }
  const delta = before - after;
  return {
    drawnFromBank: delta > 0 ? delta : 0,
    returnedToBank: delta < 0 ? -delta : 0,
    focusWeek,
  };
}
