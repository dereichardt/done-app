"use client";

import { useEffect, useState } from "react";

import { HomeInboxSection } from "@/components/home-inbox-section";
import { HomeProgressSection } from "@/components/home-progress-section";
import { HomeQuickActions } from "@/components/home-quick-actions";
import type { HomeProjectPickerRow } from "@/lib/actions/home";
import type { HomeProjectStatusPayload } from "@/lib/home-project-status";
import type { HomeInboxItemRow } from "@/lib/home-inbox-rules";

const HOME_INBOX_SECTION_ID = "home-inbox-panel";
const HOME_PROGRESS_SECTION_ID = "home-progress-panel";

export function HomeInboxGate({
  projects,
  initialItems,
  timezone,
  initialStatus,
}: {
  projects: HomeProjectPickerRow[];
  initialItems: HomeInboxItemRow[];
  timezone: string | null;
  initialStatus?: { payload?: HomeProjectStatusPayload; error?: string };
}) {
  const [inboxOpen, setInboxOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [inboxCount, setInboxCount] = useState(initialItems.length);

  useEffect(() => {
    setInboxCount(initialItems.length);
  }, [initialItems]);

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
          initialItems={initialItems}
          timezone={timezone}
          onRequestClose={() => setInboxOpen(false)}
          onItemsCountChange={setInboxCount}
        />
      ) : null}
      {progressOpen ? (
        <HomeProgressSection
          sectionId={HOME_PROGRESS_SECTION_ID}
          projects={projects}
          initialPayload={initialStatus?.payload}
          initialError={initialStatus?.error}
          onRequestClose={() => setProgressOpen(false)}
        />
      ) : null}
    </>
  );
}
