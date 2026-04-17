"use client";

import { patchProjectIntegrationEstimatedEffort } from "@/lib/actions/projects";
import { createIntegrationManualEffortEntry, updateIntegrationManualEffortEntry } from "@/lib/actions/integration-manual-effort";
import { CanvasArrowLeftIcon, CanvasArrowRightIcon } from "@/components/canvas-arrow-icons";
import { CanvasSelect, type CanvasSelectOption } from "@/components/canvas-select";
import { DialogCloseButton } from "@/components/dialog-close-button";
import {
  effortPeriodBounds,
  effortPeriodTotalHours,
  effortProratedHoursByLocalDay,
  effortTotalActualHours,
  formatEffortHoursLabel,
  formatLocalYmd,
  localDayStart,
  parseLocalYmd,
  startOfLocalMonth,
  localWeekDayStartsSunday,
  startOfLocalWeekSunday,
  startOfNextLocalMonth,
  type EffortSessionInput,
  type EffortView,
} from "@/lib/integration-effort-buckets";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const DAY_MS = 86_400_000;
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

type CalendarBlock = {
  key: string;
  dayYmd: string;
  startMsInDay: number;
  endMsInDay: number;
  duration_hours: number;
  title: string;
  work_accomplished: string | null;
  source: EffortSessionInput["source"];
  source_id: string;
  entry_type?: "task" | "meeting";
};

function TaskEffortIcon({ size = 10, className = "" }: { size?: number; className?: string }) {
  // Same visual as the Tasks "WorkOnTaskIcon", just smaller.
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className={className}>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M22 12h-4l-3 9L9 3l-3 9H2"
      />
    </svg>
  );
}

