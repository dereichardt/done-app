"use client";

import { useCallback, useEffect, useRef } from "react";

import { DialogCloseButton } from "@/components/dialog-close-button";
import type { HomeProjectPickerRow } from "@/lib/actions/home";

export function HomeProjectPickerDialog({
  open,
  title,
  projects,
  onClose,
  onPick,
}: {
  open: boolean;
  title: string;
  projects: HomeProjectPickerRow[];
  onClose: () => void;
  onPick: (row: HomeProjectPickerRow) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
    }
  }, [open]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      className="app-catalog-dialog fixed left-1/2 top-1/2 z-[200] -translate-x-1/2 -translate-y-1/2 overflow-hidden border-0 p-0 shadow-xl w-[min(100vw-2rem,28rem)] max-w-[calc(100vw-2rem)]"
      style={{
        borderRadius: "var(--app-radius)",
        background: "var(--app-surface)",
        color: "var(--app-text)",
      }}
      onClose={handleClose}
    >
      <div className="flex max-h-[min(80dvh,24rem)] flex-col">
        <div
          className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3"
          style={{ borderColor: "var(--app-border)" }}
        >
          <h2 className="min-w-0 flex-1 text-base font-medium pr-2" style={{ color: "var(--app-text)" }}>
            {title}
          </h2>
          <DialogCloseButton onClick={() => dialogRef.current?.close()} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {projects.length === 0 ? (
            <p className="px-2 py-4 text-sm" style={{ color: "var(--app-text-muted)" }}>
              No active projects yet. Add a project to continue.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {projects.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="flex w-full cursor-pointer flex-col items-start rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-[var(--app-surface-alt)]"
                    style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}
                    onClick={() => {
                      onPick(p);
                    }}
                  >
                    <span className="text-sm font-medium" style={{ color: "var(--app-text)" }}>
                      {p.customer_name}
                    </span>
                    <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>
                      {p.integration_count === 1 ? "1 integration" : `${p.integration_count} integrations`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div
          className="flex shrink-0 justify-end border-t px-4 py-3"
          style={{ borderColor: "var(--app-border)" }}
        >
          <button type="button" className="btn-cta text-xs" onClick={() => dialogRef.current?.close()}>
            Cancel
          </button>
        </div>
      </div>
    </dialog>
  );
}
