"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DialogCloseButton } from "@/components/dialog-close-button";
import { saveUtilizationQuarterTarget } from "@/lib/actions/utilization";
import { formatEffortHoursLabel } from "@/lib/integration-effort-buckets";
import type {
  UtilizationInsightStatus,
  UtilizationQuarterDTO,
  UtilizationWeekRow,
} from "@/lib/utilization-data";

function formatBarHours(hours: number): string {
  if (!Number.isFinite(hours) || hours === 0) return "0h";
  const q = Math.round(hours * 4) / 4;
  const s = Number.isInteger(q) ? String(q) : String(parseFloat(q.toFixed(2)));
  return `${s}h`;
}

function weekLabel(weekStartYmd: string): string {
  const [y, m, d] = weekStartYmd.split("-").map(Number);
  if (!y || !m || !d) return weekStartYmd;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden className="shrink-0">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
        d="M10.7 2.7 13 5l-7.2 7.2-3 .3.3-3L10.7 2.7zM9 4l3 3"
      />
    </svg>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  onEdit,
  editLabel = "Edit target",
}: {
  title: string;
  value: string;
  subtitle?: string;
  /** When set, a pencil icon appears on card hover to trigger edit. */
  onEdit?: () => void;
  editLabel?: string;
}) {
  return (
    <article
      className={[
        "card-canvas group relative flex min-h-[7.5rem] w-full flex-col px-4 py-4",
        onEdit ? "cursor-pointer" : "",
      ].join(" ")}
      onClick={onEdit}
      onKeyDown={
        onEdit
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onEdit();
              }
            }
          : undefined
      }
      role={onEdit ? "button" : undefined}
      tabIndex={onEdit ? 0 : undefined}
      aria-label={onEdit ? `${title}: ${value}. ${editLabel}` : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium leading-snug text-[var(--app-text)]">{title}</h3>
        {onEdit ? (
          <span
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--app-text-muted)] opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-[var(--app-surface-alt)] hover:text-[var(--app-text)]"
            aria-hidden
          >
            <PencilIcon />
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex min-h-0 flex-1 flex-col justify-center">
        <p className="text-2xl font-medium tabular-nums leading-none text-[var(--app-text)]">
          {value}
        </p>
        {subtitle ? (
          <p className="mt-2 text-xs font-normal text-muted-canvas">{subtitle}</p>
        ) : null}
      </div>
    </article>
  );
}

function insightTone(status: UtilizationInsightStatus): {
  border: string;
  label: string;
} {
  switch (status) {
    case "ahead":
      return { border: "var(--app-success)", label: "Ahead" };
    case "on_track":
      return { border: "var(--app-action)", label: "On track" };
    case "shortfall":
      return { border: "var(--app-warning)", label: "Shortfall" };
    case "at_risk":
      return { border: "var(--app-danger)", label: "At risk" };
    default:
      return { border: "var(--app-border)", label: "No target" };
  }
}

