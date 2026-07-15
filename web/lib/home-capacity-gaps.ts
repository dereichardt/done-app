/**
 * Portfolio capacity gap synthesis for Home inbox (weeks +4…+8 vs weekly target).
 * Matches Forecast Studio’s {@link TARGET_WEEKLY_FORECAST_HOURS} (32h).
 */

export const TARGET_WEEKLY_CAPACITY_HOURS = 32;

export type CapacityWeekGap = {
  weekStart: string;
  portfolioHours: number;
  /** Hours under the weekly target (0 when at/over capacity). */
  freeHours: number;
};

export type CapacityGapsSynthesis = {
  weeks: CapacityWeekGap[];
  /** Short body for inbox list / insert. */
  body: string;
  /** Representative free hours/week when a gap stretch exists. */
  freeHoursPerWeek: number | null;
  /** First week in the window where free capacity begins (sustained). */
  freeStartingWeek: string | null;
};

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

/**
 * Build weeks +4 through +8 from the current Sunday week start (5 weeks).
 */
export function capacityGapWeekStarts(currentSundayYmd: string): string[] {
  const [y, m, d] = currentSundayYmd.split("-").map(Number);
  const out: string[] = [];
  for (let offset = 4; offset <= 8; offset++) {
    const t = new Date(Date.UTC(y, m - 1, d + offset * 7));
    out.push(t.toISOString().slice(0, 10));
  }
  return out;
}

export function synthesizeCapacityGaps(input: {
  weekHours: Record<string, number>;
  weekStarts: string[];
  targetHours?: number;
}): CapacityGapsSynthesis {
  const target = input.targetHours ?? TARGET_WEEKLY_CAPACITY_HOURS;
  const weeks: CapacityWeekGap[] = input.weekStarts.map((weekStart) => {
    const portfolioHours = Math.max(0, Math.round(Number(input.weekHours[weekStart]) || 0));
    const freeHours = Math.max(0, target - portfolioHours);
    return { weekStart, portfolioHours, freeHours };
  });

  const hasAnyForecast = weeks.some((w) => w.portfolioHours > 0);
  if (!hasAnyForecast) {
    return {
      weeks,
      body: "No forecast hours in weeks 4–8. Generate project forecasts to see upcoming capacity.",
      freeHoursPerWeek: null,
      freeStartingWeek: null,
    };
  }

  // Find the earliest stretch of ≥2 consecutive under-target weeks, or the first under-target week.
  let freeStartingWeek: string | null = null;
  let freeHoursPerWeek: number | null = null;
  let bestLen = 0;

  let i = 0;
  while (i < weeks.length) {
    if (weeks[i]!.freeHours <= 0) {
      i += 1;
      continue;
    }
    let j = i;
    let freeSum = 0;
    while (j < weeks.length && weeks[j]!.freeHours > 0) {
      freeSum += weeks[j]!.freeHours;
      j += 1;
    }
    const len = j - i;
    const avg = Math.round(freeSum / len);
    if (len > bestLen || (len === bestLen && (freeHoursPerWeek == null || avg > freeHoursPerWeek))) {
      bestLen = len;
      freeStartingWeek = weeks[i]!.weekStart;
      freeHoursPerWeek = avg;
    }
    i = j;
  }

  if (freeStartingWeek == null || freeHoursPerWeek == null || freeHoursPerWeek <= 0) {
    return {
      weeks,
      body: `Capacity looks tight in weeks 4–8 — portfolio forecast is at or above ${target}h each week.`,
      freeHoursPerWeek: null,
      freeStartingWeek: null,
    };
  }

  const label = formatWeekLabel(freeStartingWeek);
  const hrs = freeHoursPerWeek;
  let suggestion: string;
  if (hrs >= 8) {
    suggestion = `room for a new project (~${hrs}h/week) starting ${label}`;
  } else if (hrs >= 4) {
    suggestion = `room for more integrations and/or a light new project (~${hrs}h/week) starting ${label}`;
  } else {
    suggestion = `about ${hrs}h/week free starting ${label} — limited headroom`;
  }

  return {
    weeks,
    body: `You may be able to take on ${suggestion}.`,
    freeHoursPerWeek: hrs,
    freeStartingWeek,
  };
}
