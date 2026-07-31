import Link from "next/link";

import type { HomeSummary } from "@/lib/home-summary";

type SummaryMetric = {
  href: string;
  label: string;
  value: string;
  aria: string;
};

function MetricRow({ metric }: { metric: SummaryMetric }) {
  return (
    <li className="min-w-0">
      <Link
        href={metric.href}
        className="flex items-center justify-between gap-3 rounded-[8px] px-1 py-1 no-underline transition-colors hover:bg-[var(--app-surface-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)]"
        aria-label={metric.aria}
      >
        <span className="min-w-0 truncate text-sm font-normal text-muted-canvas">{metric.label}</span>
        <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color: "var(--app-text)" }}>
          {metric.value}
        </span>
      </Link>
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
      href: "/projects",
      label: "Integrations",
      value: String(summary.integrations),
      aria: `Integrations across active projects: ${summary.integrations}. Go to projects.`,
    },
    {
      href: "/internal",
      label: "Active initiatives",
      value: String(summary.activeInitiatives),
      aria: `Active initiatives: ${summary.activeInitiatives}. Go to internal.`,
    },
  ];

  const taskMetrics: SummaryMetric[] = [
    {
      href: "/work",
      label: "Open tasks",
      value: String(openTasksCount),
      aria: `Open tasks: ${openTasksCount}. Go to work.`,
    },
    {
      href: "/work",
      label: "Due today",
      value: String(dueTodayCount),
      aria: `Tasks due today: ${dueTodayCount}. Go to work.`,
    },
    {
      href: "/work",
      label: "Past due",
      value: String(pastDueCount),
      aria: `Past due tasks: ${pastDueCount}. Go to work.`,
    },
  ];

  return (
    <section aria-label="Home summary" className="flex min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center justify-between gap-2">
        <h2 className="section-heading">Summary</h2>
      </div>
      <div className="card-canvas mt-3 flex flex-col px-4 py-2.5">
        <ul className="flex list-none flex-col gap-0.5">
          {scopeMetrics.map((t) => (
            <MetricRow key={t.label} metric={t} />
          ))}
        </ul>
        <div className="my-1.5 border-t" style={{ borderColor: "var(--app-border)" }} role="separator" />
        <ul className="flex list-none flex-col gap-0.5">
          {taskMetrics.map((t) => (
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
