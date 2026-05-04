"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import { markHomeInboxItemDone, markHomeInboxItemRead } from "@/lib/actions/home-inbox";
import type { HomeInboxItemRow } from "@/lib/home-inbox-rules";

function formatInboxTimestamp(iso: string, timeZone: string | null): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const tz = timeZone?.trim() || undefined;
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  }
}

export function HomeInboxSection({
  initialItems,
  timezone,
}: {
  initialItems: HomeInboxItemRow[];
  timezone: string | null;
}) {
  const [items, setItems] = useState(initialItems);
  const [selectedId, setSelectedId] = useState<string | null>(initialItems[0]?.id ?? null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    if (selectedId && !items.some((i) => i.id === selectedId)) {
      setSelectedId(items[0]?.id ?? null);
    }
  }, [items, selectedId]);

  const selected = useMemo(() => items.find((i) => i.id === selectedId) ?? null, [items, selectedId]);

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      const row = items.find((i) => i.id === id);
      if (!row || row.read_at != null) return;
      startTransition(async () => {
        const res = await markHomeInboxItemRead(id);
        if (!res.error) {
          const readAt = new Date().toISOString();
          setItems((prev) => prev.map((i) => (i.id === id ? { ...i, read_at: readAt } : i)));
        }
      });
    },
    [items],
  );

  const handleDone = (id: string) => {
    startTransition(async () => {
      const res = await markHomeInboxItemDone(id);
      if (!res.error) {
        setItems((prev) => {
          const next = prev.filter((i) => i.id !== id);
          if (selectedId === id) {
            setSelectedId(next[0]?.id ?? null);
          }
          return next;
        });
      }
    });
  };

  return (
    <section
      aria-label="Home inbox"
      className="mt-10 rounded-xl border p-5"
      style={{ borderColor: "var(--app-border)" }}
    >
      <h2 className="section-heading">Inbox</h2>
      <p className="mt-1 text-sm text-muted-canvas">
        Items are created automatically from your{" "}
        <Link href="/settings" className="font-medium text-[var(--app-action)] underline">
          Settings
        </Link>{" "}
        review days and integration activity. Open an item to read it; mark it done when handled.
      </p>

      {items.length === 0 ? (
        <p className="mt-6 text-center text-sm text-muted-canvas">Nothing in your inbox right now.</p>
      ) : (
        <div
          className="mt-6 flex min-h-[min(28rem,70vh)] flex-col overflow-hidden rounded-lg border sm:flex-row"
          style={{ borderColor: "var(--app-border)" }}
        >
          <div
            className="flex max-h-[40vh] w-full flex-col border-b sm:max-h-none sm:w-[20%] sm:min-w-[11rem] sm:border-b-0 sm:border-r"
            style={{ borderColor: "var(--app-border)" }}
          >
            <ul className="min-h-0 flex-1 list-none overflow-y-auto overscroll-contain p-0 m-0">
              {items.map((item) => {
                const unread = item.read_at == null;
                const active = item.id === selectedId;
                return (
                  <li key={item.id} className="m-0 border-b last:border-b-0" style={{ borderColor: "var(--app-border)" }}>
                    <button
                      type="button"
                      onClick={() => handleSelect(item.id)}
                      className={`flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left text-sm transition-colors ${
                        active ? "bg-[var(--app-surface-alt)]" : "hover:bg-[var(--app-surface-alt)]"
                      }`}
                      style={{ color: "var(--app-text)" }}
                    >
                      <span className="flex w-full min-w-0 items-start gap-2">
                        {unread ? (
                          <span
                            className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--app-action)]"
                            aria-hidden
                          />
                        ) : (
                          <span className="mt-1.5 size-1.5 shrink-0" aria-hidden />
                        )}
                        <span className={`min-w-0 flex-1 leading-snug ${unread ? "font-medium" : "font-normal"}`}>
                          {item.title}
                        </span>
                      </span>
                      <span className="pl-3.5 text-xs text-muted-canvas">{formatInboxTimestamp(item.created_at, timezone)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex min-h-[12rem] min-w-0 flex-1 flex-col bg-[var(--app-surface)] p-4 sm:min-h-0">
            {selected ? (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <h3 className="text-base font-medium" style={{ color: "var(--app-text)" }}>
                    {selected.title}
                  </h3>
                  <p className="mt-1 text-xs text-muted-canvas">
                    {formatInboxTimestamp(selected.created_at, timezone)}
                  </p>
                  {selected.body ? (
                    <p className="mt-4 text-sm text-muted-canvas whitespace-pre-wrap">{selected.body}</p>
                  ) : null}
                  {selected.link_path ? (
                    <p className="mt-4">
                      <Link
                        href={selected.link_path}
                        className="text-sm font-medium text-[var(--app-action)] underline"
                      >
                        Open linked page
                      </Link>
                    </p>
                  ) : null}
                </div>
                <div className="mt-4 shrink-0 border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
                  <button
                    type="button"
                    className="btn-cta text-sm"
                    disabled={pending}
                    onClick={() => handleDone(selected.id)}
                  >
                    Mark done
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-canvas">Select an inbox item.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
