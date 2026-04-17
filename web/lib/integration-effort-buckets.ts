/**
 * Pure helpers for integration work-session effort views (day / week / month).
 * Calendar boundaries use the **caller's local timezone** (pass Dates from the client).
 */

export type EffortView = "day" | "week" | "month";

export type EffortSessionInput = {
  /** Where this session came from (task work session vs manual effort entry). */
  source: "task_work_session" | "manual";
  /** Primary key of the underlying row. */
  source_id: string;
  started_at: string;
  finished_at: string;
  duration_hours: number;
  integration_task_id: string | null;
  /** For manual entries only. */
  entry_type?: "task" | "meeting";
  /** Display label (task title or manual entry title). */
  title: string;
  work_accomplished: string | null;
};

function parseIsoMs(s: string): number {
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? NaN : t;
}

/** Local calendar day start (00:00:00.000). */
export function localDayStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** `YYYY-MM-DD` in local calendar for `d`. */
export function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse `YYYY-MM-DD` as local midnight. */
export function parseLocalYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map((x) => Number(x));
  if (!y || !m || !d) return new Date(NaN);
  return new Date(y, m - 1, d);
}

/** Monday-based week: local Monday 00:00 of the week containing `d`. */
export function startOfLocalWeekMonday(d: Date): Date {
  const day = localDayStart(d);
  const dow = day.getDay(); // 0 Sun .. 6 Sat
  const daysFromMonday = (dow + 6) % 7;
  day.setDate(day.getDate() - daysFromMonday);
  return day;
}

/** Sunday-based week: local Sunday 00:00 of the week containing `d`. */
export function startOfLocalWeekSunday(d: Date): Date {
  const day = localDayStart(d);
  const dow = day.getDay(); // 0 Sun .. 6 Sat
  day.setDate(day.getDate() - dow);
  return day;
}

/** First day of local month at 00:00. */
export function startOfLocalMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** First day of next local month at 00:00 (exclusive end for current month). */
export function startOfNextLocalMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

export type EffortPeriodBounds = {
  /** Inclusive start (local midnight). */
  start: Date;
  /** Exclusive end. */
  endExclusive: Date;
};

/**
 * Visible range for the view. `anchor` is any instant on the anchor calendar day (local).
 */
export function effortPeriodBounds(view: EffortView, anchor: Date): EffortPeriodBounds {
  const day = localDayStart(anchor);
  if (view === "day") {
    const end = new Date(day);
    end.setDate(end.getDate() + 1);
    return { start: day, endExclusive: end };
  }
  if (view === "week") {
    const start = startOfLocalWeekMonday(anchor);
    const endExclusive = new Date(start);
    endExclusive.setDate(endExclusive.getDate() + 7);
    return { start, endExclusive };
  }
  const start = startOfLocalMonth(anchor);
  const endExclusive = startOfNextLocalMonth(anchor);
  return { start, endExclusive };
}

function wallRangeMs(s: EffortSessionInput): { a: number; b: number } | null {
  const a = parseIsoMs(s.started_at);
  const b = parseIsoMs(s.finished_at);
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return null;
  return { a, b };
}

/** True if wall-clock interval [started, finished] overlaps [rangeStart, rangeEndExclusive). */
export function sessionOverlapsWallRange(
  s: EffortSessionInput,
  rangeStart: Date,
  rangeEndExclusive: Date,
): boolean {
  const w = wallRangeMs(s);
  if (!w) return false;
  const rs = rangeStart.getTime();
  const re = rangeEndExclusive.getTime();
  return w.a < re && w.b > rs;
}

/**
 * Sum of `duration_hours` for every session whose wall interval overlaps the period (counted once).
 */
export function effortPeriodTotalHours(
  sessions: EffortSessionInput[],
  rangeStart: Date,
  rangeEndExclusive: Date,
): number {
  let sum = 0;
  for (const s of sessions) {
    if (!sessionOverlapsWallRange(s, rangeStart, rangeEndExclusive)) continue;
    const dh = Number(s.duration_hours);
    if (Number.isFinite(dh) && dh > 0) sum += dh;
  }
  return sum;
}

