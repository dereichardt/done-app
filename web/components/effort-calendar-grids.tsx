"use client";

import {
  effortProratedHoursByLocalDay,
  formatEffortHoursLabel,
  formatLocalYmd,
  localDayStart,
  parseLocalYmd,
  startOfLocalMonth,
  startOfNextLocalMonth,
  type EffortSessionInput,
} from "@/lib/integration-effort-buckets";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const DAY_MS = 86_400_000;
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export type CalendarBlock = {
  key: string;
  dayYmd: string;
  startMsInDay: number;
  endMsInDay: number;
  duration_hours: number;
  title: string;
  work_accomplished: string | null;
  source: EffortSessionInput["source"];
  source_id: string;
  /** For manual effort entries only. */
  entry_type?: "task" | "meeting";
  /** Optional per-block color metadata; used by callers that want custom tinting. */
  colorMeta?: { colorVar: string; shade: "dark" | "medium" | "light" };
};

export type CalendarBlockStyle = {
  background: string;
  borderColor: string;
  hoverBackground: string;
  hoverBorderColor: string;
};

/** Sessions that may carry optional per-session color metadata for block tinting. */
export type GridSessionInput = EffortSessionInput & {
  colorMeta?: { colorVar: string; shade: "dark" | "medium" | "light" };
};

