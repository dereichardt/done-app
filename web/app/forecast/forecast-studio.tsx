"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter } from "next/navigation";
import { ForecastEstimateVariancePanel } from "@/components/forecast-estimate-variance";
import { GenerateForecastDialog } from "@/components/generate-forecast-dialog";
import { formatEffortHoursLabel } from "@/lib/integration-effort-buckets";
import { saveProjectForecastDraft } from "@/lib/actions/project-forecast";
import type { ForecastProjectDTO } from "@/lib/forecast-data";
import {
  applyForecastProjectTotalEdit,
  applyForecastRowEdit,
  buildForecastPhaseWeekSegments,
  computeEstimateVariance,
  computeForecastPastPhaseSummary,
  currentSundayWeekYmd,
  DEFAULT_FORECAST_PM_PERCENT,
  diffForecastCells,
  forecastPrerequisites,
  forecastStartModeFromStartDate,
  PM_FORECAST_ROW_KEY,
  projectTotalsByWeek,
  sumActualsConsumedHours,
  sumEstimatedRoundedHours,
} from "@/lib/project-forecast";
import { sundayWeekStartsInclusive, formatSundayWeekLabel } from "@/lib/project-weekly-effort";
import type { DeploymentEffortByPhase } from "@/lib/user-preferences";
import {
  ForecastWeekCell,
  PORTFOLIO_BAR_MAX_HOURS,
} from "./forecast-week-cell";
import { ForecastWeekPhaseHeader } from "./forecast-week-phase-header";

type HoursByRow = Record<string, Record<string, number>>;
type SaveStatus = "idle" | "saving" | "saved" | "error";

/** Per-project edit state for an active Forecast Studio session. */
type ProjectEditSession = {
  /** Hours at first edit in this studio visit — drives change markup. */
  sessionBaseline: HoursByRow;
  /** Last successfully persisted hours (autosave baseline). */
  persisted: HoursByRow;
  /** Working draft. */
  draft: HoursByRow;
  sessionBaselineReserveHours: number;
  persistedReserveHours: number;
  reserveHours: number;
};

const TRACK_COL_DEFAULT_PX = 220;
const TRACK_COL_MIN_PX = 160;
const TRACK_COL_MAX_PX = 420;
const WEEK_COL_PX = 76;
/** Taller adjustment rows so bar height differences read more clearly. */
const DATA_ROW_PX = 168;
const PROJECT_ROW_PX = 168;
/** Per-project sticky week/phase header (extra room below dates for the scrollbar). */
const WEEK_HEADER_ROW_PX = 58;
/** Sticky portfolio strip above projects (week labels + non-editable totals). */
const PORTFOLIO_WEEK_HEADER_PX = 36;
/** Match data-row cell height so capacity bars (to 32h+) are not clipped. */
const PORTFOLIO_TOTAL_ROW_PX = 168;
const PORTFOLIO_STICKY_BLOCK_PX = PORTFOLIO_WEEK_HEADER_PX + PORTFOLIO_TOTAL_ROW_PX;
const ROW_DIVIDER =
  "border-b border-[color-mix(in_oklab,var(--app-border)_55%,transparent)]";
const AUTOSAVE_MS = 700;
const STICKY_HEADER_TOP = "var(--shell-header-toolbar-bottom)";
const STICKY_PROJECT_TOP = `calc(${STICKY_HEADER_TOP} + ${PORTFOLIO_STICKY_BLOCK_PX}px)`;

function formatSummaryHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "0h";
  return formatEffortHoursLabel(hours)
    .replace(/\s*hrs$/i, "h")
    .replace(/\s*hr$/i, "h");
}

/** Sum of forecast hours on/after the current Sunday week. */
function sumRemainingForecastHours(hoursByRow: HoursByRow, currentSunday: string): number {
  let total = 0;
  for (const row of Object.values(hoursByRow)) {
    for (const [week, hours] of Object.entries(row)) {
      if (week < currentSunday) continue;
      if (Number.isFinite(hours) && hours > 0) total += hours;
    }
  }
  return Math.round(total);
}

function sumRowRemainingHours(
  hoursByWeek: Record<string, number> | undefined,
  currentSunday: string,
): number {
  if (!hoursByWeek) return 0;
  let total = 0;
  for (const [week, hours] of Object.entries(hoursByWeek)) {
    if (week < currentSunday) continue;
    if (Number.isFinite(hours) && hours > 0) total += hours;
  }
  return Math.round(total);
}

function rowHoursDiffer(
  a: Record<string, number> | undefined,
  b: Record<string, number> | undefined,
  weeks: string[],
): boolean {
  for (const w of weeks) {
    if (Math.round(a?.[w] ?? 0) !== Math.round(b?.[w] ?? 0)) return true;
  }
  return false;
}

function cloneHours(h: HoursByRow): HoursByRow {
  const out: HoursByRow = {};
  for (const [k, weeks] of Object.entries(h)) {
    out[k] = { ...weeks };
  }
  return out;
}

function childRowKeys(project: ForecastProjectDTO): string[] {
  return [...project.integrations.map((i) => i.key), PM_FORECAST_ROW_KEY];
}

function weekInSpan(weekStart: string, startYmd: string | null, endYmd: string | null): boolean {
  if (!startYmd || !endYmd) return false;
  const weeks = sundayWeekStartsInclusive(startYmd, endYmd);
  if (weeks.length === 0) return false;
  return weekStart >= weeks[0] && weekStart <= weeks[weeks.length - 1];
}

/** Timeline ∩ forecast window — used for editable weeks (not the portfolio axis). */
function projectWritableWeeks(
  project: ForecastProjectDTO,
  sharedWeeks: string[],
  currentSunday: string,
): string[] {
  const forecastStart = project.forecast?.start_date ?? currentSunday;
  return sharedWeeks.filter(
    (w) =>
      !!project.timelineStartYmd &&
      !!project.timelineEndYmd &&
      w >= forecastStart &&
      weekInSpan(w, project.timelineStartYmd, project.timelineEndYmd),
  );
}

function projectReserveHours(project: ForecastProjectDTO): number {
  return Math.max(0, Math.round(project.forecast?.reserve_hours ?? 0));
}

function forecastCellKey(
  projectId: string,
  rowKey: "project" | string,
  weekStart: string,
): string {
  return `${projectId}:${rowKey}:${weekStart}`;
}

/** First week of each phase segment after the first — where vertical dividers start. */
function phaseBoundaryWeekStarts(
  segments: ReturnType<typeof buildForecastPhaseWeekSegments>,
): Set<string> {
  const out = new Set<string>();
  for (let i = 1; i < segments.length; i++) {
    const first = segments[i]?.weeks[0];
    if (first) out.add(first);
  }
  return out;
}

