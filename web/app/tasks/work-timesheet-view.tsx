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

/** Match `TasksEffortCalendar` detail popover width for consistent positioning. */
const TIMESHEET_POPOVER_W = 320;
const TIMESHEET_POPOVER_GAP = 10;

type ActiveTimesheetCellPopover = {
  x: number;
  y: number;
  trackLabel: string;
  dayMeta: string;
  hoursFormatted: string;
  commentsText: string;
};

function TimesheetCellDetailPopover({
  active,
  onPointerEnter,
  onPointerLeave,
  onClose,
}: {
  active: ActiveTimesheetCellPopover;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute z-[20] w-[20rem] rounded-xl border p-4 shadow-xl"
      style={{
        left: active.x,
        top: active.y,
        borderColor: "var(--app-border)",
        background: "var(--app-surface)",
        boxShadow: "0 8px 32px color-mix(in oklab, var(--app-text) 14%, transparent)",
      }}
      role="dialog"
      aria-label="Timesheet cell details"
      onMouseEnter={onPointerEnter}
      onMouseLeave={onPointerLeave}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p
            className="whitespace-pre-line text-sm font-semibold leading-snug"
            style={{ color: "var(--app-text)" }}
          >
            {active.trackLabel}
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-md p-1 text-muted-canvas transition-colors hover:bg-[var(--app-surface-alt)] hover:text-[var(--app-text)]"
          onClick={onClose}
          aria-label="Close"
        >
          <svg viewBox="0 0 24 24" width={14} height={14} aria-hidden>
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18 6 6 18M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <p className="mt-2 text-xs text-muted-canvas">
        {active.dayMeta} ·{" "}
        <span className="font-medium" style={{ color: "var(--app-text)" }}>
          {active.hoursFormatted}
        </span>
      </p>

      <div className="mt-3">
        <p className="text-xs font-medium text-muted-canvas">Work accomplished</p>
        <p className="mt-1 whitespace-pre-line text-sm" style={{ color: "var(--app-text)" }}>
          {active.commentsText.trim() || "—"}
        </p>
      </div>
    </div>
  );
}

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

const ROW_FOCUS_RING = "color-mix(in oklab, var(--app-action) 30%, transparent)";

/** One continuous outer ring for the row: each cell only draws its share of the perimeter. */
function timesheetRowFocusBoxShadow(
  segment: "worktag" | "day" | "total",
  focused: boolean,
): string | undefined {
  const hairline = "1px 0 0 var(--app-border)";
  const top = `inset 0 2px 0 0 ${ROW_FOCUS_RING}`;
  const bottom = `inset 0 -2px 0 0 ${ROW_FOCUS_RING}`;
  if (segment === "worktag") {
    if (!focused) return hairline;
    return `inset 2px 0 0 0 ${ROW_FOCUS_RING}, ${top}, ${bottom}, ${hairline}`;
  }
  if (!focused) return undefined;
  if (segment === "day") return `${top}, ${bottom}`;
  return `inset -2px 0 0 0 ${ROW_FOCUS_RING}, ${top}, ${bottom}`;
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
    <svg viewBox="0 0 24 24" className={className ?? "h-4 w-4"} aria-hidden>
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

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? "h-4 w-4"} aria-hidden>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M18 6 6 18M6 6l12 12"
      />
    </svg>
  );
}

