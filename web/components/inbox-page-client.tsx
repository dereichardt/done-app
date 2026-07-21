"use client";

import { useEffect, useRef, useState } from "react";

import { HomeInboxSection } from "@/components/home-inbox-section";
import { syncAndLoadHomeInbox } from "@/lib/actions/home-inbox";
import type { HomeInboxItemRow } from "@/lib/home-inbox-rules";

const INBOX_PAGE_SECTION_ID = "inbox-page-panel";

export function InboxPageClient({
  initialItems,
  timezone,
}: {
  initialItems: HomeInboxItemRow[];
  timezone: string | null;
}) {
  const [items, setItems] = useState(initialItems);
  const inboxSyncPromiseRef = useRef<ReturnType<typeof syncAndLoadHomeInbox> | null>(null);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    inboxSyncPromiseRef.current ??= syncAndLoadHomeInbox();
    const syncPromise = inboxSyncPromiseRef.current;
    let cancelled = false;
    void syncPromise.then((result) => {
      if (cancelled || !result.items) return;
      setItems(result.items);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <HomeInboxSection
      sectionId={INBOX_PAGE_SECTION_ID}
      initialItems={items}
      timezone={timezone}
      onItemsChange={setItems}
    />
  );
}
