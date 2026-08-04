"use client";

import { useState } from "react";

import { InitiativeIcpPill } from "@/components/initiative-icp-pill";
import {
  type BillableBreakdownItem,
  type BreakdownPeriod,
  type HomeEffortBreakdownsDTO,
  type PairHours,
} from "@/lib/home-effort-breakdowns";
import { formatEffortHoursLabel } from "@/lib/integration-effort-buckets";

const PERIODS: { id: BreakdownPeriod; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "quarter", label: "Quarter" },
];

const SEG_WIDTH = 72;

function PeriodToggle({
  period,
  onChange,
  ariaLabel,
}: {
  period: BreakdownPeriod;
  onChange: (period: BreakdownPeriod) => void;
  ariaLabel: string;
}) {
  const selectedIndex = Math.max(
    0,
    PERIODS.findIndex((p) => p.id === period),
  );

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="relative inline-flex overflow-visible rounded-[10px] border"
      style={{ borderColor: "var(--app-border)", background: "var(--app-surface-alt)" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-y-px left-0 z-[1] rounded-[10px] motion-safe:[transition:transform_180ms_cubic-bezier(0.2,0,0.2,1)]"
        style={{
          width: SEG_WIDTH,
          transform: `translateX(${selectedIndex * SEG_WIDTH}px)`,
          background: "#1f2937",
          boxShadow: "0 0 0 2px color-mix(in oklab, var(--app-border) 70%, white)",
        }}
      />
      {PERIODS.map((p, i) => {
        const selected = p.id === period;
        const rounded =
          i === 0 ? "rounded-l-[10px]" : i === PERIODS.length - 1 ? "rounded-r-[10px]" : "";
        return (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={selected}
            className={[
              "relative z-[2] inline-flex h-8 items-center justify-center whitespace-nowrap px-2 text-center text-xs transition-colors cursor-pointer",
              rounded,
              selected
                ? "font-semibold text-[#f3f5f8]"
                : "font-normal text-muted-canvas hover:text-[var(--app-text)]",
            ].join(" ")}
            style={{ width: SEG_WIDTH }}
            onClick={() => onChange(p.id)}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

function formatBarHours(hours: number): string {
  if (!Number.isFinite(hours) || hours === 0) return "0h";
  const q = Math.round(hours * 4) / 4;
  const s = Number.isInteger(q) ? String(q) : String(parseFloat(q.toFixed(2)));
  return `${s}h`;
}

function formatPct(part: number, total: number): string {
  if (!(total > 0) || !Number.isFinite(part)) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function periodNoun(period: BreakdownPeriod): string {
  switch (period) {
    case "day":
      return "today";
    case "week":
      return "this week";
    case "month":
      return "this month";
    case "quarter":
      return "this quarter";
  }
}

function BreakdownBar({
  title,
  leftLabel,
  rightLabel,
  leftColor,
  rightColor,
  leftTextColor,
  rightTextColor,
  pair,
  period,
  leftItems,
  rightItems,
}: {
  title: string;
  leftLabel: string;
  rightLabel: string;
  leftColor: string;
  rightColor: string;
  leftTextColor: string;
  rightTextColor: string;
  pair: PairHours;
  period?: BreakdownPeriod;
  leftItems?: BillableBreakdownItem[];
  rightItems?: BillableBreakdownItem[];
}) {
  const leftPct = pair.total > 0 ? (pair.a / pair.total) * 100 : 0;
  const rightPct = pair.total > 0 ? (pair.b / pair.total) * 100 : 0;
  const empty = pair.total <= 0;
  const segmentHover = Boolean(leftItems || rightItems);

  return (
    <div
      className="relative flex h-8 w-full overflow-visible rounded-full"
      style={{ background: "var(--app-surface-alt)" }}
      role="meter"
      aria-label={
        empty
          ? `${title}: no hours logged`
          : `${title}: ${formatBarHours(pair.a)} ${leftLabel}, ${formatBarHours(pair.b)} ${rightLabel}`
      }
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={empty ? 0 : Math.round(leftPct)}
    >
      {!empty && leftPct > 0 ? (
        <div
          className={[
            "relative h-full min-w-0",
            segmentHover
              ? "group/seg cursor-default outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)]"
              : "",
          ].join(" ")}
          style={{ width: `${leftPct}%` }}
          tabIndex={leftItems && leftItems.length > 0 ? 0 : undefined}
        >
          <div
            className={[
              "flex h-full w-full items-center overflow-hidden motion-safe:[transition:width_300ms_cubic-bezier(0.2,0,0.2,1)]",
              rightPct <= 0 ? "rounded-full" : "rounded-l-full",
            ].join(" ")}
            style={{
              background: leftColor,
              paddingInline: leftPct < 12 ? "0.35rem" : "0.625rem",
            }}
          >
            <span
              className="truncate text-[0.7rem] font-medium leading-none tabular-nums"
              style={{ color: leftTextColor }}
            >
              {formatBarHours(pair.a)}
            </span>
          </div>
          {period && leftItems && leftItems.length > 0 ? (
            <SegmentItemsPopover
              title={leftLabel}
              items={leftItems}
              period={period}
              totalHours={pair.a}
              swatchColor={leftColor}
            />
          ) : null}
        </div>
      ) : null}
      {!empty && rightPct > 0 ? (
        <div
          className={[
            "relative h-full min-w-0",
            segmentHover
              ? "group/seg cursor-default outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)]"
              : "",
          ].join(" ")}
          style={{ width: `${rightPct}%` }}
          tabIndex={rightItems && rightItems.length > 0 ? 0 : undefined}
        >
          <div
            className={[
              "flex h-full w-full items-center justify-end overflow-hidden motion-safe:[transition:width_300ms_cubic-bezier(0.2,0,0.2,1)]",
              leftPct <= 0 ? "rounded-full" : "rounded-r-full",
            ].join(" ")}
            style={{
              background: rightColor,
              paddingInline: rightPct < 12 ? "0.35rem" : "0.625rem",
            }}
          >
            <span
              className="truncate text-[0.7rem] font-medium leading-none tabular-nums"
              style={{ color: rightTextColor }}
            >
              {formatBarHours(pair.b)}
            </span>
          </div>
          {period && rightItems && rightItems.length > 0 ? (
            <SegmentItemsPopover
              title={rightLabel}
              items={rightItems}
              period={period}
              totalHours={pair.b}
              swatchColor={rightColor}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function BreakdownLegend({
  leftLabel,
  rightLabel,
  leftColor,
  rightColor,
  pair,
}: {
  leftLabel: string;
  rightLabel: string;
  leftColor: string;
  rightColor: string;
  pair: PairHours;
}) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      <li className="inline-flex items-center gap-1.5">
        <span
          className="inline-block size-2.5 shrink-0 rounded-sm"
          style={{ background: leftColor }}
          aria-hidden
        />
        <span style={{ color: "var(--app-text-muted)" }}>{leftLabel}</span>
        <span className="tabular-nums font-medium" style={{ color: "var(--app-text)" }}>
          {formatBarHours(pair.a)} · {formatPct(pair.a, pair.total)}
        </span>
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span
          className="inline-block size-2.5 shrink-0 rounded-sm"
          style={{ background: rightColor }}
          aria-hidden
        />
        <span style={{ color: "var(--app-text-muted)" }}>{rightLabel}</span>
        <span className="tabular-nums font-medium" style={{ color: "var(--app-text)" }}>
          {formatBarHours(pair.b)} · {formatPct(pair.b, pair.total)}
        </span>
      </li>
    </ul>
  );
}

function SegmentItemsPopover({
  title,
  items,
  period,
  totalHours,
  swatchColor,
}: {
  title: string;
  items: BillableBreakdownItem[];
  period: BreakdownPeriod;
  totalHours: number;
  swatchColor: string;
}) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute bottom-[calc(100%+0.5rem)] left-1/2 z-20 w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 rounded-[var(--app-radius)] border px-3 py-2.5 text-left opacity-0 shadow-md transition-opacity duration-150 group-hover/seg:opacity-100 group-focus-within/seg:opacity-100"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-surface)",
        boxShadow: "0 8px 24px color-mix(in oklab, var(--app-text) 12%, transparent)",
        color: "var(--app-text)",
      }}
    >
      <p className="text-[0.65rem] font-medium" style={{ color: "var(--app-text-muted)" }}>
        {title} · {periodNoun(period)}
      </p>
      <ul className="mt-1.5 max-h-48 space-y-1 overflow-y-auto text-xs">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span
                className="inline-block size-2 shrink-0 rounded-sm"
                style={{ background: swatchColor }}
                aria-hidden
              />
              <span className="truncate font-medium">{item.label}</span>
              {item.isIcp ? <InitiativeIcpPill /> : null}
            </span>
            <span className="shrink-0 tabular-nums font-medium">{formatBarHours(item.hours)}</span>
          </li>
        ))}
      </ul>
      <p
        className="mt-2 border-t pt-2 text-xs font-medium tabular-nums"
        style={{ borderColor: "var(--app-border)" }}
      >
        Total {formatBarHours(totalHours)}
      </p>
    </div>
  );
}

function BreakdownCard({
  title,
  leftLabel,
  rightLabel,
  leftColor,
  rightColor,
  leftTextColor = "#f3f5f8",
  rightTextColor = "var(--app-text)",
  pair,
  period,
  onPeriodChange,
  toggleAriaLabel,
  billableItems,
}: {
  title: string;
  leftLabel: string;
  rightLabel: string;
  leftColor: string;
  rightColor: string;
  leftTextColor?: string;
  rightTextColor?: string;
  pair: PairHours;
  period: BreakdownPeriod;
  onPeriodChange: (period: BreakdownPeriod) => void;
  toggleAriaLabel: string;
  billableItems?: BillableBreakdownItem[];
}) {
  const empty = pair.total <= 0;
  const leftItems = billableItems?.filter((item) => item.billable);
  const rightItems = billableItems?.filter((item) => !item.billable);

  return (
    <div
      className="flex min-w-0 flex-col gap-3 rounded-[var(--app-radius)] border p-4"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-surface)",
      }}
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium" style={{ color: "var(--app-text-muted)" }}>
            {title}
          </p>
          <p
            className="mt-0.5 text-sm font-medium tabular-nums"
            style={{ color: "var(--app-text)" }}
          >
            {formatEffortHoursLabel(pair.total)}
          </p>
        </div>
        <PeriodToggle period={period} onChange={onPeriodChange} ariaLabel={toggleAriaLabel} />
      </div>

      <div className="min-w-0">
        <BreakdownBar
          title={title}
          leftLabel={leftLabel}
          rightLabel={rightLabel}
          leftColor={leftColor}
          rightColor={rightColor}
          leftTextColor={leftTextColor}
          rightTextColor={rightTextColor}
          pair={pair}
          period={billableItems ? period : undefined}
          leftItems={leftItems}
          rightItems={rightItems}
        />

        {empty ? (
          <p className="mt-2 text-sm" style={{ color: "var(--app-text-muted)" }}>
            No hours logged for this period
          </p>
        ) : (
          <BreakdownLegend
            leftLabel={leftLabel}
            rightLabel={rightLabel}
            leftColor={leftColor}
            rightColor={rightColor}
            pair={pair}
          />
        )}
      </div>
    </div>
  );
}

export function HomeEffortBreakdownCards({ data }: { data: HomeEffortBreakdownsDTO }) {
  const [taskPeriod, setTaskPeriod] = useState<BreakdownPeriod>("week");
  const [billablePeriod, setBillablePeriod] = useState<BreakdownPeriod>("week");

  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <BreakdownCard
        title="Tasks vs Meetings"
        leftLabel="Tasks"
        rightLabel="Meetings"
        leftColor="var(--app-cta-dark-fill)"
        rightColor="var(--app-border)"
        rightTextColor="var(--app-text)"
        pair={data.taskVsMeeting[taskPeriod]}
        period={taskPeriod}
        onPeriodChange={setTaskPeriod}
        toggleAriaLabel="Tasks vs Meetings period"
      />
      <BreakdownCard
        title="Billable vs Non-billable"
        leftLabel="Billable"
        rightLabel="Non-billable"
        leftColor="var(--app-success)"
        rightColor="var(--app-border)"
        rightTextColor="var(--app-text)"
        pair={data.billableVsInternal[billablePeriod]}
        period={billablePeriod}
        onPeriodChange={setBillablePeriod}
        toggleAriaLabel="Billable vs Non-billable period"
        billableItems={data.billableItems[billablePeriod]}
      />
    </div>
  );
}
