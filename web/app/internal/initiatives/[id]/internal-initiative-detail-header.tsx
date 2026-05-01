"use client";

import { CanvasArrowLeftIcon } from "@/components/canvas-arrow-icons";
import {
  reopenInternalInitiative,
  updateInternalInitiativeDetails,
} from "@/lib/actions/internal-tasks";
import { formatDateDisplay } from "@/lib/integration-task-helpers";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CompleteInitiativeDialog } from "./complete-initiative-dialog";

function formatEffortInputDefault(hours: number | null): string {
  if (hours == null || !Number.isFinite(hours)) return "";
  return String(Math.round(hours * 4) / 4);
}

export function InternalInitiativeDetailHeader({
  initiativeId,
  title: initialTitle,
  startsOn,
  endsOn,
  completedAt,
  initialEstimatedEffortHours,
}: {
  initiativeId: string;
  title: string;
  startsOn: string;
  endsOn: string;
  completedAt: string | null;
  initialEstimatedEffortHours: number | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [editKey, setEditKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reopening, setReopening] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const completeDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handlePointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  function openEditMode() {
    setEditKey((k) => k + 1);
    setEditing(true);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get("title") ?? "").trim();
    const starts_on = String(fd.get("starts_on") ?? "").trim();
    const ends_on = String(fd.get("ends_on") ?? "").trim();
    const estimated_effort_hours = String(fd.get("estimated_effort_hours") ?? "");

    setSaving(true);
    try {
      const result = await updateInternalInitiativeDetails(initiativeId, {
        title,
        starts_on,
        ends_on,
        estimated_effort_hours,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleReopen() {
    setMenuOpen(false);
    setReopening(true);
    try {
      await reopenInternalInitiative(initiativeId);
      router.refresh();
    } finally {
      setReopening(false);
    }
  }

  const displayTitle = (initialTitle ?? "").trim() || "Initiative";
  const isCompleted = completedAt !== null;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        {!editing ? (
          <div className="hover-reveal-edit">
            <div className="flex w-max max-w-full items-center gap-2">
              <h1 id="initiative-title-sentinel" className="heading-page min-w-0 shrink truncate">
                {displayTitle}
              </h1>
              <div className="relative shrink-0" ref={menuRef}>
                <button
                  type="button"
                  className="hover-reveal-edit-btn flex h-9 w-9 shrink-0 items-center justify-center border bg-[var(--app-surface)] text-[var(--app-text-muted)]"
                  style={{ borderColor: "var(--app-border)" }}
                  aria-label="Initiative actions"
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  onClick={() => setMenuOpen((o) => !o)}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
                    <circle cx="12" cy="5" r="1.75" />
                    <circle cx="12" cy="12" r="1.75" />
                    <circle cx="12" cy="19" r="1.75" />
                  </svg>
                </button>
                {menuOpen ? (
                  <div
                    role="menu"
                    aria-orientation="vertical"
                    className="absolute left-0 z-[100] mt-1 min-w-[16rem] rounded-lg border py-1 shadow-lg"
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
                        setMenuOpen(false);
                        openEditMode();
                      }}
                    >
                      Edit initiative details
                    </button>
                    {isCompleted ? (
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full px-3 py-2.5 text-left text-sm transition-colors hover:bg-[var(--app-surface-alt)]"
                        style={{ color: "var(--app-text)" }}
                        disabled={reopening}
                        onClick={handleReopen}
                      >
                        {reopening ? "Reopening…" : "Reopen initiative"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full px-3 py-2.5 text-left text-sm transition-colors hover:bg-[var(--app-surface-alt)]"
                        style={{ color: "var(--app-text)" }}
                        onClick={() => {
                          setMenuOpen(false);
                          completeDialogRef.current?.showModal();
                        }}
                      >
                        Mark initiative as completed
                      </button>
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full px-3 py-2.5 text-left text-sm transition-colors hover:bg-[var(--app-surface-alt)]"
                      style={{ color: "var(--app-danger)" }}
                      onClick={() => {
                        setMenuOpen(false);
                        router.push(`/internal/initiatives/${initiativeId}/delete`);
                      }}
                    >
                      Delete initiative
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            <p className="subheading-page mt-1 text-muted-canvas">
              {formatDateDisplay(startsOn)} – {formatDateDisplay(endsOn)}
            </p>
            {initialEstimatedEffortHours != null && Number.isFinite(initialEstimatedEffortHours) ? (
              <p className="mt-1 text-sm text-muted-canvas">
                Estimated effort: {formatEffortInputDefault(initialEstimatedEffortHours)} hrs
              </p>
            ) : null}
            {isCompleted ? (
              <p className="mt-1 text-sm text-muted-canvas">Completed</p>
            ) : null}
          </div>
        ) : (
          <form key={editKey} onSubmit={handleSubmit} className="flex max-w-3xl flex-col gap-4">
            <label className="block text-sm font-medium" style={{ color: "var(--app-text)" }}>
              Title
              <input name="title" required defaultValue={displayTitle} className="input-canvas mt-1" />
            </label>
            <label className="block text-sm font-medium" style={{ color: "var(--app-text)" }}>
              Start date
              <input name="starts_on" type="date" required defaultValue={startsOn} className="input-canvas mt-1" />
            </label>
            <label className="block text-sm font-medium" style={{ color: "var(--app-text)" }}>
              End date
              <input name="ends_on" type="date" required defaultValue={endsOn} className="input-canvas mt-1" />
            </label>
            <label className="block text-sm font-medium" style={{ color: "var(--app-text)" }}>
              Estimated effort{" "}
              <span className="font-normal text-muted-canvas">(hours, optional · quarter hours)</span>
              <input
                name="estimated_effort_hours"
                type="text"
                inputMode="decimal"
                className="input-canvas mt-1"
                placeholder="e.g. 80 or 40.5"
                autoComplete="off"
                defaultValue={formatEffortInputDefault(initialEstimatedEffortHours)}
              />
            </label>
            {error ? (
              <p className="text-sm" style={{ color: "var(--app-danger)" }} role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={saving} className="btn-cta-dark whitespace-nowrap">
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                className="btn-cta whitespace-nowrap text-xs"
                disabled={saving}
                onClick={() => {
                  setEditing(false);
                  setError(null);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
      <Link href="/internal" className="btn-cta whitespace-nowrap self-start">
        <CanvasArrowLeftIcon />
        Back to Internal
      </Link>

      <CompleteInitiativeDialog initiativeId={initiativeId} dialogRef={completeDialogRef} onClose={() => {}} />
    </div>
  );
}
