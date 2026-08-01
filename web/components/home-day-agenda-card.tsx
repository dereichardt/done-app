"use client";

import { HomeCalendarEntryDialog } from "@/components/home-calendar-entry-dialog";
import { HomeCardFab } from "@/components/home-card-fab";
import {
  loadTasksCalendarSessions,
  type TasksCalendarSession,
} from "@/lib/actions/tasks-calendar";
import {
  formatEffortHoursLabel,
  localDayStart,
  parseLocalYmd,
} from "@/lib/integration-effort-buckets";
import {
  TASKS_PAGE_INTERNAL_PROJECT_ID,
  type TasksPageProject,
  type TasksPageTrack,
} from "@/lib/tasks-page-shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

function formatSessionTimeRange(session: TasksCalendarSession): string {
  const start = new Date(session.started_at);
  const end = session.finished_at ? new Date(session.finished_at) : null;
  const opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  if (!end || Number.isNaN(end.getTime())) {
    return start.toLocaleTimeString(undefined, opts);
  }
  return `${start.toLocaleTimeString(undefined, opts)}–${end.toLocaleTimeString(undefined, opts)}`;
}

function formatLongDate(ymd: string): string {
  const d = parseLocalYmd(ymd);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function sessionSortKey(s: TasksCalendarSession): number {
  const t = new Date(s.started_at).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Work sessions and manual task entries → Task; manual meetings → Meeting. */
function sessionTypeLabel(s: TasksCalendarSession): "Task" | "Meeting" {
  if (s.source === "manual" && s.entry_type === "meeting") return "Meeting";
  return "Task";
}

/** Today's effort agenda — height matches the left dashboard stack when `heightPx` is set. */
export function HomeDayAgendaCard({
  todayIso,
  heightPx = null,
  projectAbbreviationById,
  projects = [],
  tracks = [],
  onCalendarEntryCreated,
}: {
  todayIso: string;
  /** Total section height (header + card), aligned to left stack including Hours this week. */
  heightPx?: number | null;
  /** Project id → abbreviation for compact agenda rows. */
  projectAbbreviationById?: Map<string, string>;
  projects?: TasksPageProject[];
  tracks?: TasksPageTrack[];
  /** Notifies parent so Hours this week (and related metrics) can reload. */
  onCalendarEntryCreated?: () => void;
}) {
  const router = useRouter();
  const [sessions, setSessions] = useState<TasksCalendarSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const loadDay = useCallback(async (ymd: string) => {
    setLoading(true);
    setError(null);
    const start = parseLocalYmd(ymd);
    const endExclusive = new Date(start.getTime() + 86_400_000);
    const res = await loadTasksCalendarSessions(start.toISOString(), endExclusive.toISOString());
    if (res.error) {
      setError(res.error);
      setSessions([]);
      setLoading(false);
      return;
    }
    const dayStart = localDayStart(start).getTime();
    const dayEnd = dayStart + 86_400_000;
    const forDay = (res.sessions ?? []).filter((s) => {
      const a = new Date(s.started_at).getTime();
      const b = s.finished_at ? new Date(s.finished_at).getTime() : a;
      return a < dayEnd && b > dayStart;
    });
    forDay.sort((a, b) => sessionSortKey(a) - sessionSortKey(b));
    setSessions(forDay);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadDay(todayIso);
  }, [todayIso, loadDay]);

  const dayHours = useMemo(() => {
    let sum = 0;
    for (const s of sessions) {
      const dh = Number(s.duration_hours);
      if (Number.isFinite(dh) && dh > 0) sum += dh;
    }
    return sum;
  }, [sessions]);

  const calendarHref = `/work?view=calendar&scope=day&date=${encodeURIComponent(todayIso)}`;
  const dateLabel = formatLongDate(todayIso);

  return (
    <section
      aria-label="Calendar"
      className="flex min-h-0 flex-col"
      style={heightPx != null && heightPx > 0 ? { height: heightPx } : undefined}
    >
      <div className="flex h-8 shrink-0 items-center justify-between gap-2">
        <h2 className="section-heading">Calendar</h2>
        <Link href={calendarHref} className="btn-cta-tertiary shrink-0 !py-1 !px-2 text-xs">
          Open calendar
        </Link>
      </div>

      <div className="relative mt-3 min-h-0 flex-1">
        <div className="card-canvas flex h-full min-h-0 flex-col overflow-hidden">
          <div
            className="flex h-11 shrink-0 items-center justify-between gap-2 border-b px-3"
            style={{ borderColor: "var(--app-border)" }}
          >
            <p className="text-sm font-medium" style={{ color: "var(--app-text)" }}>
              {dateLabel}
            </p>
            <p className="shrink-0 text-xs tabular-nums text-muted-canvas">
              {loading ? "…" : formatEffortHoursLabel(dayHours)}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2 pb-12">
            {error ? (
              <p className="text-sm" style={{ color: "var(--app-danger)" }}>
                Could not load sessions: {error}
              </p>
            ) : loading ? (
              <p className="text-sm text-muted-canvas">Loading…</p>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-muted-canvas">No sessions logged</p>
            ) : (
              <ul className="flex list-none flex-col gap-1">
                {sessions.map((s) => {
                  const colorVar = s.colorMeta?.colorVar ?? null;
                  const typeLabel = sessionTypeLabel(s);
                  const abbr =
                    s.project_id === TASKS_PAGE_INTERNAL_PROJECT_ID
                      ? "INT"
                      : (projectAbbreviationById?.get(s.project_id) ?? "").trim() || "PRJ";
                  const timeLine = [
                    formatSessionTimeRange(s),
                    Number.isFinite(Number(s.duration_hours)) && Number(s.duration_hours) > 0
                      ? formatEffortHoursLabel(Number(s.duration_hours))
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <li
                      key={s.source_id}
                      className="rounded-[8px] border px-2 py-1"
                      style={{
                        borderColor: "var(--app-border)",
                        background: colorVar
                          ? `color-mix(in oklab, var(${colorVar}) 10%, var(--app-surface))`
                          : "var(--app-surface)",
                      }}
                    >
                      <div className="flex min-w-0 items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-[11px] tabular-nums text-muted-canvas">
                          {timeLine}
                        </p>
                        <span
                          className="inline-flex h-4 shrink-0 items-center rounded-full border px-1.5 text-[10px] font-medium"
                          style={{
                            borderColor: "var(--app-border)",
                            background: "var(--app-surface-alt)",
                            color: "var(--app-text-muted)",
                          }}
                        >
                          {typeLabel}
                        </span>
                      </div>
                      <div className="mt-0.5 flex min-w-0 items-center justify-between gap-2">
                        <p
                          className="min-w-0 flex-1 truncate text-sm font-medium"
                          style={{ color: "var(--app-text)" }}
                          title={s.title}
                        >
                          {s.title || "Untitled"}
                        </p>
                        <p
                          className="shrink-0 text-[11px] font-semibold tracking-wide text-muted-canvas"
                          title={s.project_name || undefined}
                        >
                          {abbr}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <HomeCardFab
          className="absolute bottom-3 right-3 z-10"
          aria-label="Add calendar entry"
          onClick={() => setCreateOpen(true)}
        />
      </div>

      <HomeCalendarEntryDialog
        open={createOpen}
        todayIso={todayIso}
        projects={projects}
        tracks={tracks}
        onClose={() => setCreateOpen(false)}
        onCreated={async () => {
          setCreateOpen(false);
          await loadDay(todayIso);
          onCalendarEntryCreated?.();
          router.refresh();
        }}
      />
    </section>
  );
}
