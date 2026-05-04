/**
 * Calendar helpers for `YYYY-MM-DD` strings and IANA timezones (no extra deps).
 * Used on the server (e.g. Home summary week bounds) with the user’s saved timezone.
 */

function weekdayMon0FromYmd(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return 0;
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return (js + 6) % 7;
}

export function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  return t.toISOString().slice(0, 10);
}

/** Monday `YYYY-MM-DD` of the week containing `todayYmd` (proleptic Gregorian, same as Home inbox rules). */
export function mondayYmdOfWeekContaining(todayYmd: string): string {
  const mon0 = weekdayMon0FromYmd(todayYmd);
  return addDaysYmd(todayYmd, -mon0);
}

function localYmdInTz(utcMs: number, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(utcMs));
    const y = parts.find((p) => p.type === "year")?.value;
    const mo = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    if (y && mo && d) return `${y}-${mo}-${d}`;
  } catch {
    /* fall through */
  }
  return "";
}

/**
 * UTC epoch ms for the first instant the local **calendar date** in `timeZone`
 * becomes `ymd` (`YYYY-MM-DD`). Matches the start of that local day (including DST).
 */
export function zonedLocalMidnightUtcMs(ymd: string, timeZone: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return Number.NaN;
  }
  const tz = timeZone?.trim() || "UTC";
  const anchor = Date.UTC(y, m - 1, d, 12, 0, 0);
  const pad = 52 * 60 * 60 * 1000;
  let lo = anchor - pad;
  let hi = anchor + pad;

  const ymdAt = (ms: number) => localYmdInTz(ms, tz);

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const my = ymdAt(mid);
    if (my === "" || my < ymd) lo = mid + 1;
    else hi = mid;
  }

  const start = lo;
  if (ymdAt(start) !== ymd) return Number.NaN;
  return start;
}

/** Monday-start week in `timeZone`, same notion as Work week view (`effortPeriodBounds`). */
export function zonedMondayWeekBounds(
  timeZone: string | null | undefined,
  todayYmd: string,
): { weekStart: Date; weekEndExclusive: Date; weekStartIso: string; weekEndExclusiveIso: string } {
  const tz = timeZone?.trim() || "UTC";
  const mondayYmd = mondayYmdOfWeekContaining(todayYmd);
  const nextMondayYmd = addDaysYmd(mondayYmd, 7);
  const startMs = zonedLocalMidnightUtcMs(mondayYmd, tz);
  const endMs = zonedLocalMidnightUtcMs(nextMondayYmd, tz);
  const weekStart = new Date(startMs);
  const weekEndExclusive = new Date(endMs);
  return {
    weekStart,
    weekEndExclusive,
    weekStartIso: weekStart.toISOString(),
    weekEndExclusiveIso: weekEndExclusive.toISOString(),
  };
}
