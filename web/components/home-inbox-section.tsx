"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type MouseEvent,
} from "react";

import { EllipsisVerticalIcon, FilterIcon, TrashIcon } from "@/components/action-icons";
import { DialogCloseButton } from "@/components/dialog-close-button";
import { HomeInboxItemResolverPanel } from "@/components/home-inbox-item-resolver-panel";
import {
  deleteAllHomeInboxItems,
  deleteHomeInboxItem,
  markAllHomeInboxItemsRead,
  markAllHomeInboxItemsUnread,
  markHomeInboxItemRead,
  syncHomeInboxNow,
} from "@/lib/actions/home-inbox";
import { formatInboxTimestamp, staleIntegrationProjectName } from "@/lib/inbox-format";
import type { HomeInboxItemRow } from "@/lib/home-inbox-rules";
import { getUserTodayIso } from "@/lib/user-preferences";
import { addDaysYmd, mondayYmdOfWeekContaining } from "@/lib/zoned-datetime";

const toolbarBtnClass =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-[var(--app-radius)] border bg-[var(--app-surface)] px-2.5 text-xs font-medium transition-colors hover:bg-[var(--app-surface-alt)] disabled:cursor-not-allowed disabled:opacity-45";

type InboxFilter = "all" | "new_this_week" | "read" | "unread";

const INBOX_FILTER_OPTIONS: Array<{ value: InboxFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "new_this_week", label: "New this week" },
  { value: "unread", label: "Unread only" },
  { value: "read", label: "Read only" },
];

function createdYmdInTz(iso: string, timeZone: string | null): string {
  const tz = timeZone?.trim() || "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(iso));
    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    /* fall through */
  }
  return new Date(iso).toISOString().slice(0, 10);
}

function isCreatedThisWeek(iso: string, timeZone: string | null): boolean {
  const todayYmd = getUserTodayIso(timeZone);
  const weekMon = mondayYmdOfWeekContaining(todayYmd);
  const weekSun = addDaysYmd(weekMon, 6);
  const createdYmd = createdYmdInTz(iso, timeZone);
  return createdYmd >= weekMon && createdYmd <= weekSun;
}

