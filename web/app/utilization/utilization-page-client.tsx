"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DialogCloseButton } from "@/components/dialog-close-button";
import { UtilizationTimeOffCalendar } from "@/components/utilization-time-off-calendar";
import { saveUtilizationQuarterTarget } from "@/lib/actions/utilization";
import { formatEffortHoursLabel } from "@/lib/integration-effort-buckets";
import type {
  QuarterPulseMetrics,
  UtilizationInsightStatus,
  UtilizationQuarterDTO,
  UtilizationWeekRow,
} from "@/lib/utilization-data";
import {
  formatShortHours,
  paceDeltaLabel,
  quarterPulseMetrics,
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
  color: string;
  surface: string;
  label: string;
} {
  switch (status) {
    case "ahead":
      return {
        color: "var(--app-success)",
        surface: "color-mix(in oklab, var(--app-success) 12%, var(--app-surface))",
        label: "Ahead",
      };
    case "on_track":
      return {
        color: "var(--app-success)",
        surface: "color-mix(in oklab, var(--app-success) 12%, var(--app-surface))",
        label: "On track",
      };
    case "at_risk":
      return {
        color: "var(--app-warning)",
        surface: "color-mix(in oklab, var(--app-warning) 14%, var(--app-surface))",
        label: "At risk",
      };
    case "shortfall":
      return {
        color: "var(--app-danger)",
        surface: "color-mix(in oklab, var(--app-danger) 12%, var(--app-surface))",
        label: "Shortfall",
      };
    default:
      return {
        color: "var(--app-info)",
        surface: "color-mix(in oklab, var(--app-info) 12%, var(--app-surface))",
        label: "No target",
      };
  }
}

function StatusMetric({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="min-w-0 rounded-[var(--app-radius)] border px-2.5 py-2"
      style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}
    >
      <p className="text-[0.65rem] font-medium leading-snug text-muted-canvas">{label}</p>
      <p className="mt-1 truncate text-sm font-medium tabular-nums leading-none text-[var(--app-text)]">
        {value}
      </p>
    </div>
  );
}

/** Chart ceiling: round up to the next 4h step so e.g. 39h isn't flush at 100%. */
function weekStripScaleMax(weeks: UtilizationWeekRow[]): number {
  const dataMax = Math.max(
    0,
    ...weeks.map((w) => Math.max(w.paceHours, w.actualHours, w.forecastHours)),
  );
  if (dataMax <= 0) return 1;
  return Math.max(1, Math.ceil(dataMax / 4) * 4);
}