/**
 * Total logged hours across all sessions (no date filter).
 */
export function effortTotalActualHours(sessions: EffortSessionInput[]): number {
  let sum = 0;
  for (const s of sessions) {
    const dh = Number(s.duration_hours);
    if (Number.isFinite(dh) && dh > 0) sum += dh;
  }
  return sum;
}

/**
 * Prorate each session's `duration_hours` across local calendar days by wall-clock overlap,
 * for days intersecting [windowStart, windowEndExclusive).
 */
export function effortProratedHoursByLocalDay(
  sessions: EffortSessionInput[],
  windowStart: Date,
  windowEndExclusive: Date,
): Map<string, number> {
  const out = new Map<string, number>();
  const winA = windowStart.getTime();
  const winB = windowEndExclusive.getTime();

  for (const s of sessions) {
    const w = wallRangeMs(s);
    if (!w) continue;
    const dh = Number(s.duration_hours);
    if (!Number.isFinite(dh) || dh <= 0) continue;
    const wallMs = w.b - w.a;
    if (wallMs <= 0) continue;

    let dayStartMs = localDayStart(new Date(w.a)).getTime();
    while (dayStartMs < w.b && dayStartMs < winB) {
      const dayEndMs = dayStartMs + 86_400_000;
      const segA = Math.max(w.a, dayStartMs, winA);
      const segB = Math.min(w.b, dayEndMs, winB);
      if (segB > segA) {
        const frac = (segB - segA) / wallMs;
        const key = formatLocalYmd(new Date(dayStartMs));
        out.set(key, (out.get(key) ?? 0) + dh * frac);
      }
      dayStartMs = dayEndMs;
    }
  }

  return out;
}

export type EffortBlockSegment = {
  /** Ms from local midnight of this calendar day. */
  startMsInDay: number;
  /** Ms from local midnight (exclusive end). */
  endMsInDay: number;
  duration_hours: number;
  title: string;
};

/**
 * Clipped wall-clock segments for one local calendar day (for timeline bars).
 */
export function effortBlocksForLocalDay(sessions: EffortSessionInput[], day: Date): EffortBlockSegment[] {
  const dayStart = localDayStart(day);
  const dayA = dayStart.getTime();
  const dayB = dayA + 86_400_000;
  const segments: EffortBlockSegment[] = [];

  for (const s of sessions) {
    const w = wallRangeMs(s);
    if (!w) continue;
    const segA = Math.max(w.a, dayA);
    const segB = Math.min(w.b, dayB);
    if (segB <= segA) continue;
    const dh = Number(s.duration_hours);
    if (!Number.isFinite(dh) || dh <= 0) continue;
    segments.push({
      startMsInDay: segA - dayA,
      endMsInDay: segB - dayA,
      duration_hours: dh,
      title: s.title || "Task",
    });
  }

  segments.sort((x, y) => x.startMsInDay - y.startMsInDay);
  return segments;
}

/** Labels for each day in a Monday-based week (local), inclusive start `weekStart` (Monday 00:00). */
export function localWeekDayStarts(weekStartMonday: Date): Date[] {
  const out: Date[] = [];
  const d = localDayStart(weekStartMonday);
  for (let i = 0; i < 7; i++) {
    const x = new Date(d);
    x.setDate(x.getDate() + i);
    out.push(x);
  }
  return out;
}

/** Labels for each day in a Sunday-based week (local), inclusive start `weekStart` (Sunday 00:00). */
export function localWeekDayStartsSunday(weekStartSunday: Date): Date[] {
  const out: Date[] = [];
  const d = localDayStart(weekStartSunday);
  for (let i = 0; i < 7; i++) {
    const x = new Date(d);
    x.setDate(x.getDate() + i);
    out.push(x);
  }
  return out;
}

export function formatEffortHoursLabel(hours: number): string {
  if (!Number.isFinite(hours) || hours === 0) return "0 hrs";
  const q = Math.round(hours * 4) / 4;
  const s = Number.isInteger(q) ? String(q) : String(parseFloat(q.toFixed(2)));
  return `${s} hrs`;
}