export function HomeInboxSection({
  initialItems,
  timezone,
  sectionId,
  onRequestClose,
  onItemsCountChange,
  onItemsChange,
}: {
  initialItems: HomeInboxItemRow[];
  timezone: string | null;
  sectionId?: string;
  onRequestClose?: () => void;
  onItemsCountChange?: (count: number) => void;
  onItemsChange?: (items: HomeInboxItemRow[]) => void;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const itemsRef = useRef(initialItems);
  const [pendingDelete, setPendingDelete] = useState<null | { type: "single"; id: string } | { type: "all" }>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteAllError, setDeleteAllError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [inboxMenuOpen, setInboxMenuOpen] = useState(false);
  const inboxMenuRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    setItems(initialItems);
    onItemsCountChange?.(initialItems.length);
  }, [initialItems, onItemsCountChange]);

  const visibleItems = useMemo(() => {
    switch (filter) {
      case "new_this_week":
        return items.filter((i) => isCreatedThisWeek(i.created_at, timezone));
      case "read":
        return items.filter((i) => i.read_at != null);
      case "unread":
        return items.filter((i) => i.read_at == null);
      default:
        return items;
    }
  }, [filter, items, timezone]);

  const selectedItem = useMemo(
    () => visibleItems.find((i) => i.id === selectedId) ?? null,
    [visibleItems, selectedId],
  );

  const filterLabel = INBOX_FILTER_OPTIONS.find((o) => o.value === filter)?.label ?? "All";

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    onItemsCountChange?.(items.length);
  }, [items.length, onItemsCountChange]);

  useEffect(() => {
    if (selectedId && !visibleItems.some((i) => i.id === selectedId)) {
      setSelectedId(null);
    }
  }, [visibleItems, selectedId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (filterOpen) {
        setFilterOpen(false);
        return;
      }
      if (pendingDelete) {
        setPendingDelete(null);
        setDeleteError(null);
        setDeleteAllError(null);
        return;
      }
      setSelectedId(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pendingDelete, filterOpen]);

  useEffect(() => {
    if (!inboxMenuOpen) return;
    function handlePointerDown(e: PointerEvent) {
      if (inboxMenuRef.current?.contains(e.target as Node)) return;
      setInboxMenuOpen(false);
    }
    function handleMenuKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setInboxMenuOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleMenuKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleMenuKeyDown);
    };
  }, [inboxMenuOpen]);

  useEffect(() => {
    if (!filterOpen) return;
    function handlePointerDown(e: PointerEvent) {
      if (filterMenuRef.current?.contains(e.target as Node)) return;
      setFilterOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [filterOpen]);

  /** After removing `id`, optionally select the next row (same index) or the previous row if it was last. */
  const removeFromList = useCallback((id: string, selectNext: boolean) => {
    const prev = itemsRef.current;
    const idx = prev.findIndex((i) => i.id === id);
    if (idx === -1) return;
    const nextItems = prev.filter((i) => i.id !== id);
    setItems(nextItems);
    setSelectedId((sel) => {
      if (sel !== id) return sel;
      if (!selectNext) return null;
      if (nextItems.length === 0) return null;
      return idx < nextItems.length ? nextItems[idx].id : nextItems[nextItems.length - 1].id;
    });
  }, []);

  const handleSelectItem = useCallback((row: HomeInboxItemRow) => {
    setPendingDelete(null);
    setDeleteError(null);
    setDeleteAllError(null);
    setSelectedId(row.id);
    if (row.read_at != null) return;
    startTransition(async () => {
      const res = await markHomeInboxItemRead(row.id);
      if (!res.error) {
        const readAt = new Date().toISOString();
        setItems((prev) => prev.map((i) => (i.id === row.id ? { ...i, read_at: readAt } : i)));
      }
    });
  }, []);

  const handleConfirmDeleteSingle = () => {
    if (pendingDelete?.type !== "single") return;
    const id = pendingDelete.id;
    setDeleteError(null);
    startTransition(async () => {
      const res = await deleteHomeInboxItem(id);
      if (res.error) {
        setDeleteError(res.error);
        return;
      }
      setPendingDelete(null);
      removeFromList(id, false);
    });
  };

  const handleConfirmDeleteAll = () => {
    setDeleteAllError(null);
    startTransition(async () => {
      const res = await deleteAllHomeInboxItems();
      if (res.error) {
        setDeleteAllError(res.error);
        return;
      }
      setPendingDelete(null);
      setItems([]);
      setSelectedId(null);
      router.refresh();
    });
  };

  const hasItems = items.length > 0;
  const hasUnread = items.some((i) => i.read_at == null);
  const hasRead = items.some((i) => i.read_at != null);

  const handleMarkAllRead = () => {
    if (!hasItems || !hasUnread) return;
    startTransition(async () => {
      const res = await markAllHomeInboxItemsRead();
      if (!res.error) {
        const readAt = new Date().toISOString();
        setItems((prev) => prev.map((i) => (i.read_at == null ? { ...i, read_at: readAt } : i)));
        router.refresh();
      }
    });
  };

  const handleMarkAllUnread = () => {
    if (!hasItems || !hasRead) return;
    startTransition(async () => {
      const res = await markAllHomeInboxItemsUnread();
      if (!res.error) {
        setItems((prev) => prev.map((i) => ({ ...i, read_at: null })));
        router.refresh();
      }
    });
  };

  const handleGenerateActions = () => {
    setSyncError(null);
    startTransition(async () => {
      const res = await syncHomeInboxNow();
      if (res.error) {
        setSyncError(res.error);
        return;
      }
      if (res.items) {
        setItems(res.items);
        onItemsChange?.(res.items);
        onItemsCountChange?.(res.items.length);
      }
    });
  };

  const handleRequestDeleteAll = () => {
    setDeleteAllError(null);
    setPendingDelete({ type: "all" });
    setSelectedId(null);
  };

  const handleTrashClick = (e: MouseEvent<HTMLButtonElement>, item: HomeInboxItemRow) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteError(null);
    setSelectedId(item.id);
    setPendingDelete({ type: "single", id: item.id });
  };

  return (
    <section id={sectionId} aria-label="Home inbox" className="mt-10 w-full min-w-0">
      <div className="flex w-full min-w-0 items-center justify-between gap-2">
        <div className="hover-reveal-edit hover-reveal-edit--compact flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <h2 className="section-heading shrink-0">Inbox</h2>
          <div className="relative shrink-0" ref={inboxMenuRef}>
            <button
              type="button"
              className={`hover-reveal-edit-btn border bg-[var(--app-surface)] text-[var(--app-text-muted)] hover:bg-[var(--app-surface-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)] ${
                inboxMenuOpen ? "!pointer-events-auto !opacity-100" : ""
              }`}
              style={{ borderColor: "var(--app-border)" }}
              aria-label="Inbox menu"
              aria-expanded={inboxMenuOpen}
              aria-haspopup="menu"
              onClick={() => setInboxMenuOpen((o) => !o)}
            >
              <EllipsisVerticalIcon size={14} />
            </button>
            {inboxMenuOpen ? (
              <div
                role="menu"
                aria-orientation="vertical"
                className="absolute left-0 z-[100] mt-1 min-w-[15rem] rounded-lg border py-1 shadow-lg"
                style={{
                  background: "var(--app-surface)",
                  borderColor: "var(--app-border)",
                  boxShadow: "0 8px 24px color-mix(in oklab, var(--app-text) 12%, transparent)",
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full px-3 py-2.5 text-left text-sm transition-colors hover:bg-[var(--app-surface-alt)]"
                  style={{ color: "var(--app-text)" }}
                  onClick={() => {
                    setInboxMenuOpen(false);
                    router.push("/settings");
                  }}
                >
                  Edit Settings
                </button>
              </div>
            ) : null}
          </div>
        </div>
        {onRequestClose ? (
          <DialogCloseButton aria-label="Close inbox" className="shrink-0" onClick={onRequestClose} />
        ) : null}
      </div>

      <div className="mt-4 w-full min-w-0 rounded-[var(--app-radius)]">
        <div
          className="card-canvas flex min-h-0 max-h-[calc(100dvh-10rem)] w-full flex-col overflow-hidden md:min-h-[28rem]"
          aria-label="Inbox list container"
        >
          <div
            className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2"
            style={{
              borderColor: "var(--app-border)",
              background: "var(--app-surface-alt)",
            }}
            role="toolbar"
            aria-label="Inbox actions"
          >
            <span
              className="mr-1 text-xs font-medium tabular-nums"
              style={{ color: "var(--app-text-muted)" }}
              aria-live="polite"
            >
              {filter === "all"
                ? items.length === 1
                  ? "1 item"
                  : `${items.length} items`
                : `${visibleItems.length} of ${items.length}`}
            </span>

            <div className="relative shrink-0" ref={filterMenuRef}>
              <button
                type="button"
                className={`${toolbarBtnClass} gap-1.5`}
                style={{ borderColor: "var(--app-border)", color: "var(--app-text)" }}
                aria-label={`Filter inbox: ${filterLabel}`}
                aria-expanded={filterOpen}
                aria-haspopup="menu"
                onClick={() => setFilterOpen((o) => !o)}
              >
                <FilterIcon size={14} />
                <span>{filterLabel}</span>
                <span aria-hidden className="text-[10px] opacity-70">
                  ▾
                </span>
              </button>
              {filterOpen ? (
                <div
                  role="menu"
                  aria-label="Inbox filter"
                  aria-orientation="vertical"
                  className="absolute left-0 z-[100] mt-1 min-w-[12rem] rounded-lg border py-1 shadow-lg"
                  style={{
                    background: "var(--app-surface)",
                    borderColor: "var(--app-border)",
                    boxShadow: "0 8px 24px color-mix(in oklab, var(--app-text) 12%, transparent)",
                  }}
                >
                  {INBOX_FILTER_OPTIONS.map((opt) => {
                    const selected = filter === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="menuitemradio"
                        aria-checked={selected}
                        className="flex w-full px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--app-surface-alt)]"
                        style={{
                          color: "var(--app-text)",
                          fontWeight: selected ? 500 : 400,
                        }}
                        onClick={() => {
                          setFilter(opt.value);
                          setFilterOpen(false);
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              className={toolbarBtnClass}
              style={{ borderColor: "var(--app-border)", color: "var(--app-text)" }}
              disabled={!hasItems || !hasUnread}
              onClick={() => handleMarkAllRead()}
            >
              Read all
            </button>
            <button
              type="button"
              className={toolbarBtnClass}
              style={{ borderColor: "var(--app-border)", color: "var(--app-text)" }}
              disabled={!hasItems || !hasRead}
              onClick={() => handleMarkAllUnread()}
            >
              Unread all
            </button>
            <button
              type="button"
              className={toolbarBtnClass}
              style={{ borderColor: "var(--app-border)", color: "var(--app-danger)" }}
              disabled={!hasItems}
              onClick={() => handleRequestDeleteAll()}
            >
              Delete all
            </button>
            <button
              type="button"
              className={toolbarBtnClass}
              style={{ borderColor: "var(--app-border)", color: "var(--app-text)" }}
              onClick={() => handleGenerateActions()}
            >
              Reload inbox
            </button>
            {syncError ? (
              <span className="text-xs" role="alert" style={{ color: "var(--app-danger)" }}>
                {syncError}
              </span>
            ) : null}
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
            <div
              className="flex max-h-[min(40vh,18rem)] min-h-0 w-full min-w-0 flex-col border-b md:max-h-none md:w-[min(22rem,40%)] md:max-w-[40%] md:shrink-0 md:border-b-0 md:border-r"
              style={{ borderColor: "var(--app-border)" }}
            >
              {visibleItems.length === 0 ? (
                <p className="p-5 text-center text-sm text-muted-canvas">
                  {items.length === 0
                    ? "Nothing in your inbox right now."
                    : "No items match this filter."}
                </p>
              ) : (
                <ul className="m-0 list-none flex-1 overflow-y-auto overscroll-contain p-0 px-2 py-2 md:px-3">
                  {visibleItems.map((item) => {
                    const unread = item.read_at == null;
                    const selected = selectedId === item.id;
                    const projectName = staleIntegrationProjectName(item);
                    return (
                      <li key={item.id} className="m-0 list-none py-0.5">
                        <div
                          className={`group flex min-h-[2.75rem] cursor-pointer flex-wrap items-stretch rounded-lg transition-colors sm:flex-nowrap ${
                            selected
                              ? "bg-[var(--app-surface-alt)] ring-1 ring-[var(--app-border)]"
                              : "hover:bg-[var(--app-surface-alt)]"
                          } focus-within:bg-[var(--app-surface-alt)]`}
                          style={{ outline: "none" }}
                        >
                          <button
                            type="button"
                            aria-current={selected ? "true" : undefined}
                            className="flex min-w-0 flex-1 items-start gap-2 rounded-lg px-2 py-2 text-left text-sm"
                            style={{ color: "var(--app-text)" }}
                            onClick={() => handleSelectItem(item)}
                          >
                            {unread ? (
                              <span
                                className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--app-action)]"
                                aria-hidden
                              />
                            ) : (
                              <span className="mt-1.5 size-1.5 shrink-0 rounded-full opacity-40" aria-hidden />
                            )}
                            <span className="min-w-0 flex-1">
                              <span
                                className={`block leading-snug ${unread ? "font-medium text-[var(--app-text)]" : "font-normal"}`}
                              >
                                {item.title}
                              </span>
                              {projectName ? (
                                <span className="mt-0.5 block text-xs text-muted-canvas">{projectName}</span>
                              ) : null}
                              <span className="mt-0.5 block text-xs text-muted-canvas">
                                {formatInboxTimestamp(item.created_at, timezone)}
                              </span>
                            </span>
                          </button>
                          <div className="flex shrink-0 items-center justify-end gap-2 pr-1 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border bg-[var(--app-surface)] text-[var(--app-text-muted)] transition-colors hover:bg-[var(--app-surface-alt)]"
                              style={{ borderColor: "var(--app-border)" }}
                              title="Dismiss inbox item"
                              aria-label="Dismiss inbox item"
                              onClick={(e) => handleTrashClick(e, item)}
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div
              className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-t md:border-t-0"
              style={{ borderColor: "var(--app-border)" }}
            >
              {pendingDelete?.type === "all" ? (
                <div className="flex min-h-0 flex-1 flex-col p-5">
                  <h2 className="text-base font-semibold" style={{ color: "var(--app-text)" }}>
                    Delete All Inbox Items?
                  </h2>
                  <p className="mt-3 text-sm text-muted-canvas">
                    This dismisses every open inbox item. They will not regenerate for the same week window.
                    New items can still appear next week from your Settings cadence and integrations.
                  </p>
                  {deleteAllError ? (
                    <p className="mt-3 text-sm" role="alert" style={{ color: "var(--app-danger)" }}>
                      {deleteAllError}
                    </p>
                  ) : null}
                  <div className="mt-6 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-ghost text-sm"
                      onClick={() => {
                        setPendingDelete(null);
                        setDeleteAllError(null);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="cursor-pointer rounded-[var(--app-radius)] px-3 py-2 text-sm font-medium transition-[background-color] duration-150 ease-out hover:bg-[color-mix(in_oklab,var(--app-danger)_78%,var(--app-text)_22%)] bg-[var(--app-danger)] text-[var(--app-surface)]"
                      onClick={() => handleConfirmDeleteAll()}
                    >
                      Delete All
                    </button>
                  </div>
                </div>
              ) : pendingDelete?.type === "single" ? (
                <div className="flex min-h-0 flex-1 flex-col p-5">
                  <h2 className="text-base font-semibold" style={{ color: "var(--app-text)" }}>
                    Dismiss this inbox item?
                  </h2>
                  <p className="mt-3 text-sm text-muted-canvas">
                    It will leave your inbox and will not regenerate this week if the condition is still true.
                  </p>
                  {deleteError ? (
                    <p className="mt-3 text-sm" role="alert" style={{ color: "var(--app-danger)" }}>
                      {deleteError}
                    </p>
                  ) : null}
                  <div className="mt-6 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-ghost text-sm"
                      onClick={() => {
                        setPendingDelete(null);
                        setDeleteError(null);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="cursor-pointer rounded-[var(--app-radius)] px-3 py-2 text-sm font-medium transition-[background-color] duration-150 ease-out hover:bg-[color-mix(in_oklab,var(--app-danger)_78%,var(--app-text)_22%)] bg-[var(--app-danger)] text-[var(--app-surface)]"
                      onClick={() => handleConfirmDeleteSingle()}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ) : selectedItem ? (
                <HomeInboxItemResolverPanel
                  key={selectedItem.id}
                  item={selectedItem}
                  timezone={timezone}
                  onDeselect={() => setSelectedId(null)}
                  onItemCompleted={(id) => removeFromList(id, true)}
                />
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
                  <p className="text-sm text-muted-canvas">Select an item to view details and take action.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
