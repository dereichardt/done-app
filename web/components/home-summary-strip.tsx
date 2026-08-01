import Link from "next/link";

import type { HomeSummary } from "@/lib/home-summary";

type SummaryMetric = {
  href?: string;
  label: string;
  value: string;
  aria: string;
};

function formatSummaryHours(hours: number): string {
  if (!Number.isFinite(hours) || hours === 0) return "0h";
  const q = Math.round(hours * 4) / 4;
  const s = Number.isInteger(q) ? String(q) : String(parseFloat(q.toFixed(2)));
  return `${s}h`;
}

function MetricRow({ metric }: { metric: SummaryMetric }) {
  const content = (
    <>
      <span className="min-w-0 truncate text-sm font-normal text-muted-canvas">{metric.label}</span>
      <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color: "var(--app-text)" }}>
        {metric.value}
      </span>
    </>
  );

  return (
    <li className="min-w-0">
      {metric.href ? (
        <Link
          href={metric.href}
          className="flex items-center justify-between gap-3 rounded-[8px] px-1 py-1 no-underline transition-colors hover:bg-[var(--app-surface-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)]"
          aria-label={metric.aria}
        >
          {content}
        </Link>
      ) : (
        <div className="flex items-center justify-between gap-3 px-1 py-1" aria-label={metric.aria}>
          {content}
        </div>
      )}
    </li>
  );
}

/** Single Summary card with home metrics (used inside HomeTopDashboard). */
export function HomeSummaryCard({
  summary,
  openTasksCount = 0,
  dueTodayCount = 0,
  pastDueCount = 0,
}: {
  summary: HomeSummary;
  openTasksCount?: number;
  dueTodayCount?: number;
  pastDueCount?: number;
}) {
  const scopeMetrics: SummaryMetric[] = [
    {
      href: "/projects",
      label: "Active projects",
      value: String(summary.activeProjects),
      aria: `Active projects: ${summary.activeProjects}. Go to projects.`,
    },
    {
      href: "/internal",
      label: "Active initiatives",
      value: String(summary.activeInitiatives),
      aria: `Active initiatives: ${summary.activeInitiatives}. Go to internal.`,
    },
    {
      label: "Integrations",
      value: String(summary.integrations),
      aria: `Integrations across active projects: ${summary.integrations}.`,
    },
  ];

  const taskMetrics: SummaryMetric[] = [
    {
      label: "Open tasks",
      value: String(openTasksCount),
      aria: `Open tasks: ${openTasksCount}.`,
    },
    {
      label: "Due today",
      value: String(dueTodayCount),
      aria: `Tasks due today: ${dueTodayCount}.`,
    },
    {
      label: "Past due",
      value: String(pastDueCount),
      aria: `Past due tasks: ${pastDueCount}.`,
    },
  ];

  const u = summary.utilization;
  const hasTarget = u.targetHours != null && u.targetHours > 0;
  const utilizationMetrics: SummaryMetric[] = [
    {
      href: "/utilization",
      label: "Target",
      value: hasTarget ? formatSummaryHours(u.targetHours!) : "—",
      aria: hasTarget
        ? `${u.label} target: ${formatSummaryHours(u.targetHours!)}. Go to utilization.`
        : `${u.label}: no target set. Go to utilization.`,
    },
    {
      href: "/utilization",
      label: "Actuals",
      value: formatSummaryHours(u.actualHours),
      aria: `${u.label} actuals: ${formatSummaryHours(u.actualHours)}. Go to utilization.`,
    },
    {
      href: "/utilization",
      label: "Attainment",
      value: u.attainmentPct != null ? `${u.attainmentPct}%` : "—",
      aria:
        u.attainmentPct != null
          ? `${u.label} attainment: ${u.attainmentPct}% (actuals versus target). Go to utilization.`
          : `${u.label}: attainment unavailable until a target is set. Go to utilization.`,
    },
  ];

  return (
    <section aria-label="Home summary" className="flex min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center justify-between gap-2">
        <h2 className="section-heading">Summary</h2>
      </div>
      {/* Match HomeOpenTasksCard card height (h-[22rem]). */}
      <div className="card-canvas mt-3 flex h-[22rem] min-h-0 flex-col justify-between px-4 py-3.5">
        <ul className="flex list-none flex-col gap-0.5">
          {scopeMetrics.map((t) => (
            <MetricRow key={t.label} metric={t} />
          ))}
        </ul>
        <div className="border-t" style={{ borderColor: "var(--app-border)" }} role="separator" />
        <ul className="flex list-none flex-col gap-0.5">
          {taskMetrics.map((t) => (
            <MetricRow key={t.label} metric={t} />
          ))}
        </ul>
        <div className="border-t" style={{ borderColor: "var(--app-border)" }} role="separator" />
        <ul className="flex list-none flex-col gap-0.5" aria-label={`${u.label} utilization`}>
          {utilizationMetrics.map((t) => (
            <MetricRow key={t.label} metric={t} />
          ))}
        </ul>
      </div>
    </section>
  );
}

/** @deprecated Prefer HomeSummaryCard inside HomeTopDashboard. Kept for any stray imports. */
export function HomeSummaryStrip({ summary }: { summary: HomeSummary }) {
  return <HomeSummaryCard summary={summary} />;
}
