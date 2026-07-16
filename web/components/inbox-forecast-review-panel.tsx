"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { ForecastWeekCell, TARGET_WEEKLY_FORECAST_HOURS } from "@/app/forecast/forecast-week-cell";
import {
  loadInboxForecastReviewProjects,
  saveProjectForecastDraft,
} from "@/lib/actions/project-forecast";
import type { ForecastProjectDTO } from "@/lib/forecast-data";
import {
  PM_FORECAST_ROW_KEY,
  applyForecastProjectTotalEdit,
  currentSundayWeekYmd,
  diffForecastCells,
  formatForecastSundayDate,
  projectTotalsByWeek,
  sumActualsConsumedHours,
  sumEstimatedRoundedHours,
} from "@/lib/project-forecast";
import { sundayWeekStartsInclusive } from "@/lib/project-weekly-effort";
import { addDaysYmd } from "@/lib/zoned-datetime";

type HoursByRow = Record<string, Record<string, number>>;

function cloneHours(h: HoursByRow): HoursByRow {
  const out: HoursByRow = {};
  for (const [k, weeks] of Object.entries(h)) {
    out[k] = { ...weeks };
  }
  return out;
}

function childRowKeys(project: ForecastProjectDTO): string[] {
  return [...project.integrations.map((i) => i.key), PM_FORECAST_ROW_KEY];
}

function weekInSpan(weekStart: string, startYmd: string | null, endYmd: string | null): boolean {
  if (!startYmd || !endYmd) return false;
  const weeks = sundayWeekStartsInclusive(startYmd, endYmd);
  if (weeks.length === 0) return false;
  return weekStart >= weeks[0]! && weekStart <= weeks[weeks.length - 1]!;
}

function projectWritableWeeks(
  project: ForecastProjectDTO,
  reviewWeeks: string[],
  currentSunday: string,
): string[] {
  const forecastStart = project.forecast?.start_date ?? currentSunday;
  return reviewWeeks.filter(
    (w) =>
      w >= currentSunday &&
      w >= forecastStart &&
      !!project.timelineStartYmd &&
      !!project.timelineEndYmd &&
      weekInSpan(w, project.timelineStartYmd, project.timelineEndYmd),
  );
}

function projectReserveHours(project: ForecastProjectDTO): number {
  return Math.max(0, Math.round(project.forecast?.reserve_hours ?? 0));
}

function reviewWeekAxis(currentSunday: string): string[] {
  // Current week (read-only) + next 4 Sundays (editable)
  return Array.from({ length: 5 }, (_, i) => addDaysYmd(currentSunday, i * 7));
}

