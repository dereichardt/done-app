"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { DialogCloseButton } from "@/components/dialog-close-button";
import { InboxCapacityGapsPanel } from "@/components/inbox-capacity-gaps-panel";
import { InboxForecastReviewPanel } from "@/components/inbox-forecast-review-panel";
import { InboxVariancePanel } from "@/components/inbox-variance-panel";
import { markHomeInboxItemDone } from "@/lib/actions/home-inbox";
import { formatInboxTimestamp } from "@/lib/inbox-format";
import type { HomeInboxItemRow } from "@/lib/home-inbox-rules";

const inboxFooterBtnClass =
  "inline-flex h-10 min-h-10 shrink-0 items-center justify-center gap-2 rounded-[var(--app-radius)] px-4 text-sm font-medium leading-none";

export function HomeInboxItemResolverPanel({
  item,
  timezone,
  onDeselect,
  onItemCompleted,
}: {
  item: HomeInboxItemRow;
  timezone: string | null;
  onDeselect: () => void;
  /** Called after mark done / submit update removes the item; parent advances selection. */
  onItemCompleted: (id: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleMarkDone = () => {
    startTransition(async () => {
      const res = await markHomeInboxItemDone(item.id);
      if (!res.error) {
        onItemCompleted(item.id);
        router.refresh();
      }
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3"
        style={{ borderColor: "var(--app-border)" }}
      >
        <div className="min-w-0 flex-1 pr-2">
          <h2 id="home-inbox-resolver-title" className="text-base font-medium" style={{ color: "var(--app-text)" }}>
            {item.title}
          </h2>
          <p className="mt-0.5 truncate text-sm" style={{ color: "var(--app-text-muted)" }}>
            {formatInboxTimestamp(item.created_at, timezone)}
          </p>
        </div>
        <DialogCloseButton onClick={onDeselect} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {item.rule_key === "forecast_review_reminder" ? (
          <InboxForecastReviewPanel
            onSaveAndDone={() => {
              startTransition(async () => {
                const res = await markHomeInboxItemDone(item.id);
                if (!res.error) {
                  onItemCompleted(item.id);
                  router.refresh();
                }
              });
            }}
          />
        ) : item.rule_key === "variance_review" ? (
          <InboxVariancePanel fallbackBody={item.body} />
        ) : item.rule_key === "capacity_gaps" ? (
          <InboxCapacityGapsPanel fallbackBody={item.body} metadata={item.metadata} />
        ) : (
          <GenericResolverBody item={item} />
        )}
      </div>

      {item.rule_key === "forecast_review_reminder" ? null : item.rule_key === "variance_review" ||
        item.rule_key === "capacity_gaps" ? (
        <div className="shrink-0 border-t px-4 py-3" style={{ borderColor: "var(--app-border)" }}>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {item.link_path && item.rule_key === "capacity_gaps" ? (
              <Link href={item.link_path} className={`${inboxFooterBtnClass} btn-ghost text-sm`}>
                Open Forecast
              </Link>
            ) : null}
            <button
              type="button"
              className={`${inboxFooterBtnClass} btn-cta-dark text-sm`}
              disabled={pending}
              onClick={() => handleMarkDone()}
            >
              {pending ? "Saving…" : "Mark done"}
            </button>
          </div>
        </div>
      ) : (
        <div className="shrink-0 border-t px-4 py-3" style={{ borderColor: "var(--app-border)" }}>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {item.link_path ? (
              <Link href={item.link_path} className={`${inboxFooterBtnClass} btn-ghost text-sm`}>
                Open linked page
              </Link>
            ) : null}
            <button
              type="button"
              className={`${inboxFooterBtnClass} btn-cta-dark text-sm`}
              disabled={pending}
              onClick={() => handleMarkDone()}
            >
              {pending ? "Saving…" : "Mark done"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function GenericResolverBody({ item }: { item: HomeInboxItemRow }) {
  return (
    <div className="flex flex-col gap-4">
      {item.body ? <p className="text-sm text-muted-canvas whitespace-pre-wrap">{item.body}</p> : null}
      {item.link_path ? (
        <p className="text-sm">
          <Link href={item.link_path} className="font-medium text-[var(--app-action)] underline">
            Open linked page
          </Link>
        </p>
      ) : null}
    </div>
  );
}
