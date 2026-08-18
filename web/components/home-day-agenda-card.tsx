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
import { subscribeCalendarSessionCacheCleared } from "@/lib/tasks-calendar-session-cache";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type Ref } from "react";

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

function CalendarCollapseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      width={16}
      height={16}
      aria-hidden
    >
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
        d="M6 12l4-4-4-4"
      />
    </svg>
  );
}

function TaskEffortIcon({ size = 12 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <path fill="currentColor" d="M13 2L4 14h6l-1 8 11-14h-6l1-6z" />
    </svg>
  );
}

/** Today's effort agenda — height matches the left dashboard stack when `heightPx` is set. */
export function HomeDayAgendaCard({
  todayIso,
  heightPx = null,
  projectAbbreviationById,
  projects = [],
  tracks = [],
  reloadKey = 0,
  onCalendarEntryCreated,
  onCollapse,
  collapseButtonRef,
}: {
  todayIso: string;
  /** Total section height (header + card), aligned to left stack including Hours this week. */
  heightPx?: number | null;
  /** Project id → abbreviation for compact agenda rows. */
  projectAbbreviationById?: Map<string, string>;
  projects?: TasksPageProject[];
  tracks?: TasksPageTrack[];
  /** Increment to refetch day sessions (e.g. after finishing a work session). */
  reloadKey?: number;
  /** Notifies parent so Hours this week (and related metrics) can reload. */
  onCalendarEntryCreated?: () => void;
  /** When set, shows a collapse control in the section header. */
  onCollapse?: () => void;
  collapseButtonRef?: Ref<HTMLButtonElement>;
}) {
  const [sessions, setSessions] = useState<TasksCalendarSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editSession, setEditSession] = useState<TasksCalendarSession | null>(null);
  const [cacheClearTick, setCacheClearTick] = useState(0);

  const closeEntryDialog = useCallback(() => {
    setDialogOpen(false);
    setEditSession(null);
  }, []);

  const openCreateDialog = useCallback(() => {
    setEditSession(null);
    setDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((session: TasksCalendarSession) => {
    if (session.source !== "manual") return;
    setEditSession(session);
    setDialogOpen(true);
  }, []);

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

  useEffect(() => subscribeCalendarSessionCacheCleared(() => setCacheClearTick((n) => n + 1)), []);

  useEffect(() => {
    void loadDay(todayIso);
  }, [todayIso, loadDay, reloadKey, cacheClearTick]);

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
        <div className="flex shrink-0 items-center gap-1">
          <Link href={calendarHref} className="btn-cta-tertiary shrink-0 !py-1 !px-2 text-xs">
            Open calendar
          </Link>
          {onCollapse ? (
            <button
              ref={collapseButtonRef}
              type="button"
              className="icon-btn"
              aria-label="Collapse calendar"
              aria-expanded={true}
              onClick={onCollapse}
            >
              <CalendarCollapseIcon />
            </button>
          ) : null}
        </div>
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
                  const isWorkSession = s.source === "task_work_session";
                  const isManual = s.source === "manual";
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
                  const titleText = s.title || "Untitled";
                  const rowLabel = isWorkSession
                    ? `${titleText}. Logged from a work session`
                    : isManual
                      ? `Edit ${titleText}`
                      : titleText;
                  const rowStyle = {
                    borderColor: "var(--app-border)",
                    "--row-bg": colorVar
                      ? `color-mix(in oklab, var(${colorVar}) 10%, var(--app-surface))`
                      : "var(--app-surface)",
                    "--row-bg-hover": colorVar
                      ? `color-mix(in oklab, var(${colorVar}) 16%, var(--app-surface))`
                      : "var(--app-surface-alt)",
                  } as CSSProperties;
                  const rowInner = (
                    <>
                      <div className="flex min-w-0 items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-[11px] tabular-nums text-muted-canvas">
                          {timeLine}
                        </span>
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
                        <span
                          className="flex min-w-0 flex-1 items-center gap-1 text-sm font-medium"
                          style={{ color: "var(--app-text)" }}
                          title={isWorkSession ? `${titleText} · Logged from a work session` : titleText}
                        >
                          {isWorkSession ? (
                            <span
                              className="inline-flex shrink-0"
                              style={{
                                color: "color-mix(in oklab, var(--app-action) 75%, var(--app-text) 25%)",
                              }}
                              aria-hidden
                            >
                              <TaskEffortIcon size={12} />
                            </span>
                          ) : null}
                          <span className="min-w-0 truncate">{titleText}</span>
                        </span>
                        <span
                          className="shrink-0 text-[11px] font-semibold tracking-wide text-muted-canvas"
                          title={s.project_name || undefined}
                        >
                          {abbr}
                        </span>
                      </div>
                    </>
                  );
                  return (
                    <li key={s.source_id}>
                      {isManual ? (
                        <button
                          type="button"
                          className="w-full cursor-pointer rounded-[8px] border bg-[var(--row-bg)] px-2 py-1 text-left transition-colors hover:bg-[var(--row-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)]"
                          style={rowStyle}
                          aria-label={rowLabel}
                          onClick={() => openEditDialog(s)}
                        >
                          {rowInner}
                        </button>
                      ) : (
                        <div className="rounded-[8px] border bg-[var(--row-bg)] px-2 py-1" style={rowStyle} title={rowLabel}>
                          {rowInner}
                        </div>
                      )}
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
          onClick={openCreateDialog}
        />
      </div>

      <HomeCalendarEntryDialog
        open={dialogOpen}
        todayIso={todayIso}
        projects={projects}
        tracks={tracks}
        editSession={editSession}
        onClose={closeEntryDialog}
        onCreated={async () => {
          await loadDay(todayIso);
          onCalendarEntryCreated?.();
        }}
      />
    </section>
  );
}
