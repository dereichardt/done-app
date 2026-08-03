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
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const CALENDAR_COLLAPSED_KEY = "home.calendarCollapsed";

function CalendarExpandIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      width={16}
      height={16}
      aria-hidden
    >
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
        d="M10 12 6 8l4-4"
      />
    </svg>
  );
}

function readCalendarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(CALENDAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCalendarCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(CALENDAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function HomeTopDashboard({
  summary,
  tasksSnapshot,
  todayIso,
}: {
  summary: HomeSummary;
  tasksSnapshot: TasksPageSnapshot | null;
  todayIso: string;
}) {
  const router = useRouter();
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
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const collapseButtonRef = useRef<HTMLButtonElement>(null);
  const [calendarHeightPx, setCalendarHeightPx] = useState<number | null>(null);
  const [hoursReloadKey, setHoursReloadKey] = useState(0);
  const [calendarCollapsed, setCalendarCollapsed] = useState(false);
  const [collapseHydrated, setCollapseHydrated] = useState(false);

  useEffect(() => {
    setCalendarCollapsed(readCalendarCollapsed());
    setCollapseHydrated(true);
  }, []);

  const pendingFocusRef = useRef<"expand" | "collapse" | null>(null);

  const setCollapsed = useCallback((collapsed: boolean) => {
    setCalendarCollapsed(collapsed);
    writeCalendarCollapsed(collapsed);
  }, []);

  const collapseCalendar = useCallback(() => {
    pendingFocusRef.current = "expand";
    setCollapsed(true);
  }, [setCollapsed]);

  const expandCalendar = useCallback(() => {
    pendingFocusRef.current = "collapse";
    setCollapsed(false);
  }, [setCollapsed]);

  useEffect(() => {
    const target = pendingFocusRef.current;
    if (!target) return;
    pendingFocusRef.current = null;
    if (target === "expand") expandButtonRef.current?.focus();
    else collapseButtonRef.current?.focus();
  }, [calendarCollapsed]);

  const refreshEffortSurfaces = useCallback(() => {
    setHoursReloadKey((k) => k + 1);
    router.refresh();
  }, [router]);

  useLayoutEffect(() => {
    if (calendarCollapsed) {
      setCalendarHeightPx(null);
      return;
    }
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
  }, [calendarCollapsed, openTasksCount, dueTodayCount, pastDueCount, summary, todayIso]);

  const showCalendarButton =
    collapseHydrated && calendarCollapsed ? (
      <button
        ref={expandButtonRef}
        type="button"
        className="icon-btn"
        aria-label="Show calendar"
        aria-expanded={false}
        onClick={expandCalendar}
      >
        <CalendarExpandIcon />
      </button>
    ) : null;

  return (
    <section aria-label="Home dashboard" className="mb-6">
      <div className="grid grid-cols-1 items-start gap-2 xl:grid-cols-12">
        <div
          ref={leftStackRef}
          className={
            calendarCollapsed
              ? "flex min-w-0 flex-col gap-2 xl:col-span-12"
              : "flex min-w-0 flex-col gap-2 xl:col-span-8"
          }
        >
          <div
            className={
              calendarCollapsed
                ? "grid grid-cols-1 gap-2 sm:grid-cols-8 sm:items-start xl:grid-cols-12"
                : "grid grid-cols-1 gap-2 sm:grid-cols-8 sm:items-start"
            }
          >
            <div
              className={
                calendarCollapsed
                  ? "min-w-0 self-start sm:col-span-2 xl:col-span-2"
                  : "min-w-0 self-start sm:col-span-2"
              }
            >
              <HomeSummaryCard
                summary={summary}
                openTasksCount={openTasksCount}
                dueTodayCount={dueTodayCount}
                pastDueCount={pastDueCount}
              />
            </div>
            <div
              className={
                calendarCollapsed
                  ? "min-w-0 self-start sm:col-span-6 xl:col-span-10"
                  : "min-w-0 self-start sm:col-span-6"
              }
            >
              <HomeOpenTasksCard
                snapshot={tasksSnapshot}
                onEffortChanged={refreshEffortSurfaces}
                headerTrailing={showCalendarButton}
              />
            </div>
          </div>

          <HomeWeekHoursStackedBar
            todayIso={todayIso}
            projectById={projectById}
            reloadKey={hoursReloadKey}
            wideLayout={calendarCollapsed}
          />
        </div>

        {!calendarCollapsed ? (
          <div className="order-last min-w-0 xl:order-none xl:col-span-4">
            <HomeDayAgendaCard
              todayIso={todayIso}
              heightPx={calendarHeightPx}
              projectAbbreviationById={projectAbbreviationById}
              projects={tasksSnapshot?.projects ?? []}
              tracks={tasksSnapshot?.tracks ?? []}
              onCalendarEntryCreated={refreshEffortSurfaces}
              onCollapse={collapseCalendar}
              collapseButtonRef={collapseButtonRef}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