export function InboxForecastReviewPanel({
  onSaveAndDone,
}: {
  /** Persist pending drafts then mark inbox item done (parent). */
  onSaveAndDone: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [todayIso, setTodayIso] = useState<string | null>(null);
  const [projects, setProjects] = useState<ForecastProjectDTO[]>([]);
  const [drafts, setDrafts] = useState<Record<string, HoursByRow>>({});
  const [persisted, setPersisted] = useState<Record<string, HoursByRow>>({});
  const [reserveByProject, setReserveByProject] = useState<Record<string, number>>({});
  const [persistedReserveByProject, setPersistedReserveByProject] = useState<
    Record<string, number>
  >({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const draftsRef = useRef(drafts);
  const persistedRef = useRef(persisted);
  const reserveRef = useRef(reserveByProject);
  const persistedReserveRef = useRef(persistedReserveByProject);
  const todayIsoRef = useRef(todayIso);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);
  useEffect(() => {
    persistedRef.current = persisted;
  }, [persisted]);
  useEffect(() => {
    reserveRef.current = reserveByProject;
  }, [reserveByProject]);
  useEffect(() => {
    persistedReserveRef.current = persistedReserveByProject;
  }, [persistedReserveByProject]);
  useEffect(() => {
    todayIsoRef.current = todayIso;
  }, [todayIso]);

  useEffect(() => {
    let cancelled = false;
    void loadInboxForecastReviewProjects().then((res) => {
      if (cancelled) return;
      if (res.error || !res.projects || !res.todayIso) {
        setError(res.error ?? "Failed to load forecasts.");
        setLoading(false);
        return;
      }
      setTodayIso(res.todayIso);
      setProjects(res.projects);
      const nextDrafts: Record<string, HoursByRow> = {};
      const nextPersisted: Record<string, HoursByRow> = {};
      const nextReserve: Record<string, number> = {};
      for (const p of res.projects) {
        nextDrafts[p.id] = cloneHours(p.hoursByRow);
        nextPersisted[p.id] = cloneHours(p.hoursByRow);
        nextReserve[p.id] = projectReserveHours(p);
      }
      setDrafts(nextDrafts);
      setPersisted(nextPersisted);
      setReserveByProject(nextReserve);
      setPersistedReserveByProject({ ...nextReserve });
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const currentSunday = todayIso ? currentSundayWeekYmd(todayIso) : null;
  const weeks = useMemo(
    () => (currentSunday ? reviewWeekAxis(currentSunday) : []),
    [currentSunday],
  );

  const portfolioTotals = useMemo(() => {
    const out: Record<string, number> = {};
    for (const w of weeks) out[w] = 0;
    for (const p of projects) {
      const hours = drafts[p.id] ?? p.hoursByRow;
      const totals = projectTotalsByWeek(hours, weeks);
      for (const w of weeks) out[w] = (out[w] ?? 0) + (totals[w] ?? 0);
    }
    return out;
  }, [drafts, projects, weeks]);

  const applyProjectTotalEdit = useCallback(
    (project: ForecastProjectDTO, weekStart: string, nextTotal: number) => {
      if (!currentSunday || !todayIso) return;
      if (weekStart < currentSunday) return;
      if (!project.forecast) return;

      const reviewWritable = projectWritableWeeks(project, weeks, currentSunday).filter(
        (w) => w > currentSunday,
      );
      if (!reviewWritable.includes(weekStart)) return;

      const base = cloneHours(draftsRef.current[project.id] ?? project.hoursByRow);
      const keys = childRowKeys(project);
      const reserve =
        reserveRef.current[project.id] ?? projectReserveHours(project);
      const estimated = sumEstimatedRoundedHours(project.integrations);
      const actuals = sumActualsConsumedHours(
        project.integrations,
        project.actualsByRowKey,
      );
      const result = applyForecastProjectTotalEdit({
        hoursByRow: base,
        rowKeys: keys,
        editedWeekStart: weekStart,
        nextTotalHours: nextTotal,
        currentSundayWeek: currentSunday,
        weekStarts: reviewWritable,
        reserveHours: reserve,
        estimated,
        actuals,
      });
      setDrafts((prev) => ({ ...prev, [project.id]: result.hoursByRow }));
      setReserveByProject((prev) => ({ ...prev, [project.id]: result.reserveHours }));
    },
    [currentSunday, todayIso, weeks],
  );

  const flushAllDirty = useCallback(async (): Promise<{ error?: string }> => {
    const iso = todayIsoRef.current;
    if (!iso) return { error: "Missing date." };

    for (const p of projects) {
      if (!p.forecast) continue;
      const draft = draftsRef.current[p.id];
      const base = persistedRef.current[p.id];
      if (!draft || !base) continue;
      const cells = diffForecastCells(base, draft);
      const reserve = reserveRef.current[p.id] ?? projectReserveHours(p);
      const persistedReserve =
        persistedReserveRef.current[p.id] ?? projectReserveHours(p);
      const reserveChanged = Math.round(reserve) !== Math.round(persistedReserve);
      if (cells.length === 0 && !reserveChanged) continue;
      const res = await saveProjectForecastDraft(p.id, {
        todayIso: iso,
        cells: cells.map((c) => ({
          rowKey: c.rowKey,
          weekStartDate: c.weekStartDate,
          hours: c.hours,
        })),
        reserveHours: Math.max(0, Math.round(reserve)),
      });
      if (res.error) return { error: res.error };
      setPersisted((prev) => ({ ...prev, [p.id]: cloneHours(draft) }));
      setPersistedReserveByProject((prev) => ({ ...prev, [p.id]: reserve }));
    }
    return {};
  }, [projects]);

  const handleSubmit = () => {
    setSaveError(null);
    startTransition(async () => {
      const res = await flushAllDirty();
      if (res.error) {
        setSaveError(res.error);
        return;
      }
      onSaveAndDone();
    });
  };

  if (loading) {
    return <p className="text-sm text-muted-canvas">Loading forecasts…</p>;
  }
  if (error) {
    return (
      <p className="text-sm" role="alert" style={{ color: "var(--app-danger)" }}>
        {error}
      </p>
    );
  }
  if (!currentSunday || weeks.length === 0) {
    return <p className="text-sm text-muted-canvas">No week axis available.</p>;
  }

  const withForecast = projects.filter((p) => p.forecast);
  if (withForecast.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-canvas">
          No project forecasts yet. Generate forecasts from the Forecast page, then reopen this item.
        </p>
        <Link href="/forecast" className="text-sm font-medium text-[var(--app-action)] underline">
          Open Forecast
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-canvas">
        Current week is read-only. Edit project totals for the next 4 weeks; changes redistribute across
        integrations and PM using the same banking rules as Forecast Studio.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-sm">
          <thead>
            <tr>
              <th
                className="sticky left-0 z-[1] bg-[var(--app-surface)] px-2 py-2 text-left font-medium"
                style={{ color: "var(--app-text)" }}
              >
                Project
              </th>
              {weeks.map((w) => (
                <th
                  key={w}
                  className="px-1 py-2 text-center font-medium"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  <span className="block text-[11px] leading-tight">
                    {w === currentSunday ? "This week" : formatForecastSundayDate(w)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t" style={{ borderColor: "var(--app-border)" }}>
              <td
                className="sticky left-0 z-[1] bg-[var(--app-surface)] px-2 py-2 font-medium"
                style={{ color: "var(--app-text)" }}
              >
                All projects
              </td>
              {weeks.map((w) => (
                <td key={w} className="px-1 py-2 align-bottom">
                  <ForecastWeekCell
                    hours={portfolioTotals[w] ?? 0}
                    editable={false}
                    locked
                    capacityTint
                    barScaleHours={TARGET_WEEKLY_FORECAST_HOURS}
                    onCommitHours={() => {}}
                  />
                </td>
              ))}
            </tr>
            {withForecast.map((project) => {
              const hours = drafts[project.id] ?? project.hoursByRow;
              const totals = projectTotalsByWeek(hours, weeks);
              const writable = projectWritableWeeks(project, weeks, currentSunday);
              return (
                <tr key={project.id} className="border-t" style={{ borderColor: "var(--app-border)" }}>
                  <td
                    className="sticky left-0 z-[1] max-w-[10rem] truncate bg-[var(--app-surface)] px-2 py-2 font-medium"
                    style={{ color: "var(--app-text)" }}
                    title={project.customer_name}
                  >
                    {project.customer_name}
                  </td>
                  {weeks.map((w) => {
                    const isCurrent = w === currentSunday;
                    const canEdit = !isCurrent && writable.includes(w);
                    return (
                      <td key={w} className="px-1 py-2 align-bottom">
                        <ForecastWeekCell
                          hours={totals[w] ?? 0}
                          editable={canEdit}
                          locked={!canEdit}
                          onCommitHours={(next) => applyProjectTotalEdit(project, w, next)}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {saveError ? (
        <p className="text-sm" role="alert" style={{ color: "var(--app-danger)" }}>
          {saveError}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          className="inline-flex h-10 min-h-10 items-center justify-center rounded-[var(--app-radius)] px-4 text-sm font-medium btn-cta-dark"
          disabled={pending}
          onClick={() => handleSubmit()}
        >
          {pending ? "Saving…" : "Save forecast & mark done"}
        </button>
      </div>
    </div>
  );
}
