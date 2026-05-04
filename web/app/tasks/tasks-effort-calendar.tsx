"use client";

import { CanvasArrowLeftIcon, CanvasArrowRightIcon } from "@/components/canvas-arrow-icons";
import { CanvasSelect, type CanvasSelectOption, type CanvasSelectSelectableOption } from "@/components/canvas-select";
import { DialogCloseButton } from "@/components/dialog-close-button";
import {
  ActualsCalendarGrid,
  MonthGrid,
  type CalendarBlock,
  type CalendarBlockStyle,
  formatDurationFromSlots,
  slotToLocalDateTime,
  slotToTimeLabel,
} from "@/components/effort-calendar-grids";
import {
  effortPeriodBounds,
  effortPeriodTotalHours,
  formatEffortHoursLabel,
  formatLocalYmd,
  localWeekDayStartsSunday,
  parseLocalYmd,
  startOfLocalWeekSunday,
  type EffortView,
} from "@/lib/integration-effort-buckets";
import {
  createTasksCalendarManualEntry,
  deleteTasksCalendarManualEntry,
  loadTasksCalendarSessions,
  rescheduleTasksCalendarSession,
  type TasksCalendarSession,
  updateTasksCalendarManualEntry,
} from "@/lib/actions/tasks-calendar";
import type { TasksFiltersValue } from "./tasks-filters";
import {
  type TasksPageProject,
  type TasksPageTrack,
} from "@/lib/tasks-page-shared";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const SLOT_MS = 15 * 60_000;

function clamp(n: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, n));
}

function addDaysYmd(ymd: string, delta: number): string {
  const d = parseLocalYmd(ymd);
  d.setDate(d.getDate() + delta);
  return formatLocalYmd(d);
}

function addMonthsYmd(ymd: string, delta: number): string {
  const d = parseLocalYmd(ymd);
  d.setMonth(d.getMonth() + delta);
  return formatLocalYmd(d);
}

