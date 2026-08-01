"use client";

import { HomeDayAgendaCard } from "@/components/home-day-agenda-card";
import { HomeOpenTasksCard } from "@/components/home-open-tasks-card";
import { HomeSummaryCard } from "@/components/home-summary-strip";
import {
  HomeWeekHoursStackedBar,
  type HomeWeekBarProjectMeta,
} from "@/components/home-week-hours-stacked-bar";
import type { HomeSummary } from "@/lib/home-summary";
import type { TasksPageSnapshot } from "@/lib/tasks-page-shared";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

export function HomeTopDashboard({
  summary,
  tasksSnapshot,
  todayIso,
}: {
  summary: HomeSummary;
  tasksSnapshot: TasksPageSnapshot | null;
  todayIso: string;
}) {
  const openTasks = useMemo(
    () => (tasksSnapshot?.tasks ?? []).filter((t) => t.status !== "done"),
    [tasksSnapshot?.tasks],
  );
  const openTasksCount = openTasks.length;
  const taskTodayIso = tasksSnapshot?.todayIso ?? todayIso;
  const dueTodayCount = openTasks.filter((t) => t.due_date === taskTodayIso).length;
  const pastDueCount = openTasks.filter(
    (t) => t.due_date != null && t.due_date < taskTodayIso,
  ).length;

  const projectById = useMemo(() => {
    const m = new Map<string, HomeWeekBarProjectMeta>();
    for (const p of tasksSnapshot?.projects ?? []) {
      m.set(p.id, {
        abbreviation: p.abbreviation,
        name: p.name,
        colorVar: p.colorVar,
      });
    }
    return m;
  }, [tasksSnapshot?.projects]);

  const projectAbbreviationById = useMemo(() => {
    const m = new Map<string, string>();
    for (const [id, meta] of projectById) {
      m.set(id, meta.abbreviation);
    }
    return m;
  }, [projectById]);

  const leftStackRef = useRef<HTMLDivElement>(null);
  const [calendarHeightPx, setCalendarHeightPx] = useState<number | null>(null);
  const [hoursReloadKey, setHoursReloadKey] = useState(0);

  useLayoutEffect(() => {
    const el = leftStackRef.current;
    if (!el) return;
    const sync = () => {
      const next = Math.round(el.getBoundingClientRect().height);
      setCalendarHeightPx((prev) => (prev === next ? prev : next));
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [openTasksCount, dueTodayCount, pastDueCount, summary, todayIso]);

  return (
    <section aria-label="Home dashboard" className="mb-6">
      <div className="grid grid-cols-1 items-start gap-2 xl:grid-cols-12">
        <div ref={leftStackRef} className="flex min-w-0 flex-col gap-2 xl:col-span-8">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-8 sm:items-start">
            <div className="min-w-0 self-start sm:col-span-2">
              <HomeSummaryCard
                summary={summary}
                openTasksCount={openTasksCount}
                dueTodayCount={dueTodayCount}
                pastDueCount={pastDueCount}
              />
            </div>
            <div className="min-w-0 self-start sm:col-span-6">
              <HomeOpenTasksCard snapshot={tasksSnapshot} />
            </div>
          </div>

          <HomeWeekHoursStackedBar
            todayIso={todayIso}
            projectById={projectById}
            reloadKey={hoursReloadKey}
          />
        </div>

        <div className="order-last min-w-0 xl:order-none xl:col-span-4">
          <HomeDayAgendaCard
            todayIso={todayIso}
            heightPx={calendarHeightPx}
            projectAbbreviationById={projectAbbreviationById}
            projects={tasksSnapshot?.projects ?? []}
            tracks={tasksSnapshot?.tracks ?? []}
            onCalendarEntryCreated={() => setHoursReloadKey((k) => k + 1)}
          />
        </div>
      </div>
    </section>
  );
}
