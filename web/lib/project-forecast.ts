/**
 * Pure helpers for project weekly hour forecasts (generate + edit redistribution).
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

export const PM_FORECAST_ROW_KEY = "project_management";
export const DEFAULT_FORECAST_PM_PERCENT = 5;
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

export type ForecastRowHours = {
  rowKey: string;
  /** Hours keyed by week-start YYYY-MM-DD (Sunday). */
  hoursByWeekYmd: Record<string, number>;
};

export type ForecastCell = {
  rowKey: string;
  weekStartDate: string;
  hours: number;
};

export type GenerateForecastInput = {
  phases: ForecastPhaseInput[];
  integrations: ForecastIntegrationInput[];
  deploymentEffortByPhase: DeploymentEffortByPhase;
  /** 0–100 in steps of 5. */
  pmPercent: number;
  /** This week or next week (Sunday of that week). */
  startMode: ForecastStartMode;
  /** Even peanut-butter vs per-phase bell curve. */
  spreadMode?: ForecastSpreadMode;
  /** User-local today YYYY-MM-DD. */
  todayIso: string;
  /** Actual hours logged to date, keyed by rowKey (integration id or PM). */
  actualsByRowKey: Record<string, number>;
};

export type GenerateForecastResult = {
  weeks: Array<{ startYmd: string; label: string }>;
  rows: ForecastRowHours[];
  integrationTargets: Record<string, number>;
  pmTarget: number;
  error?: string;
};