function UtilizationWeekStrip({ weeks }: { weeks: UtilizationWeekRow[] }) {
  const maxHours = Math.max(
    1,
    ...weeks.map((w) => Math.max(w.paceHours, w.actualHours, w.forecastHours)),
  );

  return (
    <div className="card-canvas px-4 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="section-heading">Week by week</h2>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-canvas">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: "var(--app-cta-dark-fill)" }}
              aria-hidden
            />
            Actuals
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-sm"
              style={{
                background: "color-mix(in oklab, var(--app-text) 22%, transparent)",
              }}
              aria-hidden
            />
            Pace
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-3"
              style={{ background: "var(--app-action)" }}
              aria-hidden
            />
            Forecast
          </span>
        </div>
      </div>

      <div className="mt-4 -mx-1 overflow-x-auto pb-1">
        <div
          className="flex min-w-full gap-1.5 px-1"
          style={{ minWidth: `${weeks.length * 3.25}rem` }}
          role="list"
          aria-label="Quarter utilization by week"
        >
          {weeks.map((w) => {
            const paceH = (w.paceHours / maxHours) * 100;
            const actualH = (w.actualHours / maxHours) * 100;
            const forecastH = (w.forecastHours / maxHours) * 100;
            const isCurrent = w.relative === "current";
            const underPacePlan =
              w.paceHours > 0 && w.forecastHours + 0.25 < w.paceHours;
            return (
              <div
                key={w.weekStartYmd}
                role="listitem"
                className="flex min-w-[2.75rem] flex-1 flex-col items-center"
                title={`${weekLabel(w.weekStartYmd)}: actual ${formatBarHours(w.actualHours)}, pace ${formatBarHours(w.paceHours)}, forecast ${formatBarHours(w.forecastHours)}${underPacePlan ? " (forecast under pace)" : ""}`}
              >
                <div
                  className="relative flex h-28 w-full items-end justify-center rounded-md"
                  style={{
                    background: underPacePlan
                      ? "color-mix(in oklab, var(--app-warning) 28%, var(--app-surface))"
                      : isCurrent
                        ? "color-mix(in oklab, var(--app-action) 8%, var(--app-surface-alt))"
                        : "var(--app-surface-alt)",
                    boxShadow: underPacePlan
                      ? "inset 0 0 0 1px color-mix(in oklab, var(--app-warning) 40%, var(--app-border))"
                      : isCurrent
                        ? "inset 0 0 0 1px color-mix(in oklab, var(--app-action) 35%, transparent)"
                        : "inset 0 0 0 1px var(--app-border)",
                  }}
                >
                  {/* Pace baseline */}
                  <div
                    className="absolute inset-x-1 bottom-0 rounded-sm"
                    style={{
                      height: `${paceH}%`,
                      background: underPacePlan
                        ? "color-mix(in oklab, var(--app-warning) 72%, var(--app-text) 18%)"
                        : "color-mix(in oklab, var(--app-text) 14%, transparent)",
                    }}
                    aria-hidden
                  />
                  {/* Forecast marker — sit inside the track even at 100% of scale */}
                  {w.forecastHours > 0 ? (
                    <div
                      className="absolute inset-x-0.5"
                      style={{
                        top: `max(0px, calc(${100 - forecastH}% - 1px))`,
                        height: 2,
                        background: "var(--app-action)",
                        opacity: 0.9,
                      }}
                      aria-hidden
                    />
                  ) : null}
                  {/* Actuals fill */}
                  {w.actualHours > 0 ? (
                    <div
                      className="absolute inset-x-1.5 bottom-0 rounded-sm motion-safe:[transition:height_280ms_cubic-bezier(0.2,0,0.2,1)]"
                      style={{
                        height: `${actualH}%`,
                        background: "var(--app-cta-dark-fill)",
                      }}
                      aria-hidden
                    />
                  ) : null}
                </div>
                <span
                  className={[
                    "mt-1.5 text-[0.65rem] tabular-nums leading-none",
                    isCurrent
                      ? "font-medium text-[var(--app-text)]"
                      : "font-normal text-muted-canvas",
                  ].join(" ")}
                >
                  {weekLabel(w.weekStartYmd)}
                </span>
                <span className="mt-1 text-[0.65rem] font-medium tabular-nums text-[var(--app-text)]">
                  {w.relative === "future" ? "—" : formatBarHours(w.actualHours)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TargetDialog({
  open,
  quarterLabel,
  quarterStartYmd,
  initialHours,
  onClose,
  onSaved,
}: {
  open: boolean;
  quarterLabel: string;
  quarterStartYmd: string;
  initialHours: number | null;
  onClose: () => void;
  onSaved: (data: UtilizationQuarterDTO) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [value, setValue] = useState(
    initialHours != null ? String(initialHours) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      setValue(initialHours != null ? String(initialHours) : "");
      setError(null);
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
    }
  }, [open, initialHours]);

  const close = () => {
    dialogRef.current?.close();
    onClose();
  };

  const submit = () => {
    const hours = Number(value);
    if (!Number.isFinite(hours) || hours < 0) {
      setError("Enter a non-negative number of hours.");
      return;
    }
    startTransition(async () => {
      const res = await saveUtilizationQuarterTarget({
        quarterStartYmd,
        targetHours: hours,
      });
      if (!res.ok || !res.data) {
        setError(res.error ?? "Could not save target.");
        return;
      }
      onSaved(res.data);
      close();
    });
  };

  return (
    <dialog
      ref={dialogRef}
      className="w-[min(100vw-2rem,24rem)] rounded-xl border p-0 shadow-lg backdrop:bg-black/40"
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
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--app-border)" }}>
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-medium">
            Target utilization
          </h2>
          <p className="mt-0.5 text-xs text-muted-canvas">{quarterLabel}</p>
        </div>
        <DialogCloseButton onClick={close} />
      </div>
      <div className="px-4 py-4">
        <label htmlFor="utilization-target-hours" className="block text-sm font-medium">
          Target hours for the quarter
        </label>
        <input
          id="utilization-target-hours"
          type="number"
          min={0}
          step={0.25}
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mt-2 w-full rounded-[var(--app-radius)] border px-3 py-2 text-sm tabular-nums"
          style={{
            borderColor: "var(--app-border)",
            background: "var(--app-surface)",
            color: "var(--app-text)",
          }}
          autoFocus
        />
        <p className="mt-1.5 text-xs text-muted-canvas">
          Spread evenly across the weeks in this quarter as your pace line.
        </p>
        {error ? (
          <p className="mt-2 text-xs" style={{ color: "var(--app-danger)" }}>
            {error}
          </p>
        ) : null}
      </div>
      <div
        className="flex justify-end gap-2 border-t px-4 py-3"
        style={{ borderColor: "var(--app-border)" }}
      >
        <button type="button" className="btn-cta-tertiary text-sm" onClick={close} disabled={pending}>
          Cancel
        </button>
        <button
          type="button"
          className="btn-cta-dark text-sm"
          onClick={submit}
          disabled={pending}
        >
          {pending ? "Saving…" : "Save target"}
        </button>
      </div>
    </dialog>
  );
}

export function UtilizationPageClient({
  initialData,
}: {
  initialData: UtilizationQuarterDTO;
}) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [targetOpen, setTargetOpen] = useState(false);

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  const tone = insightTone(data.insight.status);
  const hasTarget = data.targetHours != null && data.targetHours > 0;

  const goQuarter = (quarterStartYmd: string) => {
    router.push(`/utilization?q=${encodeURIComponent(quarterStartYmd)}`);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="heading-page">Utilization</h1>
        </div>
        <div
          className="inline-flex items-center gap-1 rounded-[10px] border p-1"
          style={{ borderColor: "var(--app-border)", background: "var(--app-surface-alt)" }}
          role="group"
          aria-label="Fiscal quarter"
        >
          <button
            type="button"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-[var(--app-text-muted)] hover:bg-[var(--app-surface)] hover:text-[var(--app-text)]"
            aria-label="Previous quarter"
            onClick={() => goQuarter(data.prevQuarterStartYmd)}
          >
            <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden>
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10 12 6 8l4-4"
              />
            </svg>
          </button>
          <span className="min-w-[5.5rem] px-2 text-center text-sm font-medium tabular-nums text-[var(--app-text)]">
            {data.label}
          </span>
          <button
            type="button"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-[var(--app-text-muted)] hover:bg-[var(--app-surface)] hover:text-[var(--app-text)]"
            aria-label="Next quarter"
            onClick={() => goQuarter(data.nextQuarterStartYmd)}
          >
            <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden>
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 12l4-4-4-4"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Target"
          value={hasTarget ? formatEffortHoursLabel(data.targetHours!) : "—"}
          subtitle={hasTarget ? "Hours for this quarter" : "Not set yet"}
          onEdit={() => setTargetOpen(true)}
          editLabel={hasTarget ? "Edit target" : "Set target"}
        />
        <MetricCard
          title="Actuals"
          value={formatEffortHoursLabel(data.actualHours)}
          subtitle="Logged in this quarter"
        />
        <MetricCard
          title="Forecast"
          value={formatEffortHoursLabel(data.forecastHours)}
          subtitle="Planned hours across quarter weeks"
        />
        <MetricCard
          title="Attainment"
          value={data.utilizationPct != null ? `${data.utilizationPct}%` : "—"}
          subtitle={
            hasTarget
              ? "Actuals ÷ target"
              : "Set a target to compute attainment"
          }
        />
      </div>

      <UtilizationWeekStrip weeks={data.weeks} />

      <div
        className="card-canvas flex gap-3 border-l-4 px-4 py-3"
        style={{ borderLeftColor: tone.border }}
        role="status"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--app-text)]">{tone.label}</p>
          <p className="mt-1 text-sm text-muted-canvas">{data.insight.message}</p>
        </div>
      </div>

      <TargetDialog
        open={targetOpen}
        quarterLabel={data.label}
        quarterStartYmd={data.quarterStartYmd}
        initialHours={data.targetHours}
        onClose={() => setTargetOpen(false)}
        onSaved={(next) => setData(next)}
      />
    </div>
  );
}
