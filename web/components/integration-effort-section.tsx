"use client";

import {
  createInternalInitiativeManualEffortEntry,
  updateInternalInitiativeManualEffortEntry,
} from "@/lib/actions/internal-initiative-manual-effort";
import { patchInternalInitiativeEstimatedEffort } from "@/lib/actions/internal-tasks";
import { createIntegrationManualEffortEntry, updateIntegrationManualEffortEntry } from "@/lib/actions/integration-manual-effort";
import { patchProjectIntegrationEstimatedEffort } from "@/lib/actions/projects";
import { CanvasArrowLeftIcon, CanvasArrowRightIcon } from "@/components/canvas-arrow-icons";
import { CanvasSelect, type CanvasSelectOption } from "@/components/canvas-select";
import { DialogCloseButton } from "@/components/dialog-close-button";
import {
  ActualsCalendarGrid,
  MonthGrid,
  type CalendarBlock,
  formatDurationFromSlots,
  slotToLocalDateTime,
  slotToTimeLabel,
} from "@/components/effort-calendar-grids";
import {
  effortPeriodBounds,
  effortPeriodTotalHours,
  effortTotalActualHours,
  formatEffortHoursLabel,
  formatLocalYmd,
  parseLocalYmd,
  localWeekDayStartsSunday,
  startOfLocalWeekSunday,
  type EffortSessionInput,
  type EffortView,
} from "@/lib/integration-effort-buckets";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
    return anchor.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "short", day: "numeric" });
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

function parseEstimateInput(raw: string): { ok: true; hours: number | null } | { ok: false; error: string } {
  const t = raw.trim();
  if (t === "") return { ok: true, hours: null };
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: "Enter a non-negative number" };
  const q = Math.round(n * 4) / 4;
  if (Math.abs(n - q) > 1e-6) return { ok: false, error: "Use quarter-hour steps (e.g. 80)" };
  return { ok: true, hours: q };
}

function formatEstimateFieldValue(hours: number | null): string {
  if (hours == null) return "";
  return Number.isInteger(hours) ? String(hours) : String(parseFloat(hours.toFixed(2)));
}

export type IntegrationEffortTarget =
  | {
      kind: "project_integration";
      projectIntegrationId: string;
      projectLabel: string;
      integrationLabel: string;
    }
  | {
      kind: "internal_initiative";
      initiativeId: string;
      projectLabel: string;
      integrationLabel: string;
    };