/** Top-right “copied” check; hover/focus shows X to clear session highlight (not clipboard). */
function TimesheetCopiedIndicator({ onClear }: { onClear: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const showDismiss = hovered || focused;

  return (
    <button
      type="button"
      className={[
        "absolute right-0.5 top-0.5 z-[5] flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)]",
        showDismiss
          ? "text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
          : "text-[var(--app-state-active-fg)]",
      ].join(" ")}
      aria-label={showDismiss ? "Clear copied highlight" : "Copied this session"}
      title={showDismiss ? "Clear copied highlight" : "Copied this session"}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onClick={(e) => {
        e.stopPropagation();
        onClear();
      }}
    >
      {showDismiss ? (
        <XIcon className="h-3.5 w-3.5" />
      ) : (
        <CheckIcon className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

/**
 * Comment preview + copy: flex row so text never paints under the control (no overlap / “see-through”).
 * Copy column is a fixed 28px lane; hover/focus (from parent cell body) toggles the chip.
 */
function TimesheetCellCommentPreview({
  previewBody,
  copyText,
  copyControlBg,
  isCopied,
  slotHover,
  notice,
  onCopy,
}: {
  previewBody: string;
  copyText: string;
  copyControlBg: string;
  isCopied: boolean;
  slotHover: boolean;
  notice: string | undefined;
  onCopy: () => void;
}) {
  const [copyFocused, setCopyFocused] = useState(false);
  const showCopyChrome = slotHover || copyFocused;

  return (
    <div className="mt-3 min-w-0">
      <div className="flex min-w-0 items-start gap-0">
        <p className="line-clamp-2 min-w-0 flex-1 whitespace-pre-line break-words text-[11px] leading-snug text-muted-canvas">
          {previewBody || "—"}
        </p>
        {copyText ? (
          <div className="relative isolate h-7 w-7 shrink-0">
            {showCopyChrome ? (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-md"
                style={{ backgroundColor: copyControlBg }}
              />
            ) : null}
            <button
              type="button"
              className={[
                "absolute inset-0 z-10 flex cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 text-[var(--app-text-muted)] hover:text-[var(--app-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)]",
                showCopyChrome ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
              ].join(" ")}
              tabIndex={0}
              aria-label={isCopied ? "Copy comments again" : "Copy comments"}
              title={isCopied ? "Copy comments again" : "Copy all comments"}
              onFocus={() => setCopyFocused(true)}
              onBlur={(e) => {
                const next = e.relatedTarget as Node | null;
                if (!e.currentTarget.parentElement?.contains(next)) {
                  setCopyFocused(false);
                }
              }}
              onClick={(e) => {
                e.stopPropagation();
                void onCopy();
              }}
            >
              <CopyIcon />
            </button>
          </div>
        ) : null}
      </div>
      {notice ? <p className="mt-0.5 text-[10px] text-muted-canvas">{notice}</p> : null}
    </div>
  );
}

/** Hours + comment preview; hover anywhere here reveals the copy control. */
function TimesheetDayCellBody({
  has,
  hoursFormatted,
  linesLength,
  previewBody,
  copyText,
  copyControlBg,
  isCopied,
  notice,
  onCopy,
}: {
  has: boolean;
  hoursFormatted: string;
  linesLength: number;
  previewBody: string;
  copyText: string;
  copyControlBg: string;
  isCopied: boolean;
  notice: string | undefined;
  onCopy: () => void;
}) {
  const [cellHovered, setCellHovered] = useState(false);
  const trackHover = linesLength > 0;

  return (
    <div
      onMouseEnter={() => {
        if (trackHover) setCellHovered(true);
      }}
      onMouseLeave={() => {
        if (trackHover) setCellHovered(false);
      }}
    >
      <div
        className="text-left text-base font-semibold tabular-nums"
        style={{ color: "var(--app-action)" }}
      >
        {has ? hoursFormatted : "—"}
      </div>
      {linesLength > 0 ? (
        <TimesheetCellCommentPreview
          previewBody={previewBody}
          copyText={copyText}
          copyControlBg={copyControlBg}
          isCopied={isCopied}
          slotHover={cellHovered}
          notice={notice}
          onCopy={onCopy}
        />
      ) : null}
    </div>
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
  /** Cells the user copied this session; cleared when leaving the timesheet (component unmount). */
  const [copiedCellKeys, setCopiedCellKeys] = useState<Set<string>>(() => new Set());
  const [focusedTrackId, setFocusedTrackId] = useState<string | null>(null);
  const [activeHoverDetail, setActiveHoverDetail] = useState<ActiveTimesheetCellPopover | null>(null);
  const tableBodyWrapRef = useRef<HTMLDivElement | null>(null);
  const closePopoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPopoverHoveredRef = useRef(false);
  /** Default off: hover popover for full comments only when user enables it. */
  const [commentsPopoverEnabled, setCommentsPopoverEnabled] = useState(false);

  useEffect(() => {
    return () => {
      if (closePopoverTimerRef.current) {
        clearTimeout(closePopoverTimerRef.current);
        closePopoverTimerRef.current = null;
      }
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

  useEffect(() => {
    setFocusedTrackId(null);
    setActiveHoverDetail(null);
    isPopoverHoveredRef.current = false;
    if (closePopoverTimerRef.current) {
      clearTimeout(closePopoverTimerRef.current);
      closePopoverTimerRef.current = null;
    }
  }, [weekStartYmd, trackIdsKey]);

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

  const showTimesheetCellPopover = useCallback(
    (el: HTMLElement, opts: { trackId: string; dayYmd: string; hours: number; copyText: string }) => {
      const wrap = tableBodyWrapRef.current;
      let x = 24;
      let y = 24;
      if (wrap && el) {
        const wr = wrap.getBoundingClientRect();
        const br = el.getBoundingClientRect();
        const rightX = br.right - wr.left + wrap.scrollLeft + TIMESHEET_POPOVER_GAP;
        const leftX = br.left - wr.left + wrap.scrollLeft - TIMESHEET_POPOVER_W - TIMESHEET_POPOVER_GAP;
        const maxX = wrap.scrollLeft + wr.width - TIMESHEET_POPOVER_W - 8;
        x = Math.max(8, Math.min(maxX, rightX <= maxX ? rightX : leftX));
        y = Math.max(
          wrap.scrollTop + 8,
          Math.min(
            wrap.scrollTop + wr.height - 180,
            br.top - wr.top + wrap.scrollTop - 8,
          ),
        );
      }
      const sample = sessionsInWeek.find((s) => s.project_track_id === opts.trackId);
      const trackLabel = trackLabelForSummary(opts.trackId, projects, tracks, integrations, sample);
      const dayIdx = dayYmcs.indexOf(opts.dayYmd);
      const dayMeta =
        dayIdx >= 0
          ? `${WEEKDAY_LABELS[dayIdx]} · ${dayDates[dayIdx].toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
          : opts.dayYmd;
      const hasH = opts.hours > 0.001;
      const hoursFormatted = hasH ? formatEffortHoursLabel(opts.hours) : "—";
      setActiveHoverDetail({
        x,
        y,
        trackLabel,
        dayMeta,
        hoursFormatted,
        commentsText: opts.copyText,
      });
    },
    [dayYmcs, dayDates, projects, sessionsInWeek, tracks, integrations],
  );

  const handleCellHoverEnter = useCallback(
    (el: HTMLElement, opts: { trackId: string; dayYmd: string; hours: number; copyText: string }) => {
      if (closePopoverTimerRef.current) {
        clearTimeout(closePopoverTimerRef.current);
        closePopoverTimerRef.current = null;
      }
      showTimesheetCellPopover(el, opts);
    },
    [showTimesheetCellPopover],
  );

  const handleCellHoverEnd = useCallback(() => {
    if (closePopoverTimerRef.current) {
      clearTimeout(closePopoverTimerRef.current);
    }
    closePopoverTimerRef.current = setTimeout(() => {
      if (!isPopoverHoveredRef.current) {
        setActiveHoverDetail(null);
      }
      closePopoverTimerRef.current = null;
    }, 140);
  }, []);

  const handleTimesheetPopoverEnter = useCallback(() => {
    isPopoverHoveredRef.current = true;
    if (closePopoverTimerRef.current) {
      clearTimeout(closePopoverTimerRef.current);
      closePopoverTimerRef.current = null;
    }
  }, []);

  const handleTimesheetPopoverLeave = useCallback(() => {
    isPopoverHoveredRef.current = false;
    if (closePopoverTimerRef.current) {
      clearTimeout(closePopoverTimerRef.current);
    }
    closePopoverTimerRef.current = setTimeout(() => {
      if (!isPopoverHoveredRef.current) {
        setActiveHoverDetail(null);
      }
      closePopoverTimerRef.current = null;
    }, 140);
  }, []);

  const closeTimesheetPopover = useCallback(() => {
    setActiveHoverDetail(null);
    isPopoverHoveredRef.current = false;
  }, []);

  const toggleCommentsPopover = useCallback(() => {
    setCommentsPopoverEnabled((prev) => {
      const next = !prev;
      if (!next) {
        setActiveHoverDetail(null);
        isPopoverHoveredRef.current = false;
        if (closePopoverTimerRef.current) {
          clearTimeout(closePopoverTimerRef.current);
          closePopoverTimerRef.current = null;
        }
      }
      return next;
    });
  }, []);

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
        {!loading && !fetchError && trackRowIds.length > 0 ? (
          <button
            type="button"
            className="btn-cta-tertiary shrink-0 text-sm whitespace-nowrap"
            onClick={toggleCommentsPopover}
            aria-pressed={commentsPopoverEnabled}
          >
            {commentsPopoverEnabled ? "Hide Comments" : "Show Comments"}
          </button>
        ) : null}
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
              <tbody>
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
              </tbody>
            </table>
          </div>

          <div
            ref={tableBodyWrapRef}
            className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
          >
            <table className="w-full table-fixed border-collapse text-left text-sm">
              <TimesheetColGroup dayYmcs={dayYmcs} />
              <tbody>
              {trackRowIds.map((trackId, rowIndex) => {
                const sample = sessionsInWeek.find((s) => s.project_track_id === trackId);
                const byDay = hoursByTrackAndDay.get(trackId);
                const isLastRow = rowIndex === trackRowIds.length - 1;
                const rowFocused = focusedTrackId === trackId;
                return (
                  <tr key={trackId} onClick={() => setFocusedTrackId(trackId)}>
                    <td
                      className={`min-w-0 max-w-0 border-r px-1.5 py-1 align-top ${isLastRow ? "" : "border-b"}`}
                      style={{
                        borderColor: "var(--app-border)",
                        background: "var(--app-surface)",
                        boxShadow: timesheetRowFocusBoxShadow("worktag", rowFocused),
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
                      const isCopied = copiedCellKeys.has(cellKey);
                      const copyControlBg = isCopied
                        ? "var(--app-state-active-surface)"
                        : has
                          ? "var(--app-surface-alt)"
                          : "var(--app-surface)";

                      return (
                        <td
                          key={dayYmd}
                          className={`relative min-w-0 max-w-0 py-1.5 pl-2 pr-1 align-top ${isLastRow ? "" : "border-b"}`}
                          style={{
                            borderColor: "var(--app-border)",
                            background: isCopied
                              ? "var(--app-state-active-surface)"
                              : has
                                ? "var(--app-surface-alt)"
                                : "var(--app-surface)",
                            boxShadow: timesheetRowFocusBoxShadow("day", rowFocused),
                          }}
                          tabIndex={has || lines.length > 0 ? 0 : -1}
                          onMouseEnter={
                            commentsPopoverEnabled && lines.length > 0
                              ? (e) =>
                                  handleCellHoverEnter(e.currentTarget, {
                                    trackId,
                                    dayYmd,
                                    hours: h,
                                    copyText,
                                  })
                              : undefined
                          }
                          onMouseLeave={
                            commentsPopoverEnabled && lines.length > 0 ? handleCellHoverEnd : undefined
                          }
                        >
                          {isCopied && copyText ? (
                            <TimesheetCopiedIndicator
                              onClear={() => {
                                setCopiedCellKeys((prev) => {
                                  const next = new Set(prev);
                                  next.delete(cellKey);
                                  return next;
                                });
                              }}
                            />
                          ) : null}
                          <TimesheetDayCellBody
                            has={has}
                            hoursFormatted={formatEffortHoursLabel(h)}
                            linesLength={lines.length}
                            previewBody={previewBody}
                            copyText={copyText}
                            copyControlBg={copyControlBg}
                            isCopied={isCopied}
                            notice={
                              sum?.status === "ready" && sum.notice ? sum.notice : undefined
                            }
                            onCopy={() => {
                              void (async () => {
                                try {
                                  await navigator.clipboard.writeText(copyText);
                                  setCopiedCellKeys((prev) => {
                                    const next = new Set(prev);
                                    next.add(cellKey);
                                    return next;
                                  });
                                } catch {
                                  /* clipboard denied or unavailable */
                                }
                              })();
                            }}
                          />
                        </td>
                      );
                    })}
                    <td
                      className={`border-l px-0.5 py-1.5 text-center align-middle ${isLastRow ? "" : "border-b"}`}
                      style={{
                        borderColor: "var(--app-border)",
                        background: "var(--app-surface-alt)",
                        boxShadow: timesheetRowFocusBoxShadow("total", rowFocused),
                      }}
                      title="Total hours this week for this worktag"
                    >
                      <span className="tabular-nums text-xs font-semibold" style={{ color: "var(--app-text)" }}>
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
            {commentsPopoverEnabled && activeHoverDetail ? (
              <TimesheetCellDetailPopover
                active={activeHoverDetail}
                onPointerEnter={handleTimesheetPopoverEnter}
                onPointerLeave={handleTimesheetPopoverLeave}
                onClose={closeTimesheetPopover}
              />
            ) : null}
          </div>

          <div className="shrink-0 overflow-x-hidden border-t" style={{ borderColor: "var(--app-border)" }}>
            <table className="w-full table-fixed border-collapse text-left text-sm">
              <TimesheetColGroup dayYmcs={dayYmcs} />
              <tbody>
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
                    <span className="tabular-nums text-xs font-semibold" style={{ color: "var(--app-text)" }}>
                      {weekGrandTotal > 0.001 ? formatEffortHoursLabel(weekGrandTotal) : "—"}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