const PHASE_DIVIDER_ROW =
  "border-l border-[color-mix(in_oklab,var(--app-text)_16%,var(--app-border))]";

export function ForecastStudio({
  projects: initialProjects,
  todayIso,
  deploymentEffortByPhase,
  focusProjectId,
}: {
  projects: ForecastProjectDTO[];
  todayIso: string;
  deploymentEffortByPhase: DeploymentEffortByPhase;
  focusProjectId: string | null;
}) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  useEffect(() => {
    setProjects(initialProjects);
  }, [initialProjects]);

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    if (focusProjectId) s.add(focusProjectId);
    return s;
  });

  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeRowKey, setActiveRowKey] = useState<"project" | string | null>(null);
  /** All projects touched this studio visit — markup persists until leaving the page. */
  const [projectEdits, setProjectEdits] = useState<Record<string, ProjectEditSession>>({});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastEditedCellKey, setLastEditedCellKey] = useState<string | null>(null);
  const [generateFor, setGenerateFor] = useState<ForecastProjectDTO | null>(null);
  const [pending, startTransition] = useTransition();

  const focusRef = useRef<HTMLDivElement | null>(null);
  const syncingScrollRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef<HoursByRow | null>(null);
  const persistedRef = useRef<HoursByRow | null>(null);
  const reserveHoursRef = useRef<number | null>(null);
  const editingIdRef = useRef<string | null>(null);
  /** Bumped to ignore in-flight autosaves after regenerate / hard reset. */
  const saveEpochRef = useRef(0);
  const discardDialogRef = useRef<HTMLDialogElement>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [pendingLeaveAction, setPendingLeaveAction] = useState<(() => void) | null>(null);

  const [trackColPx, setTrackColPx] = useState(TRACK_COL_DEFAULT_PX);
  const [isResizingTrack, setIsResizingTrack] = useState(false);
  const trackDragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const onTrackResizePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLSpanElement>) => {
      e.preventDefault();
      e.stopPropagation();
      trackDragRef.current = { startX: e.clientX, startWidth: trackColPx };
      setIsResizingTrack(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [trackColPx],
  );

  const onTrackResizePointerMove = useCallback((e: ReactPointerEvent<HTMLSpanElement>) => {
    const drag = trackDragRef.current;
    if (!drag) return;
    const next = Math.min(
      TRACK_COL_MAX_PX,
      Math.max(TRACK_COL_MIN_PX, drag.startWidth + (e.clientX - drag.startX)),
    );
    setTrackColPx(next);
  }, []);

  const onTrackResizePointerUp = useCallback((e: ReactPointerEvent<HTMLSpanElement>) => {
    trackDragRef.current = null;
    setIsResizingTrack(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  const renderTrackColResizeHandle = () => (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize track column"
      aria-valuenow={trackColPx}
      aria-valuemin={TRACK_COL_MIN_PX}
      aria-valuemax={TRACK_COL_MAX_PX}
      tabIndex={0}
      className="absolute inset-y-0 right-0 z-[4] w-2 translate-x-1/2 cursor-col-resize touch-none"
      onPointerDown={onTrackResizePointerDown}
      onPointerMove={onTrackResizePointerMove}
      onPointerUp={onTrackResizePointerUp}
      onPointerCancel={onTrackResizePointerUp}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          setTrackColPx((w) => Math.max(TRACK_COL_MIN_PX, w - 8));
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          setTrackColPx((w) => Math.min(TRACK_COL_MAX_PX, w + 8));
        }
      }}
    >
      <span
        className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2"
        style={{
          background: isResizingTrack
            ? "var(--app-text-muted)"
            : "color-mix(in oklab, var(--app-border) 70%, transparent)",
        }}
        aria-hidden
      />
    </span>
  );

  useEffect(() => {
    if (!isResizingTrack) return;
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [isResizingTrack]);

  useEffect(() => {
    draftRef.current = activeProjectId ? (projectEdits[activeProjectId]?.draft ?? null) : null;
  }, [activeProjectId, projectEdits]);
  useEffect(() => {
    persistedRef.current = activeProjectId
      ? (projectEdits[activeProjectId]?.persisted ?? null)
      : null;
  }, [activeProjectId, projectEdits]);
  useEffect(() => {
    editingIdRef.current = activeProjectId;
  }, [activeProjectId]);

  const currentSunday = useMemo(() => currentSundayWeekYmd(todayIso), [todayIso]);

  const sharedWeeks = useMemo(() => {
    let min: string | null = null;
    let max: string | null = null;
    for (const p of projects) {
      if (p.timelineStartYmd && (!min || p.timelineStartYmd < min)) min = p.timelineStartYmd;
      if (p.timelineEndYmd && (!max || p.timelineEndYmd > max)) max = p.timelineEndYmd;
    }
    if (!min || !max) return [] as string[];
    return sundayWeekStartsInclusive(min, max);
  }, [projects]);

  const scrollTargetWeekYmd = useMemo(() => {
    if (sharedWeeks.length === 0) return null;
    if (sharedWeeks.some((w) => w === currentSunday)) return currentSunday;
    const upcoming = sharedWeeks.find((w) => w > currentSunday);
    return upcoming ?? sharedWeeks[sharedWeeks.length - 1] ?? null;
  }, [sharedWeeks, currentSunday]);

  const weeksGridStyle = useMemo(
    () => ({
      gridTemplateColumns: `repeat(${Math.max(sharedWeeks.length, 1)}, ${WEEK_COL_PX}px)`,
      width: Math.max(sharedWeeks.length, 1) * WEEK_COL_PX,
    }),
    [sharedWeeks.length],
  );

  /** Sum of each project's weekly totals (includes in-progress draft for the editing project). */
  const portfolioTotalsByWeek = useMemo(() => {
    const out: Record<string, number> = {};
    for (const w of sharedWeeks) out[w] = 0;
    for (const p of projects) {
      const hours = projectEdits[p.id]?.draft ?? p.hoursByRow;
      const totals = projectTotalsByWeek(hours, sharedWeeks);
      for (const w of sharedWeeks) {
        out[w] = (out[w] ?? 0) + (totals[w] ?? 0);
      }
    }
    return out;
  }, [projects, sharedWeeks, projectEdits]);

  const targetScrollLeft = useMemo(() => {
    if (!scrollTargetWeekYmd) return 0;
    const idx = sharedWeeks.indexOf(scrollTargetWeekYmd);
    return Math.max(0, idx) * WEEK_COL_PX;
  }, [scrollTargetWeekYmd, sharedWeeks]);

  const allWeekScrollers = useCallback(() => {
    return Array.from(
      document.querySelectorAll<HTMLDivElement>("[data-forecast-week-scroll]"),
    );
  }, []);

  const syncWeekScroll = useCallback(
    (source: HTMLDivElement) => {
      if (syncingScrollRef.current) return;
      syncingScrollRef.current = true;
      const next = source.scrollLeft;
      for (const el of allWeekScrollers()) {
        if (el !== source && el.scrollLeft !== next) el.scrollLeft = next;
      }
      syncingScrollRef.current = false;
    },
    [allWeekScrollers],
  );

  useLayoutEffect(() => {
    for (const el of allWeekScrollers()) {
      el.scrollLeft = targetScrollLeft;
    }
  }, [allWeekScrollers, targetScrollLeft, sharedWeeks.length, projects.length, expanded]);

  useEffect(() => {
    if (!focusProjectId) return;
    const t = window.setTimeout(() => {
      focusRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [focusProjectId]);

  useEffect(() => {
    if (!discardOpen) return;
    const el = discardDialogRef.current;
    if (el && !el.open) el.showModal();
  }, [discardOpen]);

  const activeDirty = useMemo(() => {
    if (!activeProjectId) return false;
    const edit = projectEdits[activeProjectId];
    if (!edit) return false;
    return diffForecastCells(edit.persisted, edit.draft).length > 0;
  }, [activeProjectId, projectEdits]);

  const clearAutosaveTimer = useCallback(() => {
    if (autosaveTimerRef.current != null) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  }, []);

  const applyPersistedToProjects = useCallback(
    (projectId: string, hours: HoursByRow, reserveHours: number) => {
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== projectId) return p;
          return {
            ...p,
            hoursByRow: cloneHours(hours),
            hours: Object.entries(hours).flatMap(([row_key, weeks]) =>
              Object.entries(weeks).map(([week_start_date, h]) => ({
                row_key,
                week_start_date,
                hours: h,
              })),
            ),
            forecast: p.forecast
              ? { ...p.forecast, reserve_hours: reserveHours }
              : p.forecast,
          };
        }),
      );
    },
    [],
  );

  const flushSave = useCallback(
    (opts?: {
      after?: () => void;
      projectId?: string;
      draftOverride?: HoursByRow;
      reserveOverride?: number;
    }) => {
      clearAutosaveTimer();
      const projectId = opts?.projectId ?? editingIdRef.current;
      const edit = projectId ? projectEdits[projectId] : undefined;
      const currentDraft =
        opts?.draftOverride ?? (opts?.projectId ? edit?.draft : draftRef.current);
      const currentPersisted = opts?.projectId ? edit?.persisted : persistedRef.current;
      const currentReserve =
        opts?.reserveOverride ??
        (opts?.projectId ? edit?.reserveHours : reserveHoursRef.current) ??
        edit?.reserveHours ??
        0;
      const persistedReserve = edit?.persistedReserveHours ?? currentReserve;
      const epoch = saveEpochRef.current;
      if (!projectId || !currentDraft || !currentPersisted) {
        opts?.after?.();
        return;
      }
      const cells = diffForecastCells(currentPersisted, currentDraft);
      const reserveChanged = Math.round(currentReserve) !== Math.round(persistedReserve);
      if (cells.length === 0 && !reserveChanged) {
        setSaveStatus("saved");
        opts?.after?.();
        return;
      }
      setSaveStatus("saving");
      setSaveError(null);
      startTransition(async () => {
        const res = await saveProjectForecastDraft(projectId, {
          todayIso,
          cells: cells.map((c) => ({
            rowKey: c.rowKey,
            weekStartDate: c.weekStartDate,
            hours: c.hours,
          })),
          reserveHours: Math.max(0, Math.round(currentReserve)),
        });
        if (epoch !== saveEpochRef.current) {
          opts?.after?.();
          return;
        }
        if (res.error) {
          setSaveError(res.error);
          setSaveStatus("error");
          return;
        }
        const saved = cloneHours(currentDraft);
        const savedReserve = Math.max(0, Math.round(currentReserve));
        persistedRef.current = saved;
        draftRef.current = saved;
        reserveHoursRef.current = savedReserve;
        setProjectEdits((prev) => {
          const entry = prev[projectId];
          if (!entry) return prev;
          return {
            ...prev,
            [projectId]: {
              ...entry,
              persisted: saved,
              draft: saved,
              persistedReserveHours: savedReserve,
              reserveHours: savedReserve,
            },
          };
        });
        applyPersistedToProjects(projectId, saved, savedReserve);
        setSaveStatus("saved");
        setSaveError(null);
        router.refresh();
        opts?.after?.();
      });
    },
    [clearAutosaveTimer, todayIso, applyPersistedToProjects, router, projectEdits],
  );

  const scheduleAutosave = useCallback(() => {
    clearAutosaveTimer();
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      flushSave();
    }, AUTOSAVE_MS);
  }, [clearAutosaveTimer, flushSave]);

  useEffect(() => {
    return () => clearAutosaveTimer();
  }, [clearAutosaveTimer]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const anyDirty = Object.values(projectEdits).some(
        (edit) =>
          diffForecastCells(edit.persisted, edit.draft).length > 0 ||
          Math.round(edit.persistedReserveHours) !== Math.round(edit.reserveHours),
      );
      const saving = autosaveTimerRef.current != null;
      if (anyDirty || saving) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [projectEdits]);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setExpanded(new Set(projects.map((p) => p.id)));
  }

  function collapseAll() {
    setExpanded(new Set());
  }

  function endStudioSession() {
    clearAutosaveTimer();
    editingIdRef.current = null;
    persistedRef.current = null;
    draftRef.current = null;
    reserveHoursRef.current = null;
    setActiveProjectId(null);
    setActiveRowKey(null);
    setProjectEdits({});
    setSaveStatus("idle");
    setSaveError(null);
    setLastEditedCellKey(null);
  }

  function activateProject(project: ForecastProjectDTO, rowKey: "project" | string) {
    const hours = cloneHours(project.hoursByRow);
    const reserve = projectReserveHours(project);
    setProjectEdits((prev) => {
      const next = prev[project.id]
        ? prev
        : {
            ...prev,
            [project.id]: {
              sessionBaseline: cloneHours(hours),
              persisted: cloneHours(hours),
              draft: cloneHours(hours),
              sessionBaselineReserveHours: reserve,
              persistedReserveHours: reserve,
              reserveHours: reserve,
            },
          };
      const edit = next[project.id]!;
      editingIdRef.current = project.id;
      draftRef.current = edit.draft;
      persistedRef.current = edit.persisted;
      reserveHoursRef.current = edit.reserveHours;
      return next;
    });
    setActiveProjectId(project.id);
    setActiveRowKey(rowKey);
    setSaveStatus("idle");
    setSaveError(null);
    if (rowKey !== "project") {
      setExpanded((prev) => new Set(prev).add(project.id));
    }
  }

  function discardActiveUnsaved() {
    if (!activeProjectId) return;
    setProjectEdits((prev) => {
      const entry = prev[activeProjectId];
      if (!entry) return prev;
      const persisted = cloneHours(entry.persisted);
      const reserve = entry.persistedReserveHours;
      draftRef.current = persisted;
      reserveHoursRef.current = reserve;
      return {
        ...prev,
        [activeProjectId]: {
          ...entry,
          draft: persisted,
          reserveHours: reserve,
        },
      };
    });
  }

  /** Ensure an edit session exists for this project/row before applying a change. */
  function ensureEditSession(
    project: ForecastProjectDTO,
    rowKey: "project" | string,
  ): boolean {
    if (activeProjectId === project.id && projectEdits[project.id]) {
      setActiveRowKey(rowKey);
      if (rowKey !== "project") {
        setExpanded((prev) => new Set(prev).add(project.id));
      }
      return true;
    }
    if (activeProjectId && activeProjectId !== project.id) {
      const activeEdit = projectEdits[activeProjectId];
      const hasDirty =
        activeEdit &&
        (diffForecastCells(activeEdit.persisted, activeEdit.draft).length > 0 ||
          Math.round(activeEdit.persistedReserveHours) !==
            Math.round(activeEdit.reserveHours));
      if (hasDirty || autosaveTimerRef.current != null || saveStatus === "saving") {
        setPendingLeaveAction(() => () => activateProject(project, rowKey));
        setDiscardOpen(true);
        return false;
      }
      clearAutosaveTimer();
      activateProject(project, rowKey);
      return true;
    }
    activateProject(project, rowKey);
    return true;
  }

  const revertCellToSessionOriginal = useCallback(
    (project: ForecastProjectDTO, rowKey: "project" | string, weekStart: string) => {
      const session = projectEdits[project.id];
      const sessionBaseline = session?.sessionBaseline;
      if (!sessionBaseline || !session) return;

      const writable = projectWritableWeeks(project, sharedWeeks, currentSunday);
      const base = cloneHours(session.draft);
      const estimated = sumEstimatedRoundedHours(project.integrations);
      const actuals = sumActualsConsumedHours(project.integrations, project.actualsByRowKey);

      let sessionValue: number;
      if (rowKey === "project") {
        sessionValue = childRowKeys(project).reduce(
          (s, key) => s + Math.max(0, Math.round(sessionBaseline[key]?.[weekStart] ?? 0)),
          0,
        );
      } else {
        sessionValue = Math.max(0, Math.round(sessionBaseline[rowKey]?.[weekStart] ?? 0));
      }

      let currentValue: number;
      if (rowKey === "project") {
        currentValue = childRowKeys(project).reduce(
          (s, key) => s + Math.max(0, Math.round(base[key]?.[weekStart] ?? 0)),
          0,
        );
      } else {
        currentValue = Math.max(0, Math.round(base[rowKey]?.[weekStart] ?? 0));
      }

      if (sessionValue === currentValue) {
        setLastEditedCellKey(null);
        return;
      }

      const cellKey = forecastCellKey(project.id, rowKey, weekStart);
      setLastEditedCellKey(cellKey);

      let nextDraft: HoursByRow;
      let nextReserve: number;
      if (rowKey === "project") {
        const keys = childRowKeys(project);
        const result = applyForecastProjectTotalEdit({
          hoursByRow: base,
          rowKeys: keys,
          editedWeekStart: weekStart,
          nextTotalHours: sessionValue,
          currentSundayWeek: currentSunday,
          weekStarts: writable,
          reserveHours: session.reserveHours,
          estimated,
          actuals,
        });
        nextDraft = result.hoursByRow;
        nextReserve = result.reserveHours;
      } else {
        const rowHours = { ...(base[rowKey] ?? {}) };
        const projectForecastTotal = sumRemainingForecastHours(base, currentSunday);
        const result = applyForecastRowEdit({
          hoursByWeek: rowHours,
          editedWeekStart: weekStart,
          nextHours: sessionValue,
          currentSundayWeek: currentSunday,
          weekStarts: writable,
          reserveHours: session.reserveHours,
          projectForecastTotal,
          estimated,
          actuals,
        });
        nextDraft = { ...base, [rowKey]: result.hoursByWeek };
        nextReserve = result.reserveHours;
      }

      draftRef.current = nextDraft;
      reserveHoursRef.current = nextReserve;
      setProjectEdits((prev) => {
        const entry = prev[project.id];
        if (!entry) return prev;
        return {
          ...prev,
          [project.id]: { ...entry, draft: nextDraft, reserveHours: nextReserve },
        };
      });
      setLastEditedCellKey(null);
      if (activeProjectId === project.id) {
        draftRef.current = nextDraft;
        reserveHoursRef.current = nextReserve;
        scheduleAutosave();
      } else {
        flushSave({
          projectId: project.id,
          draftOverride: nextDraft,
          reserveOverride: nextReserve,
        });
      }
    },
    [projectEdits, activeProjectId, sharedWeeks, currentSunday, scheduleAutosave, flushSave],
  );

  const applyRowEdit = useCallback(
    (project: ForecastProjectDTO, rowKey: string, weekStart: string, nextHours: number) => {
      if (!ensureEditSession(project, rowKey)) return;

      const cellKey = forecastCellKey(project.id, rowKey, weekStart);
      setLastEditedCellKey(cellKey);
      const writable = projectWritableWeeks(project, sharedWeeks, currentSunday);
      const entry = projectEdits[project.id];
      const base = cloneHours(entry?.draft ?? project.hoursByRow);
      const reserve = entry?.reserveHours ?? projectReserveHours(project);
      const estimated = sumEstimatedRoundedHours(project.integrations);
      const actuals = sumActualsConsumedHours(project.integrations, project.actualsByRowKey);
      const projectForecastTotal = sumRemainingForecastHours(base, currentSunday);
      const rowHours = { ...(base[rowKey] ?? {}) };
      const result = applyForecastRowEdit({
        hoursByWeek: rowHours,
        editedWeekStart: weekStart,
        nextHours,
        currentSundayWeek: currentSunday,
        weekStarts: writable,
        reserveHours: reserve,
        projectForecastTotal,
        estimated,
        actuals,
      });
      const nextDraft = { ...base, [rowKey]: result.hoursByWeek };
      draftRef.current = nextDraft;
      reserveHoursRef.current = result.reserveHours;
      setProjectEdits((prev) => {
        const existing = prev[project.id] ?? {
          sessionBaseline: cloneHours(project.hoursByRow),
          persisted: cloneHours(project.hoursByRow),
          draft: cloneHours(project.hoursByRow),
          sessionBaselineReserveHours: projectReserveHours(project),
          persistedReserveHours: projectReserveHours(project),
          reserveHours: projectReserveHours(project),
        };
        return {
          ...prev,
          [project.id]: {
            ...existing,
            draft: nextDraft,
            reserveHours: result.reserveHours,
          },
        };
      });
      scheduleAutosave();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ensureEditSession uses refs + latest saveStatus
    [sharedWeeks, currentSunday, scheduleAutosave, saveStatus, projectEdits],
  );

  const applyProjectTotalEdit = useCallback(
    (project: ForecastProjectDTO, weekStart: string, nextTotal: number) => {
      if (!ensureEditSession(project, "project")) return;

      const cellKey = forecastCellKey(project.id, "project", weekStart);
      setLastEditedCellKey(cellKey);
      const writable = projectWritableWeeks(project, sharedWeeks, currentSunday);
      const keys = childRowKeys(project);
      const entry = projectEdits[project.id];
      const base = cloneHours(entry?.draft ?? project.hoursByRow);
      const reserve = entry?.reserveHours ?? projectReserveHours(project);
      const estimated = sumEstimatedRoundedHours(project.integrations);
      const actuals = sumActualsConsumedHours(project.integrations, project.actualsByRowKey);
      const result = applyForecastProjectTotalEdit({
        hoursByRow: base,
        rowKeys: keys,
        editedWeekStart: weekStart,
        nextTotalHours: nextTotal,
        currentSundayWeek: currentSunday,
        weekStarts: writable,
        reserveHours: reserve,
        estimated,
        actuals,
      });
      draftRef.current = result.hoursByRow;
      reserveHoursRef.current = result.reserveHours;
      setProjectEdits((prev) => {
        const existing = prev[project.id] ?? {
          sessionBaseline: cloneHours(project.hoursByRow),
          persisted: cloneHours(project.hoursByRow),
          draft: cloneHours(project.hoursByRow),
          sessionBaselineReserveHours: projectReserveHours(project),
          persistedReserveHours: projectReserveHours(project),
          reserveHours: projectReserveHours(project),
        };
        return {
          ...prev,
          [project.id]: {
            ...existing,
            draft: result.hoursByRow,
            reserveHours: result.reserveHours,
          },
        };
      });
      scheduleAutosave();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sharedWeeks, currentSunday, scheduleAutosave, saveStatus, projectEdits],
  );

  function hoursForDisplay(project: ForecastProjectDTO): HoursByRow {
    return projectEdits[project.id]?.draft ?? project.hoursByRow;
  }

  /** Session-start hours for left-panel original totals (survives autosave). */
  function sessionOriginalFor(project: ForecastProjectDTO): HoursByRow {
    return projectEdits[project.id]?.sessionBaseline ?? project.hoursByRow;
  }

  function navigateWeek(
    projectId: string,
    rowKey: string,
    weekStart: string,
    direction: -1 | 1,
  ) {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    const editableWeeks = sharedWeeks.filter(
      (w) =>
        w >= currentSunday &&
        weekInSpan(w, project.timelineStartYmd, project.timelineEndYmd),
    );
    const idx = editableWeeks.indexOf(weekStart);
    if (idx < 0) return;
    const nextWeek = editableWeeks[idx + direction];
    if (!nextWeek) return;
    const cellId = `${projectId}:${rowKey}:${nextWeek}`;
    const el = document.querySelector<HTMLInputElement>(
      `[data-forecast-cell="${cellId}"] input`,
    );
    el?.focus();
    el?.select();
  }

  function closeDiscardDialog() {
    discardDialogRef.current?.close();
    setDiscardOpen(false);
    setPendingLeaveAction(null);
  }

  if (projects.length === 0) {
    return (
      <div className="card-canvas p-6">
        <h1 className="heading-page">Forecast Studio</h1>
        <p className="mt-3 text-sm text-[var(--app-text-muted)]">
          No active projects yet. Create a project to generate forecasts.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="heading-page">Forecast Studio</h1>
          <p className="mt-1 text-sm text-[var(--app-text-muted)]">
            Click any future week to adjust hours. Changes redistribute from the bank and save
            automatically.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-cta-tertiary" onClick={expandAll}>
            Expand all
          </button>
          <button type="button" className="btn-cta-tertiary" onClick={collapseAll}>
            Collapse all
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)]">
        {/* Sticky portfolio totals — sum of all project weekly totals (read-only) */}
        <div
          className="sticky z-30 border-b border-[var(--app-border)] bg-[var(--app-surface)]"
          style={{ top: STICKY_HEADER_TOP }}
        >
          <div
            className={`flex bg-[var(--app-surface-muted-solid)] ${ROW_DIVIDER}`}
            style={{ height: PORTFOLIO_WEEK_HEADER_PX }}
          >
            <div
              className="relative flex shrink-0 items-center border-r border-[var(--app-border)] px-2 pr-3 shadow-[4px_0_8px_-4px_color-mix(in_oklab,var(--app-text)_14%,transparent)]"
              style={{ width: trackColPx, height: PORTFOLIO_WEEK_HEADER_PX }}
            >
              <span className="truncate text-xs font-medium text-[var(--app-text-muted)]">
                Week
              </span>
              {renderTrackColResizeHandle()}
            </div>
            <div
              data-forecast-week-scroll
              className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              style={{ height: PORTFOLIO_WEEK_HEADER_PX }}
              onScroll={(e) => syncWeekScroll(e.currentTarget)}
            >
              <div className="grid h-full items-center" style={weeksGridStyle}>
                {sharedWeeks.map((w) => (
                  <div
                    key={w}
                    className={`px-1 text-center text-[10px] font-medium text-[var(--app-text-muted)] ${
                      w === currentSunday || w === scrollTargetWeekYmd
                        ? "bg-[var(--app-info-surface)]"
                        : ""
                    }`}
                  >
                    {formatSundayWeekLabel(w)}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={`flex ${ROW_DIVIDER}`} style={{ height: PORTFOLIO_TOTAL_ROW_PX }}>
            <div
              className="relative flex shrink-0 items-center overflow-hidden border-r border-[var(--app-border)] px-2 pr-3 shadow-[4px_0_8px_-4px_color-mix(in_oklab,var(--app-text)_14%,transparent)] bg-[var(--app-surface-muted-solid)]"
              style={{ width: trackColPx, height: PORTFOLIO_TOTAL_ROW_PX }}
            >
              <div className="min-w-0 flex-1 overflow-hidden py-1 pl-1">
                <div className="truncate text-sm font-medium text-[var(--app-text)]">
                  All projects
                </div>
                <div className="mt-0.5 text-[11px] text-[var(--app-text-muted)]">
                  Weekly total
                </div>
              </div>
              {renderTrackColResizeHandle()}
            </div>

            <div
              data-forecast-week-scroll
              className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden bg-[var(--app-surface-muted-solid)]"
              style={{ height: PORTFOLIO_TOTAL_ROW_PX }}
              onScroll={(e) => syncWeekScroll(e.currentTarget)}
            >
              <div className="grid h-full items-center" style={weeksGridStyle}>
                {sharedWeeks.map((w) => {
                  const h = portfolioTotalsByWeek[w] ?? 0;
                  const past = w < currentSunday;
                  return (
                    <div
                      key={w}
                      className={`flex h-full items-center justify-center ${
                        w === currentSunday || w === scrollTargetWeekYmd
                          ? "bg-[var(--app-info-surface)]"
                          : ""
                      }`}
                    >
                      <ForecastWeekCell
                        hours={h}
                        editable={false}
                        locked={past}
                        capacityTint
                        barScaleHours={PORTFOLIO_BAR_MAX_HOURS}
                        cellId={`portfolio:total:${w}`}
                        onCommitHours={() => {}}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {projects.map((project) => {
          const isExpanded = expanded.has(project.id);
          const hasStudioSession = project.id in projectEdits;
          const isActiveProject = activeProjectId === project.id;
          const displayHours = hoursForDisplay(project);
          const sessionHours = sessionOriginalFor(project);
          const totals = projectTotalsByWeek(displayHours, sharedWeeks);
          const prereq = forecastPrerequisites({
            phases: project.phases,
            integrations: project.integrations,
          });
          const hasForecast = project.forecast != null;
          const rowKeys = childRowKeys(project);
          const isFocused = focusProjectId === project.id;
          const startMode = project.forecast
            ? forecastStartModeFromStartDate(project.forecast.start_date, todayIso)
            : "this_week";
          const phaseSegments = buildForecastPhaseWeekSegments(sharedWeeks, project.phases);
          const phaseBoundaries = phaseBoundaryWeekStarts(phaseSegments);

          const estimatedTotal = sumEstimatedRoundedHours(project.integrations);
          const actualsTotal = sumActualsConsumedHours(
            project.integrations,
            project.actualsByRowKey,
          );
          const forecastRemainingTotal = sumRemainingForecastHours(displayHours, currentSunday);
          const originalForecastTotal = sumRemainingForecastHours(sessionHours, currentSunday);
          const showSessionTotals = hasStudioSession;

          const liveVariance = computeEstimateVariance({
            estimated: estimatedTotal,
            actuals: actualsTotal,
            forecastTotal: forecastRemainingTotal,
          });
          const originalVariance = computeEstimateVariance({
            estimated: estimatedTotal,
            actuals: actualsTotal,
            forecastTotal: originalForecastTotal,
          });

          function sessionBaselineHoursForCell(
            rowKey: "project" | string,
            weekStart: string,
          ): number {
            if (rowKey === "project") {
              return childRowKeys(project).reduce(
                (s, key) => s + Math.max(0, Math.round(sessionHours[key]?.[weekStart] ?? 0)),
                0,
              );
            }
            return Math.max(0, Math.round(sessionHours[rowKey]?.[weekStart] ?? 0));
          }

          function cellEditProps(rowKey: "project" | string, weekStart: string) {
            const cellKey = forecastCellKey(project.id, rowKey, weekStart);
            return {
              sessionBaselineHours: hasStudioSession
                ? sessionBaselineHoursForCell(rowKey, weekStart)
                : null,
              onRevertToSession: hasStudioSession
                ? () => revertCellToSessionOriginal(project, rowKey, weekStart)
                : undefined,
              saving:
                isActiveProject &&
                lastEditedCellKey === cellKey &&
                (saveStatus === "saving" || pending),
              saveError: isActiveProject && lastEditedCellKey === cellKey ? saveError : null,
            };
          }

          const pastPhaseSummary = hasForecast
            ? computeForecastPastPhaseSummary({
                phases: project.phases,
                integrations: project.integrations,
                deploymentEffortByPhase,
                pmPercent: project.forecast?.pm_percent ?? DEFAULT_FORECAST_PM_PERCENT,
                startMode,
                todayIso,
                actualsByRowKey: project.actualsByRowKey,
              })
            : null;

          return (
            <div
              key={project.id}
              ref={isFocused ? focusRef : undefined}
              className="border-b border-[var(--app-border)] last:border-b-0"
            >
              {/* Sticky project + week/phase header (freezes on vertical scroll) */}
              <div
                className={`sticky z-20 flex border-b border-[var(--app-border)] bg-[var(--app-surface-muted-solid)]`}
                style={{ top: STICKY_PROJECT_TOP, height: WEEK_HEADER_ROW_PX }}
              >
                <div
                  className="relative flex shrink-0 items-center gap-2 overflow-hidden border-r border-[var(--app-border)] px-2 pr-3 shadow-[4px_0_8px_-4px_color-mix(in_oklab,var(--app-text)_14%,transparent)]"
                  style={{ width: trackColPx, height: WEEK_HEADER_ROW_PX }}
                >
                  <button
                    type="button"
                    className="icon-btn shrink-0"
                    aria-expanded={isExpanded}
                    aria-label={isExpanded ? "Collapse project" : "Expand project"}
                    onClick={() => toggleExpanded(project.id)}
                  >
                    <span aria-hidden className="text-sm">
                      {isExpanded ? "▾" : "▸"}
                    </span>
                  </button>
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <div className="truncate text-sm font-medium">{project.customer_name}</div>
                  </div>
                  <button
                    type="button"
                    className="btn-cta-dark shrink-0 !px-2.5 !py-1 text-xs"
                    disabled={!prereq.ok}
                    title={!prereq.ok ? prereq.reason : undefined}
                    onClick={() => {
                      if (isActiveProject && activeDirty) {
                        flushSave({
                          after: () => setGenerateFor(project),
                        });
                        return;
                      }
                      setGenerateFor(project);
                    }}
                  >
                    {hasForecast ? "Regen" : "Generate"}
                  </button>
                  {renderTrackColResizeHandle()}
                </div>

                <ForecastWeekPhaseHeader
                  segments={phaseSegments}
                  currentSunday={currentSunday}
                  scrollTargetWeekYmd={scrollTargetWeekYmd}
                  heightPx={WEEK_HEADER_ROW_PX}
                  onScroll={syncWeekScroll}
                />
              </div>

              {/* Project total — stats in the label cell; taller bars in the week pane */}
              <div className={`flex ${ROW_DIVIDER}`} style={{ height: PROJECT_ROW_PX }}>
                <div
                  className={`relative flex shrink-0 items-center overflow-hidden border-r border-[var(--app-border)] px-2 pr-3 shadow-[4px_0_8px_-4px_color-mix(in_oklab,var(--app-text)_14%,transparent)] ${
                    isActiveProject && activeRowKey === "project"
                      ? "bg-[color-mix(in_oklab,var(--app-info-surface)_70%,var(--app-surface))]"
                      : "bg-[var(--app-surface)]"
                  }`}
                  style={{ width: trackColPx, height: PROJECT_ROW_PX }}
                >
                  <div className="min-w-0 flex-1 overflow-hidden py-1 pl-2">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="truncate text-sm font-medium text-[var(--app-text)]">
                        Project total
                      </span>
                    </div>

                    {hasForecast ? (
                      <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1">
                        <div className="min-w-0">
                          <div className="text-[10px] font-medium text-[var(--app-text-muted)]">
                            Estimated
                          </div>
                          <div className="truncate text-xs font-medium tabular-nums text-[var(--app-text)]">
                            {formatSummaryHours(estimatedTotal)}
                          </div>
                        </div>
                        <div className="min-w-0">
                          <div className="text-[10px] font-medium text-[var(--app-text-muted)]">
                            Actuals
                          </div>
                          <div className="truncate text-xs font-medium tabular-nums text-[var(--app-text)]">
                            {formatSummaryHours(actualsTotal)}
                          </div>
                        </div>
                        <div className="col-span-2 min-w-0">
                          <div className="text-[10px] font-medium text-[var(--app-text-muted)]">
                            Forecast
                          </div>
                          {showSessionTotals ? (
                            <div
                              className="truncate text-xs font-medium tabular-nums text-[var(--app-text)]"
                              title={`Original ${formatSummaryHours(originalForecastTotal)} → ${formatSummaryHours(forecastRemainingTotal)}`}
                            >
                              <span className="line-through opacity-70">
                                {formatSummaryHours(originalForecastTotal)}
                              </span>
                              {" → "}
                              <span className="font-medium">
                                {formatSummaryHours(forecastRemainingTotal)}
                              </span>
                            </div>
                          ) : (
                            <div className="truncate text-xs font-medium tabular-nums text-[var(--app-text)]">
                              {formatSummaryHours(forecastRemainingTotal)}
                            </div>
                          )}
                          <div className="mt-1 text-[10px] font-medium text-[var(--app-text-muted)]">
                            {liveVariance.kind === "under"
                              ? "Under estimate"
                              : liveVariance.kind === "over"
                                ? "Over estimate"
                                : "Estimate"}
                          </div>
                          {showSessionTotals &&
                          originalVariance.label !== liveVariance.label ? (
                            <div
                              className={`flex min-w-0 items-center gap-1 truncate text-xs font-medium tabular-nums ${
                                liveVariance.kind === "over"
                                  ? "rounded-md bg-[color-mix(in_oklab,var(--app-warning)_16%,var(--app-surface))] px-1 py-0.5 text-[var(--app-warning)]"
                                  : "text-[var(--app-text)]"
                              }`}
                              title={`Original ${originalVariance.label} → ${liveVariance.label}`}
                              role={liveVariance.kind === "over" ? "status" : undefined}
                            >
                              <span className="min-w-0 truncate">
                                <span className="line-through opacity-70">
                                  {originalVariance.kind === "on"
                                    ? "0h"
                                    : formatSummaryHours(originalVariance.absHours)}
                                </span>
                                {" → "}
                                <span>
                                  {liveVariance.kind === "on"
                                    ? "0h"
                                    : formatSummaryHours(liveVariance.absHours)}
                                </span>
                              </span>
                              {pastPhaseSummary && pastPhaseSummary.pastPhaseHours > 0 ? (
                                <ForecastEstimateVariancePanel
                                  summary={pastPhaseSummary}
                                  inline
                                  valueOnly
                                  hideValue
                                />
                              ) : null}
                            </div>
                          ) : (
                            <div
                              className={`flex items-center gap-1 ${
                                liveVariance.kind === "over"
                                  ? "rounded-md bg-[color-mix(in_oklab,var(--app-warning)_16%,var(--app-surface))] px-1 py-0.5"
                                  : ""
                              }`}
                            >
                              <span
                                className={`text-xs font-medium tabular-nums ${
                                  liveVariance.kind === "over"
                                    ? "text-[var(--app-warning)]"
                                    : "text-[var(--app-text)]"
                                }`}
                                title={liveVariance.label}
                              >
                                {liveVariance.kind === "on"
                                  ? "0h"
                                  : formatSummaryHours(liveVariance.absHours)}
                              </span>
                              {pastPhaseSummary && pastPhaseSummary.pastPhaseHours > 0 ? (
                                <ForecastEstimateVariancePanel
                                  summary={pastPhaseSummary}
                                  inline
                                  valueOnly
                                  hideValue
                                />
                              ) : null}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="mt-1.5 line-clamp-3 text-[11px] leading-snug text-[var(--app-text-muted)]">
                        {prereq.ok
                          ? "No forecast yet — generate to populate weekly hours."
                          : prereq.reason}
                      </p>
                    )}
                  </div>
                  {renderTrackColResizeHandle()}
                </div>

                <div
                  data-forecast-week-scroll
                  className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                  style={{ height: PROJECT_ROW_PX }}
                  onScroll={(e) => syncWeekScroll(e.currentTarget)}
                >
                  <div className="grid h-full items-center" style={weeksGridStyle}>
                    {sharedWeeks.map((w) => {
                      const h = totals[w] ?? 0;
                      const inTimeline = weekInSpan(
                        w,
                        project.timelineStartYmd,
                        project.timelineEndYmd,
                      );
                      const past = w < currentSunday;
                      const canEdit = hasForecast && !past && inTimeline;
                      const isPhaseBoundary = phaseBoundaries.has(w);
                      const editProps = cellEditProps("project", w);
                      return (
                        <div
                          key={w}
                          className={`flex h-full items-center justify-center ${
                            isPhaseBoundary ? PHASE_DIVIDER_ROW : ""
                          } ${
                            w === currentSunday || w === scrollTargetWeekYmd
                              ? "bg-[var(--app-info-surface)]"
                              : ""
                          }`}
                        >
                          {inTimeline ? (
                            <ForecastWeekCell
                              hours={h}
                              editable={canEdit}
                              locked={past}
                              cellId={`${project.id}:project:${w}`}
                              {...editProps}
                              onCommitHours={(next) =>
                                applyProjectTotalEdit(project, w, next)
                              }
                              onNavigateWeek={(dir) =>
                                navigateWeek(project.id, "project", w, dir)
                              }
                            />
                          ) : (
                            <span className="text-xs text-[var(--app-text-muted)]">·</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Integration / PM rows — each is its own flex row for height lock */}
              {isExpanded
                ? rowKeys.map((rowKey) => {
                    const label =
                      rowKey === PM_FORECAST_ROW_KEY
                        ? project.pmLabel
                        : (project.integrations.find((i) => i.key === rowKey)?.label ?? rowKey);
                    const rowActive = isActiveProject && activeRowKey === rowKey;
                    const rowHours = Math.max(
                      0,
                      sumRowRemainingHours(displayHours[rowKey], currentSunday),
                    );
                    const rowOriginal = Math.max(
                      0,
                      sumRowRemainingHours(sessionHours[rowKey], currentSunday),
                    );
                    const showRowDelta =
                      showSessionTotals &&
                      rowHoursDiffer(displayHours[rowKey], sessionHours[rowKey], sharedWeeks);
                    return (
                      <div
                        key={rowKey}
                        className={`flex ${ROW_DIVIDER}`}
                        style={{ height: DATA_ROW_PX }}
                      >
                        <div
                          className={`relative flex shrink-0 items-center overflow-hidden border-r border-[var(--app-border)] px-2 pr-3 pl-10 shadow-[4px_0_8px_-4px_color-mix(in_oklab,var(--app-text)_14%,transparent)] ${
                            rowActive
                              ? "bg-[color-mix(in_oklab,var(--app-info-surface)_70%,var(--app-surface-muted-solid))]"
                              : "bg-[var(--app-surface-muted-solid)]"
                          }`}
                          style={{ width: trackColPx, height: DATA_ROW_PX }}
                          title={
                            showRowDelta
                              ? `${label}: ${formatSummaryHours(rowOriginal)} → ${formatSummaryHours(rowHours)}`
                              : label
                          }
                        >
                          <div className="min-w-0 flex-1">
                            <span className="line-clamp-2 text-sm leading-snug text-[var(--app-text)]">
                              {label}
                            </span>
                            {showRowDelta ? (
                              <div className="mt-0.5 truncate text-[10px] tabular-nums text-[var(--app-text-muted)]">
                                <span className="line-through opacity-70">
                                  {formatSummaryHours(rowOriginal)}
                                </span>
                                {" → "}
                                <span className="font-medium text-[var(--app-text)]">
                                  {formatSummaryHours(rowHours)}
                                </span>
                              </div>
                            ) : null}
                          </div>
                          {renderTrackColResizeHandle()}
                        </div>

                        <div
                          data-forecast-week-scroll
                          className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                          style={{ height: DATA_ROW_PX }}
                          onScroll={(e) => syncWeekScroll(e.currentTarget)}
                        >
                          <div className="grid h-full items-center" style={weeksGridStyle}>
                            {sharedWeeks.map((w) => {
                              const h = Math.max(0, Math.round(displayHours[rowKey]?.[w] ?? 0));
                              const inTimeline = weekInSpan(
                                w,
                                project.timelineStartYmd,
                                project.timelineEndYmd,
                              );
                              const past = w < currentSunday;
                              const canEdit = hasForecast && !past && inTimeline;
                              const isPhaseBoundary = phaseBoundaries.has(w);
                              const editProps = cellEditProps(rowKey, w);
                              return (
                                <div
                                  key={w}
                                  className={`flex h-full items-center justify-center ${
                                    isPhaseBoundary ? PHASE_DIVIDER_ROW : ""
                                  } ${
                                    w === currentSunday || w === scrollTargetWeekYmd
                                      ? "bg-[var(--app-info-surface)]"
                                      : "bg-[color-mix(in_oklab,var(--app-surface-alt)_40%,var(--app-surface))]"
                                  }`}
                                >
                                  {inTimeline ? (
                                    <ForecastWeekCell
                                      hours={h}
                                      editable={canEdit}
                                      locked={past}
                                      cellId={`${project.id}:${rowKey}:${w}`}
                                      {...editProps}
                                      onCommitHours={(next) =>
                                        applyRowEdit(project, rowKey, w, next)
                                      }
                                      onNavigateWeek={(dir) =>
                                        navigateWeek(project.id, rowKey, w, dir)
                                      }
                                    />
                                  ) : (
                                    <span className="text-xs text-[var(--app-text-muted)]">·</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })
                : null}
            </div>
          );
        })}
      </div>

      {generateFor ? (
        <GenerateForecastDialog
          projectId={generateFor.id}
          projectLabel={generateFor.customer_name}
          phases={generateFor.phases}
          integrations={generateFor.integrations}
          actualsByRowKey={generateFor.actualsByRowKey}
          deploymentEffortByPhase={deploymentEffortByPhase}
          defaultPmPercent={generateFor.forecast?.pm_percent ?? DEFAULT_FORECAST_PM_PERCENT}
          defaultSpreadMode={generateFor.forecast?.spread_mode ?? "even"}
          defaultIncludePastPhaseHours={
            generateFor.forecast?.include_past_phases_in_spread ?? false
          }
          hasExistingForecast={generateFor.forecast != null}
          todayIso={todayIso}
          onClose={() => setGenerateFor(null)}
          onGenerated={(project) => {
            clearAutosaveTimer();
            saveEpochRef.current += 1;
            setProjectEdits((prev) => {
              const next = { ...prev };
              delete next[generateFor.id];
              return next;
            });
            if (activeProjectId === generateFor.id) {
              setActiveProjectId(null);
              setActiveRowKey(null);
              editingIdRef.current = null;
              draftRef.current = null;
              persistedRef.current = null;
              reserveHoursRef.current = null;
            }
            if (project) {
              setProjects((prev) => prev.map((p) => (p.id === project.id ? project : p)));
            }
            setGenerateFor(null);
            router.refresh();
          }}
        />
      ) : null}

      {discardOpen ? (
        <dialog
          ref={discardDialogRef}
          className="fixed left-1/2 top-1/2 z-[220] w-[min(100vw-2rem,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border-0 p-0 shadow-xl"
          style={{ background: "var(--app-surface)", color: "var(--app-text)" }}
          onClose={closeDiscardDialog}
        >
          <div className="p-5">
            <h2 className="text-base font-medium">Switch projects?</h2>
            <p className="mt-2 text-sm text-[var(--app-text-muted)]">
              Save current forecast edits before editing another project?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn-cta-tertiary" onClick={closeDiscardDialog}>
                Keep editing
              </button>
              <button
                type="button"
                className="btn-cta-tertiary"
                onClick={() => {
                  const action = pendingLeaveAction;
                  discardActiveUnsaved();
                  clearAutosaveTimer();
                  closeDiscardDialog();
                  action?.();
                }}
              >
                Discard
              </button>
              <button
                type="button"
                className="btn-cta-dark"
                onClick={() => {
                  const action = pendingLeaveAction;
                  flushSave({
                    after: () => {
                      closeDiscardDialog();
                      action?.();
                    },
                  });
                }}
              >
                Save &amp; switch
              </button>
            </div>
          </div>
        </dialog>
      ) : null}
    </div>
  );
}
