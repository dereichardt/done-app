"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { HomeProgressSection } from "@/components/home-progress-section";
import type { HomeProjectPickerRow } from "@/lib/actions/home";
import {
  loadAllHomeProjectStatuses,
  loadHomeProjectStatus,
  type HomeProjectStatusCacheEntry,
} from "@/lib/actions/home-project-status";
import type { HomeProjectStatusPayload } from "@/lib/home-project-status";

export function HomeProgressGate({ projects }: { projects: HomeProjectPickerRow[] }) {
  const [progressEntries, setProgressEntries] = useState<
    Record<string, HomeProjectStatusCacheEntry>
  >({});
  const [progressLoading, setProgressLoading] = useState(projects.length > 0);
  const progressPromiseRef = useRef<ReturnType<typeof loadAllHomeProjectStatuses> | null>(null);

  useEffect(() => {
    if (projects.length === 0) {
      setProgressLoading(false);
      return;
    }
    progressPromiseRef.current ??= loadAllHomeProjectStatuses();
    const progressPromise = progressPromiseRef.current;
    let cancelled = false;
    void progressPromise.then((result) => {
      if (cancelled) return;
      if (result.error) {
        setProgressEntries(
          Object.fromEntries(projects.map((project) => [project.id, { error: result.error }])),
        );
      } else {
        setProgressEntries(result.entries);
      }
      setProgressLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projects]);

  const retryProgress = useCallback(async (projectId: string) => {
    setProgressEntries((current) => {
      const next = { ...current };
      delete next[projectId];
      return next;
    });
    setProgressLoading(true);
    const result = await loadHomeProjectStatus(projectId);
    setProgressEntries((current) => ({
      ...current,
      [projectId]: result.payload
        ? { payload: result.payload }
        : { error: result.error ?? "Load failed" },
    }));
    setProgressLoading(false);
  }, []);

  const updateProgressPayload = useCallback(
    (projectId: string, payload: HomeProjectStatusPayload) => {
      setProgressEntries((current) => ({ ...current, [projectId]: { payload } }));
    },
    [],
  );

  return (
    <HomeProgressSection
      projects={projects}
      entries={progressEntries}
      backgroundLoading={progressLoading}
      onRetry={(projectId) => void retryProgress(projectId)}
      onPayloadChange={updateProgressPayload}
    />
  );
}