function formatPeriodTitle(view: EffortView, anchorYmd: string): string {
  const anchor = parseLocalYmd(anchorYmd);
  if (Number.isNaN(anchor.getTime())) return anchorYmd;
  if (view === "day") {
    return anchor.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
  if (view === "week") {
    const start = startOfLocalWeekSunday(anchor);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const sameYear = start.getFullYear() === end.getFullYear();
    const optStart: Intl.DateTimeFormatOptions = sameYear
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" };
    const optEnd: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
    return `${start.toLocaleDateString(undefined, optStart)} – ${end.toLocaleDateString(undefined, optEnd)}`;
  }
  return anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

// ─── Block coloring ───────────────────────────────────────────────────────────

function projectBlockStyle(colorVar: string, shade: "dark" | "medium" | "light"): CalendarBlockStyle {
  const fillPct = shade === "light" ? 28 : shade === "medium" ? 22 : 16;
  const borderPct = shade === "light" ? 55 : shade === "medium" ? 45 : 35;
  const fillHoverPct = fillPct + 8;
  const borderHoverPct = borderPct + 12;
  return {
    background: `color-mix(in oklab, var(${colorVar}) ${fillPct}%, var(--app-surface))`,
    borderColor: `color-mix(in oklab, var(${colorVar}) ${borderPct}%, var(--app-border))`,
    hoverBackground: `color-mix(in oklab, var(${colorVar}) ${fillHoverPct}%, var(--app-surface))`,
    hoverBorderColor: `color-mix(in oklab, var(${colorVar}) ${borderHoverPct}%, var(--app-border))`,
  };
}

const FALLBACK_BLOCK_STYLE: CalendarBlockStyle = {
  background: "color-mix(in oklab, var(--app-info) 12%, white)",
  borderColor: "color-mix(in oklab, var(--app-action) 30%, var(--app-border) 70%)",
  hoverBackground: "color-mix(in oklab, var(--app-info) 16%, white)",
  hoverBorderColor: "color-mix(in oklab, var(--app-action) 45%, var(--app-border) 55%)",
};

// ─── Summary tiles ────────────────────────────────────────────────────────────

function IntegrationSummaryTiles({
  sessions,
  periodStart,
  periodEnd,
  projects,
  tracks,
}: {
  sessions: TasksCalendarSession[];
  periodStart: Date;
  periodEnd: Date;
  projects: TasksPageProject[];
  tracks: TasksPageTrack[];
}) {
  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project] as const)),
    [projects],
  );
  const trackById = useMemo(
    () => new Map(tracks.map((track) => [track.id, track] as const)),
    [tracks],
  );
  const [expanded, setExpanded] = useState(false);

  const tileStyleForTrack = useCallback(
    (trackId: string): { borderColor: string; background: string; valueColor: string } => {
      const track = trackById.get(trackId);
      const projectColorVar = track?.projectId ? projectById.get(track.projectId)?.colorVar : null;
      if (!projectColorVar) {
        return {
          borderColor: "var(--app-border)",
          background: "var(--app-surface-alt)",
          valueColor: "var(--app-action)",
        };
      }
      return {
        borderColor: `color-mix(in oklab, var(${projectColorVar}) 36%, var(--app-border))`,
        background: `color-mix(in oklab, var(${projectColorVar}) 16%, var(--app-surface-alt))`,
        valueColor: `color-mix(in oklab, var(${projectColorVar}) 64%, var(--app-action))`,
      };
    },
    [projectById, trackById],
  );

  const totalsByTrack = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessions) {
      const dh = Number(s.duration_hours);
      if (!Number.isFinite(dh) || dh <= 0) continue;
      // Overlap check
      const a = new Date(s.started_at).getTime();
      const b = new Date(s.finished_at).getTime();
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      if (a >= periodEnd.getTime() || b <= periodStart.getTime()) continue;
      map.set(s.project_track_id, (map.get(s.project_track_id) ?? 0) + dh);
    }
    return map;
  }, [sessions, periodStart, periodEnd]);

  const projectRows = useMemo(() => {
    const rows = new Map<string, { total: number; tracks: Array<{ trackId: string; hours: number }> }>();
    for (const [trackId, hours] of totalsByTrack.entries()) {
      const track = trackById.get(trackId);
      if (!track || hours <= 0) continue;
      const current = rows.get(track.projectId);
      if (current) {
        current.total += hours;
        current.tracks.push({ trackId, hours });
      } else {
        rows.set(track.projectId, { total: hours, tracks: [{ trackId, hours }] });
      }
    }
    return Array.from(rows.entries())
      .map(([projectId, data]) => ({
        projectId,
        projectName: projectById.get(projectId)?.name ?? "Project",
        total: data.total,
        tracks: data.tracks.sort((a, b) => b.hours - a.hours),
      }))
      .sort((a, b) => b.total - a.total);
  }, [projectById, totalsByTrack, trackById]);

  if (projectRows.length === 0) {
    return (
      <p className="text-sm text-muted-canvas">No time logged for this period.</p>
    );
  }

  return (
    <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-alt)" }}>
      <button
        type="button"
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-canvas transition-colors hover:text-[var(--app-text)]"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <svg
          viewBox="0 0 20 20"
          width={12}
          height={12}
          aria-hidden
          className="shrink-0 transition-transform"
          style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          <path
            d="M7 4l6 6-6 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {expanded ? "Hide hours breakdown" : "Show hours breakdown"}
      </button>

      {expanded ? (
        <div className="mt-2 space-y-1.5">
          {projectRows.map((row) => (
            <div key={row.projectId} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[11px] font-semibold" style={{ color: "var(--app-text)" }}>
                {row.projectName}
                <span className="ml-1 font-semibold tabular-nums text-muted-canvas">
                  ({formatEffortHoursLabel(row.total)})
                </span>
              </span>
              {row.tracks.map(({ trackId, hours }) => {
                const tileStyle = tileStyleForTrack(trackId);
                const label = trackById.get(trackId)?.label ?? "Track";
                return (
                  <div
                    key={trackId}
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1"
                    style={{ borderColor: tileStyle.borderColor, background: tileStyle.background }}
                  >
                    <span className="max-w-[12rem] truncate text-[11px] font-medium text-muted-canvas" title={label}>
                      {label}
                    </span>
                    <span className="text-[11px] font-semibold tabular-nums" style={{ color: tileStyle.valueColor }}>
                      {formatEffortHoursLabel(hours)}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ─── Detail popover ───────────────────────────────────────────────────────────

type ActiveBlock = {
  block: CalendarBlock;
  session: TasksCalendarSession | null;
  x: number;
  y: number;
};

function BlockDetailPopover({
  active,
  onPointerEnter,
  onPointerLeave,
  onClose,
}: {
  active: ActiveBlock;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  onClose: () => void;
}) {
  const { block, session } = active;
  const dayStart = parseLocalYmd(block.dayYmd).getTime();
  const t0 = new Date(dayStart + block.startMsInDay);
  const t1 = new Date(dayStart + block.endMsInDay);
  const timeLabel = `${t0.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}–${t1.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  const manualTypeLabel =
    block.source === "manual"
      ? `(${block.entry_type === "meeting" ? "meeting" : "task"})`
      : null;

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
      aria-label="Session details"
      onMouseEnter={onPointerEnter}
      onMouseLeave={onPointerLeave}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug" style={{ color: "var(--app-text)" }}>
            {block.title || "Task"}{" "}
            {manualTypeLabel ? (
              <span className="font-normal text-muted-canvas">{manualTypeLabel}</span>
            ) : null}
          </p>
          {session ? (
            <p className="mt-0.5 truncate text-xs text-muted-canvas" title={session.project_name}>
              {session.project_name}
              {session.integration_label ? ` · ${session.integration_label}` : ""}
            </p>
          ) : null}
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
        {timeLabel} ·{" "}
        <span className="font-medium" style={{ color: "var(--app-text)" }}>
          {formatEffortHoursLabel(block.duration_hours)}
        </span>
      </p>

      {block.work_accomplished?.trim() ? (
        <div className="mt-3">
          <p className="text-xs font-medium text-muted-canvas">Work accomplished</p>
          <p className="mt-1 text-sm" style={{ color: "var(--app-text)" }}>
            {block.work_accomplished.trim()}
          </p>
        </div>
      ) : null}

      {session?.integration_href ? (
        <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--app-border)" }}>
          <Link
            href={session.integration_href}
            className="inline-flex items-center gap-1 text-xs font-medium transition-colors hover:underline"
            style={{ color: "var(--app-action)" }}
          >
            {session.integration_href_label}
            <svg viewBox="0 0 24 24" width={12} height={12} aria-hidden>
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"
              />
            </svg>
          </Link>
        </div>
      ) : null}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TasksEffortCalendar({
  scope,
  anchorYmd,
  onScopeChange,
  onAnchorChange,
  filters,
  projects,
  tracks,
  lastUsedIntegrationId,
  onRememberIntegration,
}: {
  scope: EffortView;
  anchorYmd: string;
  onScopeChange: (scope: EffortView) => void;
  onAnchorChange: (ymd: string) => void;
  filters: TasksFiltersValue;
  projects: TasksPageProject[];
  tracks: TasksPageTrack[];
  lastUsedIntegrationId: string | null;
  onRememberIntegration: (projectTrackId: string) => void;
}) {
  const anchorDate = useMemo(() => parseLocalYmd(anchorYmd), [anchorYmd]);

  // Period bounds for the current view/anchor
  const { start: periodStart, endExclusive: periodEnd } = useMemo(
    () => effortPeriodBounds(scope, anchorDate),
    [scope, anchorDate],
  );

  // Week grid columns (Sun-based to match the existing integration view)
  const weekDays = useMemo(() => {
    const sun = startOfLocalWeekSunday(anchorDate);
    return localWeekDayStartsSunday(sun);
  }, [anchorDate]);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const [allSessions, setAllSessions] = useState<TasksCalendarSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Cache by "startIso|endIso" so navigating inside the cached window is instant
  const sessionCache = useRef<Map<string, TasksCalendarSession[]>>(new Map());

  // Determine the fetch window: current period + one period pad on each side
  const fetchWindow = useMemo(() => {
    const padMs = scope === "month" ? 31 * DAY_MS : scope === "week" ? 7 * DAY_MS : DAY_MS;
    const start = new Date(periodStart.getTime() - padMs);
    const end = new Date(periodEnd.getTime() + padMs);
    return {
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      cacheKey: `${start.toISOString()}|${end.toISOString()}`,
    };
  }, [periodStart, periodEnd, scope]);

  useEffect(() => {
    const { startIso, endIso, cacheKey } = fetchWindow;
    const cached = sessionCache.current.get(cacheKey);
    if (cached) {
      setAllSessions(cached);
      setLoading(false);
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

  // ── Filter sessions ────────────────────────────────────────────────────────
  const filteredSessions = useMemo(() => {
    return allSessions.filter((s) => {
      if (filters.projectId && s.project_id !== filters.projectId) return false;
      if (filters.projectTrackId && s.project_track_id !== filters.projectTrackId) return false;
      // When a priority filter is active, exclude manual entries (meetings/tasks have no task priority)
      if (filters.priority) {
        if (s.task_priority !== filters.priority) return false;
      }
      const q = filters.search.trim().toLowerCase();
      if (q && !s.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allSessions, filters]);

  const periodHours = useMemo(
    () => effortPeriodTotalHours(filteredSessions, periodStart, periodEnd),
    [filteredSessions, periodStart, periodEnd],
  );

  // ── Block coloring ─────────────────────────────────────────────────────────
  const sessionBySourceId = useMemo(() => {
    const map = new Map<string, TasksCalendarSession>();
    for (const s of filteredSessions) map.set(s.source_id, s);
    return map;
  }, [filteredSessions]);

  const blockStyleFor = useCallback(
    (block: CalendarBlock): CalendarBlockStyle => {
      if (block.colorMeta) {
        return projectBlockStyle(block.colorMeta.colorVar, block.colorMeta.shade);
      }
      return FALLBACK_BLOCK_STYLE;
    },
    [],
  );

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p] as const)), [projects]);
  const trackById = useMemo(() => new Map(tracks.map((t) => [t.id, t] as const)), [tracks]);

  const defaultTrackFromSessions = useMemo(() => {
    const scoped = filters.projectId
      ? filteredSessions.filter((s) => s.project_id === filters.projectId)
      : filteredSessions;
    if (scoped.length === 0) return null;
    const sorted = [...scoped].sort(
      (a, b) =>
        new Date(b.finished_at).getTime() -
        new Date(a.finished_at).getTime(),
    );
    return sorted[0]?.project_track_id ?? null;
  }, [filteredSessions, filters.projectId]);

  const createDialogRef = useRef<HTMLDialogElement | null>(null);
  const deleteDialogRef = useRef<HTMLDialogElement | null>(null);
  const [deleteContext, setDeleteContext] = useState<{
    manualEntryId: string;
    title: string;
    durationLabel: string;
  } | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const timeOptions = useMemo((): { start: CanvasSelectOption[]; end: CanvasSelectOption[] } => {
    const start: CanvasSelectOption[] = [];
    for (let i = 0; i < 96; i++) start.push({ value: String(i), label: slotToTimeLabel(i) });
    const end: CanvasSelectOption[] = [];
    for (let i = 1; i < 96; i++) end.push({ value: String(i), label: slotToTimeLabel(i) });
    return { start, end };
  }, []);

  const scopedProjects = useMemo(
    () => (filters.projectId ? projects.filter((p) => p.id === filters.projectId) : projects),
    [filters.projectId, projects],
  );
  const scopedTracks = useMemo(
    () => (filters.projectId ? tracks.filter((track) => track.projectId === filters.projectId) : tracks),
    [filters.projectId, tracks],
  );
  const projectOptions = useMemo(
    () => scopedProjects.map((p) => ({ value: p.id, label: p.name })),
    [scopedProjects],
  );
  const trackOptionsForProject = useCallback(
    (projectId: string): CanvasSelectOption[] => {
      const projectTrackOptions: CanvasSelectSelectableOption[] = scopedTracks
        .filter((track) => track.projectId === projectId)
        .map((track) => ({
          value: track.id,
          label: track.label,
        }));
      return projectTrackOptions;
    },
    [scopedTracks],
  );

  const [createDraft, setCreateDraft] = useState<{
    mode: "create" | "edit";
    manualEntryId: string | null;
    dayYmd: string;
    startSlot: number;
    endSlot: number;
    selectedProjectId: string;
    projectTrackId: string;
    entry_type: "task" | "meeting";
    title: string;
    work_accomplished: string;
    saving: boolean;
    error: string | null;
  } | null>(null);
  const [calendarActionError, setCalendarActionError] = useState<string | null>(null);

  const resetAndReload = useCallback(async () => {
    sessionCache.current.clear();
    setLoading(true);
    setFetchError(null);
    const { startIso, endIso, cacheKey } = fetchWindow;
    const res = await loadTasksCalendarSessions(startIso, endIso);
    if (res.error) {
      setFetchError(res.error);
      setLoading(false);
      return;
    }
    const sessions = res.sessions ?? [];
    sessionCache.current.set(cacheKey, sessions);
    setAllSessions(sessions);
    setLoading(false);
  }, [fetchWindow]);

  const resolveDefaultSelection = useCallback((): { selectedProjectId: string; projectTrackId: string } => {
    const fallbackProjectId = scopedProjects[0]?.id ?? "";
    if (filters.projectTrackId) {
      const selectedTrack = trackById.get(filters.projectTrackId);
      if (selectedTrack && scopedTracks.some((track) => track.id === selectedTrack.id)) {
        return {
          selectedProjectId: selectedTrack.projectId ?? fallbackProjectId,
          projectTrackId: selectedTrack.id,
        };
      }
    }
    if (lastUsedIntegrationId && scopedTracks.some((track) => track.id === lastUsedIntegrationId)) {
      const selectedProjectId = trackById.get(lastUsedIntegrationId)?.projectId ?? fallbackProjectId;
      return {
        selectedProjectId,
        projectTrackId: lastUsedIntegrationId,
      };
    }
    if (defaultTrackFromSessions && scopedTracks.some((track) => track.id === defaultTrackFromSessions)) {
      const selectedProjectId = trackById.get(defaultTrackFromSessions)?.projectId ?? fallbackProjectId;
      return {
        selectedProjectId,
        projectTrackId: defaultTrackFromSessions,
      };
    }
    const firstTrack = scopedTracks[0] ?? null;
    if (firstTrack) {
      return {
        selectedProjectId: firstTrack.projectId,
        projectTrackId: firstTrack.id,
      };
    }
    return {
      selectedProjectId: fallbackProjectId,
      projectTrackId: "",
    };
  }, [
    defaultTrackFromSessions,
    filters.projectTrackId,
    scopedTracks,
    scopedProjects,
    trackById,
    lastUsedIntegrationId,
  ]);

  const openCreateModal = useCallback(
    (dayYmd: string, startSlot: number) => {
      if (scopedTracks.length === 0) {
        setCalendarActionError("Create a track first before adding calendar entries.");
        return;
      }
      const defaults = resolveDefaultSelection();
      setCalendarActionError(null);
      const start = clamp(startSlot, 0, 95);
      const end = clamp(start + 2, 1, 95);
      setCreateDraft({
        mode: "create",
        manualEntryId: null,
        dayYmd,
        startSlot: start,
        endSlot: end,
        selectedProjectId: defaults.selectedProjectId,
        projectTrackId: defaults.projectTrackId,
        entry_type: "meeting",
        title: "",
        work_accomplished: "",
        saving: false,
        error: null,
      });
      requestAnimationFrame(() => createDialogRef.current?.showModal());
    },
    [resolveDefaultSelection, scopedTracks.length],
  );

  const openEditManualModal = useCallback(
    (block: CalendarBlock, session: TasksCalendarSession | null) => {
      if (!session) return;
      const startSlot = clamp(Math.round(block.startMsInDay / SLOT_MS), 0, 95);
      const endSlot = clamp(Math.round(block.endMsInDay / SLOT_MS), 1, 95);
      setCalendarActionError(null);
      setCreateDraft({
        mode: "edit",
        manualEntryId: block.source_id,
        dayYmd: block.dayYmd,
        startSlot,
        endSlot: Math.max(endSlot, startSlot + 1),
        selectedProjectId: session.project_id,
        projectTrackId: session.project_track_id,
        entry_type: block.entry_type === "meeting" ? "meeting" : "task",
        title: block.title ?? "",
        work_accomplished: block.work_accomplished ?? "",
        saving: false,
        error: null,
      });
      requestAnimationFrame(() => createDialogRef.current?.showModal());
    },
    [],
  );

  const closeCreateModal = useCallback(() => {
    createDialogRef.current?.close();
  }, []);

  const saveCreate = useCallback(async () => {
    if (!createDraft) return;
    if (createDraft.saving) return;
    const title = createDraft.title.trim();
    if (!title) {
      setCreateDraft((prev) => (prev ? { ...prev, error: "Title is required" } : prev));
      return;
    }
    if (!createDraft.selectedProjectId) {
      setCreateDraft((prev) => (prev ? { ...prev, error: "Choose a project" } : prev));
      return;
    }
    if (!createDraft.projectTrackId) {
      setCreateDraft((prev) => (prev ? { ...prev, error: "Choose a track" } : prev));
      return;
    }
    if (createDraft.endSlot <= createDraft.startSlot) {
      setCreateDraft((prev) =>
        prev ? { ...prev, error: "End time must be after start time" } : prev,
      );
      return;
    }

    setCreateDraft((prev) => (prev ? { ...prev, saving: true, error: null } : prev));
    setCalendarActionError(null);
    const started = slotToLocalDateTime(createDraft.dayYmd, createDraft.startSlot);
    const finished = slotToLocalDateTime(createDraft.dayYmd, clamp(createDraft.endSlot, 1, 95));

    const res =
      createDraft.mode === "edit" && createDraft.manualEntryId
        ? await updateTasksCalendarManualEntry({
            project_track_id: createDraft.projectTrackId,
            manual_entry_id: createDraft.manualEntryId,
            entry_type: createDraft.entry_type,
            title,
            started_at: started.toISOString(),
            finished_at: finished.toISOString(),
            work_accomplished: createDraft.work_accomplished.trim()
              ? createDraft.work_accomplished.trim()
              : null,
          })
        : await createTasksCalendarManualEntry({
            project_track_id: createDraft.projectTrackId,
            entry_type: createDraft.entry_type,
            title,
            started_at: started.toISOString(),
            finished_at: finished.toISOString(),
            work_accomplished: createDraft.work_accomplished.trim()
              ? createDraft.work_accomplished.trim()
              : null,
          });

    if (res.error) {
      setCreateDraft((prev) => (prev ? { ...prev, saving: false, error: res.error ?? "Could not save" } : prev));
      return;
    }

    onRememberIntegration(createDraft.projectTrackId);
    closeCreateModal();
    await resetAndReload();
  }, [closeCreateModal, createDraft, onRememberIntegration, resetAndReload]);

  const openDeleteConfirm = useCallback(() => {
    if (!createDraft || createDraft.mode !== "edit" || !createDraft.manualEntryId) return;
    setDeleteContext({
      manualEntryId: createDraft.manualEntryId,
      title: createDraft.title.trim() || (createDraft.entry_type === "meeting" ? "Meeting" : "Task"),
      durationLabel: formatDurationFromSlots(createDraft.startSlot, createDraft.endSlot),
    });
    setDeleteError(null);
    requestAnimationFrame(() => deleteDialogRef.current?.showModal());
  }, [createDraft]);

  const closeDeleteConfirm = useCallback(() => {
    deleteDialogRef.current?.close();
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteContext) return;
    if (deletePending) return;
    setDeletePending(true);
    setDeleteError(null);
    const res = await deleteTasksCalendarManualEntry({
      manual_entry_id: deleteContext.manualEntryId,
    });
    setDeletePending(false);
    if (res.error) {
      setDeleteError(res.error);
      return;
    }
    deleteDialogRef.current?.close();
    closeCreateModal();
    await resetAndReload();
  }, [closeCreateModal, deleteContext, deletePending, resetAndReload]);

  // ── Detail popover ─────────────────────────────────────────────────────────
  const gridWrapRef = useRef<HTMLDivElement>(null);
  const [activeBlock, setActiveBlock] = useState<ActiveBlock | null>(null);
  const closePopoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPopoverHoveredRef = useRef(false);
  const POPOVER_W = 320;
  const POPOVER_GAP = 10;

  const showDetailPopover = useCallback(
    (block: CalendarBlock, el?: HTMLElement) => {
      const session = sessionBySourceId.get(block.source_id) ?? null;
      const wrap = gridWrapRef.current;
      let x = 24;
      let y = 24;
      if (wrap && el) {
        const wr = wrap.getBoundingClientRect();
        const br = el.getBoundingClientRect();
        const rightX = br.right - wr.left + wrap.scrollLeft + POPOVER_GAP;
        const leftX = br.left - wr.left + wrap.scrollLeft - POPOVER_W - POPOVER_GAP;
        const maxX = wrap.scrollLeft + wr.width - POPOVER_W - 8;
        x = Math.max(8, Math.min(maxX, rightX <= maxX ? rightX : leftX));
        y = Math.max(
          wrap.scrollTop + 8,
          Math.min(
            wrap.scrollTop + wr.height - 180,
            br.top - wr.top + wrap.scrollTop - 8,
          ),
        );
      } else if (wrap) {
        const wr = wrap.getBoundingClientRect();
        x = Math.min(wr.width - 340, Math.max(16, wr.width / 2 - 160));
        y = 60;
      }
      setActiveBlock({ block, session, x, y });
    },
    [sessionBySourceId],
  );

  const handleBlockHover = useCallback(
    (block: CalendarBlock, el: HTMLElement) => {
      if (closePopoverTimerRef.current) {
        clearTimeout(closePopoverTimerRef.current);
        closePopoverTimerRef.current = null;
      }
      showDetailPopover(block, el);
    },
    [showDetailPopover],
  );

  const handleBlockHoverEnd = useCallback(() => {
    if (closePopoverTimerRef.current) {
      clearTimeout(closePopoverTimerRef.current);
    }
    closePopoverTimerRef.current = setTimeout(() => {
      if (!isPopoverHoveredRef.current) {
        setActiveBlock(null);
      }
      closePopoverTimerRef.current = null;
    }, 140);
  }, []);

  const handlePopoverEnter = useCallback(() => {
    isPopoverHoveredRef.current = true;
    if (closePopoverTimerRef.current) {
      clearTimeout(closePopoverTimerRef.current);
      closePopoverTimerRef.current = null;
    }
  }, []);

  const handlePopoverLeave = useCallback(() => {
    isPopoverHoveredRef.current = false;
    setActiveBlock(null);
  }, []);

  const handleBlockClick = useCallback(
    (block: CalendarBlock) => {
      const session = sessionBySourceId.get(block.source_id) ?? null;
      if (block.source === "manual") {
        openEditManualModal(block, session);
        setActiveBlock(null);
        return;
      }
      showDetailPopover(block);
    },
    [openEditManualModal, sessionBySourceId, showDetailPopover],
  );

  const handleBlockDrop = useCallback(
    async (block: CalendarBlock, target: { dayYmd: string; startSlot: number }) => {
      const targetStart = slotToLocalDateTime(target.dayYmd, target.startSlot);
      const originalStart = slotToLocalDateTime(
        block.dayYmd,
        clamp(Math.round(block.startMsInDay / SLOT_MS), 0, 95),
      );
      const originalEnd = slotToLocalDateTime(
        block.dayYmd,
        clamp(Math.round(block.endMsInDay / SLOT_MS), 1, 95),
      );
      const durationMs = originalEnd.getTime() - originalStart.getTime();
      if (durationMs <= 0) return;
      const nextEnd = new Date(targetStart.getTime() + durationMs);

      const previous = allSessions;
      setCalendarActionError(null);
      setAllSessions((prev) =>
        prev.map((s) => {
          if (s.source_id !== block.source_id) return s;
          return {
            ...s,
            started_at: targetStart.toISOString(),
            finished_at: nextEnd.toISOString(),
          };
        }),
      );

      const res = await rescheduleTasksCalendarSession({
        source: block.source,
        source_id: block.source_id,
        started_at: targetStart.toISOString(),
      });
      if (res.error) {
        setAllSessions(previous);
        setCalendarActionError(res.error);
        return;
      }
      await resetAndReload();
    },
    [allSessions, resetAndReload],
  );

  // ── Navigation ─────────────────────────────────────────────────────────────
  const goPrev = () => {
    if (scope === "day") onAnchorChange(addDaysYmd(anchorYmd, -1));
    else if (scope === "week") onAnchorChange(addDaysYmd(anchorYmd, -7));
    else onAnchorChange(addMonthsYmd(anchorYmd, -1));
  };

  const goNext = () => {
    if (scope === "day") onAnchorChange(addDaysYmd(anchorYmd, 1));
    else if (scope === "week") onAnchorChange(addDaysYmd(anchorYmd, 7));
    else onAnchorChange(addMonthsYmd(anchorYmd, 1));
  };

  const goToday = () => onAnchorChange(formatLocalYmd(new Date()));

  // ── Segmented control ──────────────────────────────────────────────────────
  const viewSegIndex = scope === "day" ? 0 : scope === "week" ? 1 : 2;
  const viewSegWidthPx = 76;

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar: scope tabs + nav */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <div
            role="tablist"
            aria-label="Calendar scope"
            className="inline-flex relative overflow-visible rounded-[10px] border"
            style={{ borderColor: "var(--app-border)", background: "var(--app-surface-alt)" }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-y-px left-0 z-[1] rounded-[10px]"
              style={{
                width: viewSegWidthPx,
                transform: `translateX(${viewSegIndex * viewSegWidthPx}px)`,
                transition: "transform 180ms cubic-bezier(0.2, 0, 0.2, 1)",
                background: "#1f2937",
                boxShadow: "0 0 0 2px color-mix(in oklab, var(--app-border) 70%, white)",
              }}
            />
            {(["day", "week", "month"] as EffortView[]).map((v, i) => {
              const active = scope === v;
              const pos = i === 0 ? "rounded-l-[10px]" : i === 2 ? "rounded-r-[10px]" : "";
              return (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={[
                    "relative z-[2] inline-flex h-8 w-[4.75rem] items-center justify-center px-3 text-center text-xs transition-colors cursor-pointer",
                    active
                      ? "font-semibold text-[#f3f5f8]"
                      : "font-normal text-muted-canvas hover:text-[var(--app-text)]",
                    pos,
                  ].join(" ")}
                  onClick={() => onScopeChange(v)}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              );
            })}
          </div>

          <div
            className="ml-1 inline-flex overflow-hidden rounded-[10px] border"
            style={{ borderColor: "var(--app-border)", background: "var(--app-surface-alt)" }}
          >
            <button
              type="button"
              className="inline-flex h-8 w-9 shrink-0 cursor-pointer items-center justify-center text-[var(--app-text)] transition-colors hover:bg-[color-mix(in_oklab,var(--app-surface-alt)_90%,var(--app-border))]"
              aria-label="Previous period"
              onClick={goPrev}
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
              aria-label="Next period"
              onClick={goNext}
            >
              <CanvasArrowRightIcon />
            </button>
          </div>
        </div>

        <p className="self-end pb-0.5 text-sm text-muted-canvas">
          {scope === "day" ? "This day" : scope === "week" ? "This week" : "This month"}:{" "}
          <strong className="font-semibold tabular-nums" style={{ color: "var(--app-text)" }}>
            {loading ? "…" : formatEffortHoursLabel(periodHours)}
          </strong>
        </p>
      </div>

      {/* Summary tiles */}
      {loading ? (
        <SummaryTilesSkeleton />
      ) : fetchError ? (
        <p className="text-sm" style={{ color: "var(--app-danger)" }}>
          Could not load sessions: {fetchError}
        </p>
      ) : (
        <IntegrationSummaryTiles
          sessions={filteredSessions}
          periodStart={periodStart}
          periodEnd={periodEnd}
          projects={projects}
          tracks={tracks}
        />
      )}
      {calendarActionError ? (
        <p className="text-sm" style={{ color: "var(--app-danger)" }} role="alert">
          {calendarActionError}
        </p>
      ) : null}

      {/* Calendar grid */}
      <div className="relative" ref={gridWrapRef}>
        {loading ? (
          <CalendarGridSkeleton />
        ) : (
          <>
            {scope === "day" ? (
              <ActualsCalendarGrid
                days={[anchorDate]}
                sessions={filteredSessions}
                blockStyleFor={blockStyleFor}
                onDayColumnClick={openCreateModal}
                onBlockHover={handleBlockHover}
                onBlockHoverEnd={handleBlockHoverEnd}
                onBlockClick={handleBlockClick}
                onBlockDrop={handleBlockDrop}
              />
            ) : null}

            {scope === "week" ? (
              <ActualsCalendarGrid
                days={weekDays}
                sessions={filteredSessions}
                blockStyleFor={blockStyleFor}
                onDayColumnClick={openCreateModal}
                onBlockHover={handleBlockHover}
                onBlockHoverEnd={handleBlockHoverEnd}
                onBlockClick={handleBlockClick}
                onBlockDrop={handleBlockDrop}
              />
            ) : null}

            {scope === "month" ? (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mb-2 flex flex-col gap-2">
                  <div
                    className="w-full rounded-md border px-3 py-2 text-center"
                    style={{
                      borderColor: "var(--app-border)",
                      background: "var(--app-surface-muted-solid)",
                    }}
                  >
                    <p
                      className="text-sm font-medium tabular-nums"
                      style={{ color: "var(--app-text)" }}
                    >
                      {formatPeriodTitle("month", anchorYmd)}
                    </p>
                  </div>
                </div>
                <MonthGrid anchorYmd={anchorYmd} sessions={filteredSessions} />
              </div>
            ) : null}

            {/* Detail popover */}
            {activeBlock ? (
              <BlockDetailPopover
                active={activeBlock}
                onPointerEnter={handlePopoverEnter}
                onPointerLeave={handlePopoverLeave}
                onClose={() => setActiveBlock(null)}
              />
            ) : null}
          </>
        )}
      </div>

      <dialog
        ref={createDialogRef}
        className="app-catalog-dialog fixed left-1/2 top-1/2 z-[220] w-[min(100vw-2rem,38rem)] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden border-0 p-0 shadow-xl"
        style={{ borderRadius: "12px", background: "var(--app-surface)", color: "var(--app-text)" }}
        onClose={(e) => {
          if (e.target !== createDialogRef.current) return;
          setCreateDraft(null);
        }}
      >
        <div className="flex max-h-[min(calc(100dvh-2rem),44rem)] min-h-0 flex-col">
          <div
            className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3"
            style={{ borderColor: "var(--app-border)" }}
          >
            <div className="min-w-0 flex-1 pr-2">
              <h2 className="text-base font-semibold" style={{ color: "var(--app-text)" }}>
                {createDraft?.mode === "edit" ? "Edit Entry" : "Add Task or Meeting"}
              </h2>
              {createDraft ? (
                <p className="mt-0.5 truncate text-sm text-muted-canvas">
                  {(projectById.get(createDraft.selectedProjectId)?.name ?? "Project") +
                    " · " +
                    (trackById.get(createDraft.projectTrackId)?.label ?? "Track")}
                </p>
              ) : null}
            </div>
            <DialogCloseButton onClick={closeCreateModal} />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-5">
            {!createDraft ? null : (
              <div className="grid grid-cols-1 gap-3">
                <label
                  className="canvas-select-field flex flex-col gap-1 text-xs"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  Project
                  <CanvasSelect
                    name="tasks_calendar_manual_entry_project"
                    options={projectOptions}
                    value={createDraft.selectedProjectId}
                    onValueChange={(projectId) => {
                      const nextTrackId =
                        scopedTracks.find((track) => track.projectId === projectId)?.id ?? "";
                      setCreateDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              selectedProjectId: projectId,
                              projectTrackId: nextTrackId,
                              error: null,
                            }
                          : prev,
                      );
                    }}
                  />
                </label>

                <label
                  className="canvas-select-field flex flex-col gap-1 text-xs"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  Track
                  <CanvasSelect
                    name="tasks_calendar_manual_entry_track"
                    options={
                      trackOptionsForProject(createDraft.selectedProjectId).length > 0
                        ? trackOptionsForProject(createDraft.selectedProjectId)
                        : [{ value: "", label: "No tracks for selected project" }]
                    }
                    value={createDraft.projectTrackId}
                    onValueChange={(v) => {
                      if (v) onRememberIntegration(v);
                      setCreateDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              selectedProjectId: trackById.get(v)?.projectId ?? prev.selectedProjectId,
                              projectTrackId: v,
                              error: null,
                            }
                          : prev,
                      );
                    }}
                  />
                </label>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <label className="text-xs font-medium text-muted-canvas sm:flex-1">
                    Title
                    <input
                      className="input-canvas mt-1 h-9 w-full text-sm placeholder:text-sm placeholder:font-normal placeholder:text-muted-canvas"
                      value={createDraft.title}
                      onChange={(e) =>
                        setCreateDraft((prev) =>
                          prev ? { ...prev, title: e.target.value, error: null } : prev,
                        )
                      }
                      placeholder={createDraft.entry_type === "meeting" ? "e.g. Weekly sync" : "e.g. Fix auth bug"}
                      autoComplete="off"
                    />
                  </label>

                  <div className="flex flex-col gap-1 sm:shrink-0">
                    <p className="text-xs font-medium text-muted-canvas">Type</p>
                    <div
                      role="tablist"
                      aria-label="Manual entry type"
                      className="inline-flex relative overflow-visible rounded-[10px] border"
                      style={{ borderColor: "var(--app-border)", background: "var(--app-surface-alt)" }}
                    >
                      <div
                        aria-hidden
                        className="pointer-events-none absolute -inset-y-px left-0 z-[1] rounded-[10px]"
                        style={{
                          width: 96,
                          transform: `translateX(${createDraft.entry_type === "meeting" ? 0 : 96}px)`,
                          transition: "transform 180ms cubic-bezier(0.2, 0, 0.2, 1)",
                          background: "#1f2937",
                          boxShadow: "0 0 0 2px color-mix(in oklab, var(--app-border) 70%, white)",
                        }}
                      />
                      <button
                        type="button"
                        role="tab"
                        aria-selected={createDraft.entry_type === "meeting"}
                        className={[
                          "relative z-[2] inline-flex h-9 w-24 items-center justify-center px-3 text-center text-xs transition-colors cursor-pointer",
                          createDraft.entry_type === "meeting"
                            ? "font-semibold text-[#f3f5f8]"
                            : "font-normal text-muted-canvas hover:text-[var(--app-text)]",
                          "rounded-l-[10px]",
                        ].join(" ")}
                        onClick={() =>
                          setCreateDraft((prev) => (prev ? { ...prev, entry_type: "meeting" } : prev))
                        }
                      >
                        Meeting
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={createDraft.entry_type === "task"}
                        className={[
                          "relative z-[2] inline-flex h-9 w-24 items-center justify-center px-3 text-center text-xs transition-colors cursor-pointer",
                          createDraft.entry_type === "task"
                            ? "font-semibold text-[#f3f5f8]"
                            : "font-normal text-muted-canvas hover:text-[var(--app-text)]",
                          "rounded-r-[10px]",
                        ].join(" ")}
                        onClick={() =>
                          setCreateDraft((prev) => (prev ? { ...prev, entry_type: "task" } : prev))
                        }
                      >
                        Task
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="canvas-select-field flex flex-col gap-1 text-xs" style={{ color: "var(--app-text-muted)" }}>
                    Start Time
                    <CanvasSelect
                      name="tasks_calendar_manual_entry_started_slot"
                      options={timeOptions.start}
                      value={String(createDraft.startSlot)}
                      onValueChange={(v) => {
                        const startSlot = Number(v);
                        setCreateDraft((prev) => {
                          if (!prev) return prev;
                          const endSlot = prev.endSlot <= startSlot ? Math.min(startSlot + 1, 95) : prev.endSlot;
                          return { ...prev, startSlot, endSlot, error: null };
                        });
                      }}
                    />
                  </label>

                  <label className="canvas-select-field flex flex-col gap-1 text-xs" style={{ color: "var(--app-text-muted)" }}>
                    End Time
                    <CanvasSelect
                      name="tasks_calendar_manual_entry_finished_slot"
                      options={timeOptions.end}
                      value={String(createDraft.endSlot)}
                      onValueChange={(v) =>
                        setCreateDraft((prev) => (prev ? { ...prev, endSlot: Number(v), error: null } : prev))
                      }
                    />
                  </label>
                </div>

                <p className="-mt-1 text-xs text-muted-canvas">
                  Duration:{" "}
                  <span className="font-medium" style={{ color: "var(--app-text)" }}>
                    {formatDurationFromSlots(createDraft.startSlot, createDraft.endSlot)}
                  </span>
                </p>

                <label className="mt-7 text-xs font-medium text-muted-canvas">
                  Work Accomplished
                  <textarea
                    className="input-canvas mt-1 w-full resize-y p-2 text-sm"
                    rows={5}
                    value={createDraft.work_accomplished}
                    onChange={(e) =>
                      setCreateDraft((prev) =>
                        prev ? { ...prev, work_accomplished: e.target.value, error: null } : prev,
                      )
                    }
                    placeholder="Optional"
                  />
                </label>

                {createDraft.error ? (
                  <p className="text-sm" style={{ color: "var(--app-danger)" }} role="alert">
                    {createDraft.error}
                  </p>
                ) : null}

                <div className="flex items-center justify-between gap-2 pt-1">
                  <div>
                    {createDraft.mode === "edit" ? (
                      <button
                        type="button"
                        className="btn-ghost h-9 text-sm"
                        onClick={openDeleteConfirm}
                        disabled={createDraft.saving}
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn-ghost h-9 text-sm"
                      onClick={closeCreateModal}
                      disabled={createDraft.saving}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn-cta-dark h-9 text-sm"
                      onClick={() => void saveCreate()}
                      disabled={createDraft.saving}
                    >
                      {createDraft.saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </dialog>

      <dialog
        ref={deleteDialogRef}
        className="app-catalog-dialog fixed left-1/2 top-1/2 z-[230] w-[min(100vw-2rem,26rem)] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden border-0 p-0 shadow-xl"
        style={{ borderRadius: "12px", background: "var(--app-surface)", color: "var(--app-text)" }}
        onClose={() => {
          setDeleteContext(null);
          setDeleteError(null);
        }}
      >
        <div className="flex flex-col gap-4 p-5">
          <h2 className="text-base font-semibold" style={{ color: "var(--app-text)" }}>
            Delete this entry?
          </h2>
          {deleteContext ? (
            <div className="flex flex-col gap-1 text-sm">
              <p className="font-medium" style={{ color: "var(--app-text)" }}>
                {deleteContext.title}
              </p>
              <p className="text-muted-canvas">{deleteContext.durationLabel}</p>
            </div>
          ) : null}
          {deleteError ? (
            <p className="text-sm" style={{ color: "var(--app-danger)" }} role="alert">
              {deleteError}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="btn-ghost h-9 text-sm"
              disabled={deletePending}
              onClick={closeDeleteConfirm}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-[var(--app-radius)] px-3 py-2 text-sm font-medium cursor-pointer bg-[var(--app-danger)] text-[var(--app-surface)] transition-[background-color] duration-150 ease-out hover:bg-[color-mix(in_oklab,var(--app-danger)_78%,var(--app-text)_22%)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={deletePending || !deleteContext}
              onClick={() => void confirmDelete()}
            >
              {deletePending ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}

// ─── Loading skeletons ────────────────────────────────────────────────────────

function SummaryTilesSkeleton() {
  return (
    <div className="flex items-center gap-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-10 w-32 animate-pulse rounded-lg border"
          style={{ borderColor: "var(--app-border)", background: "var(--app-surface-alt)" }}
        />
      ))}
    </div>
  );
}

function CalendarGridSkeleton() {
  return (
    <div
      className="h-[min(52rem,82vh)] animate-pulse rounded-lg border"
      style={{ borderColor: "var(--app-border)", background: "var(--app-surface-alt)" }}
    >
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-canvas">Loading sessions…</p>
      </div>
    </div>
  );
}