function hourLabel(h: number): string {
  const hh = h % 24;
  const am = hh < 12;
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}${am ? "AM" : "PM"}`;
}

function clamp(n: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, n));
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function slotToTimeLabel(slot: number): string {
  const totalMin = clamp(slot | 0, 0, 95) * 15;
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  const am = hh < 12;
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  const suf = am ? "AM" : "PM";
  return `${h12}:${pad2(mm)}${suf}`;
}

function slotToLocalDateTime(dayYmd: string, slot: number): Date {
  const d = parseLocalYmd(dayYmd);
  const totalMin = clamp(slot | 0, 0, 95) * 15;
  d.setHours(Math.floor(totalMin / 60), totalMin % 60, 0, 0);
  return d;
}

function formatDurationFromSlots(startSlot: number, endSlot: number): string {
  const slots = Math.max(0, (endSlot | 0) - (startSlot | 0));
  const totalMin = slots * 15;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (totalMin === 0) return "0 min";
  if (h === 0) return `${m} min`;
  if (m === 0) return h === 1 ? "1 hr" : `${h} hrs`;
  return `${h} hr ${m} min`;
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

function MonthGrid({
  anchorYmd,
  sessions,
}: {
  anchorYmd: string;
  sessions: EffortSessionInput[];
}) {
  const { monthStart, monthEnd, dim, pad } = useMemo(() => {
    const anchor = parseLocalYmd(anchorYmd);
    const ms = startOfLocalMonth(anchor);
    const me = startOfNextLocalMonth(anchor);
    const d = Math.round((me.getTime() - ms.getTime()) / DAY_MS);
    const p = ms.getDay(); // Sun=0 ... Sat=6 (month grid starts on Sunday)
    return { monthStart: ms, monthEnd: me, dim: d, pad: p };
  }, [anchorYmd]);

  const hoursByDay = useMemo(
    () => effortProratedHoursByLocalDay(sessions, monthStart, monthEnd),
    [sessions, monthStart, monthEnd],
  );

  const totalCells = Math.ceil((pad + dim) / 7) * 7;

  const cells: { key: string; dayNum: number | null; ymd: string | null }[] = [];
  for (let i = 0; i < totalCells; i++) {
    const dayIndex = i - pad + 1;
    if (dayIndex < 1 || dayIndex > dim) {
      cells.push({ key: `e-${i}`, dayNum: null, ymd: null });
    } else {
      const d = new Date(monthStart);
      d.setDate(d.getDate() + dayIndex - 1);
      cells.push({ key: formatLocalYmd(d), dayNum: dayIndex, ymd: formatLocalYmd(d) });
    }
  }

  return (
    <div className="mt-2">
      <div className="grid grid-cols-7 gap-1 text-center text-[0.65rem] font-medium uppercase tracking-wide text-muted-canvas">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c) => {
          if (c.ymd == null) {
            return <div key={c.key} className="min-h-[3.25rem] rounded-md bg-transparent" />;
          }
          const h = hoursByDay.get(c.ymd) ?? 0;
          const has = h > 0.001;
          return (
            <div
              key={c.key}
              className="flex min-h-[3.25rem] flex-col items-center justify-start rounded-md border px-0.5 py-1"
              style={{
                borderColor: "var(--app-border)",
                background: has ? "var(--app-info-surface)" : "var(--app-surface)",
              }}
            >
              <span className="text-xs font-medium" style={{ color: "var(--app-text)" }}>
                {c.dayNum}
              </span>
              {has ? (
                <span className="mt-0.5 text-[0.7rem] font-medium tabular-nums" style={{ color: "var(--app-action)" }}>
                  {formatEffortHoursLabel(h)}
                </span>
              ) : (
                <span className="mt-0.5 text-[0.65rem] text-muted-canvas">—</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActualsCalendarGrid({
  days,
  sessions,
  projectIntegrationId,
  projectLabel,
  integrationLabel,
}: {
  days: Date[];
  sessions: EffortSessionInput[];
  projectIntegrationId: string;
  projectLabel: string;
  integrationLabel: string;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState<{
    key: string;
    x: number;
    y: number;
    title: string;
    manualTypeLabel: string | null;
    timeLabel: string;
    durationLabel: string;
    note: string | null;
  } | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());
  /** Defer the positioned “now” line until after mount so SSR HTML matches the first client render. */
  const [liveClockReady, setLiveClockReady] = useState(false);
  const [hoverPreview, setHoverPreview] = useState<{ dayYmd: string; startSlot: number } | null>(null);

  const createDialogRef = useRef<HTMLDialogElement | null>(null);
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

  const timeOptions = useMemo((): { start: CanvasSelectOption[]; end: CanvasSelectOption[] } => {
    const start: CanvasSelectOption[] = [];
    for (let i = 0; i < 96; i++) start.push({ value: String(i), label: slotToTimeLabel(i) });

    const end: CanvasSelectOption[] = [];
    for (let i = 1; i < 96; i++) end.push({ value: String(i), label: slotToTimeLabel(i) });

    return { start, end };
  }, []);

  // Always render a full 24-hour grid; the default view is achieved via scroll position.
  const visibleStartHour = 0;
  const visibleEndHourExclusive = 24;
  const visibleStartMs = 0;
  const visibleEndMs = DAY_MS;
  const visibleMs = DAY_MS;
  const hourHeight = 64;
  const gridHeight = ((visibleEndHourExclusive - visibleStartHour) * hourHeight) | 0;
  const offHourShade = "color-mix(in oklab, var(--app-surface-alt) 55%, white)";
  const normalStartHour = 7;
  const normalEndHourExclusive = 18;
  const offEarlyTop = 0;
  const offEarlyHeight = (normalStartHour - visibleStartHour) * hourHeight;
  const offLateTop = (normalEndHourExclusive - visibleStartHour) * hourHeight;
  const offLateHeight = (visibleEndHourExclusive - normalEndHourExclusive) * hourHeight;

  const hours = useMemo(() => {
    const out: number[] = [];
    for (let h = visibleStartHour; h <= visibleEndHourExclusive; h++) out.push(h);
    return out;
  }, [visibleStartHour, visibleEndHourExclusive]);

  const dayYmds = useMemo(() => days.map((d) => formatLocalYmd(d)), [days]);
  const dayYmdKey = dayYmds.join("|");
  const isWeekView = dayYmds.length > 1;
  const nowDayYmd = formatLocalYmd(now);
  const nowMsInDay =
    now.getHours() * 3_600_000 + now.getMinutes() * 60_000 + now.getSeconds() * 1_000 + now.getMilliseconds();
  const dayColumnsTemplate = useMemo(() => {
    if (!isWeekView) return `72px repeat(${dayYmds.length}, minmax(9rem, 1fr))`;
    const cols = dayYmds
      .map((ymd) => (ymd === nowDayYmd ? "minmax(10rem, 1.14fr)" : "minmax(9rem, 1fr)"))
      .join(" ");
    return `72px ${cols}`;
  }, [isWeekView, dayYmds, nowDayYmd]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    el.scrollTop = normalStartHour * hourHeight;
  }, [dayYmdKey, normalStartHour, hourHeight]);

  useEffect(() => {
    setLiveClockReady(true);
    const tick = () => setNow(new Date());
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const blocksByDay = useMemo(() => {
    const SLOT_MS = 15 * 60_000;
    const map = new Map<string, CalendarBlock[]>();
    for (const d of days) map.set(formatLocalYmd(d), []);

    for (const s of sessions) {
      const dh = Number(s.duration_hours);
      if (!Number.isFinite(dh) || dh <= 0) continue; // don’t render 0-hr sessions
      const slotsNeeded = Math.round(dh * 4);
      if (slotsNeeded <= 0) continue;

      const dayStart = localDayStart(new Date(s.started_at));
      const startMs = new Date(s.started_at).getTime();
      const endMs = new Date(s.finished_at).getTime();
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;

      // Walk days spanned by this session (rare but safe).
      let cur = localDayStart(new Date(startMs)).getTime();
      while (cur < endMs) {
        const next = cur + DAY_MS;
        const dayKey = formatLocalYmd(new Date(cur));
        if (map.has(dayKey)) {
          const segA = Math.max(startMs, cur);
          const segB = Math.min(endMs, next);
          if (segB > segA) {
            // Quantize start to 15-minute boundary (round down), then pack forward to avoid overlap.
            // Note: duration is authoritative (15-min bands); wall-clock times are used as a hint for placement.
            const rawStartInDay = segA - cur;
            const rawSlot = Math.floor(rawStartInDay / SLOT_MS);
            map.get(dayKey)!.push({
              key: `${dayKey}-${s.source}-${s.source_id}-${startMs}-${endMs}`,
              dayYmd: dayKey,
              startMsInDay: rawSlot * SLOT_MS,
              endMsInDay: (rawSlot + slotsNeeded) * SLOT_MS,
              duration_hours: dh,
              title: s.title || (s.source === "manual" ? (s.entry_type === "meeting" ? "Meeting" : "Task") : "Task"),
              work_accomplished: s.work_accomplished,
              source: s.source,
              source_id: s.source_id,
              entry_type: s.entry_type,
            });
          }
        }
        cur = next;
      }
      void dayStart;
    }

    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => a.startMsInDay - b.startMsInDay);
      // De-overlap by packing forward on 15-min slots within the day.
      const occupied = new Array(96).fill(false);
      const packed: CalendarBlock[] = [];
      for (const b of arr) {
        const slotsNeeded = Math.max(1, Math.round(Number(b.duration_hours) * 4));
        if (slotsNeeded <= 0) continue;
        let slot = Math.floor(b.startMsInDay / SLOT_MS);
        slot = Math.max(0, Math.min(96 - slotsNeeded, slot));
        while (slot <= 96 - slotsNeeded) {
          let ok = true;
          for (let i = 0; i < slotsNeeded; i++) {
            if (occupied[slot + i]) {
              ok = false;
              break;
            }
          }
          if (ok) break;
          slot += 1;
        }
        if (slot > 96 - slotsNeeded) continue; // no room; drop
        for (let i = 0; i < slotsNeeded; i++) occupied[slot + i] = true;
        packed.push({
          ...b,
          startMsInDay: slot * SLOT_MS,
          endMsInDay: (slot + slotsNeeded) * SLOT_MS,
        });
      }
      packed.sort((a, b) => a.startMsInDay - b.startMsInDay);
      map.set(k, packed);
    }
    return map;
  }, [days, sessions]);

  const onBlockActivate = (b: CalendarBlock, el: HTMLElement) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const wr = wrap.getBoundingClientRect();
    const br = el.getBoundingClientRect();

    const dayStart = localDayStart(parseLocalYmd(b.dayYmd)).getTime();
    const t0 = new Date(dayStart + b.startMsInDay);
    const t1 = new Date(dayStart + b.endMsInDay);
    const timeLabel = `${t0.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}–${t1.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;

    setActive({
      key: b.key,
      // Position within the scroll container’s content coordinates (account for scroll offsets).
      x: clamp(br.left - wr.left + wrap.scrollLeft + br.width + 10, 8, wrap.scrollLeft + wr.width - 280),
      y: clamp(br.top - wr.top + wrap.scrollTop, 8, wrap.scrollTop + wr.height - 140),
      title: b.title || "Task",
      manualTypeLabel: b.source === "manual" ? `(${b.entry_type === "meeting" ? "meeting" : "task"})` : null,
      timeLabel,
      durationLabel: formatEffortHoursLabel(b.duration_hours),
      note: b.work_accomplished?.trim() ? b.work_accomplished.trim() : null,
    });
  };

  const slotFromColumnPoint = (col: HTMLDivElement, clientY: number): number => {
    const r = col.getBoundingClientRect();
    const y = clamp(clientY - r.top, 0, r.height);
    const msInDay = (y / r.height) * DAY_MS;
    return clamp(Math.floor(msInDay / (15 * 60_000)), 0, 95);
  };

  const openCreateModal = (dayYmd: string, startSlot: number) => {
    const start = clamp(startSlot, 0, 95);
    const end = clamp(start + 2, 1, 95); // default 30 minutes
    setHoverPreview(null);
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
  };

  const openEditManualModal = (b: CalendarBlock) => {
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
  };

  const onDayColumnClick = (ymd: string, e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement | null)?.closest?.("button[data-effort-block='1']")) return;
    const slot = slotFromColumnPoint(e.currentTarget, e.clientY);
    openCreateModal(ymd, slot);
  };

  const closeCreateModal = () => {
    createDialogRef.current?.close();
  };

  const saveCreate = async () => {
    if (!createDraft) return;
    if (createDraft.saving) return;

    const title = createDraft.title.trim();
    if (!title) {
      setCreateDraft((prev) => (prev ? { ...prev, error: "Title is required" } : prev));
      return;
    }
    if (createDraft.endSlot <= createDraft.startSlot) {
      setCreateDraft((prev) => (prev ? { ...prev, error: "End time must be after start time" } : prev));
      return;
    }

    setCreateDraft((prev) => (prev ? { ...prev, saving: true, error: null } : prev));

    const started = slotToLocalDateTime(createDraft.dayYmd, createDraft.startSlot);
    const finishedSlot = clamp(createDraft.endSlot, 1, 95);
    const finished = slotToLocalDateTime(createDraft.dayYmd, finishedSlot);

    const res =
      createDraft.mode === "edit" && createDraft.manualEntryId
        ? await updateIntegrationManualEffortEntry(projectIntegrationId, createDraft.manualEntryId, {
            entry_type: createDraft.entry_type,
            title,
            started_at: started.toISOString(),
            finished_at: finished.toISOString(),
            work_accomplished: createDraft.work_accomplished.trim() ? createDraft.work_accomplished.trim() : null,
          })
        : await createIntegrationManualEffortEntry(projectIntegrationId, {
            entry_type: createDraft.entry_type,
            title,
            started_at: started.toISOString(),
            finished_at: finished.toISOString(),
            work_accomplished: createDraft.work_accomplished.trim() ? createDraft.work_accomplished.trim() : null,
          });

    if (res.error) {
      setCreateDraft((prev) => (prev ? { ...prev, saving: false, error: res.error ?? "Could not save" } : prev));
      return;
    }
    closeCreateModal();
  };

  return (
    <div className="mt-1">
      <div className="h-[min(52rem,82vh)]">
        <div
          ref={wrapRef}
          className="relative h-full min-w-0 overflow-auto rounded-lg border"
          style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}
          onPointerDown={() => setActive(null)}
          onMouseLeave={() => setActive(null)}
        >
          {/* Header row */}
          <div
            className="grid sticky top-0 z-[2] border-b"
            style={{
              gridTemplateColumns: dayColumnsTemplate,
              borderColor: "var(--app-border)",
              background: "var(--app-surface-muted-solid)",
            }}
          >
            <div className="flex flex-col items-center justify-between px-2 py-2 text-xs font-medium text-muted-canvas">
              <div className="h-7 w-7" aria-hidden />
              <div className="flex items-end justify-center">Time</div>
            </div>
            {dayYmds.map((ymd) => {
              const d = parseLocalYmd(ymd);
              const isTodayColumn = ymd === nowDayYmd;
              const wd = d.toLocaleDateString(undefined, { weekday: "short" });
              const md = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
              const dayTotal = (blocksByDay.get(ymd) ?? []).reduce((sum, b) => sum + (Number.isFinite(b.duration_hours) ? b.duration_hours : 0), 0);
              const showTotal = dayTotal > 0.001;
              return (
                <div
                  key={ymd}
                  className="flex flex-col items-center justify-between px-2 py-2 text-xs font-medium"
                  style={{
                    color: "var(--app-text)",
                    background: isTodayColumn ? "color-mix(in oklab, var(--app-info-surface) 72%, white)" : "transparent",
                  }}
                >
                  <div
                    className="inline-flex h-7 min-w-10 items-center justify-center rounded-md px-2 text-[11px] font-semibold tabular-nums"
                    style={{
                      background: showTotal ? "var(--app-info-surface)" : "transparent",
                      color: "var(--app-action)",
                    }}
                    aria-label={showTotal ? `Total hours: ${formatEffortHoursLabel(dayTotal)}` : undefined}
                    title={showTotal ? `Total: ${formatEffortHoursLabel(dayTotal)}` : undefined}
                  >
                    {showTotal ? String(parseFloat(dayTotal.toFixed(2))).replace(/\.0+$/, "") : null}
                  </div>
                  <div className="mt-1.5 flex items-end justify-center">
                    <span className="mr-2 text-muted-canvas">{wd}</span>
                    <span className="tabular-nums">{md}</span>
                    {isTodayColumn ? (
                      <span
                        className="ml-2 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                        style={{
                          background: "color-mix(in oklab, var(--app-action) 16%, white)",
                          color: "var(--app-action)",
                        }}
                      >
                        Today
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Body */}
          <div
            className="grid"
            style={{
              gridTemplateColumns: dayColumnsTemplate,
            }}
          >
            {/* Y-axis */}
            <div className="relative border-r" style={{ borderColor: "var(--app-border)" }}>
              <div className="sticky left-0">
                <div className="relative" style={{ height: `${gridHeight}px` }}>
                  {true ? (
                    <div
                      className="absolute left-0 right-0"
                      style={{ top: offEarlyTop, height: offEarlyHeight, background: offHourShade }}
                      aria-hidden
                    />
                  ) : null}
                  {true ? (
                    <div
                      className="absolute left-0 right-0"
                      style={{ top: offLateTop, height: offLateHeight, background: offHourShade }}
                      aria-hidden
                    />
                  ) : null}
                  {hours.map((h, idx) => {
                    if (h === visibleEndHourExclusive) return null;
                    const top = idx * hourHeight;
                    return (
                      <div key={h} className="absolute left-0 right-0" style={{ top, height: hourHeight }}>
                        <div className="flex h-full items-start justify-center px-2 pt-1 text-[11px] text-muted-canvas">
                          {hourLabel(h)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Day columns */}
            {dayYmds.map((ymd) => {
              const blocks = blocksByDay.get(ymd) ?? [];
              const isTodayColumn = ymd === nowDayYmd;
              const showNowIndicator = liveClockReady && isTodayColumn;
              const nowTopPx = (() => {
                const px = (clamp(nowMsInDay, visibleStartMs, visibleEndMs) / DAY_MS) * gridHeight;
                return `${Math.round(px * 100) / 100}px`;
              })();
              return (
                <div
                  key={ymd}
                  className="relative border-r last:border-r-0"
                  style={{
                    borderColor: "var(--app-border)",
                  }}
                >
                  <div
                    className="relative isolate cursor-pointer"
                    style={{
                      height: `${gridHeight}px`,
                      background: isTodayColumn
                        ? "color-mix(in oklab, var(--app-info-surface) 78%, white)"
                        : "transparent",
                    }}
                    onClick={(e) => onDayColumnClick(ymd, e)}
                    onMouseEnter={(e) => {
                      if ((e.target as HTMLElement | null)?.closest?.("button[data-effort-block='1']")) return;
                      const slot = slotFromColumnPoint(e.currentTarget, e.clientY);
                      setHoverPreview({ dayYmd: ymd, startSlot: slot });
                    }}
                    onMouseMove={(e) => {
                      if ((e.target as HTMLElement | null)?.closest?.("button[data-effort-block='1']")) {
                        setHoverPreview((prev) => (prev?.dayYmd === ymd ? null : prev));
                        return;
                      }
                      const slot = slotFromColumnPoint(e.currentTarget, e.clientY);
                      setHoverPreview((prev) => {
                        if (prev?.dayYmd === ymd && prev.startSlot === slot) return prev;
                        return { dayYmd: ymd, startSlot: slot };
                      });
                    }}
                    onMouseLeave={() => setHoverPreview((prev) => (prev?.dayYmd === ymd ? null : prev))}
                    role="button"
                    tabIndex={0}
                    aria-label={`Add task or meeting on ${ymd}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openCreateModal(ymd, 9 * 4); // default 9:00 if keyboard-triggered
                      }
                    }}
                  >
                    {true ? (
                      <div
                        className="absolute left-0 right-0"
                        style={{ top: offEarlyTop, height: offEarlyHeight, background: offHourShade }}
                        aria-hidden
                      />
                    ) : null}
                    {true ? (
                      <div
                        className="absolute left-0 right-0"
                        style={{ top: offLateTop, height: offLateHeight, background: offHourShade }}
                        aria-hidden
                      />
                    ) : null}
                    {/* hour grid lines */}
                    {hours.map((h, idx) => {
                      if (h === visibleEndHourExclusive) return null;
                      const top = idx * hourHeight;
                      return (
                        <div
                          key={`${ymd}-h-${h}`}
                          className="pointer-events-none absolute left-0 right-0 z-0 border-t"
                          style={{
                            top,
                            borderColor: "color-mix(in oklab, var(--app-border) 70%, transparent)",
                          }}
                        />
                      );
                    })}

                    {showNowIndicator ? (
                      <div
                        className="pointer-events-none absolute left-0 right-0 z-[12]"
                        style={{ top: nowTopPx }}
                        aria-hidden
                      >
                        <div
                          className="w-full"
                          style={{
                            height: isTodayColumn ? "2px" : "1px",
                            background: isTodayColumn
                              ? "var(--app-action)"
                              : "color-mix(in oklab, var(--app-action) 45%, white)",
                          }}
                        />
                      </div>
                    ) : null}

                    {hoverPreview?.dayYmd === ymd ? (
                      (() => {
                        const startMs = hoverPreview.startSlot * 15 * 60_000;
                        const endMs = clamp((hoverPreview.startSlot + 2) * 15 * 60_000, 15 * 60_000, DAY_MS);
                        const top = Math.floor(((startMs - visibleStartMs) / visibleMs) * gridHeight);
                        const height = Math.max(Math.ceil(((endMs - startMs) / visibleMs) * gridHeight), 10);
                        return (
                          <div
                            className="pointer-events-none absolute left-1 right-1 z-[8] flex items-center rounded-md border border-dashed px-2"
                            style={{
                              top,
                              height,
                              borderColor: "color-mix(in oklab, var(--app-action) 40%, var(--app-border) 60%)",
                              background: "color-mix(in oklab, var(--app-info-surface) 70%, white)",
                              color: "var(--app-text-muted)",
                            }}
                            aria-hidden
                          >
                            <span className="text-[10px] font-medium">Add task/meeting · 30 min</span>
                          </div>
                        );
                      })()
                    ) : null}

                    {blocks.map((b) => {
                      const segA = clamp(b.startMsInDay, visibleStartMs, visibleEndMs);
                      const segB = clamp(b.endMsInDay, visibleStartMs, visibleEndMs);
                      if (segB <= segA) return null;
                      // Snap to whole pixels and slightly overdraw so hour divider lines never peek through
                      // due to sub-pixel rounding at exact boundaries (e.g. blocks crossing an hour mark).
                      const topRaw = ((segA - visibleStartMs) / visibleMs) * gridHeight;
                      const heightRaw = ((segB - segA) / visibleMs) * gridHeight;
                      const top = Math.floor(topRaw);
                      const height = Math.max(Math.ceil(heightRaw) + 1, 10);
                      const dur = formatEffortHoursLabel(b.duration_hours);
                      const slots = Math.round(Number(b.duration_hours) * 4);
                      const isQuarterBlock = slots === 1 || height <= 18;
                      return (
                        <button
                          key={b.key}
                          type="button"
                          data-effort-block="1"
                          className={[
                            "absolute left-1 right-1 z-[10] overflow-hidden rounded-md border text-left shadow-sm cursor-pointer transition-[background-color,border-color,box-shadow,transform] hover:shadow-md hover:-translate-y-[0.5px]",
                            isQuarterBlock
                              ? "flex items-center justify-between gap-1 px-1 py-0"
                              : "flex flex-col justify-start px-2 py-1",
                          ].join(" ")}
                          style={{
                            top,
                            height,
                            borderColor: "color-mix(in oklab, var(--app-action) 30%, var(--app-border) 70%)",
                            // Use an opaque mix so grid lines can’t show through.
                            background: "color-mix(in oklab, var(--app-info) 12%, white)",
                            color: "var(--app-text)",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "color-mix(in oklab, var(--app-info) 16%, white)";
                            e.currentTarget.style.borderColor = "color-mix(in oklab, var(--app-action) 45%, var(--app-border) 55%)";
                            onBlockActivate(b, e.currentTarget);
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "color-mix(in oklab, var(--app-info) 12%, white)";
                            e.currentTarget.style.borderColor = "color-mix(in oklab, var(--app-action) 30%, var(--app-border) 70%)";
                            setActive((prev) => (prev?.key === b.key ? null : prev));
                          }}
                          onBlur={() => {
                            setActive((prev) => (prev?.key === b.key ? null : prev));
                          }}
                          onFocus={(e) => {
                            onBlockActivate(b, e.currentTarget);
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (b.source === "manual") {
                              openEditManualModal(b);
                              return;
                            }
                            onBlockActivate(b, e.currentTarget);
                          }}
                        >
                          {b.source === "task_work_session" && !isQuarterBlock ? (
                            <span
                              className="absolute right-1 top-1"
                              style={{ color: "color-mix(in oklab, var(--app-action) 75%, var(--app-text) 25%)" }}
                              aria-hidden
                            >
                              <TaskEffortIcon size={10} />
                            </span>
                          ) : null}
                          <span
                            className={isQuarterBlock ? "text-[9px] font-semibold tabular-nums" : "text-[10px] font-semibold tabular-nums"}
                            style={{ color: "var(--app-action)" }}
                          >
                            {dur}
                          </span>
                          {b.source === "task_work_session" && isQuarterBlock ? (
                            <span
                              className="shrink-0"
                              style={{ color: "color-mix(in oklab, var(--app-action) 75%, var(--app-text) 25%)" }}
                              aria-hidden
                            >
                              <TaskEffortIcon size={10} />
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {active ? (
            <div
              className="absolute z-[5] w-[18rem] rounded-lg border p-3 shadow-lg"
              style={{
                left: active.x,
                top: active.y,
                borderColor: "var(--app-border)",
                background: "var(--app-surface)",
                boxShadow: "0 8px 24px color-mix(in oklab, var(--app-text) 12%, transparent)",
                pointerEvents: "none",
              }}
              role="dialog"
              aria-label="Work session details"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <p className="text-sm font-semibold" style={{ color: "var(--app-text)" }}>
                {active.title}{" "}
                {active.manualTypeLabel ? <span className="font-normal text-muted-canvas">{active.manualTypeLabel}</span> : null}
              </p>
              <p className="mt-1 text-xs text-muted-canvas">
                {active.timeLabel} · <span className="font-medium">{active.durationLabel}</span>
              </p>
              <div className="mt-2">
                <p className="text-xs font-medium text-muted-canvas">Work accomplished</p>
                <p className="mt-1 text-sm" style={{ color: "var(--app-text)" }}>
                  {active.note ?? "—"}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <dialog
        ref={createDialogRef}
        className="app-catalog-dialog fixed left-1/2 top-1/2 z-[220] w-[min(100vw-2rem,38rem)] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden border-0 p-0 shadow-xl"
        style={{
          borderRadius: "12px",
          background: "var(--app-surface)",
          color: "var(--app-text)",
        }}
        onClose={(e) => {
          if (e.target !== createDialogRef.current) return;
          setCreateDraft(null);
        }}
      >
        <div className="flex max-h-[min(92dvh,44rem)] flex-col">
          <div className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--app-border)" }}>
            <div className="min-w-0 flex-1 pr-2">
              <h2 className="text-base font-semibold" style={{ color: "var(--app-text)" }}>
                Add Task or Meeting
              </h2>
              <p className="mt-0.5 truncate text-sm text-muted-canvas" title={`${projectLabel} · ${integrationLabel}`}>
                {projectLabel} · {integrationLabel}
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
                        setCreateDraft((prev) => (prev ? { ...prev, title: e.target.value, error: null } : prev))
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
                        onClick={() => setCreateDraft((prev) => (prev ? { ...prev, entry_type: "meeting" } : prev))}
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
                        onClick={() => setCreateDraft((prev) => (prev ? { ...prev, entry_type: "task" } : prev))}
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
                          const endSlot = prev.endSlot <= startSlot ? Math.min(startSlot + 1, 95) : prev.endSlot;
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
                    onChange={(e) => setCreateDraft((prev) => (prev ? { ...prev, work_accomplished: e.target.value, error: null } : prev))}
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

export function IntegrationEffortSection({
  projectIntegrationId,
  projectLabel,
  integrationLabel,
  initialEstimatedEffortHours,
  sessions,
  className = "",
}: {
  projectIntegrationId: string;
  projectLabel: string;
  integrationLabel: string;
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
      const res = await patchProjectIntegrationEstimatedEffort(projectIntegrationId, parsed.hours);
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
    [projectIntegrationId, router],
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
            projectIntegrationId={projectIntegrationId}
            projectLabel={projectLabel}
            integrationLabel={integrationLabel}
          />
        </div>
      ) : null}

      {view === "week" ? (
        <div className="min-h-0 flex-1">
          <ActualsCalendarGrid
            days={weekDays}
            sessions={sessions}
            projectIntegrationId={projectIntegrationId}
            projectLabel={projectLabel}
            integrationLabel={integrationLabel}
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
    </div>
  );
}
