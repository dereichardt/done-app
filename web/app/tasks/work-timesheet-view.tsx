"use client";

import { CanvasArrowLeftIcon, CanvasArrowRightIcon } from "@/components/canvas-arrow-icons";
import {
  effortProratedHoursByLocalDay,
  formatEffortHoursLabel,
  formatLocalYmd,
  parseLocalYmd,
  sessionOverlapsWallRange,
} from "@/lib/integration-effort-buckets";
import { loadTasksCalendarSessions, type TasksCalendarSession } from "@/lib/actions/tasks-calendar";
import { timesheetFallbackBullets } from "@/lib/timesheet-fallback-bullets";
import { sundayWeekWindowFromAnchorYmd } from "@/lib/timesheet-week";
import {
  TASKS_PAGE_INTERNAL_PROJECT_ID,
  type TasksPageIntegration,
  type TasksPageProject,
  type TasksPageTrack,
} from "@/lib/tasks-page-shared";
import type { TasksFiltersValue } from "./tasks-filters";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const DAY_MS = 86_400_000;
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function TimesheetColGroup({ dayYmcs }: { dayYmcs: readonly string[] }) {
  return (
    <colgroup>
      <col style={{ width: "8.75rem" }} />
      {dayYmcs.map((ymd) => (
        <col key={ymd} />
      ))}
      <col style={{ width: "3.5rem" }} />
    </colgroup>
  );
}

function addDaysYmd(ymd: string, delta: number): string {
  const d = parseLocalYmd(ymd);
  d.setDate(d.getDate() + delta);
  return formatLocalYmd(d);
}

function djbHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h, 33) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

function formatWeekRangeTitle(weekStart: Date): string {
  const start = weekStart;
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const sameYear = start.getFullYear() === end.getFullYear();
  const optStart: Intl.DateTimeFormatOptions = sameYear
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" };
  const optEnd: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  return `${start.toLocaleDateString(undefined, optStart)} – ${end.toLocaleDateString(undefined, optEnd)}`;
}

function filterSessions(sessions: TasksCalendarSession[], filters: TasksFiltersValue): TasksCalendarSession[] {
  return sessions.filter((s) => {
    if (filters.projectId && s.project_id !== filters.projectId) return false;
    if (filters.projectTrackId && s.project_track_id !== filters.projectTrackId) return false;
    if (filters.priority) {
      if (s.task_priority !== filters.priority) return false;
    }
    const q = filters.search.trim().toLowerCase();
    if (q && !s.title.toLowerCase().includes(q)) return false;
    return true;
  });
}

function rawLinesForCell(
  sessions: TasksCalendarSession[],
  trackId: string,
  dayYmd: string,
): string[] {
  const day = parseLocalYmd(dayYmd);
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const dayEnd = dayStart + DAY_MS;
  const lines: string[] = [];
  for (const s of sessions) {
    if (s.project_track_id !== trackId) continue;
    const a = new Date(s.started_at).getTime();
    const b = new Date(s.finished_at).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) continue;
    if (b <= dayStart || a >= dayEnd) continue;
    const title = (s.title ?? "").trim() || "Task";
    const wa = (s.work_accomplished ?? "").trim();
    lines.push(wa ? `${title} — ${wa}` : title);
  }
  return lines;
}

/** Flat label for AI summary + sort keys. */
function trackLabelForSummary(
  trackId: string,
  projects: TasksPageProject[],
  tracks: TasksPageTrack[],
  integrations: TasksPageIntegration[],
  sampleSession: TasksCalendarSession | undefined,
): string {
  const track = tracks.find((t) => t.id === trackId);
  if (track?.projectId === TASKS_PAGE_INTERNAL_PROJECT_ID) {
    return `Internal · ${track.label}`;
  }
  if (track?.kind === "integration" && track.projectIntegrationId) {
    const project = projects.find((p) => p.id === track.projectId);
    const integ = integrations.find((i) => i.id === track.projectIntegrationId);
    const code = (integ?.internalTimeCode ?? "").trim();
    const name = (project?.name ?? "Project").trim() || "Project";
    const codeDisp = code.length > 0 ? code : "—";
    return `Project: ${name}\nTime code: ${codeDisp}\nIntegration: ${track.label}`;
  }
  if (track?.kind === "project_management" && track.projectId !== TASKS_PAGE_INTERNAL_PROJECT_ID) {
    const project = projects.find((p) => p.id === track.projectId);
    const name = (project?.name ?? "Project").trim() || "Project";
    const codeLine = (track.label ?? "").trim() || "—";
    return `Project: ${name}\nTime code: ${codeLine}\nCategory: Project management`;
  }
  if (track) {
    const project = projects.find((p) => p.id === track.projectId);
    return `${project?.name ?? "Project"} · ${track.label}`;
  }
  if (sampleSession) {
    return `Project: ${sampleSession.project_name}\nTime code: —\nIntegration: ${sampleSession.integration_label}`;
  }
  return "Unknown track";
}

