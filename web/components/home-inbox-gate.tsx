"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { HomeInboxSection } from "@/components/home-inbox-section";
import { HomeProgressSection } from "@/components/home-progress-section";
import { HomeQuickActions } from "@/components/home-quick-actions";
import type { HomeProjectPickerRow } from "@/lib/actions/home";
import { syncAndLoadHomeInbox } from "@/lib/actions/home-inbox";
import {
  loadAllHomeProjectStatuses,
  loadHomeProjectStatus,
  type HomeProjectStatusCacheEntry,
} from "@/lib/actions/home-project-status";
import type { HomeProjectStatusPayload } from "@/lib/home-project-status";
import type { HomeInboxItemRow } from "@/lib/home-inbox-rules";

const HOME_INBOX_SECTION_ID = "home-inbox-panel";
const HOME_PROGRESS_SECTION_ID = "home-progress-panel";

export function HomeInboxGate({
  projects,
  initialItems,
  timezone,
}: {
  projects: HomeProjectPickerRow[];
  initialItems: HomeInboxItemRow[];
  timezone: string | null;
}) {
  const [inboxOpen, setInboxOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [inboxItems, setInboxItems] = useState(initialItems);
  const [inboxCount, setInboxCount] = useState(initialItems.length);
  const [progressEntries, setProgressEntries] = useState<
    Record<string, HomeProjectStatusCacheEntry>
  >({});
  const [progressLoading, setProgressLoading] = useState(projects.length > 0);
  const progressPromiseRef = useRef<ReturnType<typeof loadAllHomeProjectStatuses> | null>(null);
  const inboxSyncPromiseRef = useRef<ReturnType<typeof syncAndLoadHomeInbox> | null>(null);

  useEffect(() => {
    setInboxItems(initialItems);
    setInboxCount(initialItems.length);
  }, [initialItems]);

  useEffect(() => {
    inboxSyncPromiseRef.current ??= syncAndLoadHomeInbox();
    const syncPromise = inboxSyncPromiseRef.current;
    let cancelled = false;
    void syncPromise.then((result) => {
      if (cancelled || !result.items) return;
      setInboxItems(result.items);
      setInboxCount(result.items.length);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (projects.length === 0) return;
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
      [projectId]: result.payload ? { payload: result.payload } : { error: result.error ?? "Load failed" },
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
    <>
      <HomeQuickActions
        projects={projects}
        inboxSectionId={HOME_INBOX_SECTION_ID}
        inboxItemCount={inboxCount}
        inboxPanelOpen={inboxOpen}
        onOpenInboxPanel={() => {
          setProgressOpen(false);
          setInboxOpen(true);
        }}
        progressSectionId={HOME_PROGRESS_SECTION_ID}
        progressPanelOpen={progressOpen}
        onOpenProgressPanel={() => {
          setInboxOpen(false);
          setProgressOpen(true);
        }}
      />
      {inboxOpen ? (
        <HomeInboxSection
          sectionId={HOME_INBOX_SECTION_ID}
          initialItems={inboxItems}
          timezone={timezone}
          onRequestClose={() => setInboxOpen(false)}
          onItemsCountChange={setInboxCount}
          onItemsChange={setInboxItems}
        />
      ) : null}
      {progressOpen ? (
        <HomeProgressSection
          sectionId={HOME_PROGRESS_SECTION_ID}
          projects={projects}
          entries={progressEntries}
          backgroundLoading={progressLoading}
          onRetry={(projectId) => void retryProgress(projectId)}
          onPayloadChange={updateProgressPayload}
          onRequestClose={() => setProgressOpen(false)}
        />
      ) : null}
    </>
  );
}
