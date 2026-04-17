export type PhaseForStatus = {
  name: string;
  sort_order: number;
  start_date: string | null;
  end_date: string | null;
};

/** Calendar day in UTC (matches typical server rendering). */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function calendarDaysFromTo(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T12:00:00.000Z`).getTime();
  const to = new Date(`${toISO}T12:00:00.000Z`).getTime();
  return Math.round((to - from) / 86_400_000);
}

export function formatPhaseDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

/** Days-until-end label used by project summary and list row metrics. */
export function formatPhaseDaysRemainingLabel(n: number): string {
  if (n === 0) return "0 days left";
  if (n === 1) return "1 day left";
  if (n < 0) return `${Math.abs(n)} days overdue`;
  return `${n} days left`;
}

export type PhaseStatusResult =
  | { kind: "empty" }
  | { kind: "unset" }
  | { kind: "active"; name: string; endDate: string; daysRemaining: number }
  | { kind: "upcoming"; name: string; endDate: string; daysUntilEnd: number }
  | { kind: "complete"; name: string; endedDate: string };

/**
 * Phases must be ordered by `sort_order` ascending (same as DB query).
 */
export function resolvePhaseStatus(phases: PhaseForStatus[]): PhaseStatusResult {
  const sorted = [...phases].sort((a, b) => a.sort_order - b.sort_order);
  if (sorted.length === 0) return { kind: "empty" };

  const today = todayISO();

  for (const p of sorted) {
    const { start_date: s, end_date: e, name } = p;
    if (s && e && s <= today && today <= e) {
      return { kind: "active", name, endDate: e, daysRemaining: calendarDaysFromTo(today, e) };
    }
  }

  for (const p of sorted) {
    const { end_date: e, name } = p;
    if (e && e >= today) {
      return { kind: "upcoming", name, endDate: e, daysUntilEnd: calendarDaysFromTo(today, e) };
    }
  }

  let lastWithEnd: PhaseForStatus | null = null;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].end_date) {
      lastWithEnd = sorted[i];
      break;
    }
  }
  if (lastWithEnd?.end_date && lastWithEnd.end_date < today) {
    return { kind: "complete", name: lastWithEnd.name, endedDate: lastWithEnd.end_date };
  }

  return { kind: "unset" };
}

/** Per-row timeline label; rules ordered for deterministic output. */
export type TimelinePhaseRowStatus =
  | { kind: "completed"; label: string }
  | { kind: "current"; label: string }
  | { kind: "upcoming"; label: string; daysUntil: number }
  | { kind: "none" };

export function getTimelinePhaseRowStatus(
  today: string,
  start_date: string | null,
  end_date: string | null,
): TimelinePhaseRowStatus {
  const e = end_date?.trim() || null;
  const s = start_date?.trim() || null;

  if (e && e < today) {
    return { kind: "completed", label: "Completed" };
  }
  if (s && e && s <= today && today <= e) {
    return { kind: "current", label: "Current" };
  }
  if (s && s > today) {
    const daysUntil = calendarDaysFromTo(today, s);
    if (daysUntil <= 0) {
      return { kind: "upcoming", label: "Starts today", daysUntil: 0 };
    }
    if (daysUntil === 1) {
      return { kind: "upcoming", label: "Starts in 1 day", daysUntil: 1 };
    }
    return { kind: "upcoming", label: `Starts in ${daysUntil} days`, daysUntil };
  }
  return { kind: "none" };
}
