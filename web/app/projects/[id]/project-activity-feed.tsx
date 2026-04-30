"use client";

import { loadMoreProjectActivity } from "@/lib/actions/project-activity";
import type { ActivityEvent, ActivityEventKind } from "@/lib/project-activity";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 25;

type FilterKind = "all" | ActivityEventKind;

const FILTERS: { label: string; kind: FilterKind }[] = [
  { label: "All", kind: "all" },
  { label: "Updates", kind: "update" },
  { label: "Tasks", kind: "task_created" },
  { label: "Working time", kind: "work_session" },
  { label: "Meetings", kind: "meeting" },
  { label: "State changes", kind: "integration_state" },
  { label: "Lifecycle", kind: "lifecycle" },
];

/** Map a kind to the group heading its filter chip targets (some chips cover multiple kinds). */
function matchesFilter(kind: ActivityEventKind, filter: FilterKind): boolean {
  if (filter === "all") return true;
  if (filter === "task_created") return kind === "task_created" || kind === "task_completed";
  if (filter === "work_session") return kind === "work_session" || kind === "manual_task";
  if (filter === "lifecycle") return kind === "lifecycle" || kind === "phase" || kind === "integration_linked";
  return kind === filter;
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function IconLifecycle() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
    </svg>
  );
}

function IconPhase() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path fillRule="evenodd" clipRule="evenodd" d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75Z" />
    </svg>
  );
}

function IconIntegrationLinked() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
    </svg>
  );
}

function IconIntegrationState() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M10 1a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 1ZM5.05 3.05a.75.75 0 0 1 1.06 0l1.062 1.06A.75.75 0 1 1 6.11 5.173L5.05 4.11a.75.75 0 0 1 0-1.06ZM14.95 3.05a.75.75 0 0 1 0 1.06l-1.06 1.062a.75.75 0 0 1-1.062-1.061l1.06-1.06a.75.75 0 0 1 1.062 0ZM3 9.25a.75.75 0 0 0 0 1.5h1.5a.75.75 0 0 0 0-1.5H3ZM15.5 9.25a.75.75 0 0 0 0 1.5H17a.75.75 0 0 0 0-1.5h-1.5ZM5.05 15.05a.75.75 0 0 0 1.06-1.06l-1.06-1.062a.75.75 0 0 0-1.062 1.061l1.06 1.06ZM14.95 13.99a.75.75 0 0 0-1.062 1.061l1.06 1.06a.75.75 0 0 0 1.061-1.06l-1.06-1.061ZM10 17.5a.75.75 0 0 1-.75-.75v-1.5a.75.75 0 0 1 1.5 0v1.5a.75.75 0 0 1-.75.75ZM10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
    </svg>
  );
}

function IconUpdate() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path fillRule="evenodd" clipRule="evenodd" d="M2 10c0-4.418 3.582-8 8-8s8 3.582 8 8-3.582 8-8 8H2.75a.75.75 0 0 1-.53-1.28l1.43-1.43A7.956 7.956 0 0 1 2 10Zm8-3.5a.75.75 0 0 1 .75.75v3.19l2.03 2.03a.75.75 0 0 1-1.06 1.06l-2.25-2.25A.75.75 0 0 1 9.25 11V7.25A.75.75 0 0 1 10 6.5Z" />
    </svg>
  );
}

function IconTask() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path fillRule="evenodd" clipRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" />
    </svg>
  );
}

function IconWorkSession() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path fillRule="evenodd" clipRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h3.5a.75.75 0 0 0 0-1.5h-2.75V5Z" />
    </svg>
  );
}

function IconMeeting() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM14.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1.615 16.428a1.224 1.224 0 0 1-.569-1.175 6.002 6.002 0 0 1 11.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 0 1 7 17a9.953 9.953 0 0 1-5.385-1.572ZM14.5 10c.97 0 1.874.25 2.667.69A7.003 7.003 0 0 1 21 16.5H14.5v-1.5c0-1.065-.23-2.076-.64-2.985A3.503 3.503 0 0 0 14.5 10Z" />
    </svg>
  );
}