export function IntegrationEffortSection({
  effortTarget,
  initialEstimatedEffortHours,
  sessions,
  className = "",
}: {
  effortTarget: IntegrationEffortTarget;
  initialEstimatedEffortHours: number | null;
  sessions: EffortSessionInput[];
  className?: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<EffortView>("week");
  const [anchorYmd, setAnchorYmd] = useState(() => formatLocalYmd(new Date()));

  const [estimateEditing, setEstimateEditing] = useState(false);
  const [estimateDraft, setEstimateDraft] = useState(() => formatEstimateFieldValue(initialEstimatedEffortHours));
  const [estimateBanner, setEstimateBanner] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [estimateBannerText, setEstimateBannerText] = useState<string | null>(null);
  const saveGen = useRef(0);

  useEffect(() => {
    setEstimateDraft(formatEstimateFieldValue(initialEstimatedEffortHours));
  }, [initialEstimatedEffortHours]);

  const anchorDate = useMemo(() => parseLocalYmd(anchorYmd), [anchorYmd]);
  const { start: periodStart, endExclusive: periodEnd } = useMemo(
    () => effortPeriodBounds(view, anchorDate),
    [view, anchorDate],
  );

  const actualTotalAll = useMemo(() => effortTotalActualHours(sessions), [sessions]);
  const periodHours = useMemo(
    () => effortPeriodTotalHours(sessions, periodStart, periodEnd),
    [sessions, periodStart, periodEnd],
  );

  const remaining =
    initialEstimatedEffortHours != null && Number.isFinite(initialEstimatedEffortHours)
      ? initialEstimatedEffortHours - actualTotalAll
      : null;

  const saveEstimate = useCallback(
    async (raw: string) => {
      const parsed = parseEstimateInput(raw);
      if (!parsed.ok) {
        setEstimateBanner("error");
        setEstimateBannerText(parsed.error);
        return;
      }
      const gen = ++saveGen.current;
      setEstimateBanner("saving");
      setEstimateBannerText(null);
      const res =
        effortTarget.kind === "project_integration"
          ? await patchProjectIntegrationEstimatedEffort(effortTarget.projectIntegrationId, parsed.hours)
          : await patchInternalInitiativeEstimatedEffort(effortTarget.initiativeId, parsed.hours);
      if (gen !== saveGen.current) return;
      if (res.error) {
        setEstimateBanner("error");
        setEstimateBannerText(res.error);
        return;
      }
      router.refresh();
      setEstimateBanner("saved");
      setEstimateBannerText(null);
      setTimeout(() => {
        if (gen === saveGen.current) setEstimateBanner("idle");
      }, 2000);
    },
    [effortTarget, router],
  );

  const runEstimateSaveIfChanged = () => {
    const next = estimateDraft.trim();
    const currentField = formatEstimateFieldValue(initialEstimatedEffortHours);
    if (next === currentField || (next === "" && initialEstimatedEffortHours == null)) {
      setEstimateEditing(false);
      setEstimateBanner("idle");
      setEstimateBannerText(null);
      return;
    }
    void (async () => {
      await saveEstimate(estimateDraft);
      setEstimateEditing(false);
    })();
  };

  const goPrev = () => {
    if (view === "day") setAnchorYmd((y) => addDaysYmd(y, -1));
    else if (view === "week") setAnchorYmd((y) => addDaysYmd(y, -7));
    else setAnchorYmd((y) => addMonthsYmd(y, -1));
  };

  const goNext = () => {
    if (view === "day") setAnchorYmd((y) => addDaysYmd(y, 1));
    else if (view === "week") setAnchorYmd((y) => addDaysYmd(y, 7));
    else setAnchorYmd((y) => addMonthsYmd(y, 1));
  };

  const goToday = () => setAnchorYmd(formatLocalYmd(new Date()));

  const weekDays = useMemo(() => {
    const sun = startOfLocalWeekSunday(anchorDate);
    return localWeekDayStartsSunday(sun);
  }, [anchorDate]);

  // ── Create / edit dialog (lifted from ActualsCalendarGrid) ──────────────────
  const createDialogRef = useRef<HTMLDialogElement | null>(null);

  const timeOptions = useMemo((): { start: CanvasSelectOption[]; end: CanvasSelectOption[] } => {
    const start: CanvasSelectOption[] = [];
    for (let i = 0; i < 96; i++) start.push({ value: String(i), label: slotToTimeLabel(i) });
    const end: CanvasSelectOption[] = [];
    for (let i = 1; i < 96; i++) end.push({ value: String(i), label: slotToTimeLabel(i) });
    return { start, end };
  }, []);

  const [createDraft, setCreateDraft] = useState<{
    mode: "create" | "edit";
    manualEntryId: string | null;
    dayYmd: string;
    startSlot: number;
    endSlot: number;
    entry_type: "task" | "meeting";
    title: string;
    work_accomplished: string;
    saving: boolean;
    error: string | null;
  } | null>(null);

  const openCreateModal = useCallback((dayYmd: string, startSlot: number) => {
    const start = clamp(startSlot, 0, 95);
    const end = clamp(start + 2, 1, 95);
    setCreateDraft({
      mode: "create",
      manualEntryId: null,
      dayYmd,
      startSlot: start,
      endSlot: end,
      entry_type: "meeting",
      title: "",
      work_accomplished: "",
      saving: false,
      error: null,
    });
    requestAnimationFrame(() => createDialogRef.current?.showModal());
  }, []);

  const openEditManualModal = useCallback((b: CalendarBlock) => {
    const startSlot = clamp(Math.round(b.startMsInDay / (15 * 60_000)), 0, 95);
    const endSlot = clamp(Math.round(b.endMsInDay / (15 * 60_000)), 1, 95);
    setCreateDraft({
      mode: "edit",
      manualEntryId: b.source_id,
      dayYmd: b.dayYmd,
      startSlot,
      endSlot: Math.max(endSlot, startSlot + 1),
      entry_type: b.entry_type === "meeting" ? "meeting" : "task",
      title: b.title ?? "",
      work_accomplished: b.work_accomplished ?? "",
      saving: false,
      error: null,
    });
    requestAnimationFrame(() => createDialogRef.current?.showModal());
  }, []);

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
    if (createDraft.endSlot <= createDraft.startSlot) {
      setCreateDraft((prev) =>
        prev ? { ...prev, error: "End time must be after start time" } : prev,
      );
      return;
    }
    setCreateDraft((prev) => (prev ? { ...prev, saving: true, error: null } : prev));

    const started = slotToLocalDateTime(createDraft.dayYmd, createDraft.startSlot);
    const finishedSlot = clamp(createDraft.endSlot, 1, 95);
    const finished = slotToLocalDateTime(createDraft.dayYmd, finishedSlot);

    const manualPayload = {
      entry_type: createDraft.entry_type,
      title,
      started_at: started.toISOString(),
      finished_at: finished.toISOString(),
      work_accomplished: createDraft.work_accomplished.trim()
        ? createDraft.work_accomplished.trim()
        : null,
    };

    const res =
      effortTarget.kind === "project_integration"
        ? createDraft.mode === "edit" && createDraft.manualEntryId
          ? await updateIntegrationManualEffortEntry(
              effortTarget.projectIntegrationId,
              createDraft.manualEntryId,
              manualPayload,
            )
          : await createIntegrationManualEffortEntry(effortTarget.projectIntegrationId, manualPayload)
        : createDraft.mode === "edit" && createDraft.manualEntryId
          ? await updateInternalInitiativeManualEffortEntry(
              effortTarget.initiativeId,
              createDraft.manualEntryId,
              manualPayload,
            )
          : await createInternalInitiativeManualEffortEntry(effortTarget.initiativeId, manualPayload);

    if (res.error) {
      setCreateDraft((prev) =>
        prev ? { ...prev, saving: false, error: res.error ?? "Could not save" } : prev,
      );
      return;
    }
    closeCreateModal();
    router.refresh();
  }, [createDraft, effortTarget, closeCreateModal, router]);

  const viewSegIndex = view === "day" ? 0 : view === "week" ? 1 : 2;
  const viewSegWidthPx = 76; // 4.75rem @ 16px root

  const viewTabBtn = (v: EffortView, label: string, pos: "left" | "mid" | "right") => {
    const active = view === v;
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
          pos === "left" ? "rounded-l-[10px]" : "",
          pos === "right" ? "rounded-r-[10px]" : "",
        ].join(" ")}
        onClick={() => setView(v)}
      >
        {label}
      </button>
    );
  };

  return (
    <div className={`card-canvas flex min-h-0 flex-col gap-4 overflow-hidden p-4 ${className}`.trim()}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div
          className="hover-reveal-edit relative rounded-lg border p-3"
          style={{ borderColor: "var(--app-border)", background: "var(--app-surface-alt)" }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-canvas">Estimated</p>
              {!estimateEditing ? (
                <p className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: "var(--app-text)" }}>
                  {initialEstimatedEffortHours == null ? "—" : formatEffortHoursLabel(initialEstimatedEffortHours)}
                </p>
              ) : (
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    className="input-canvas h-9 w-[5.5rem] text-base"
                    aria-label="Estimated effort (hours)"
                    value={estimateDraft}
                    onChange={(e) => {
                      setEstimateDraft(e.target.value);
                      setEstimateBanner("idle");
                      setEstimateBannerText(null);
                    }}
                    placeholder="80"
                    autoComplete="off"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        runEstimateSaveIfChanged();
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setEstimateEditing(false);
                        setEstimateDraft(formatEstimateFieldValue(initialEstimatedEffortHours));
                        setEstimateBanner("idle");
                        setEstimateBannerText(null);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border text-[#f3f5f8] shadow-sm transition-[background-color,border-color,opacity] hover:enabled:bg-[color-mix(in_oklab,#1f2937_90%,#f3f5f8_10%)] hover:enabled:border-[color-mix(in_oklab,#4b5563_55%,#f3f5f8_12%)] disabled:cursor-not-allowed disabled:opacity-50"
                    style={{
                      borderColor: "color-mix(in oklab, #1f2937 78%, #4b5563 22%)",
                      background: "#1f2937",
                    }}
                    aria-label="Save estimated effort"
                    onClick={runEstimateSaveIfChanged}
                    disabled={estimateBanner === "saving"}
                  >
                    <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden>
                      <path
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M20 6 9 17l-5-5"
                      />
                    </svg>
                  </button>
                  <span className="text-xs text-muted-canvas">hrs</span>
                </div>
              )}
            </div>
            {!estimateEditing ? (
              <button
                type="button"
                className="hover-reveal-edit-btn border bg-[var(--app-surface)] text-[var(--app-text-muted)]"
                style={{ borderColor: "var(--app-border)" }}
                aria-label="Edit estimated effort"
                onClick={() => {
                  setEstimateEditing(true);
                  setEstimateBanner("idle");
                  setEstimateBannerText(null);
                  setEstimateDraft(formatEstimateFieldValue(initialEstimatedEffortHours));
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-[18px] w-[18px]"
                  aria-hidden
                >
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </button>
            ) : null}
          </div>
        </div>

        <div
          className="rounded-lg border p-3"
          style={{ borderColor: "var(--app-border)", background: "var(--app-surface-alt)" }}
        >
          <p className="text-xs font-medium text-muted-canvas">Actual</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: "var(--app-text)" }}>
            {formatEffortHoursLabel(actualTotalAll)}
          </p>
        </div>

        <div
          className="rounded-lg border p-3"
          style={{
            borderColor: "var(--app-border)",
            background:
              remaining == null
                ? "var(--app-surface)"
                : remaining < 0
                  ? "color-mix(in oklab, var(--app-danger) 18%, white)"
                  : "var(--app-info-surface)",
          }}
        >
          <p className="text-xs font-medium text-muted-canvas">Remaining</p>
          <p
            className="mt-1 text-2xl font-semibold tabular-nums"
            style={{
              color:
                remaining == null
                  ? "var(--app-text)"
                  : remaining < 0
                    ? "var(--app-danger)"
                    : "var(--app-action)",
            }}
          >
            {remaining == null ? "—" : formatEffortHoursLabel(remaining)}
          </p>
        </div>
      </div>

      <div className="min-h-[1.25rem] text-xs">
        {estimateBanner === "saving" ? <p className="text-muted-canvas">Saving estimate…</p> : null}
        {estimateBanner === "saved" ? (
          <p style={{ color: "color-mix(in oklab, var(--app-text-muted) 85%, green)" }}>Estimate saved</p>
        ) : null}
        {estimateBanner === "error" ? (
          <p style={{ color: "var(--app-danger)" }} role="alert">
            {estimateBannerText ?? "Could not save"}
          </p>
        ) : null}
      </div>

      <div>
        <p className="text-base font-semibold" style={{ color: "var(--app-text)" }}>
          Hours Worked
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <div
            role="tablist"
            aria-label="Effort view"
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
            {viewTabBtn("day", "Day", "left")}
            {viewTabBtn("week", "Week", "mid")}
            {viewTabBtn("month", "Month", "right")}
          </div>

          <div
            className="ml-1 inline-flex overflow-hidden rounded-[10px] border"
            style={{ borderColor: "var(--app-border)", background: "var(--app-surface-alt)" }}
          >
            <button
              type="button"
              className="inline-flex h-8 w-9 shrink-0 cursor-pointer items-center justify-center text-[var(--app-text)] transition-colors hover:bg-[color-mix(in_oklab,var(--app-surface-alt)_90%,var(--app-border))] disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Previous period"
              onClick={goPrev}
            >
              <CanvasArrowLeftIcon />
            </button>
            <div className="w-px self-stretch" style={{ background: "var(--app-border)" }} aria-hidden />
            <button
              type="button"
              className="inline-flex h-8 items-center justify-center whitespace-nowrap px-3 text-xs font-medium cursor-pointer text-[var(--app-text)] transition-colors hover:bg-[color-mix(in_oklab,var(--app-surface-alt)_90%,var(--app-border))] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={goToday}
            >
              Today
            </button>
            <div className="w-px self-stretch" style={{ background: "var(--app-border)" }} aria-hidden />
            <button
              type="button"
              className="inline-flex h-8 w-9 shrink-0 cursor-pointer items-center justify-center text-[var(--app-text)] transition-colors hover:bg-[color-mix(in_oklab,var(--app-surface-alt)_90%,var(--app-border))] disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Next period"
              onClick={goNext}
            >
              <CanvasArrowRightIcon />
            </button>
          </div>
        </div>

        <p className="self-end pb-0.5 text-sm text-muted-canvas">
          {view === "day" ? "This day" : view === "week" ? "This week" : "This month"}:{" "}
          <strong className="font-semibold tabular-nums" style={{ color: "var(--app-text)" }}>
            {formatEffortHoursLabel(periodHours)}
          </strong>
        </p>
      </div>

      {view === "day" ? (
        <div className="min-h-0 flex-1">
          <ActualsCalendarGrid
            days={[anchorDate]}
            sessions={sessions}
            onDayColumnClick={openCreateModal}
            onEditManualEntry={openEditManualModal}
          />
        </div>
      ) : null}

      {view === "week" ? (
        <div className="min-h-0 flex-1">
          <ActualsCalendarGrid
            days={weekDays}
            sessions={sessions}
            onDayColumnClick={openCreateModal}
            onEditManualEntry={openEditManualModal}
          />
        </div>
      ) : null}

      {view === "month" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mb-2 flex flex-col gap-2">
            <div
              className="w-full rounded-md border px-3 py-2 text-center"
              style={{ borderColor: "var(--app-border)", background: "var(--app-surface-muted-solid)" }}
            >
              <p className="text-sm font-medium tabular-nums" style={{ color: "var(--app-text)" }}>
                {formatPeriodTitle("month", anchorYmd)}
              </p>
            </div>
          </div>
          <MonthGrid anchorYmd={anchorYmd} sessions={sessions} />
        </div>
      ) : null}

      {/* Create / edit manual effort entry dialog */}
      <dialog
        ref={createDialogRef}
        className="app-catalog-dialog fixed left-1/2 top-1/2 z-[220] w-[min(100vw-2rem,38rem)] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden border-0 p-0 shadow-xl"
        style={{ borderRadius: "12px", background: "var(--app-surface)", color: "var(--app-text)" }}
        onClose={(e) => {
          if (e.target !== createDialogRef.current) return;
          setCreateDraft(null);
        }}
      >
        <div className="flex max-h-[min(92dvh,44rem)] flex-col">
          <div
            className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3"
            style={{ borderColor: "var(--app-border)" }}
          >
            <div className="min-w-0 flex-1 pr-2">
              <h2 className="text-base font-semibold" style={{ color: "var(--app-text)" }}>
                {createDraft?.mode === "edit" ? "Edit Entry" : "Add Task or Meeting"}
              </h2>
              <p
                className="mt-0.5 truncate text-sm text-muted-canvas"
                title={`${effortTarget.projectLabel} · ${effortTarget.integrationLabel}`}
              >
                {effortTarget.projectLabel} · {effortTarget.integrationLabel}
              </p>
            </div>
            <DialogCloseButton onClick={closeCreateModal} />
          </div>

          <div className="min-h-0 flex-1 overflow-visible p-4">
            {!createDraft ? null : (
              <div className="grid grid-cols-1 gap-3">
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
                      placeholder={
                        createDraft.entry_type === "meeting" ? "e.g. Weekly sync" : "e.g. Fix auth bug"
                      }
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
                          setCreateDraft((prev) =>
                            prev ? { ...prev, entry_type: "meeting" } : prev,
                          )
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
                  <label
                    className="canvas-select-field flex flex-col gap-1 text-xs"
                    style={{ color: "var(--app-text-muted)" }}
                  >
                    Start Time
                    <CanvasSelect
                      name="manual_effort_started_slot"
                      options={timeOptions.start}
                      value={String(createDraft.startSlot)}
                      onValueChange={(v) => {
                        const startSlot = Number(v);
                        setCreateDraft((prev) => {
                          if (!prev) return prev;
                          const endSlot =
                            prev.endSlot <= startSlot ? Math.min(startSlot + 1, 95) : prev.endSlot;
                          return { ...prev, startSlot, endSlot, error: null };
                        });
                      }}
                    />
                  </label>

                  <label
                    className="canvas-select-field flex flex-col gap-1 text-xs"
                    style={{ color: "var(--app-text-muted)" }}
                  >
                    End Time
                    <CanvasSelect
                      name="manual_effort_finished_slot"
                      options={timeOptions.end}
                      value={String(createDraft.endSlot)}
                      onValueChange={(v) => {
                        const endSlot = Number(v);
                        setCreateDraft((prev) => (prev ? { ...prev, endSlot, error: null } : prev));
                      }}
                    />
                  </label>
                </div>

                <p className="-mt-1 text-xs text-muted-canvas">
                  Duration:{" "}
                  <span className="font-medium" style={{ color: "var(--app-text)" }}>
                    {formatDurationFromSlots(createDraft.startSlot, createDraft.endSlot)}
                  </span>
                </p>

                <label className="mt-10 text-xs font-medium text-muted-canvas">
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

                <div className="flex items-center justify-end gap-2 pt-1">
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
                    onClick={saveCreate}
                    disabled={createDraft.saving}
                  >
                    {createDraft.saving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </dialog>
    </div>
  );
}