function dateOnlyYmd(iso: string | null | undefined): string | null {
  if (iso == null || iso.trim() === "") return null;
  const s = iso.trim();
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function roundWholeHours(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
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
      reason: "Add estimated effort to at least one integration before generating a forecast.",
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
  bankedHours: number;
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
 * stages already past the writable window are banked and placed on the last bank
 * week (end of Hypercare when available).
 */
export function spreadRemainingAcrossWeeks(input: {
  remaining: number;
  writableWeeks: string[];
  phases: ForecastPhaseInput[];
  deploymentEffortByPhase: DeploymentEffortByPhase;
  spreadMode?: ForecastSpreadMode;
}): SpreadRemainingResult {
  const hoursByWeekYmd: Record<string, number> = {};
  for (const w of input.writableWeeks) hoursByWeekYmd[w] = 0;

  const spreadMode = input.spreadMode ?? DEFAULT_FORECAST_SPREAD_MODE;
  const bankWeekStarts = forecastBankWeekStarts(input.writableWeeks, input.phases);
  const remaining = Math.max(0, Math.round(input.remaining));
  if (remaining === 0 || input.writableWeeks.length === 0) {
    return { hoursByWeekYmd, bankWeekStarts, bankedHours: 0 };
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
    return { hoursByWeekYmd, bankWeekStarts, bankedHours: 0 };
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
    return { hoursByWeekYmd, bankWeekStarts, bankedHours: 0 };
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

  if (bankedHours > 0) {
    const bankWeeks =
      bankWeekStarts.length > 0
        ? bankWeekStarts
        : [input.writableWeeks[input.writableWeeks.length - 1]];
    const lastBankWeek = bankWeeks[bankWeeks.length - 1];
    hoursByWeekYmd[lastBankWeek] = (hoursByWeekYmd[lastBankWeek] ?? 0) + bankedHours;
  }

  return { hoursByWeekYmd, bankWeekStarts, bankedHours };
}

export function computeForecastTargets(
  integrations: ForecastIntegrationInput[],
  pmPercent: number,
): { integrationTargets: Record<string, number>; pmTarget: number } {
  const p = Math.min(100, Math.max(0, Math.round(pmPercent))) / 100;
  const integrationTargets: Record<string, number> = {};
  let pmTarget = 0;
  for (const integ of integrations) {
    const E = roundWholeHours(Number(integ.estimatedEffortHours ?? 0));
    if (E <= 0) {
      integrationTargets[integ.key] = 0;
      continue;
    }
    const pmShare = Math.round(E * p);
    integrationTargets[integ.key] = Math.max(0, E - pmShare);
    pmTarget += pmShare;
  }
  return { integrationTargets, pmTarget };
}

export type ForecastBankedPhaseShare = {
  phase_key: DefaultPhaseKey;
  label: string;
  percent: number;
  hours: number;
};

/**
 * Hours “banked” from stages that no longer overlap the forecast window.
 * Those stage shares sit at the end of Hypercare (last bank week) and are
 * drawn from first when manually adjusting earlier weeks.
 */
export type ForecastBankedSummary = {
  remainingHours: number;
  bankedHours: number;
  /** Remaining − banked (native share of still-active stages). */
  activeNativeHours: number;
  bankedPhases: ForecastBankedPhaseShare[];
  activePhases: ForecastBankedPhaseShare[];
  /** Hypercare (or fallback) weeks that form the bank pool; hours land on the last. */
  bankWeekStarts: string[];
};

function phaseLabel(phaseKey: DefaultPhaseKey): string {
  return DEPLOYMENT_EFFORT_PHASES.find((p) => p.phase_key === phaseKey)?.label ?? phaseKey;
}

function totalRemainingHours(input: {
  integrations: ForecastIntegrationInput[];
  pmPercent: number;
  actualsByRowKey: Record<string, number>;
}): number {
  const { integrationTargets, pmTarget } = computeForecastTargets(
    input.integrations,
    input.pmPercent,
  );
  let remaining = 0;
  for (const integ of input.integrations) {
    const target = integrationTargets[integ.key] ?? 0;
    if (target <= 0 && !(Number(integ.estimatedEffortHours) > 0)) continue;
    const actuals = actualsHoursConsumed(Number(input.actualsByRowKey[integ.key] ?? 0));
    remaining += Math.max(0, target - actuals);
  }
  const pmActuals = actualsHoursConsumed(
    Number(input.actualsByRowKey[PM_FORECAST_ROW_KEY] ?? 0),
  );
  remaining += Math.max(0, pmTarget - pmActuals);
  return remaining;
}

export function computeForecastBankedSummary(input: {
  phases: ForecastPhaseInput[];
  integrations: ForecastIntegrationInput[];
  deploymentEffortByPhase: DeploymentEffortByPhase;
  pmPercent: number;
  startMode: ForecastStartMode;
  todayIso: string;
  actualsByRowKey: Record<string, number>;
}): ForecastBankedSummary | null {
  const span = timelineSpanFromPhases(input.phases);
  if (!span) return null;

  const startSunday = forecastStartSundayYmd(input.todayIso, input.startMode);
  const writableWeeks = sundayWeekStartsInclusive(startSunday, span.endYmd).filter(
    (w) => w >= startSunday,
  );
  if (writableWeeks.length === 0) return null;

  const remainingHours = totalRemainingHours(input);
  const phases = datedDefaultPhases(input.phases);
  const bankWeekStarts = forecastBankWeekStarts(writableWeeks, input.phases);
  if (phases.length === 0 || remainingHours <= 0) {
    return {
      remainingHours,
      bankedHours: 0,
      activeNativeHours: remainingHours,
      bankedPhases: [],
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
  const banked = phases.filter((p) => !isActive(p));

  const allWeights = phases.map((p) => input.deploymentEffortByPhase[p.phase_key] ?? 0);
  const allShares = allocateByLargestRemainder(remainingHours, allWeights);

  const bankedPhases: ForecastBankedPhaseShare[] = [];
  const activePhases: ForecastBankedPhaseShare[] = [];
  let bankedHours = 0;
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
    if (banked.some((b) => b.phase_key === p.phase_key)) {
      bankedPhases.push(entry);
      bankedHours += hours;
    } else if (active.some((a) => a.phase_key === p.phase_key)) {
      activePhases.push(entry);
      activeNativeHours += hours;
    }
  });

  return {
    remainingHours,
    bankedHours,
    activeNativeHours,
    bankedPhases,
    activePhases,
    bankWeekStarts,
  };
}

export function generateForecastHours(input: GenerateForecastInput): GenerateForecastResult {
  const prereq = forecastPrerequisites(input);
  if (!prereq.ok) {
    return {
      weeks: [],
      rows: [],
      integrationTargets: {},
      pmTarget: 0,
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
      rows: [],
      integrationTargets: {},
      pmTarget: 0,
      error: "No current or future weeks remain in the project timeline.",
    };
  }

  const { integrationTargets, pmTarget } = computeForecastTargets(
    input.integrations,
    input.pmPercent,
  );

  const spreadMode = input.spreadMode ?? DEFAULT_FORECAST_SPREAD_MODE;
  const rows: ForecastRowHours[] = [];

  // Build per-track remaining (after actuals). Project total remaining = sum of these.
  const trackKeys: string[] = [];
  const trackRemaining: number[] = [];
  for (const integ of input.integrations) {
    const target = integrationTargets[integ.key] ?? 0;
    if (target <= 0 && !(Number(integ.estimatedEffortHours) > 0)) continue;
    const actuals = actualsHoursConsumed(Number(input.actualsByRowKey[integ.key] ?? 0));
    trackKeys.push(integ.key);
    trackRemaining.push(Math.max(0, target - actuals));
  }
  {
    const actuals = actualsHoursConsumed(
      Number(input.actualsByRowKey[PM_FORECAST_ROW_KEY] ?? 0),
    );
    trackKeys.push(PM_FORECAST_ROW_KEY);
    trackRemaining.push(Math.max(0, pmTarget - actuals));
  }

  if (spreadMode === "even") {
    // Peanut-butter week totals first, then carve each week across tracks by
    // remaining budget. Avoids jagged project totals from stacking independent
    // per-track sparse 1h/0h patterns.
    const totalRemaining = trackRemaining.reduce((a, b) => a + b, 0);
    const spread = spreadRemainingAcrossWeeks({
      remaining: totalRemaining,
      writableWeeks,
      phases: input.phases,
      deploymentEffortByPhase: input.deploymentEffortByPhase,
      spreadMode: "even",
    });
    const budgets = [...trackRemaining];
    const maps = trackKeys.map(() => {
      const m: Record<string, number> = {};
      for (const w of writableWeeks) m[w] = 0;
      return m;
    });
    const dumpWeek =
      spread.bankWeekStarts[spread.bankWeekStarts.length - 1] ??
      writableWeeks[writableWeeks.length - 1];

    for (const week of writableWeeks) {
      const H = spread.hoursByWeekYmd[week] ?? 0;
      if (H <= 0) continue;
      const weightSum = budgets.reduce((a, b) => a + Math.max(0, b), 0);
      if (weightSum <= 0) {
        if (dumpWeek) {
          maps[0][dumpWeek] = (maps[0][dumpWeek] ?? 0) + H;
        }
        continue;
      }
      const parts = allocateByLargestRemainder(H, budgets);
      for (let i = 0; i < trackKeys.length; i++) {
        const h = parts[i] ?? 0;
        if (h <= 0) continue;
        maps[i][week] = (maps[i][week] ?? 0) + h;
        budgets[i] = Math.max(0, budgets[i] - h);
      }
    }

    for (let i = 0; i < trackKeys.length; i++) {
      if (budgets[i] > 0 && dumpWeek) {
        maps[i][dumpWeek] = (maps[i][dumpWeek] ?? 0) + budgets[i];
        budgets[i] = 0;
      }
      rows.push({ rowKey: trackKeys[i], hoursByWeekYmd: maps[i] });
    }
  } else {
    // Bell: shape each track independently so phase peaks stay intentional.
    for (let i = 0; i < trackKeys.length; i++) {
      const spread = spreadRemainingAcrossWeeks({
        remaining: trackRemaining[i],
        writableWeeks,
        phases: input.phases,
        deploymentEffortByPhase: input.deploymentEffortByPhase,
        spreadMode: "bell",
      });
      rows.push({ rowKey: trackKeys[i], hoursByWeekYmd: spread.hoursByWeekYmd });
    }
  }

  return {
    weeks: writableWeeks.map((startYmd) => ({
      startYmd,
      label: formatSundayWeekLabel(startYmd),
    })),
    rows,
    integrationTargets,
    pmTarget,
  };
}

/**
 * After editing week `editedWeekStart` to `nextHours`, redistribute delta so the
 * sum of editable weeks stays constant. Prefer bank weeks (end of Hypercare) first
 * when taking or returning hours — deplete / refill the last bank week first.
 */
export function redistributeForecastAfterEdit(input: {
  hoursByWeek: Record<string, number>;
  editedWeekStart: string;
  nextHours: number;
  currentSundayWeek: string;
  /** Ordered week starts (ascending). */
  weekStarts: string[];
  /** Weeks that hold banked hours (Hypercare pool; hours sit on the last). */
  bankWeekStarts?: string[];
}): Record<string, number> {
  const editable = input.weekStarts.filter((w) => w >= input.currentSundayWeek);
  if (editable.length === 0) return { ...input.hoursByWeek };
  if (!editable.includes(input.editedWeekStart)) return { ...input.hoursByWeek };

  const out: Record<string, number> = { ...input.hoursByWeek };
  for (const w of editable) {
    if (out[w] == null) out[w] = 0;
  }

  const editableTotal = editable.reduce((s, w) => s + Math.max(0, Math.round(out[w] ?? 0)), 0);
  const desired = Math.max(0, Math.round(input.nextHours));
  const idx = editable.indexOf(input.editedWeekStart);
  const later = editable.slice(idx + 1);

  if (later.length === 0) {
    out[input.editedWeekStart] = Math.min(desired, editableTotal);
    return out;
  }

  const othersBefore = editable
    .slice(0, idx)
    .reduce((s, w) => s + Math.max(0, Math.round(out[w] ?? 0)), 0);
  const maxForEdited = editableTotal - othersBefore;
  const clamped = Math.min(desired, maxForEdited);
  const oldEdited = Math.max(0, Math.round(out[input.editedWeekStart] ?? 0));
  const delta = clamped - oldEdited;
  out[input.editedWeekStart] = clamped;

  if (delta === 0) return out;

  const bankSet = new Set(input.bankWeekStarts ?? []);
  const bankLater = later.filter((w) => bankSet.has(w));
  const otherLater = later.filter((w) => !bankSet.has(w));

  if (delta > 0) {
    // Increase edited week: draw from last bank week first, then other later weeks.
    let need = delta;
    need = takeHoursFromWeeksEndFirst(out, bankLater, need);
    if (need > 0) need = takeHoursFromWeeks(out, otherLater, need);
    if (need > 0) {
      out[input.editedWeekStart] = clamped - need;
    }
  } else {
    // Decrease edited week: return hours to last bank week first, then other later weeks.
    let give = -delta;
    give = addHoursToWeeksEndFirst(out, bankLater, give);
    if (give > 0) addHoursToWeeks(out, otherLater, give);
  }

  return out;
}

/** Remove up to `need` hours from `weeks` end-first (last week depleted first). */
function takeHoursFromWeeksEndFirst(
  hoursByWeek: Record<string, number>,
  weeks: string[],
  need: number,
): number {
  if (need <= 0 || weeks.length === 0) return need;
  let remaining = need;
  for (let i = weeks.length - 1; i >= 0 && remaining > 0; i--) {
    const w = weeks[i];
    const available = Math.max(0, Math.round(hoursByWeek[w] ?? 0));
    const take = Math.min(remaining, available);
    hoursByWeek[w] = available - take;
    remaining -= take;
  }
  return remaining;
}

/** Add `give` hours onto the last week in `weeks`. */
function addHoursToWeeksEndFirst(
  hoursByWeek: Record<string, number>,
  weeks: string[],
  give: number,
): number {
  if (give <= 0 || weeks.length === 0) return give;
  const last = weeks[weeks.length - 1];
  hoursByWeek[last] = Math.max(0, Math.round(hoursByWeek[last] ?? 0)) + give;
  return 0;
}

/** Remove up to `need` hours from `weeks` (prefer proportional to current hours). Returns unpaid remainder. */
function takeHoursFromWeeks(
  hoursByWeek: Record<string, number>,
  weeks: string[],
  need: number,
): number {
  if (need <= 0 || weeks.length === 0) return need;
  const current = weeks.map((w) => Math.max(0, Math.round(hoursByWeek[w] ?? 0)));
  const sum = current.reduce((a, b) => a + b, 0);
  const take = Math.min(need, sum);
  if (take <= 0) return need;
  const weights = sum > 0 ? current : weeks.map(() => 1);
  const next = allocateByLargestRemainder(sum - take, weights);
  weeks.forEach((w, i) => {
    hoursByWeek[w] = next[i] ?? 0;
  });
  return need - take;
}

/** Add `give` hours into `weeks` (proportional when they already have hours). Returns unplaced remainder. */
function addHoursToWeeks(
  hoursByWeek: Record<string, number>,
  weeks: string[],
  give: number,
): number {
  if (give <= 0 || weeks.length === 0) return give;
  const current = weeks.map((w) => Math.max(0, Math.round(hoursByWeek[w] ?? 0)));
  const sum = current.reduce((a, b) => a + b, 0);
  const weights = sum > 0 ? current : weeks.map(() => 1);
  const next = allocateByLargestRemainder(sum + give, weights);
  weeks.forEach((w, i) => {
    hoursByWeek[w] = next[i] ?? 0;
  });
  return 0;
}

/**
 * Edit project weekly total for `editedWeekStart`; split that week across rows by current share,
 * then rebalance each row's later weeks (bank first) to conserve that row's editable total.
 */
export function redistributeProjectTotalAfterEdit(input: {
  /** rowKey → week → hours */
  hoursByRow: Record<string, Record<string, number>>;
  rowKeys: string[];
  editedWeekStart: string;
  nextTotalHours: number;
  currentSundayWeek: string;
  weekStarts: string[];
  bankWeekStarts?: string[];
}): Record<string, Record<string, number>> {
  const editable = input.weekStarts.filter((w) => w >= input.currentSundayWeek);
  if (!editable.includes(input.editedWeekStart)) {
    return structuredClone(input.hoursByRow);
  }

  const result: Record<string, Record<string, number>> = {};
  for (const key of input.rowKeys) {
    result[key] = { ...(input.hoursByRow[key] ?? {}) };
  }

  const desired = Math.max(0, Math.round(input.nextTotalHours));

  const totalByWeek: Record<string, number> = {};
  for (const w of editable) {
    totalByWeek[w] = input.rowKeys.reduce(
      (s, key) => s + Math.max(0, Math.round(result[key][w] ?? 0)),
      0,
    );
  }
  const redistributedTotals = redistributeForecastAfterEdit({
    hoursByWeek: totalByWeek,
    editedWeekStart: input.editedWeekStart,
    nextHours: desired,
    currentSundayWeek: input.currentSundayWeek,
    weekStarts: input.weekStarts,
    bankWeekStarts: input.bankWeekStarts,
  });

  for (const w of editable) {
    const newTotal = Math.max(0, Math.round(redistributedTotals[w] ?? 0));
    const oldWeekTotal = totalByWeek[w] ?? 0;
    if (newTotal === oldWeekTotal && w !== input.editedWeekStart) continue;

    const shares = input.rowKeys.map((key) =>
      Math.max(0, Math.round(result[key][w] ?? 0)),
    );
    const parts = allocateByLargestRemainder(newTotal, shares);
    input.rowKeys.forEach((key, i) => {
      result[key][w] = parts[i] ?? 0;
    });
  }

  return result;
}

export function diffForecastCells(
  baseline: Record<string, Record<string, number>>,
  draft: Record<string, Record<string, number>>,
): ForecastCell[] {
  const cells: ForecastCell[] = [];
  const rowKeys = new Set([...Object.keys(baseline), ...Object.keys(draft)]);
  for (const rowKey of rowKeys) {
    const b = baseline[rowKey] ?? {};
    const d = draft[rowKey] ?? {};
    const weeks = new Set([...Object.keys(b), ...Object.keys(d)]);
    for (const weekStartDate of weeks) {
      const bh = Math.max(0, Math.round(b[weekStartDate] ?? 0));
      const dh = Math.max(0, Math.round(d[weekStartDate] ?? 0));
      if (bh !== dh) {
        cells.push({ rowKey, weekStartDate, hours: dh });
      }
    }
  }
  return cells;
}

export function cellsToHoursByRow(cells: ForecastCell[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const c of cells) {
    if (!out[c.rowKey]) out[c.rowKey] = {};
    out[c.rowKey][c.weekStartDate] = c.hours;
  }
  return out;
}

export function sumActualsByRowKey(
  sessions: Array<{ rowKey: string; duration_hours: number }>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of sessions) {
    const h = Number(s.duration_hours);
    if (!Number.isFinite(h) || h <= 0) continue;
    out[s.rowKey] = (out[s.rowKey] ?? 0) + h;
  }
  return out;
}

export function projectTotalsByWeek(
  hoursByRow: Record<string, Record<string, number>>,
  weekStarts: string[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const w of weekStarts) {
    let sum = 0;
    for (const row of Object.values(hoursByRow)) {
      sum += Math.max(0, Math.round(row[w] ?? 0));
    }
    out[w] = sum;
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
