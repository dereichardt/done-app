"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { HomeProjectPickerDialog } from "@/components/home-project-picker-dialog";
import type { HomeProjectPickerRow } from "@/lib/actions/home";

export function HomeCreateFab({ projects }: { projects: HomeProjectPickerRow[] }) {
  const router = useRouter();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const integrationProjects = projects.filter((p) => p.integrations_enabled);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (e.target instanceof Node && root.contains(e.target)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const closeMenu = useCallback(() => setOpen(false), []);

  const handlePickIntegration = useCallback(
    (row: HomeProjectPickerRow) => {
      setPickerOpen(false);
      router.push(`/projects/${row.id}/integrations/new`);
    },
    [router],
  );

  return (
    <>
      <div ref={rootRef} className="fixed bottom-6 right-6 z-[230] flex flex-col items-end gap-2">
        {open ? (
          <div
            id={menuId}
            role="menu"
            aria-label="Create"
            className="flex min-w-[12.5rem] flex-col overflow-hidden rounded-[var(--app-radius)] border shadow-lg"
            style={{
              borderColor: "var(--app-border)",
              background: "var(--app-surface)",
              boxShadow: "var(--app-shadow-card)",
            }}
          >
            <Link
              role="menuitem"
              href="/projects/new"
              className="px-3 py-2.5 text-sm font-medium no-underline transition-colors hover:bg-[var(--app-surface-alt)] focus-visible:outline-none focus-visible:bg-[var(--app-surface-alt)]"
              style={{ color: "var(--app-text)" }}
              onClick={closeMenu}
            >
              Add project
            </Link>
            <button
              type="button"
              role="menuitem"
              className="cursor-pointer px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-[var(--app-surface-alt)] focus-visible:outline-none focus-visible:bg-[var(--app-surface-alt)] disabled:cursor-not-allowed disabled:opacity-50"
              style={{ color: "var(--app-text)" }}
              disabled={integrationProjects.length === 0}
              onClick={() => {
                closeMenu();
                setPickerOpen(true);
              }}
            >
              Add integration
            </button>
            <Link
              role="menuitem"
              href="/internal/initiatives/new"
              className="px-3 py-2.5 text-sm font-medium no-underline transition-colors hover:bg-[var(--app-surface-alt)] focus-visible:outline-none focus-visible:bg-[var(--app-surface-alt)]"
              style={{ color: "var(--app-text)" }}
              onClick={closeMenu}
            >
              Add initiative
            </Link>
          </div>
        ) : null}

        <button
          type="button"
          className="inline-flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border shadow-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)]"
          style={{
            borderColor: "var(--app-border)",
            background: "var(--app-text)",
            color: "var(--app-surface)",
            boxShadow: "var(--app-shadow-card)",
          }}
          aria-label={open ? "Close create menu" : "Create"}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-controls={open ? menuId : undefined}
          onClick={() => setOpen((v) => !v)}
        >
          <svg viewBox="0 0 16 16" width={22} height={22} aria-hidden className="shrink-0">
            {open ? (
              <path
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.6"
                d="M4 4l8 8M12 4l-8 8"
              />
            ) : (
              <path
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.6"
                d="M8 3v10M3 8h10"
              />
            )}
          </svg>
        </button>
      </div>

      <HomeProjectPickerDialog
        open={pickerOpen}
        title="Choose a project — Add integration"
        projects={integrationProjects}
        onClose={() => setPickerOpen(false)}
        onPick={handlePickIntegration}
      />
    </>
  );
}