function UtilizationWeekStrip({
  weeks,
  pulse,
  targetHours,
  status,
  statusMessage,
}: {
  weeks: UtilizationWeekRow[];
  pulse: QuarterPulseMetrics | null;
  targetHours: number | null;
  status: UtilizationInsightStatus;
  statusMessage: string;
}) {
  const maxHours = weekStripScaleMax(weeks);
  const paceChip = pulse ? paceDeltaLabel(pulse.aheadBy) : null;
  const forecastSurplus =
    pulse != null && targetHours != null
      ? Math.max(0, pulse.projectedHours - targetHours)
      : 0;
  const tone = insightTone(status);

  return (
    <div className="card-canvas px-4 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="section-heading">Week by week</h2>
          <span
            className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium"
            style={{ color: tone.color, background: tone.surface }}
            role="status"
            title={statusMessage}
            aria-label={statusMessage}
          >
            {tone.label}
          </span>
        </div>
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
              style={{ background: "var(--app-border)" }}
              aria-hidden
            />
            Forecast
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-3"
              style={{
                background: "color-mix(in oklab, var(--app-text) 55%, transparent)",
              }}
              aria-hidden
            />
            Pace
          </span>
        </div>
      </div>

      <div className="relative z-10 mt-4">
        <div
          className="flex items-end gap-1.5"
          role="img"
          aria-label="Quarter utilization by week"
        >
          {weeks.map((w) => {
            const pacePct = Math.round((w.paceHours / maxHours) * 100);
            const actualPct = Math.round((w.actualHours / maxHours) * 100);
            const forecastPct = Math.round((w.forecastHours / maxHours) * 100);
            const isCurrent = w.relative === "current";
            const isFuture = w.relative === "future";
            const underPacePlan =
              w.paceHours > 0 && w.forecastHours + 0.25 < w.paceHours;
            const actualMetPace =
              w.paceHours > 0 && w.actualHours + 0.25 >= w.paceHours;
            const label = weekLabel(w.weekStartYmd);
            const actualLabel = isFuture ? "—" : formatBarHours(w.actualHours);
            const inBarColor =
              w.actualHours > 0
                ? actualMetPace
                  ? "var(--app-surface)"
                  : "var(--app-cta-dark-fg)"
                : "var(--app-text)";

            return (
              <div
                key={w.weekStartYmd}
                className="group relative z-0 flex min-w-0 flex-1 flex-col items-center gap-1 hover:z-30 focus-within:z-30"
              >
                <span
                  className="flex h-3.5 items-center justify-center tabular-nums text-[0.65rem] font-medium"
                  style={{
                    color:
                      w.relative === "past" && actualMetPace
                        ? "var(--app-success)"
                        : "var(--app-text-muted)",
                  }}
                  aria-label={
                    w.relative === "past" && actualMetPace
                      ? `Pace met (${formatBarHours(w.actualHours)} actual vs ${formatBarHours(w.paceHours)} pace)`
                      : undefined
                  }
                >
                  {w.relative === "past" && actualMetPace ? (
                    <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden>
                      <path
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3.5 8.5 6.5 11.5 12.5 4.5"
                      />
                    </svg>
                  ) : (
                    formatBarHours(w.forecastHours)
                  )}
                </span>
                <div
                  className="relative w-full cursor-default overflow-hidden rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)]"
                  style={{
                    height: "7rem",
                    background: "var(--app-surface-alt)",
                    boxShadow: "inset 0 0 0 1px var(--app-border)",
                  }}
                  tabIndex={0}
                  aria-label={`${label}: actual ${formatBarHours(w.actualHours)}, pace ${formatBarHours(w.paceHours)}, forecast ${formatBarHours(w.forecastHours)}${underPacePlan ? ", forecast under pace" : ""}`}
                >
                  {/* Under-pace track: blue only up to the pace line */}
                  {underPacePlan && pacePct > 0 ? (
                    <div
                      className="absolute bottom-0 left-0 right-0 motion-safe:[transition:height_300ms_cubic-bezier(0.2,0,0.2,1)]"
                      style={{
                        height: `${pacePct}%`,
                        background:
                          "color-mix(in oklab, var(--app-action) 28%, var(--app-surface))",
                      }}
                      aria-hidden
                    />
                  ) : null}
                  {/* Forecast volume */}
                  {forecastPct > 0 ? (
                    <div
                      className="absolute bottom-0 left-0 right-0 motion-safe:[transition:height_300ms_cubic-bezier(0.2,0,0.2,1)]"
                      style={{
                        height: `${forecastPct}%`,
                        background: "var(--app-border)",
                      }}
                      aria-hidden
                    />
                  ) : null}
                  {/* Actuals fill */}
                  {actualPct > 0 ? (
                    <div
                      className="absolute bottom-0 left-0 right-0 motion-safe:[transition:height_300ms_cubic-bezier(0.2,0,0.2,1)]"
                      style={{
                        height: `${actualPct}%`,
                        background: actualMetPace
                          ? "var(--app-success)"
                          : "var(--app-cta-dark-fill)",
                      }}
                      aria-hidden
                    />
                  ) : null}
                  {/* Pace line */}
                  {w.paceHours > 0 ? (
                    <div
                      className="absolute inset-x-0 z-[1]"
                      style={{
                        bottom: `max(0px, calc(${pacePct}% - 1px))`,
                        height: 2,
                        background: underPacePlan
                          ? "var(--app-action)"
                          : "color-mix(in oklab, var(--app-text) 55%, transparent)",
                      }}
                      aria-hidden
                    />
                  ) : null}
                  <span
                    className="pointer-events-none absolute inset-x-0 bottom-1 z-[1] truncate px-0.5 text-center text-[0.6rem] font-medium leading-none tabular-nums"
                    style={{ color: inBarColor }}
                  >
                    {actualLabel}
                  </span>
                </div>

                <span
                  className={[
                    "truncate text-[0.65rem]",
                    isCurrent
                      ? "font-medium text-[var(--app-text)]"
                      : "font-normal text-muted-canvas",
                  ].join(" ")}
                >
                  {label}
                </span>

                <div
                  role="tooltip"
                  className="pointer-events-none absolute bottom-[calc(100%-0.25rem)] left-1/2 z-20 w-max min-w-[7.5rem] -translate-x-1/2 rounded-[var(--app-radius)] border px-2.5 py-2 text-left opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
                  style={{
                    borderColor: "var(--app-border)",
                    background: "var(--app-surface)",
                    boxShadow: "0 8px 24px color-mix(in oklab, var(--app-text) 12%, transparent)",
                    color: "var(--app-text)",
                  }}
                >
                  <p
                    className="text-[0.65rem] font-medium"
                    style={{ color: "var(--app-text-muted)" }}
                  >
                    {label}
                    {underPacePlan ? " · under pace" : ""}
                  </p>
                  <dl className="mt-1 space-y-0.5 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <dt style={{ color: "var(--app-text-muted)" }}>Actual</dt>
                      <dd className="tabular-nums font-medium">{actualLabel}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt style={{ color: "var(--app-text-muted)" }}>Pace</dt>
                      <dd
                        className="tabular-nums font-medium"
                        style={{
                          color: underPacePlan ? "var(--app-action)" : "var(--app-text)",
                        }}
                      >
                        {formatBarHours(w.paceHours)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt style={{ color: "var(--app-text-muted)" }}>Forecast</dt>
                      <dd className="tabular-nums font-medium">
                        {formatBarHours(w.forecastHours)}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {pulse && paceChip ? (
        <div
          className="mt-4 grid grid-cols-6 gap-1.5 border-t pt-3"
          style={{ borderColor: "var(--app-border)" }}
        >
          <StatusMetric
            label="Pace to date"
            value={formatShortHours(pulse.paceToDateHours)}
          />
          <StatusMetric label={paceChip.label} value={paceChip.value} />
          <StatusMetric
            label="Hours to reach target"
            value={formatShortHours(pulse.hoursLeftToTarget)}
          />
          <StatusMetric
            label="Projected hours"
            value={formatShortHours(pulse.projectedHours)}
          />
          <StatusMetric
            label="Remaining forecast"
            value={formatShortHours(pulse.planForecastHours)}
          />
          <StatusMetric
            label={pulse.coverageShortfall > 0.25 ? "Coverage shortfall" : "Forecast surplus"}
            value={
              pulse.coverageShortfall > 0.25
                ? formatShortHours(pulse.coverageShortfall)
                : formatShortHours(forecastSurplus)
            }
          />
        </div>
      ) : null}
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

  const hasTarget = data.targetHours != null && data.targetHours > 0;
  const pulse = hasTarget
    ? quarterPulseMetrics({
        weeks: data.weeks,
        todayYmd: data.todayYmd,
        targetHours: data.targetHours!,
        endExclusiveYmd: data.endExclusiveYmd,
        timeOffYmds: new Set(data.timeOffDays.map((d) => d.dayYmd)),
      })
    : null;

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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
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
        <MetricCard
          title="Projected Attainment"
          value={pulse != null ? `${pulse.projectedAttainmentPct}%` : "—"}
          subtitle={
            hasTarget
              ? "Actuals + remaining forecast ÷ target"
              : "Set a target to project attainment"
          }
        />
      </div>

      <UtilizationWeekStrip
        weeks={data.weeks}
        pulse={pulse}
        targetHours={data.targetHours}
        status={data.insight.status}
        statusMessage={
          data.insight.detail
            ? `${data.insight.message} ${data.insight.detail}`
            : data.insight.message
        }
      />

      <UtilizationTimeOffCalendar data={data} onDataChange={setData} />

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
