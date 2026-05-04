import Link from "next/link";

import type { HomeSummary } from "@/lib/home-summary";

const labelSm = "text-sm font-medium text-muted-canvas";
const valueCenter = "text-2xl font-semibold leading-tight tracking-tight sm:text-3xl";

const cardShell =
  "card-canvas flex min-h-[10.5rem] flex-col px-4 py-5 sm:min-h-[11rem] transition-colors hover:bg-[var(--app-surface-alt)]";
const topLeft = "shrink-0 self-start text-left";
const valueRegion = "flex min-h-[2.5rem] flex-1 flex-col items-center justify-center px-1 text-center";

function formatWeekHours(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return "0";
  const rounded = Math.round(h * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function HomeSummaryStrip({ summary }: { summary: HomeSummary }) {
  const tiles: Array<{
    href: string;
    label: string;
    value: string;
    aria: string;
  }> = [
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
    {
      href: "/work",
      label: "Hours this week",
      value: `${formatWeekHours(summary.weekHours)} h`,
      aria: `Hours recorded this week: ${formatWeekHours(summary.weekHours)}. Go to work.`,
    },
  ];

  return (
    <section className="mt-10" aria-label="Home summary">
      <h2 className="section-heading">Summary</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-stretch xl:grid-cols-4">
        {tiles.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className={`${cardShell} block min-h-0 no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)]`}
            aria-label={t.aria}
          >
            <div className={topLeft}>
              <p className={labelSm}>{t.label}</p>
            </div>
            <div className={valueRegion}>
              <p className={valueCenter} style={{ color: "var(--app-text)" }}>
                {t.value}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