function TaskEffortIcon({ size = 10, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className={className}>
      <path
        fill="currentColor"
        d="M13 2L4 14h6l-1 8 11-14h-6l1-6z"
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

export function slotToTimeLabel(slot: number): string {
  const totalMin = clamp(slot | 0, 0, 95) * 15;
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  const am = hh < 12;
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  const suf = am ? "AM" : "PM";
  return `${h12}:${pad2(mm)}${suf}`;
}

export function slotToLocalDateTime(dayYmd: string, slot: number): Date {
  const d = parseLocalYmd(dayYmd);
  const totalMin = clamp(slot | 0, 0, 95) * 15;
  d.setHours(Math.floor(totalMin / 60), totalMin % 60, 0, 0);
  return d;
}

export function formatDurationFromSlots(startSlot: number, endSlot: number): string {
  const slots = Math.max(0, (endSlot | 0) - (startSlot | 0));
  const totalMin = slots * 15;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (totalMin === 0) return "0 min";
  if (h === 0) return `${m} min`;
  if (m === 0) return h === 1 ? "1 hr" : `${h} hrs`;
  return `${h} hr ${m} min`;
}

const DEFAULT_BLOCK_STYLE: CalendarBlockStyle = {
  background: "color-mix(in oklab, var(--app-info) 12%, white)",
  borderColor: "color-mix(in oklab, var(--app-action) 30%, var(--app-border) 70%)",
  hoverBackground: "color-mix(in oklab, var(--app-info) 16%, white)",
  hoverBorderColor: "color-mix(in oklab, var(--app-action) 45%, var(--app-border) 55%)",
};

function defaultBlockStyleFor(): CalendarBlockStyle {
  return DEFAULT_BLOCK_STYLE;
}

// ─── MonthGrid ────────────────────────────────────────────────────────────────

export function MonthGrid({
  anchorYmd,
  sessions,
}: {
  anchorYmd: string;
  sessions: GridSessionInput[];
}) {
  const { monthStart, monthEnd, dim, pad } = useMemo(() => {
    const anchor = parseLocalYmd(anchorYmd);
    const ms = startOfLocalMonth(anchor);
    const me = startOfNextLocalMonth(anchor);
    const d = Math.round((me.getTime() - ms.getTime()) / DAY_MS);
    const p = ms.getDay(); // Sun=0 … Sat=6
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
                <span
                  className="mt-0.5 text-[0.7rem] font-medium tabular-nums"
                  style={{ color: "var(--app-action)" }}
                >
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

// ─── ActualsCalendarGrid ──────────────────────────────────────────────────────

export function ActualsCalendarGrid({
  days,
  sessions,
  blockStyleFor = defaultBlockStyleFor,
  onDayColumnClick,
  onEditManualEntry,
  onBlockClick,
  onBlockHover,
  onBlockHoverEnd,
  onBlockDrop,
}: {
  days: Date[];
  sessions: GridSessionInput[];
  /**
   * Return custom background/border colors for a block. Defaults to info-blue.
   * If `onBlockClick` is provided this is still used for visual styling.
   */
  blockStyleFor?: (block: CalendarBlock) => CalendarBlockStyle;
  /**
   * Called when the user clicks an empty column slot. When absent, clicking an
   * empty slot is a no-op and the hover ghost preview is hidden.
   */
  onDayColumnClick?: (ymd: string, slot: number) => void;
  /**
   * Called when the user clicks a manual effort entry block (instead of
   * the built-in edit flow). When absent, clicks on manual entries fall
   * through to the same popover as task sessions.
   */
  onEditManualEntry?: (block: CalendarBlock) => void;
  /**
   * When provided, ALL block clicks call this callback instead of the
   * built-in tooltip popover. Useful for the Tasks page's custom detail popover.
   */
  onBlockClick?: (block: CalendarBlock) => void;
  /**
   * Optional hover callback used by callers that render an external popover.
   * Unlike `onBlockClick`, this is called on hover/focus only.
   */
  onBlockHover?: (block: CalendarBlock, el: HTMLElement) => void;
  /** Called when hover/focus leaves a block for custom popover cleanup. */
  onBlockHoverEnd?: () => void;
  /**
   * Optional drag/drop handler. When provided, calendar blocks become draggable
   * and drops snap to the nearest 15-minute slot.
   */
  onBlockDrop?: (block: CalendarBlock, target: { dayYmd: string; startSlot: number }) => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const dayColumnRefs = useRef<Map<string, HTMLDivElement>>(new Map());
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
  const [now, setNow] = useState<Date | null>(null);
  const [hoverPreview, setHoverPreview] = useState<{ dayYmd: string; startSlot: number } | null>(
    null,
  );
  const [dragPreview, setDragPreview] = useState<{
    blockKey: string;
    dayYmd: string;
    startSlot: number;
    durationSlots: number;
  } | null>(null);
  const dragSessionRef = useRef<{
    block: CalendarBlock;
    pointerId: number;
    originX: number;
    originY: number;
    didDrag: boolean;
  } | null>(null);
  const suppressClickRef = useRef<string | null>(null);

  // Always render a full 24-hour grid; default scroll positions to 7:00.
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
  const nowDayYmd = now ? formatLocalYmd(now) : null;
  const nowMsInDay = now
    ? now.getHours() * 3_600_000 +
      now.getMinutes() * 60_000 +
      now.getSeconds() * 1_000 +
      now.getMilliseconds()
    : 0;

  const dayColumnsTemplate = useMemo(() => {
    if (!isWeekView) return `72px repeat(${dayYmds.length}, minmax(9rem, 1fr))`;
    const cols = dayYmds
      .map((ymd) => (nowDayYmd != null && ymd === nowDayYmd ? "minmax(10rem, 1.14fr)" : "minmax(9rem, 1fr)"))
      .join(" ");
    return `72px ${cols}`;
  }, [isWeekView, dayYmds, nowDayYmd]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    el.scrollTop = normalStartHour * hourHeight;
  }, [dayYmdKey, normalStartHour, hourHeight]);

  useEffect(() => {
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
      if (!Number.isFinite(dh) || dh <= 0) continue;
      const slotsNeeded = Math.round(dh * 4);
      if (slotsNeeded <= 0) continue;

      const startMs = new Date(s.started_at).getTime();
      const endMs = new Date(s.finished_at).getTime();
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;

      let cur = localDayStart(new Date(startMs)).getTime();
      while (cur < endMs) {
        const next = cur + DAY_MS;
        const dayKey = formatLocalYmd(new Date(cur));
        if (map.has(dayKey)) {
          const segA = Math.max(startMs, cur);
          const segB = Math.min(endMs, next);
          if (segB > segA) {
            const rawStartInDay = segA - cur;
            const rawSlot = Math.floor(rawStartInDay / SLOT_MS);
            map.get(dayKey)!.push({
              key: `${dayKey}-${s.source}-${s.source_id}-${startMs}-${endMs}`,
              dayYmd: dayKey,
              startMsInDay: rawSlot * SLOT_MS,
              endMsInDay: (rawSlot + slotsNeeded) * SLOT_MS,
              duration_hours: dh,
              title:
                s.title ||
                (s.source === "manual" ? (s.entry_type === "meeting" ? "Meeting" : "Task") : "Task"),
              work_accomplished: s.work_accomplished,
              source: s.source,
              source_id: s.source_id,
              entry_type: s.entry_type,
              colorMeta: s.colorMeta,
            });
          }
        }
        cur = next;
      }
    }

    // De-overlap by packing forward on 15-min slots within the day.
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => a.startMsInDay - b.startMsInDay);
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
        if (slot > 96 - slotsNeeded) continue;
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

  const onBlockActivate = useCallback(
    (b: CalendarBlock, el: HTMLElement) => {
      if (onBlockClick) {
        onBlockClick(b);
        return;
      }
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
        x: clamp(
          br.left - wr.left + wrap.scrollLeft + br.width + 10,
          8,
          wrap.scrollLeft + wr.width - 280,
        ),
        y: clamp(br.top - wr.top + wrap.scrollTop, 8, wrap.scrollTop + wr.height - 140),
        title: b.title || "Task",
        manualTypeLabel:
          b.source === "manual"
            ? `(${b.entry_type === "meeting" ? "meeting" : "task"})`
            : null,
        timeLabel,
        durationLabel: formatEffortHoursLabel(b.duration_hours),
        note: b.work_accomplished?.trim() ? b.work_accomplished.trim() : null,
      });
    },
    [onBlockClick],
  );

  const slotFromColumnPoint = (col: HTMLDivElement, clientY: number): number => {
    const r = col.getBoundingClientRect();
    const y = clamp(clientY - r.top, 0, r.height);
    const msInDay = (y / r.height) * DAY_MS;
    return clamp(Math.floor(msInDay / (15 * 60_000)), 0, 95);
  };

  const dragTargetFromPoint = useCallback(
    (clientX: number, clientY: number): { dayYmd: string; startSlot: number } | null => {
      for (const dayYmd of dayYmds) {
        const col = dayColumnRefs.current.get(dayYmd);
        if (!col) continue;
        const r = col.getBoundingClientRect();
        if (clientX < r.left || clientX > r.right) continue;
        const slot = slotFromColumnPoint(col, clientY);
        return { dayYmd, startSlot: slot };
      }
      return null;
    },
    [dayYmds],
  );

  const handleDayColumnClick = (ymd: string, e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement | null)?.closest?.("button[data-effort-block='1']")) return;
    if (!onDayColumnClick) return;
    const slot = slotFromColumnPoint(e.currentTarget, e.clientY);
    onDayColumnClick(ymd, slot);
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
              const isTodayColumn = nowDayYmd != null && ymd === nowDayYmd;
              const wd = d.toLocaleDateString(undefined, { weekday: "short" });
              const md = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
              const dayTotal = (blocksByDay.get(ymd) ?? []).reduce(
                (sum, b) => sum + (Number.isFinite(b.duration_hours) ? b.duration_hours : 0),
                0,
              );
              const showTotal = dayTotal > 0.001;
              return (
                <div
                  key={ymd}
                  className="flex flex-col items-center justify-between px-2 py-2 text-xs font-medium"
                  style={{
                    color: "var(--app-text)",
                    background: isTodayColumn
                      ? "color-mix(in oklab, var(--app-info-surface) 72%, white)"
                      : "transparent",
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
                    {showTotal
                      ? String(parseFloat(dayTotal.toFixed(2))).replace(/\.0+$/, "")
                      : null}
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
          <div className="grid" style={{ gridTemplateColumns: dayColumnsTemplate }}>
            {/* Y-axis */}
            <div className="relative border-r" style={{ borderColor: "var(--app-border)" }}>
              <div className="sticky left-0">
                <div className="relative" style={{ height: `${gridHeight}px` }}>
                  <div
                    className="absolute left-0 right-0"
                    style={{ top: offEarlyTop, height: offEarlyHeight, background: offHourShade }}
                    aria-hidden
                  />
                  <div
                    className="absolute left-0 right-0"
                    style={{ top: offLateTop, height: offLateHeight, background: offHourShade }}
                    aria-hidden
                  />
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
              const isTodayColumn = nowDayYmd != null && ymd === nowDayYmd;
              const showNowIndicator = isTodayColumn;
              const nowTopPx = (() => {
                const px =
                  (clamp(nowMsInDay, visibleStartMs, visibleEndMs) / DAY_MS) * gridHeight;
                return `${Math.round(px * 100) / 100}px`;
              })();

              return (
                <div
                  key={ymd}
                  className="relative border-r last:border-r-0"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  <div
                    className="relative isolate"
                    ref={(el) => {
                      if (el) dayColumnRefs.current.set(ymd, el);
                      else dayColumnRefs.current.delete(ymd);
                    }}
                    style={{
                      height: `${gridHeight}px`,
                      background: isTodayColumn
                        ? "color-mix(in oklab, var(--app-info-surface) 78%, white)"
                        : "transparent",
                      cursor: onDayColumnClick ? "pointer" : "default",
                    }}
                    onClick={(e) => handleDayColumnClick(ymd, e)}
                    onMouseEnter={(e) => {
                      if (dragPreview) return;
                      if (!onDayColumnClick) return;
                      if (
                        (e.target as HTMLElement | null)?.closest?.("button[data-effort-block='1']")
                      )
                        return;
                      const slot = slotFromColumnPoint(e.currentTarget, e.clientY);
                      setHoverPreview({ dayYmd: ymd, startSlot: slot });
                    }}
                    onMouseMove={(e) => {
                      if (dragPreview) return;
                      if (!onDayColumnClick) return;
                      if (
                        (e.target as HTMLElement | null)?.closest?.("button[data-effort-block='1']")
                      ) {
                        setHoverPreview((prev) => (prev?.dayYmd === ymd ? null : prev));
                        return;
                      }
                      const slot = slotFromColumnPoint(e.currentTarget, e.clientY);
                      setHoverPreview((prev) => {
                        if (prev?.dayYmd === ymd && prev.startSlot === slot) return prev;
                        return { dayYmd: ymd, startSlot: slot };
                      });
                    }}
                    onMouseLeave={() =>
                      setHoverPreview((prev) => (prev?.dayYmd === ymd ? null : prev))
                    }
                    role={onDayColumnClick ? "button" : undefined}
                    tabIndex={onDayColumnClick ? 0 : undefined}
                    aria-label={onDayColumnClick ? `Add task or meeting on ${ymd}` : undefined}
                    onKeyDown={
                      onDayColumnClick
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onDayColumnClick(ymd, 9 * 4);
                            }
                          }
                        : undefined
                    }
                  >
                    <div
                      className="absolute left-0 right-0"
                      style={{ top: offEarlyTop, height: offEarlyHeight, background: offHourShade }}
                      aria-hidden
                    />
                    <div
                      className="absolute left-0 right-0"
                      style={{ top: offLateTop, height: offLateHeight, background: offHourShade }}
                      aria-hidden
                    />

                    {/* Hour grid lines */}
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

                    {onDayColumnClick && hoverPreview?.dayYmd === ymd
                      ? (() => {
                          const startMs = hoverPreview.startSlot * 15 * 60_000;
                          const endMs = clamp(
                            (hoverPreview.startSlot + 2) * 15 * 60_000,
                            15 * 60_000,
                            DAY_MS,
                          );
                          const top = Math.floor(
                            ((startMs - visibleStartMs) / visibleMs) * gridHeight,
                          );
                          const height = Math.max(
                            Math.ceil(((endMs - startMs) / visibleMs) * gridHeight),
                            10,
                          );
                          return (
                            <div
                              className="pointer-events-none absolute left-1 right-1 z-[8] flex items-center rounded-md border border-dashed px-2"
                              style={{
                                top,
                                height,
                                borderColor:
                                  "color-mix(in oklab, var(--app-action) 40%, var(--app-border) 60%)",
                                background:
                                  "color-mix(in oklab, var(--app-info-surface) 70%, white)",
                                color: "var(--app-text-muted)",
                              }}
                              aria-hidden
                            >
                              <span className="text-[10px] font-medium">
                                Add task/meeting · 30 min
                              </span>
                            </div>
                          );
                        })()
                      : null}

                    {dragPreview?.dayYmd === ymd
                      ? (() => {
                          const startMs = dragPreview.startSlot * 15 * 60_000;
                          const endMs = clamp(
                            (dragPreview.startSlot + dragPreview.durationSlots) * 15 * 60_000,
                            15 * 60_000,
                            DAY_MS,
                          );
                          const top = Math.floor(
                            ((startMs - visibleStartMs) / visibleMs) * gridHeight,
                          );
                          const height = Math.max(
                            Math.ceil(((endMs - startMs) / visibleMs) * gridHeight),
                            10,
                          );
                          return (
                            <div
                              className="pointer-events-none absolute left-1 right-1 z-[11] flex items-center rounded-md border border-dashed px-2"
                              style={{
                                top,
                                height,
                                borderColor:
                                  "color-mix(in oklab, var(--app-action) 45%, var(--app-border) 55%)",
                                background:
                                  "color-mix(in oklab, var(--app-info-surface) 72%, white)",
                              }}
                              aria-hidden
                            />
                          );
                        })()
                      : null}

                    {blocks.map((b) => {
                      const segA = clamp(b.startMsInDay, visibleStartMs, visibleEndMs);
                      const segB = clamp(b.endMsInDay, visibleStartMs, visibleEndMs);
                      if (segB <= segA) return null;
                      const topRaw = ((segA - visibleStartMs) / visibleMs) * gridHeight;
                      const heightRaw = ((segB - segA) / visibleMs) * gridHeight;
                      const top = Math.floor(topRaw);
                      const height = Math.max(Math.ceil(heightRaw) + 1, 10);
                      const dur = formatEffortHoursLabel(b.duration_hours);
                      const slots = Math.round(Number(b.duration_hours) * 4);
                      const isQuarterBlock = slots === 1 || height <= 18;
                      const hideTitleForShortDuration = slots <= 2;
                      const bStyle = blockStyleFor(b);

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
                            borderColor: bStyle.borderColor,
                            background: bStyle.background,
                            color: "var(--app-text)",
                            opacity:
                              dragPreview && dragPreview.blockKey === b.key ? 0.35 : 1,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = bStyle.hoverBackground;
                            e.currentTarget.style.borderColor = bStyle.hoverBorderColor;
                            if (onBlockHover) {
                              onBlockHover(b, e.currentTarget);
                            } else if (!onBlockClick) {
                              onBlockActivate(b, e.currentTarget);
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = bStyle.background;
                            e.currentTarget.style.borderColor = bStyle.borderColor;
                            if (onBlockHover) {
                              onBlockHoverEnd?.();
                            }
                            if (!onBlockClick) {
                              setActive((prev) => (prev?.key === b.key ? null : prev));
                            }
                          }}
                          onBlur={() => {
                            if (onBlockHover) {
                              onBlockHoverEnd?.();
                            }
                            if (!onBlockClick) {
                              setActive((prev) => (prev?.key === b.key ? null : prev));
                            }
                          }}
                          onFocus={(e) => {
                            if (onBlockHover) {
                              onBlockHover(b, e.currentTarget);
                            } else if (!onBlockClick) {
                              onBlockActivate(b, e.currentTarget);
                            }
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (suppressClickRef.current === b.key) {
                              suppressClickRef.current = null;
                              e.preventDefault();
                              return;
                            }
                            if (onBlockClick) {
                              onBlockClick(b);
                              return;
                            }
                            if (b.source === "manual" && onEditManualEntry) {
                              onEditManualEntry(b);
                              return;
                            }
                            onBlockActivate(b, e.currentTarget);
                          }}
                          onPointerDown={(e) => {
                            if (!onBlockDrop) return;
                            e.stopPropagation();
                            dragSessionRef.current = {
                              block: b,
                              pointerId: e.pointerId,
                              originX: e.clientX,
                              originY: e.clientY,
                              didDrag: false,
                            };
                            e.currentTarget.setPointerCapture(e.pointerId);
                          }}
                          onPointerMove={(e) => {
                            if (!onBlockDrop) return;
                            const session = dragSessionRef.current;
                            if (!session || session.pointerId !== e.pointerId) return;
                            const dx = Math.abs(e.clientX - session.originX);
                            const dy = Math.abs(e.clientY - session.originY);
                            const moved = dx + dy >= 6;
                            if (!session.didDrag && !moved) return;
                            if (!session.didDrag) {
                              session.didDrag = true;
                              setActive(null);
                              setHoverPreview(null);
                            }
                            const slots = Math.max(
                              1,
                              Math.round(Number(session.block.duration_hours) * 4),
                            );
                            const target = dragTargetFromPoint(e.clientX, e.clientY);
                            if (!target) return;
                            setDragPreview({
                              blockKey: session.block.key,
                              dayYmd: target.dayYmd,
                              startSlot: clamp(target.startSlot, 0, 96 - slots),
                              durationSlots: slots,
                            });
                          }}
                          onPointerUp={(e) => {
                            if (!onBlockDrop) return;
                            const session = dragSessionRef.current;
                            if (!session || session.pointerId !== e.pointerId) return;
                            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                              e.currentTarget.releasePointerCapture(e.pointerId);
                            }
                            if (session.didDrag) {
                              const slots = Math.max(
                                1,
                                Math.round(Number(session.block.duration_hours) * 4),
                              );
                              const target = dragTargetFromPoint(e.clientX, e.clientY);
                              const currentStartSlot = clamp(
                                Math.round(session.block.startMsInDay / (15 * 60_000)),
                                0,
                                95,
                              );
                              if (target) {
                                const nextStartSlot = clamp(target.startSlot, 0, 96 - slots);
                                if (
                                  target.dayYmd !== session.block.dayYmd ||
                                  nextStartSlot !== currentStartSlot
                                ) {
                                  onBlockDrop(session.block, {
                                    dayYmd: target.dayYmd,
                                    startSlot: nextStartSlot,
                                  });
                                }
                              }
                              suppressClickRef.current = session.block.key;
                            }
                            dragSessionRef.current = null;
                            setDragPreview(null);
                          }}
                          onPointerCancel={(e) => {
                            const session = dragSessionRef.current;
                            if (!session || session.pointerId !== e.pointerId) return;
                            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                              e.currentTarget.releasePointerCapture(e.pointerId);
                            }
                            dragSessionRef.current = null;
                            setDragPreview(null);
                          }}
                        >
                          {b.source === "task_work_session" && !isQuarterBlock ? (
                            <span
                              className="absolute right-1 top-1"
                              style={{
                                color: "color-mix(in oklab, var(--app-action) 75%, var(--app-text) 25%)",
                              }}
                              aria-hidden
                            >
                              <TaskEffortIcon size={10} />
                            </span>
                          ) : null}
                          <span
                            className={
                              isQuarterBlock
                                ? "text-[9px] font-semibold tabular-nums"
                                : "text-[10px] font-semibold tabular-nums"
                            }
                            style={{ color: "var(--app-action)" }}
                          >
                            {dur}
                          </span>
                          {b.source === "task_work_session" && isQuarterBlock ? (
                            <span
                              className="shrink-0"
                              style={{
                                color: "color-mix(in oklab, var(--app-action) 75%, var(--app-text) 25%)",
                              }}
                              aria-hidden
                            >
                              <TaskEffortIcon size={10} />
                            </span>
                          ) : null}
                          {!isQuarterBlock && !hideTitleForShortDuration && b.title ? (
                            <span
                              className="mt-0.5 line-clamp-2 text-[10px] leading-tight"
                              style={{ color: "var(--app-text)" }}
                            >
                              {b.title}
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

          {/* Built-in tooltip popover — only shown when onBlockClick is absent */}
          {active && !onBlockClick ? (
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
            >
              <p className="text-sm font-semibold" style={{ color: "var(--app-text)" }}>
                {active.title}{" "}
                {active.manualTypeLabel ? (
                  <span className="font-normal text-muted-canvas">{active.manualTypeLabel}</span>
                ) : null}
              </p>
              <p className="mt-1 text-xs text-muted-canvas">
                {active.timeLabel} ·{" "}
                <span className="font-medium">{active.durationLabel}</span>
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
    </div>
  );
}