function ActivityIcon({ kind }: { kind: ActivityEventKind }) {
  const iconEl = {
    lifecycle: <IconLifecycle />,
    phase: <IconPhase />,
    integration_linked: <IconIntegrationLinked />,
    integration_state: <IconIntegrationState />,
    update: <IconUpdate />,
    task_created: <IconTask />,
    task_completed: <IconTask />,
    work_session: <IconWorkSession />,
    meeting: <IconMeeting />,
    manual_task: <IconWorkSession />,
  }[kind];

  return (
    <span
      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
      style={{
        color: "var(--app-text-muted)",
        background: "color-mix(in oklab, var(--app-border) 25%, var(--app-surface) 75%)",
      }}
    >
      {iconEl}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Relative time
// ---------------------------------------------------------------------------

function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  const d = new Date(isoString);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDayHeading(isoString: string): string {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString;
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const isoDay = d.toDateString();
  if (isoDay === today.toDateString()) return "Today";
  if (isoDay === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function getDayKey(isoString: string): string {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString;
  return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Event row
// ---------------------------------------------------------------------------

function EventRow({ event, showDivider }: { event: ActivityEvent; showDivider: boolean }) {
  return (
    <div
      className="flex gap-3 py-3"
      style={showDivider ? { borderTop: "1px solid color-mix(in oklab, var(--app-border) 45%, var(--app-surface) 55%)" } : undefined}
    >
      <ActivityIcon kind={event.kind} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 text-sm leading-snug" style={{ color: "var(--app-text)" }}>
            {event.link ? (
              <Link
                href={event.link}
                className="hover:underline focus-visible:underline"
                style={{ color: "var(--app-text)" }}
              >
                {event.summary}
                {event.entity ? <> <span className="font-medium">{event.entity}</span></> : null}
              </Link>
            ) : (
              <>
                {event.summary}
                {event.entity ? <> <span className="font-medium">{event.entity}</span></> : null}
              </>
            )}
          </p>
          <time
            dateTime={event.occurredAt}
            className="shrink-0 whitespace-nowrap text-xs"
            style={{ color: "var(--app-text-muted)" }}
          >
            {formatRelativeTime(event.occurredAt)}
          </time>
        </div>
        {event.secondary ? (
          <p
            className="mt-0.5 min-w-0 truncate text-xs leading-relaxed"
            style={{ color: "var(--app-text-muted)" }}
            title={event.secondary}
          >
            {event.secondary}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ProjectActivityFeed({
  projectId,
  initialEvents,
}: {
  projectId: string;
  initialEvents: ActivityEvent[];
}) {
  const [events, setEvents] = useState<ActivityEvent[]>(initialEvents);
  const [filter, setFilter] = useState<FilterKind>("all");
  const [isPending, startTransition] = useTransition();
  const [hasMore, setHasMore] = useState(initialEvents.length >= PAGE_SIZE);
  const [loadError, setLoadError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Stable ref so the IntersectionObserver callback never closes over stale state
  const loadRef = useRef<{ hasMore: boolean; isPending: boolean; oldest: string | null }>({
    hasMore: initialEvents.length >= PAGE_SIZE,
    isPending: false,
    oldest: initialEvents.at(-1)?.occurredAt ?? null,
  });

  const filteredEvents = useMemo(
    () => events.filter((e) => matchesFilter(e.kind, filter)),
    [events, filter],
  );

  // Group by day
  const grouped = useMemo(() => {
    const groups: { dayKey: string; heading: string; events: ActivityEvent[] }[] = [];
    for (const event of filteredEvents) {
      const dayKey = getDayKey(event.occurredAt);
      const last = groups.at(-1);
      if (last?.dayKey === dayKey) {
        last.events.push(event);
      } else {
        groups.push({ dayKey, heading: formatDayHeading(event.occurredAt), events: [event] });
      }
    }
    return groups;
  }, [filteredEvents]);

  const loadOlder = useCallback(() => {
    const { hasMore: hm, isPending: ip, oldest } = loadRef.current;
    if (!hm || ip || !oldest) return;
    loadRef.current.isPending = true;
    setLoadError(null);
    startTransition(async () => {
      const res = await loadMoreProjectActivity(projectId, oldest);
      loadRef.current.isPending = false;
      if (res.error) {
        setLoadError(res.error);
        return;
      }
      const newEvents = res.events;
      const done = newEvents.length < PAGE_SIZE;
      if (done) {
        loadRef.current.hasMore = false;
        setHasMore(false);
      }
      setEvents((prev) => {
        const existingIds = new Set(prev.map((e) => e.id));
        const merged = [...prev, ...newEvents.filter((e) => !existingIds.has(e.id))];
        merged.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
        loadRef.current.oldest = merged.at(-1)?.occurredAt ?? null;
        return merged;
      });
    });
  }, [projectId]);

  // Scroll-triggered load: fire when the sentinel enters the viewport
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadOlder();
      },
      { threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadOlder]);

  return (
    <div>
      <h2 className="section-heading">Activity</h2>

      {/* Filter chips */}
      <div
        className="mt-3 flex flex-wrap gap-2"
        role="group"
        aria-label="Filter activity by type"
      >
        {FILTERS.map((f) => {
          const isActive = filter === f.kind;
          return (
            <button
              key={f.kind}
              type="button"
              onClick={() => setFilter(f.kind)}
              aria-pressed={isActive}
              className="cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
              style={{
                borderColor: isActive ? "var(--app-cta-dark-fill)" : "var(--app-border)",
                background: isActive ? "var(--app-cta-dark-fill)" : "var(--app-surface)",
                color: isActive ? "var(--app-cta-dark-fg)" : "var(--app-text-muted)",
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ["--tw-ring-color" as any]: "color-mix(in oklab, var(--app-text) 35%, transparent)",
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Event list */}
      <div className="mt-4">
        {filteredEvents.length === 0 ? (
          <p className="py-8 text-center text-sm" style={{ color: "var(--app-text-muted)" }}>
            No activity yet
            {filter !== "all" ? " for this filter" : ""}.
          </p>
        ) : (
          <div
            className="rounded-xl border"
            style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}
          >
            {/* Scrollable region — fixed height, day headings stick inside */}
            <div className="max-h-[40rem] overflow-y-auto">
              {grouped.map((group, gi) => (
                <div key={group.dayKey}>
                  {/* Sticky day heading */}
                  <div
                    className="sticky top-0 z-10 px-4 py-2 text-xs font-medium tracking-wide"
                    style={{
                      color: "var(--app-text-muted)",
                      background: "color-mix(in oklab, var(--app-border) 20%, var(--app-surface) 80%)",
                      borderRadius:
                        gi === 0
                          ? "calc(var(--app-radius) - 1px) calc(var(--app-radius) - 1px) 0 0"
                          : undefined,
                    }}
                  >
                    {group.heading}
                  </div>
                  {/* Events in this day */}
                  <div className="px-4">
                    {group.events.map((event, i) => (
                      <EventRow key={event.id} event={event} showDivider={i > 0} />
                    ))}
                  </div>
                </div>
              ))}

              {/* Scroll sentinel — observed to trigger loading older events */}
              {hasMore ? (
                <div ref={sentinelRef} className="flex items-center justify-center py-4">
                  {isPending ? (
                    <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>
                      Loading…
                    </span>
                  ) : (
                    <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>
                      Scroll for more
                    </span>
                  )}
                </div>
              ) : null}

              {loadError ? (
                <p className="px-4 py-3 text-xs" style={{ color: "var(--app-danger)" }}>
                  {loadError}
                </p>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
