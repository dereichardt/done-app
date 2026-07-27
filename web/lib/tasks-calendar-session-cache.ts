"use client";

import {
  effortPeriodBounds,
  parseLocalYmd,
  type EffortView,
} from "@/lib/integration-effort-buckets";
import {
  loadTasksCalendarSessions,
  type TasksCalendarSession,
} from "@/lib/actions/tasks-calendar";

const DAY_MS = 86_400_000;

export function calendarSessionCacheKey(startIso: string, endIso: string): string {
  return `${startIso}|${endIso}`;
}

const cache = new Map<string, TasksCalendarSession[]>();
const inflight = new Map<string, Promise<TasksCalendarSession[] | null>>();
const clearListeners = new Set<() => void>();
let cacheGeneration = 0;

export function getCachedCalendarSessions(cacheKey: string): TasksCalendarSession[] | undefined {
  return cache.get(cacheKey);
}

export function setCachedCalendarSessions(cacheKey: string, sessions: TasksCalendarSession[]): void {
  cache.set(cacheKey, sessions);
}

export function clearCalendarSessionCache(): void {
  cache.clear();
  inflight.clear();
  cacheGeneration += 1;
  for (const listener of clearListeners) listener();
}

/** Subscribe to cache clears so keep-alive calendar panes can quiet-reload. */
export function subscribeCalendarSessionCacheCleared(listener: () => void): () => void {
  clearListeners.add(listener);
  return () => {
    clearListeners.delete(listener);
  };
}

export function getCalendarSessionCacheGeneration(): number {
  return cacheGeneration;
}

export function computeCalendarFetchWindow(
  scope: EffortView,
  anchorYmd: string,
): { startIso: string; endIso: string; cacheKey: string } {
  const anchorDate = parseLocalYmd(anchorYmd);
  const { start: periodStart, endExclusive: periodEnd } = effortPeriodBounds(scope, anchorDate);
  const padMs = scope === "month" ? 31 * DAY_MS : scope === "week" ? 7 * DAY_MS : DAY_MS;
  const start = new Date(periodStart.getTime() - padMs);
  const end = new Date(periodEnd.getTime() + padMs);
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  return { startIso, endIso, cacheKey: calendarSessionCacheKey(startIso, endIso) };
}

async function fetchAndCacheWindow(
  startIso: string,
  endIso: string,
  cacheKey: string,
): Promise<{ sessions: TasksCalendarSession[]; error?: string }> {
  const cached = cache.get(cacheKey);
  if (cached) return { sessions: cached };

  const existing = inflight.get(cacheKey);
  if (existing) {
    const sessions = await existing;
    if (sessions) return { sessions };
    return { sessions: [], error: "Could not load calendar sessions." };
  }

  const loadPromise = (async (): Promise<TasksCalendarSession[] | null> => {
    const res = await loadTasksCalendarSessions(startIso, endIso);
    if (res.error || !res.sessions) return null;
    cache.set(cacheKey, res.sessions);
    return res.sessions;
  })();

  inflight.set(cacheKey, loadPromise);
  try {
    const sessions = await loadPromise;
    if (!sessions) return { sessions: [], error: "Could not load calendar sessions." };
    return { sessions };
  } finally {
    inflight.delete(cacheKey);
  }
}

export async function ensureCalendarSessionsForWindow(
  scope: EffortView,
  anchorYmd: string,
): Promise<{ sessions: TasksCalendarSession[]; error?: string }> {
  const { startIso, endIso, cacheKey } = computeCalendarFetchWindow(scope, anchorYmd);
  return fetchAndCacheWindow(startIso, endIso, cacheKey);
}

export async function prefetchCalendarSessions(scope: EffortView, anchorYmd: string): Promise<void> {
  await ensureCalendarSessionsForWindow(scope, anchorYmd);
}
