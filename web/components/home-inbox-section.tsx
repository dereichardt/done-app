"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { markHomeInboxItemDone } from "@/lib/actions/home-inbox";
import type { HomeInboxItemRow } from "@/lib/home-inbox-rules";

export function HomeInboxSection({ initialItems }: { initialItems: HomeInboxItemRow[] }) {
  const [items, setItems] = useState(initialItems);
  const [pending, startTransition] = useTransition();

  const handleDone = (id: string) => {
    startTransition(async () => {
      const res = await markHomeInboxItemDone(id);
      if (!res.error) {
        setItems((prev) => prev.filter((i) => i.id !== id));
      }
    });
  };

  return (
    <section aria-label="Home inbox" className="mt-10">
      <h2 className="section-heading">Inbox</h2>
      <p className="mt-1 text-sm" style={{ color: "var(--app-text-muted)" }}>
        Reminders from Done — open an item or mark it done when you have handled it.
      </p>
      {items.length === 0 ? (
        <p className="mt-3 text-sm" style={{ color: "var(--app-text-muted)" }}>
          Nothing in your inbox right now.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-3 transition-colors hover:bg-[var(--app-surface-alt)]"
              style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium" style={{ color: "var(--app-text)" }}>
                  {item.title}
                </p>
                {item.body ? (
                  <p className="mt-0.5 text-xs" style={{ color: "var(--app-text-muted)" }}>
                    {item.body}
                  </p>
                ) : null}
                {item.link_path ? (
                  <Link
                    href={item.link_path}
                    className="mt-1 inline-block text-xs font-medium text-[var(--app-action)] underline"
                  >
                    Open
                  </Link>
                ) : null}
              </div>
              <button
                type="button"
                className="btn-cta text-xs shrink-0"
                disabled={pending}
                onClick={() => handleDone(item.id)}
              >
                Mark done
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
