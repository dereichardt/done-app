"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";

import { DialogCloseButton } from "@/components/dialog-close-button";
import {
  removeUtilizationTimeOff,
  saveUtilizationTimeOff,
} from "@/lib/actions/utilization";
import {
  TIME_OFF_TYPE_LABELS,
  TIME_OFF_TYPES,
  formatTimeOffDayLabel,
  type TimeOffDay,
  type TimeOffType,
} from "@/lib/time-off";
import type { UtilizationQuarterDTO } from "@/lib/utilization-data";

const WEEKDAY_HEADERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

function ymdFromParts(y: number, m0: number, d: number): string {
  return `${y}-${String(m0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function isWeekendYmd(ymd: string): boolean {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(y!, m! - 1, d!).getDay();
  return dow === 0 || dow === 6;
}

function monthTitle(year: number, month0: number): string {
  return new Date(year, month0, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

/** Three calendar months covering [quarterStart, endExclusive). */
function quarterMonths(
  quarterStartYmd: string,
  endExclusiveYmd: string,
): Array<{ year: number; month0: number }> {
  const [sy, sm] = quarterStartYmd.split("-").map(Number);
  const end = new Date(
    Number(endExclusiveYmd.slice(0, 4)),
    Number(endExclusiveYmd.slice(5, 7)) - 1,
    Number(endExclusiveYmd.slice(8, 10)),
  );
  end.setDate(end.getDate() - 1);
  const out: Array<{ year: number; month0: number }> = [];
  let y = sy!;
  let m0 = sm! - 1;
  for (let i = 0; i < 3; i++) {
    out.push({ year: y, month0: m0 });
    m0 += 1;
    if (m0 > 11) {
      m0 = 0;
      y += 1;
    }
  }
  return out;
}

function MonthGrid({
  year,
  month0,
  quarterStartYmd,
  endExclusiveYmd,
  selected,
  timeOffByDay,
  onDayClick,
}: {
  year: number;
  month0: number;
  quarterStartYmd: string;
  endExclusiveYmd: string;
  selected: ReadonlySet<string>;
  timeOffByDay: ReadonlyMap<string, TimeOffDay>;
  onDayClick: (ymd: string, existing: TimeOffDay | undefined) => void;
}) {
  const firstDow = new Date(year, month0, 1).getDay();
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const cells: Array<{ ymd: string | null; dayNum: number | null }> = [];
  for (let i = 0; i < firstDow; i++) cells.push({ ymd: null, dayNum: null });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ ymd: ymdFromParts(year, month0, d), dayNum: d });
  }
  while (cells.length % 7 !== 0) cells.push({ ymd: null, dayNum: null });

  return (
    <div className="min-w-0">
      <p className="mb-2 text-sm font-medium text-[var(--app-text)]">
        {monthTitle(year, month0)}
      </p>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAY_HEADERS.map((h) => (
          <div
            key={h}
            className="pb-1 text-[0.65rem] font-medium text-[var(--app-text-muted)]"
          >
            {h}
          </div>
        ))}
        {cells.map((cell, idx) => {
          if (!cell.ymd || cell.dayNum == null) {
            return <div key={`e-${idx}`} className="aspect-square" />;
          }
          const ymd = cell.ymd;
          const inQuarter = ymd >= quarterStartYmd && ymd < endExclusiveYmd;
          const weekend = isWeekendYmd(ymd);
          const selectable = inQuarter && !weekend;
          const isSelected = selected.has(ymd);
          const existing = timeOffByDay.get(ymd);
          const disabled = !selectable;

          return (
            <button
              key={ymd}
              type="button"
              disabled={disabled}
              aria-pressed={existing ? undefined : isSelected}
              aria-label={`${formatTimeOffDayLabel(ymd)}${
                existing ? `, ${TIME_OFF_TYPE_LABELS[existing.offType]}` : ""
              }`}
              title={
                existing
                  ? existing.offType === "other" && existing.otherLabel
                    ? existing.otherLabel
                    : TIME_OFF_TYPE_LABELS[existing.offType]
                  : undefined
              }
              onClick={() => onDayClick(ymd, existing)}
              className={[
                "relative mx-auto aspect-square w-[78%] text-xs tabular-nums transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)]",
                disabled
                  ? "cursor-default text-[var(--app-text-muted)] opacity-40"
                  : "cursor-pointer",
                isSelected && !existing
                  ? "rounded-full border border-dashed border-[color-mix(in_oklab,var(--app-text)_50%,transparent)] bg-[var(--app-surface)] font-medium text-[var(--app-text)]"
                  : existing
                    ? "rounded-full border border-transparent bg-[color-mix(in_oklab,var(--app-info)_18%,var(--app-surface))] font-bold text-[var(--app-info)] hover:bg-[color-mix(in_oklab,var(--app-info)_28%,var(--app-surface))]"
                    : "rounded-full border border-transparent text-[var(--app-text)] hover:bg-[var(--app-surface-alt)]",
              ].join(" ")}
            >
              {cell.dayNum}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TimeOffDetailDialog({
  open,
  quarterLabel,
  quarterStartYmd,
  day,
  onClose,
  onRemoved,
}: {
  open: boolean;
  quarterLabel: string;
  quarterStartYmd: string;
  day: TimeOffDay | null;
  onClose: () => void;
  onRemoved: (data: UtilizationQuarterDTO) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && day) {
      setError(null);
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
    }
  }, [open, day]);

  const close = () => {
    dialogRef.current?.close();
    onClose();
  };

  const remove = () => {
    if (!day) return;
    startTransition(async () => {
      const res = await removeUtilizationTimeOff({
        quarterStartYmd,
        dayYmds: [day.dayYmd],
      });
      if (!res.ok || !res.data) {
        setError(res.error ?? "Could not remove time off.");
        return;
      }
      onRemoved(res.data);
      close();
    });
  };

  const typeLabel = day ? TIME_OFF_TYPE_LABELS[day.offType] : "";

  return (
    <dialog
      ref={dialogRef}
      className="fixed left-1/2 top-1/2 z-[220] w-[min(100vw-2rem,28rem)] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border p-0 shadow-lg backdrop:bg-black/40"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-surface)",
        color: "var(--app-text)",
      }}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div
        className="flex items-start justify-between gap-3 border-b px-4 py-3"
        style={{ borderColor: "var(--app-border)" }}
      >
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-medium">
            Time off details
          </h2>
          <p className="mt-0.5 text-xs text-muted-canvas">{quarterLabel}</p>
        </div>
        <DialogCloseButton onClick={close} />
      </div>

      <div className="space-y-3 px-4 py-4">
        {day ? (
          <dl className="space-y-2 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-canvas">Date</dt>
              <dd className="font-medium">{formatTimeOffDayLabel(day.dayYmd)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-canvas">Type</dt>
              <dd className="font-medium">{typeLabel}</dd>
            </div>
            {day.offType === "other" && day.otherLabel ? (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-canvas">Label</dt>
                <dd className="font-medium">{day.otherLabel}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
        {error ? (
          <p className="text-xs" style={{ color: "var(--app-danger)" }}>
            {error}
          </p>
        ) : null}
      </div>

      <div
        className="flex justify-end gap-2 border-t px-4 py-3"
        style={{ borderColor: "var(--app-border)" }}
      >
        <button
          type="button"
          className="btn-cta text-sm"
          onClick={close}
          disabled={pending}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn-cta-dark text-sm"
          onClick={remove}
          disabled={pending}
        >
          {pending ? "Removing…" : "Remove time off"}
        </button>
      </div>
    </dialog>
  );
}

function TimeOffDialog({
  open,
  quarterLabel,
  quarterStartYmd,
  selectedDays,
  onClose,
  onSaved,
}: {
  open: boolean;
  quarterLabel: string;
  quarterStartYmd: string;
  selectedDays: string[];
  onClose: () => void;
  onSaved: (data: UtilizationQuarterDTO) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [offType, setOffType] = useState<TimeOffType>("pto");
  const [otherLabel, setOtherLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      setOffType("pto");
      setOtherLabel("");
      setError(null);
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
    }
  }, [open]);

  const close = () => {
    dialogRef.current?.close();
    onClose();
  };

  const submit = () => {
    if (offType === "other" && !otherLabel.trim()) {
      setError("Enter a label for Other time off.");
      return;
    }
    startTransition(async () => {
      const res = await saveUtilizationTimeOff({
        quarterStartYmd,
        dayYmds: selectedDays,
        offType,
        otherLabel: offType === "other" ? otherLabel.trim() : null,
      });
      if (!res.ok || !res.data) {
        setError(res.error ?? "Could not save time off.");
        return;
      }
      onSaved(res.data);
      close();
    });
  };

  return (
    <dialog
      ref={dialogRef}
      className="fixed left-1/2 top-1/2 z-[220] w-[min(100vw-2rem,28rem)] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border p-0 shadow-lg backdrop:bg-black/40"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-surface)",
        color: "var(--app-text)",
      }}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div
        className="flex items-start justify-between gap-3 border-b px-4 py-3"
        style={{ borderColor: "var(--app-border)" }}
      >
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-medium">
            Capture time off
          </h2>
          <p className="mt-0.5 text-xs text-muted-canvas">{quarterLabel}</p>
        </div>
        <DialogCloseButton onClick={close} />
      </div>

      <div className="space-y-4 px-4 py-4">
        <div>
          <p className="text-sm font-medium">Selected days</p>
          <ul className="mt-1.5 max-h-28 space-y-0.5 overflow-y-auto text-sm text-muted-canvas">
            {selectedDays.map((d) => (
              <li key={d}>{formatTimeOffDayLabel(d)}</li>
            ))}
          </ul>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Type</legend>
          {TIME_OFF_TYPES.map((t) => (
            <label key={t} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="time-off-type"
                value={t}
                checked={offType === t}
                onChange={() => setOffType(t)}
                className="accent-[var(--app-action)]"
              />
              {TIME_OFF_TYPE_LABELS[t]}
            </label>
          ))}
        </fieldset>

        {offType === "other" ? (
          <label className="block text-sm font-medium">
            Label
            <input
              type="text"
              value={otherLabel}
              onChange={(e) => setOtherLabel(e.target.value)}
              className="mt-1.5 w-full rounded-[var(--app-radius)] border px-3 py-2 text-sm font-normal"
              style={{
                borderColor: "var(--app-border)",
                background: "var(--app-surface)",
                color: "var(--app-text)",
              }}
              placeholder="e.g. Jury duty"
              autoFocus
            />
          </label>
        ) : null}

        {error ? (
          <p className="text-xs" style={{ color: "var(--app-danger)" }}>
            {error}
          </p>
        ) : null}
      </div>

      <div
        className="flex justify-end gap-2 border-t px-4 py-3"
        style={{ borderColor: "var(--app-border)" }}
      >
        <button
          type="button"
          className="btn-cta text-sm"
          onClick={close}
          disabled={pending}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn-cta-dark text-sm"
          onClick={submit}
          disabled={pending}
        >
          {pending ? "Saving…" : "Save time off"}
        </button>
      </div>
    </dialog>
  );
}

export function UtilizationTimeOffCalendar({
  data,
  onDataChange,
}: {
  data: UtilizationQuarterDTO;
  onDataChange: (next: UtilizationQuarterDTO) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailDay, setDetailDay] = useState<TimeOffDay | null>(null);

  useEffect(() => {
    setSelected(new Set());
    setDialogOpen(false);
    setDetailDay(null);
  }, [data.quarterStartYmd]);

  const timeOffByDay = useMemo(() => {
    const map = new Map<string, TimeOffDay>();
    for (const d of data.timeOffDays ?? []) map.set(d.dayYmd, d);
    return map;
  }, [data.timeOffDays]);

  const months = useMemo(
    () => quarterMonths(data.quarterStartYmd, data.endExclusiveYmd),
    [data.quarterStartYmd, data.endExclusiveYmd],
  );

  const selectedList = useMemo(() => Array.from(selected).sort(), [selected]);

  const onDayClick = (ymd: string, existing: TimeOffDay | undefined) => {
    if (existing) {
      setDetailDay(existing);
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ymd)) next.delete(ymd);
      else next.add(ymd);
      return next;
    });
  };

  return (
    <section
      className="card-canvas space-y-4 px-4 py-4"
      aria-labelledby="utilization-time-off-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="utilization-time-off-heading" className="section-heading">
          Time off
        </h2>
        {selectedList.length > 0 ? (
          <button
            type="button"
            className="btn-cta-dark shrink-0 text-sm"
            onClick={() => setDialogOpen(true)}
          >
            Capture time off ({selectedList.length})
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {months.map(({ year, month0 }) => (
          <MonthGrid
            key={`${year}-${month0}`}
            year={year}
            month0={month0}
            quarterStartYmd={data.quarterStartYmd}
            endExclusiveYmd={data.endExclusiveYmd}
            selected={selected}
            timeOffByDay={timeOffByDay}
            onDayClick={onDayClick}
          />
        ))}
      </div>

      <TimeOffDialog
        open={dialogOpen}
        quarterLabel={data.label}
        quarterStartYmd={data.quarterStartYmd}
        selectedDays={selectedList}
        onClose={() => setDialogOpen(false)}
        onSaved={(next) => {
          onDataChange(next);
          setSelected(new Set());
        }}
      />

      <TimeOffDetailDialog
        open={detailDay != null}
        quarterLabel={data.label}
        quarterStartYmd={data.quarterStartYmd}
        day={detailDay}
        onClose={() => setDetailDay(null)}
        onRemoved={(next) => {
          onDataChange(next);
          setDetailDay(null);
        }}
      />
    </section>
  );
}