function ProjectWorktagCell({
  trackId,
  projects,
  tracks,
  integrations,
  sampleSession,
}: {
  trackId: string;
  projects: TasksPageProject[];
  tracks: TasksPageTrack[];
  integrations: TasksPageIntegration[];
  sampleSession: TasksCalendarSession | undefined;
}) {
  const track = tracks.find((t) => t.id === trackId);
  if (track?.projectId === TASKS_PAGE_INTERNAL_PROJECT_ID) {
    return (
      <div className="min-w-0 py-0.5">
        <p className="truncate text-xs font-medium leading-snug" style={{ color: "var(--app-text)" }}>
          Internal · {track.label}
        </p>
      </div>
    );
  }
  if (track?.kind === "integration" && track.projectIntegrationId) {
    const project = projects.find((p) => p.id === track.projectId);
    const integ = integrations.find((i) => i.id === track.projectIntegrationId);
    const code = (integ?.internalTimeCode ?? "").trim();
    const name = (project?.name ?? "Project").trim() || "Project";
    const integrationName = track.label;
    const codeDisplay = code.length > 0 ? code : "—";
    return (
      <div className="min-w-0 space-y-0.5 py-0.5">
        <p className="truncate text-xs font-medium leading-snug" style={{ color: "var(--app-text)" }} title={name}>
          {name}
        </p>
        <p
          className={`truncate text-xs font-normal leading-snug tabular-nums ${code.length > 0 ? "text-[var(--app-text)]" : "text-muted-canvas"}`}
          title={code.length > 0 ? code : undefined}
        >
          {codeDisplay}
        </p>
        <p
          className="truncate text-[11px] font-normal leading-snug text-muted-canvas"
          title={integrationName}
        >
          {integrationName}
        </p>
      </div>
    );
  }
  if (track?.kind === "project_management" && track.projectId !== TASKS_PAGE_INTERNAL_PROJECT_ID) {
    const project = projects.find((p) => p.id === track.projectId);
    const name = (project?.name ?? "Project").trim() || "Project";
    const labelTrim = (track.label ?? "").trim();
    const timeCode = labelTrim.length > 0 ? labelTrim : "—";
    return (
      <div className="min-w-0 space-y-0.5 py-0.5">
        <p className="truncate text-xs font-medium leading-snug" style={{ color: "var(--app-text)" }} title={name}>
          {name}
        </p>
        <p
          className={`truncate text-xs font-normal leading-snug ${labelTrim.length > 0 ? "text-[var(--app-text)]" : "text-muted-canvas"}`}
          title={labelTrim.length > 0 ? labelTrim : undefined}
        >
          {timeCode}
        </p>
        <p className="truncate text-[11px] font-normal leading-snug text-muted-canvas">Project management</p>
      </div>
    );
  }
  if (track) {
    const project = projects.find((p) => p.id === track.projectId);
    const line1 = `${(project?.name ?? "Project").trim() || "Project"} · ${track.label}`;
    return (
      <div className="min-w-0 py-0.5">
        <p className="truncate text-xs font-medium leading-snug" style={{ color: "var(--app-text)" }} title={line1}>
          {line1}
        </p>
      </div>
    );
  }
  if (sampleSession) {
    return (
      <div className="min-w-0 space-y-0.5 py-0.5">
        <p className="truncate text-xs font-medium leading-snug" style={{ color: "var(--app-text)" }}>
          {sampleSession.project_name}
        </p>
        <p className="truncate text-xs font-normal leading-snug text-muted-canvas tabular-nums">—</p>
        <p
          className="truncate text-[11px] font-normal leading-snug text-muted-canvas"
          title={sampleSession.integration_label}
        >
          {sampleSession.integration_label}
        </p>
      </div>
    );
  }
  return <span className="text-xs text-muted-canvas">Unknown</span>;
}

function sortTrackRowIds(
  ids: string[],
  projects: TasksPageProject[],
  tracks: TasksPageTrack[],
  integrations: TasksPageIntegration[],
  sampleSessionByTrackId: Map<string, TasksCalendarSession>,
): string[] {
  const label = (id: string) =>
    trackLabelForSummary(id, projects, tracks, integrations, sampleSessionByTrackId.get(id)).toLowerCase();
  const internalLast = (id: string) => {
    const t = tracks.find((x) => x.id === id);
    return t?.projectId === TASKS_PAGE_INTERNAL_PROJECT_ID ? 1 : 0;
  };
  return [...ids].sort((a, b) => {
    const ia = internalLast(a);
    const ib = internalLast(b);
    if (ia !== ib) return ia - ib;
    return label(a).localeCompare(label(b));
  });
}

type SummaryState =
  | { status: "ready"; bullets: string[]; source: "model" | "fallback"; notice?: string }
  | { status: "error"; message: string; bullets: string[] };

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} className={className} aria-hidden>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M8 4h8v4H8V4zM8 12h8M8 16h5"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} className={className} aria-hidden>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20 6 9 17l-5-5"
      />
    </svg>
  );
}

export function WorkTimesheetView({
  anchorYmd,
  onAnchorChange,
  filters,
  projects,
  tracks,
  integrations,
}: {
  anchorYmd: string;
  onAnchorChange: (ymd: string) => void;
  filters: TasksFiltersValue;
  projects: TasksPageProject[];
  tracks: TasksPageTrack[];
  integrations: TasksPageIntegration[];
}) {
  const { weekStart, weekEndExclusive, dayDates, dayYmcs } = useMemo(
    () => sundayWeekWindowFromAnchorYmd(anchorYmd),
    [anchorYmd],
  );

  const fetchWindow = useMemo(() => {
    const padMs = 7 * DAY_MS;
    const start = new Date(weekStart.getTime() - padMs);
    const end = new Date(weekEndExclusive.getTime() + padMs);
    return {
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      cacheKey: `${start.toISOString()}|${end.toISOString()}`,
    };
  }, [weekStart, weekEndExclusive]);

  const [allSessions, setAllSessions] = useState<TasksCalendarSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const sessionCache = useRef<Map<string, TasksCalendarSession[]>>(new Map());

  useEffect(() => {
    const { startIso, endIso, cacheKey } = fetchWindow;
    const cached = sessionCache.current.get(cacheKey);
    if (cached) {
      setAllSessions(cached);
      setLoading(false);
      setFetchError(null);
      return;
    }
    setLoading(true);
    setFetchError(null);
    let cancelled = false;
    void (async () => {
      const res = await loadTasksCalendarSessions(startIso, endIso);
      if (cancelled) return;
      if (res.error) {
        setFetchError(res.error);
        setLoading(false);
        return;
      }
      const sessions = res.sessions ?? [];
      sessionCache.current.set(cacheKey, sessions);
      setAllSessions(sessions);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchWindow]);

  const filteredSessions = useMemo(
    () => filterSessions(allSessions, filters),
    [allSessions, filters],
  );

  const sessionsInWeek = useMemo(() => {
    return filteredSessions.filter((s) =>
      sessionOverlapsWallRange(s, weekStart, weekEndExclusive),
    );
  }, [filteredSessions, weekStart, weekEndExclusive]);

  const trackRowIds = useMemo(() => {
    const ids = new Set<string>();
    const sampleById = new Map<string, TasksCalendarSession>();
    for (const s of sessionsInWeek) {
      ids.add(s.project_track_id);
      if (!sampleById.has(s.project_track_id)) sampleById.set(s.project_track_id, s);
    }
    return sortTrackRowIds([...ids], projects, tracks, integrations, sampleById);
  }, [sessionsInWeek, projects, tracks, integrations]);

  const hoursByTrackAndDay = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const trackId of trackRowIds) {
      const subset = sessionsInWeek.filter((s) => s.project_track_id === trackId);
      const byDay = effortProratedHoursByLocalDay(subset, weekStart, weekEndExclusive);
      map.set(trackId, byDay);
    }
    return map;
  }, [sessionsInWeek, trackRowIds, weekStart, weekEndExclusive]);

  const rowTotalsByTrack = useMemo(() => {
    const m = new Map<string, number>();
    for (const trackId of trackRowIds) {
      let sum = 0;
      const byDay = hoursByTrackAndDay.get(trackId);
      for (const ymd of dayYmcs) {
        sum += byDay?.get(ymd) ?? 0;
      }
      m.set(trackId, sum);
    }
    return m;
  }, [trackRowIds, dayYmcs, hoursByTrackAndDay]);

  const columnTotalsByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const ymd of dayYmcs) {
      let sum = 0;
      for (const trackId of trackRowIds) {
        sum += hoursByTrackAndDay.get(trackId)?.get(ymd) ?? 0;
      }
      m.set(ymd, sum);
    }
    return m;
  }, [trackRowIds, dayYmcs, hoursByTrackAndDay]);

  const weekGrandTotal = useMemo(() => {
    let t = 0;
    for (const v of columnTotalsByDay.values()) t += v;
    return t;
  }, [columnTotalsByDay]);

  const weekStartYmd = formatLocalYmd(weekStart);

  const [summaryMap, setSummaryMap] = useState<Map<string, SummaryState>>(() => new Map());
  const prefetchGen = useRef(0);
  const [copiedCellKey, setCopiedCellKey] = useState<string | null>(null);
  const copyResetTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    return () => {
      for (const t of copyResetTimers.current.values()) clearTimeout(t);
      copyResetTimers.current.clear();
    };
  }, []);

  const summaryKey = useCallback((trackId: string, dayYmd: string, lines: string[]) => {
    const stable = [...lines].sort((a, b) => a.localeCompare(b));
    const h = djbHash(stable.join("\x1e"));
    return `${weekStartYmd}|${trackId}|${dayYmd}|${h}`;
  }, [weekStartYmd]);

  const sessionsInWeekFingerprint = useMemo(() => {
    return [...sessionsInWeek]
      .map((s) => `${s.source}:${s.source_id}:${s.started_at}:${s.finished_at}`)
      .sort()
      .join("|");
  }, [sessionsInWeek]);

  /** Primitives only — React requires a fixed-length dependency array (no raw object arrays). */
  const projectsFingerprint = useMemo(
    () => projects.map((p) => `${p.id}\t${p.name}`).join("\n"),
    [projects],
  );
  const tracksFingerprint = useMemo(
    () =>
      tracks
        .map(
          (t) =>
            `${t.id}\t${t.projectId}\t${t.kind}\t${t.label}\t${t.projectIntegrationId ?? ""}`,
        )
        .join("\n"),
    [tracks],
  );
  const integrationsFingerprint = useMemo(
    () =>
      integrations
        .map((i) => `${i.id}\t${i.projectId}\t${i.label}\t${i.internalTimeCode ?? ""}`)
        .join("\n"),
    [integrations],
  );

  /** Single primitive dep so the effect dependency array is always length 1 (React 19 dev invariant). */
  const trackIdsKey = trackRowIds.join("\x1e");
  const dayYmcsKey = dayYmcs.join("\x1e");
  const prefetchDepKey = useMemo(
    () =>
      JSON.stringify({
        loading,
        fetchError: fetchError ?? "",
        weekStartYmd,
        trackIds: trackIdsKey,
        dayYmcs: dayYmcsKey,
        sessionFp: sessionsInWeekFingerprint,
        projectFp: projectsFingerprint,
        tracksFp: tracksFingerprint,
        integrationsFp: integrationsFingerprint,
      }),
    [
      loading,
      fetchError,
      weekStartYmd,
      trackIdsKey,
      dayYmcsKey,
      sessionsInWeekFingerprint,
      projectsFingerprint,
      tracksFingerprint,
      integrationsFingerprint,
    ],
  );

  useEffect(() => {
    if (loading || fetchError) return;
    if (trackRowIds.length === 0) {
      setSummaryMap(new Map());
      return;
    }

    const gen = ++prefetchGen.current;

    const tasks: Array<{ key: string; trackId: string; dayYmd: string; lines: string[] }> = [];
    const initial = new Map<string, SummaryState>();

    for (const trackId of trackRowIds) {
      for (const dayYmd of dayYmcs) {
        const lines = rawLinesForCell(sessionsInWeek, trackId, dayYmd);
        if (lines.length === 0) continue;
        const key = summaryKey(trackId, dayYmd, lines);
        initial.set(key, {
          status: "ready",
          bullets: timesheetFallbackBullets(lines),
          source: "fallback",
        });
        tasks.push({ key, trackId, dayYmd, lines });
      }
    }

    setSummaryMap(initial);

    if (tasks.length === 0) return;

    const CONCURRENCY = 5;

    async function fetchCell(t: { key: string; trackId: string; dayYmd: string; lines: string[] }) {
      const trackLabel = trackLabelForSummary(
        t.trackId,
        projects,
        tracks,
        integrations,
        sessionsInWeek.find((s) => s.project_track_id === t.trackId),
      );
      try {
        const res = await fetch("/api/work/timesheet-cell-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trackLabel, dayYmd: t.dayYmd, lines: t.lines }),
        });
        const data = (await res.json()) as {
          bullets?: string[];
          source?: "model" | "fallback";
          error?: string;
        };
        if (prefetchGen.current !== gen) return;
        if (!res.ok) {
          setSummaryMap((prev) => {
            if (prefetchGen.current !== gen) return prev;
            const next = new Map(prev);
            next.set(t.key, {
              status: "error",
              message: (data as { error?: string }).error ?? "Request failed",
              bullets: timesheetFallbackBullets(t.lines),
            });
            return next;
          });
          return;
        }
        const bullets = Array.isArray(data.bullets) ? data.bullets : [];
        setSummaryMap((prev) => {
          if (prefetchGen.current !== gen) return prev;
          const next = new Map(prev);
          next.set(t.key, {
            status: "ready",
            bullets: bullets.length > 0 ? bullets : timesheetFallbackBullets(t.lines),
            source: data.source === "model" ? "model" : "fallback",
            notice: typeof data.error === "string" ? data.error : undefined,
          });
          return next;
        });
      } catch {
        if (prefetchGen.current !== gen) return;
        setSummaryMap((prev) => {
          if (prefetchGen.current !== gen) return prev;
          const next = new Map(prev);
          next.set(t.key, {
            status: "error",
            message: "Network error",
            bullets: timesheetFallbackBullets(t.lines),
          });
          return next;
        });
      }
    }

    void (async () => {
      for (let i = 0; i < tasks.length; i += CONCURRENCY) {
        if (prefetchGen.current !== gen) return;
        const chunk = tasks.slice(i, i + CONCURRENCY);
        await Promise.all(chunk.map((t) => fetchCell(t)));
      }
    })();
  }, [prefetchDepKey]);

  const goPrevWeek = () => onAnchorChange(addDaysYmd(anchorYmd, -7));
  const goNextWeek = () => onAnchorChange(addDaysYmd(anchorYmd, 7));
  const goToday = () => onAnchorChange(formatLocalYmd(new Date()));

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div
            className="inline-flex h-8 shrink-0 overflow-hidden rounded-md border"
            style={{ borderColor: "var(--app-border)" }}
          >
            <button
              type="button"
              className="inline-flex h-8 w-9 shrink-0 cursor-pointer items-center justify-center text-[var(--app-text)] transition-colors hover:bg-[color-mix(in_oklab,var(--app-surface-alt)_90%,var(--app-border))]"
              aria-label="Previous week"
              onClick={goPrevWeek}
            >
              <CanvasArrowLeftIcon />
            </button>
            <div className="w-px self-stretch" style={{ background: "var(--app-border)" }} aria-hidden />
            <button
              type="button"
              className="inline-flex h-8 items-center justify-center whitespace-nowrap px-3 text-xs font-medium cursor-pointer text-[var(--app-text)] transition-colors hover:bg-[color-mix(in_oklab,var(--app-surface-alt)_90%,var(--app-border))]"
              onClick={goToday}
            >
              Today
            </button>
            <div className="w-px self-stretch" style={{ background: "var(--app-border)" }} aria-hidden />
            <button
              type="button"
              className="inline-flex h-8 w-9 shrink-0 cursor-pointer items-center justify-center text-[var(--app-text)] transition-colors hover:bg-[color-mix(in_oklab,var(--app-surface-alt)_90%,var(--app-border))]"
              aria-label="Next week"
              onClick={goNextWeek}
            >
              <CanvasArrowRightIcon />
            </button>
          </div>
          <p className="min-w-0 truncate text-sm font-medium tabular-nums" style={{ color: "var(--app-text)" }}>
            {formatWeekRangeTitle(weekStart)}
          </p>
        </div>
      </div>

      {loading ? (
        <p className="flex flex-1 min-h-0 items-center text-sm text-muted-canvas">Loading timesheet…</p>
      ) : fetchError ? (
        <p className="flex flex-1 min-h-0 items-center text-sm" style={{ color: "var(--app-danger)" }}>
          Could not load sessions: {fetchError}
        </p>
      ) : trackRowIds.length === 0 ? (
        <p className="flex flex-1 min-h-0 items-center text-sm text-muted-canvas">No time logged for this week.</p>
      ) : (
        <div
          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border"
          style={{ borderColor: "var(--app-border)" }}
        >
          <div className="shrink-0 overflow-x-hidden">
            <table className="w-full table-fixed border-collapse text-left text-sm">
              <TimesheetColGroup dayYmcs={dayYmcs} />
              <tr style={{ background: "var(--app-surface-alt)" }}>
                <th
                  scope="col"
                  className="border-b border-r px-1.5 py-2 text-left text-xs font-medium text-muted-canvas"
                  style={{
                    borderColor: "var(--app-border)",
                    background: "var(--app-surface-alt)",
                    boxShadow: "1px 0 0 var(--app-border)",
                  }}
                >
                  Project Worktag
                </th>
                {dayYmcs.map((ymd, i) => (
                  <th
                    key={ymd}
                    scope="col"
                    className="border-b px-1 py-2 text-center text-xs font-medium text-muted-canvas"
                    style={{
                      borderColor: "var(--app-border)",
                      background: "var(--app-surface-alt)",
                    }}
                  >
                    <div>{WEEKDAY_LABELS[i]}</div>
                    <div className="mt-0.5 tabular-nums" style={{ color: "var(--app-text)" }}>
                      {dayDates[i].getDate()}
                    </div>
                  </th>
                ))}
                <th
                  scope="col"
                  className="border-b border-l px-0.5 py-2 text-center text-xs font-medium text-muted-canvas"
                  style={{
                    borderColor: "var(--app-border)",
                    background: "var(--app-surface-alt)",
                  }}
                  title="Total hours for the week (this row)"
                >
                  Total
                </th>
              </tr>
            </table>
          </div>

          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
            <table className="w-full table-fixed border-collapse text-left text-sm">
              <TimesheetColGroup dayYmcs={dayYmcs} />
              <tbody>
              {trackRowIds.map((trackId, rowIndex) => {
                const sample = sessionsInWeek.find((s) => s.project_track_id === trackId);
                const byDay = hoursByTrackAndDay.get(trackId);
                const isLastRow = rowIndex === trackRowIds.length - 1;
                return (
                  <tr key={trackId}>
                    <td
                      className={`min-w-0 max-w-0 border-r px-1.5 py-1 align-top ${isLastRow ? "" : "border-b"}`}
                      style={{
                        borderColor: "var(--app-border)",
                        background: "var(--app-surface)",
                        boxShadow: "1px 0 0 var(--app-border)",
                      }}
                    >
                      <ProjectWorktagCell
                        trackId={trackId}
                        projects={projects}
                        tracks={tracks}
                        integrations={integrations}
                        sampleSession={sample}
                      />
                    </td>
                    {dayYmcs.map((dayYmd) => {
                      const h = byDay?.get(dayYmd) ?? 0;
                      const has = h > 0.001;
                      const lines = rawLinesForCell(sessionsInWeek, trackId, dayYmd);
                      const sk = summaryKey(trackId, dayYmd, lines);
                      const sum = summaryMap.get(sk);
                      const bullets =
                        sum?.status === "ready" || sum?.status === "error"
                          ? sum.bullets
                          : lines.length > 0
                            ? timesheetFallbackBullets(lines)
                            : [];
                      const copyText = bullets.join("\n");
                      const previewBody = bullets
                        .map((b) => b.replace(/^\s*-\s+/, "").trim())
                        .filter(Boolean)
                        .join("\n");
                      const cellKey = `${trackId}|${dayYmd}`;
                      const isCopied = copiedCellKey === cellKey;

                      return (
                        <td
                          key={dayYmd}
                          className={`group relative min-w-0 max-w-0 px-1 py-1.5 align-top ${isLastRow ? "" : "border-b"}`}
                          style={{
                            borderColor: "var(--app-border)",
                            background: has ? "var(--app-surface-alt)" : "var(--app-surface)",
                          }}
                          tabIndex={has || lines.length > 0 ? 0 : -1}
                        >
                          <div className="tabular-nums text-xs font-semibold" style={{ color: "var(--app-action)" }}>
                            {has ? formatEffortHoursLabel(h) : "—"}
                          </div>
                          {lines.length > 0 ? (
                            <div className="relative mt-1 min-h-[4.5rem] pr-7">
                              <p
                                className="whitespace-pre-line break-words text-[11px] leading-snug text-muted-canvas line-clamp-6"
                                title={copyText}
                              >
                                {previewBody || "—"}
                              </p>
                              {copyText ? (
                                <button
                                  type="button"
                                  className={[
                                    "absolute right-0 top-0 cursor-pointer rounded-md p-1 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)]",
                                    isCopied
                                      ? "opacity-100 text-[var(--app-state-active-fg)]"
                                      : "text-[var(--app-text-muted)] opacity-0 hover:bg-[var(--app-surface-alt)] hover:text-[var(--app-text)] group-hover:opacity-100 group-focus-within:opacity-100",
                                  ].join(" ")}
                                  aria-label={isCopied ? "Copied to clipboard" : "Copy comments"}
                                  title={isCopied ? "Copied" : "Copy all comments"}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void (async () => {
                                      try {
                                        await navigator.clipboard.writeText(copyText);
                                        const prev = copyResetTimers.current.get(cellKey);
                                        if (prev) clearTimeout(prev);
                                        setCopiedCellKey(cellKey);
                                        const timer = setTimeout(() => {
                                          setCopiedCellKey((k) => (k === cellKey ? null : k));
                                          copyResetTimers.current.delete(cellKey);
                                        }, 2200);
                                        copyResetTimers.current.set(cellKey, timer);
                                      } catch {
                                        /* clipboard denied or unavailable */
                                      }
                                    })();
                                  }}
                                >
                                  {isCopied ? <CheckIcon /> : <CopyIcon />}
                                </button>
                              ) : null}
                              {sum?.status === "ready" && sum.notice ? (
                                <p className="mt-0.5 text-[10px] text-muted-canvas">{sum.notice}</p>
                              ) : null}
                            </div>
                          ) : null}
                        </td>
                      );
                    })}
                    <td
                      className={`border-l px-0.5 py-1.5 text-center align-middle ${isLastRow ? "" : "border-b"}`}
                      style={{
                        borderColor: "var(--app-border)",
                        background: "var(--app-surface)",
                      }}
                      title="Total hours this week for this worktag"
                    >
                      <span className="tabular-nums text-xs font-semibold" style={{ color: "var(--app-action)" }}>
                        {(rowTotalsByTrack.get(trackId) ?? 0) > 0.001
                          ? formatEffortHoursLabel(rowTotalsByTrack.get(trackId) ?? 0)
                          : "—"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            </table>
          </div>

          <div className="shrink-0 overflow-x-hidden border-t" style={{ borderColor: "var(--app-border)" }}>
            <table className="w-full table-fixed border-collapse text-left text-sm">
              <TimesheetColGroup dayYmcs={dayYmcs} />
              <tr style={{ background: "var(--app-surface-alt)" }}>
                <th
                  scope="row"
                  className="border-r px-1.5 py-1.5 text-left text-xs font-medium text-muted-canvas"
                  style={{
                    borderColor: "var(--app-border)",
                    background: "var(--app-surface-alt)",
                    boxShadow: "1px 0 0 var(--app-border)",
                  }}
                >
                  Total
                </th>
                {dayYmcs.map((ymd) => (
                  <td
                    key={ymd}
                    className="px-0.5 py-1.5 text-center align-middle"
                    style={{
                      borderColor: "var(--app-border)",
                      background: "var(--app-surface-alt)",
                    }}
                    title="Sum of hours for this day"
                  >
                    <span className="tabular-nums text-xs font-semibold" style={{ color: "var(--app-text)" }}>
                      {(columnTotalsByDay.get(ymd) ?? 0) > 0.001
                        ? formatEffortHoursLabel(columnTotalsByDay.get(ymd) ?? 0)
                        : "—"}
                    </span>
                  </td>
                ))}
                <td
                  className="border-l px-0.5 py-1.5 text-center align-middle"
                  style={{
                    borderColor: "var(--app-border)",
                    background: "var(--app-surface-alt)",
                  }}
                  title="Total hours for the week (all worktags)"
                >
                  <span className="tabular-nums text-xs font-semibold" style={{ color: "var(--app-action)" }}>
                    {weekGrandTotal > 0.001 ? formatEffortHoursLabel(weekGrandTotal) : "—"}
                  </span>
                </td>
              </tr>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
