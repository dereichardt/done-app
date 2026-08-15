"use client";

import {
  addAnyTaskSubtask,
  deleteAnyTaskSubtask,
  toggleAnyTaskSubtask,
  updateAnyTaskSubtaskTitle,
} from "@/lib/actions/task-subtasks";
import type { TaskSubtask } from "@/lib/tasks-page-shared";
import { useId, useRef, useState } from "react";

function newDraftId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function SubtaskCheckbox({
  checked,
  disabled,
  labelledBy,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  labelledBy?: string;
  onChange: (next: boolean) => void;
}) {
  const id = useId();
  return (
    <label className="relative inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center">
      <input
        id={id}
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        aria-labelledby={labelledBy}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        className="flex h-4 w-4 items-center justify-center rounded-[3px] border bg-[var(--app-surface)] transition-colors peer-checked:border-[color:var(--app-cta-dark-fill)] peer-checked:bg-[var(--app-cta-dark-fill)] peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)] peer-disabled:cursor-not-allowed peer-disabled:opacity-50 peer-checked:[&>svg]:opacity-100"
        style={{ borderColor: "var(--app-border)" }}
        aria-hidden
      >
        <svg viewBox="0 0 16 16" className="pointer-events-none h-[11px] w-[11px] opacity-0" aria-hidden>
          <path
            d="M3.5 8 L7 11.5 L12.5 4.5"
            fill="none"
            stroke="var(--app-cta-dark-fg)"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </label>
  );
}

export function SubtaskListEditor({
  subtasks,
  onSubtasksChange,
  persist,
  disabled = false,
  showLabel = true,
  includeFormFields = false,
  scrollable = false,
}: {
  subtasks: TaskSubtask[];
  onSubtasksChange: (next: TaskSubtask[]) => void;
  persist?: {
    taskId: string;
    scope: "project" | "internal";
  };
  disabled?: boolean;
  showLabel?: boolean;
  /** When true (create forms), emit a hidden JSON field for server actions. */
  includeFormFields?: boolean;
  /** Cap the list and scroll instead of growing the parent dialog. */
  scrollable?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [titleEdits, setTitleEdits] = useState<Record<string, string>>({});
  const draftRef = useRef<HTMLInputElement | null>(null);

  /** Five committed rows + the trailing placeholder, with `gap-1` between them. */
  const scrollableListClass =
    "flex h-[calc(6*1.5rem+5*0.25rem)] shrink-0 list-none flex-col gap-1 overflow-y-auto overscroll-contain";

  function focusDraft() {
    requestAnimationFrame(() => {
      draftRef.current?.focus();
      draftRef.current?.scrollIntoView({ block: "nearest" });
    });
  }

  async function commitDraft() {
    const title = draft.trim();
    if (!title || disabled) return;
    setError(null);
    setDraft("");

    if (!persist) {
      onSubtasksChange([
        ...subtasks,
        {
          id: newDraftId(),
          title,
          completed: false,
          sort_order: subtasks.length,
        },
      ]);
      focusDraft();
      return;
    }

    const tempId = `temp-${newDraftId()}`;
    const optimistic: TaskSubtask = {
      id: tempId,
      title,
      completed: false,
      sort_order: subtasks.length,
    };
    onSubtasksChange([...subtasks, optimistic]);
    setBusyId(tempId);
    const res = await addAnyTaskSubtask(persist.taskId, title, persist.scope);
    setBusyId(null);
    if (res.error || !res.subtask) {
      onSubtasksChange(subtasks);
      setDraft(title);
      setError(res.error ?? "Could not add subtask");
      return;
    }
    onSubtasksChange([...subtasks, res.subtask]);
    focusDraft();
  }

  async function toggleRow(row: TaskSubtask, completed: boolean) {
    if (disabled) return;
    const prev = subtasks;
    onSubtasksChange(subtasks.map((s) => (s.id === row.id ? { ...s, completed } : s)));
    if (!persist || row.id.startsWith("temp-")) return;
    const res = await toggleAnyTaskSubtask(persist.taskId, row.id, completed, persist.scope);
    if (res.error) {
      onSubtasksChange(prev);
      setError(res.error);
    }
  }

  async function commitTitle(row: TaskSubtask, nextTitle: string) {
    const trimmed = nextTitle.trim();
    if (disabled) return;
    if (!trimmed) {
      await removeRow(row);
      return;
    }
    if (trimmed === row.title) {
      setTitleEdits((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      return;
    }
    const prev = subtasks;
    setTitleEdits((edits) => {
      const next = { ...edits };
      delete next[row.id];
      return next;
    });
    onSubtasksChange(subtasks.map((s) => (s.id === row.id ? { ...s, title: trimmed } : s)));
    if (!persist || row.id.startsWith("temp-")) return;
    const res = await updateAnyTaskSubtaskTitle(persist.taskId, row.id, trimmed, persist.scope);
    if (res.error) {
      onSubtasksChange(prev);
      setError(res.error);
    }
  }

  async function removeRow(row: TaskSubtask) {
    if (disabled) return;
    const prev = subtasks;
    setTitleEdits((edits) => {
      const next = { ...edits };
      delete next[row.id];
      return next;
    });
    onSubtasksChange(subtasks.filter((s) => s.id !== row.id));
    if (!persist || row.id.startsWith("temp-") || row.id.startsWith("draft-")) return;
    const res = await deleteAnyTaskSubtask(persist.taskId, row.id, persist.scope);
    if (res.error) {
      onSubtasksChange(prev);
      setError(res.error);
    }
  }

  return (
    <div className={`flex min-w-0 flex-col gap-1 ${scrollable ? "shrink-0" : ""}`.trim()}>
      {showLabel ? (
        <span className="shrink-0 text-xs" style={{ color: "var(--app-text-muted)" }}>
          Subtasks
        </span>
      ) : null}

      {includeFormFields ? (
        <input type="hidden" name="subtasks_json" value={JSON.stringify(subtasks)} />
      ) : null}

      <ul className={scrollable ? scrollableListClass : "flex list-none flex-col gap-1"}>
        {subtasks.map((row) => {
          const titleId = `subtask-title-${row.id}`;
          const titleValue = titleEdits[row.id] ?? row.title;
          return (
            <li key={row.id} className="flex min-h-6 min-w-0 items-center gap-2">
              <SubtaskCheckbox
                checked={row.completed}
                disabled={disabled || busyId === row.id}
                labelledBy={titleId}
                onChange={(next) => void toggleRow(row, next)}
              />
              <input
                id={titleId}
                type="text"
                value={titleValue}
                disabled={disabled || busyId === row.id}
                aria-label="Subtask"
                className="min-w-0 flex-1 border-0 bg-transparent px-0 py-0.5 text-sm outline-none focus-visible:ring-0"
                style={{
                  color: row.completed ? "var(--app-text-muted)" : "var(--app-text)",
                  textDecoration: row.completed ? "line-through" : "none",
                }}
                onChange={(e) => {
                  setTitleEdits((prev) => ({ ...prev, [row.id]: e.target.value }));
                  setError(null);
                }}
                onBlur={(e) => void commitTitle(row, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void commitTitle(row, e.currentTarget.value).then(() => focusDraft());
                  }
                  if (e.key === "Backspace" && e.currentTarget.value === "") {
                    e.preventDefault();
                    void removeRow(row);
                  }
                }}
              />
              <button
                type="button"
                className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--app-text-muted)] transition-colors hover:bg-[var(--app-surface-alt)] hover:text-[var(--app-text)]"
                aria-label="Remove subtask"
                title="Remove subtask"
                disabled={disabled || busyId === row.id}
                onClick={() => void removeRow(row)}
              >
                <span className="text-sm leading-none" aria-hidden>
                  ×
                </span>
              </button>
            </li>
          );
        })}
        <li className="flex min-h-6 min-w-0 items-center gap-2">
          <SubtaskCheckbox checked={false} disabled onChange={() => undefined} />
          <input
            ref={draftRef}
            type="text"
            value={draft}
            disabled={disabled}
            placeholder="Enter subtask"
            aria-label="Enter subtask"
            className="min-w-0 flex-1 border-0 bg-transparent px-0 py-0.5 text-sm outline-none placeholder:text-[var(--app-text-muted)] focus-visible:ring-0"
            style={{ color: "var(--app-text)" }}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void commitDraft();
              }
            }}
            onBlur={() => {
              if (draft.trim()) void commitDraft();
            }}
          />
        </li>
      </ul>
      {error ? (
        <p className="text-xs" style={{ color: "var(--app-danger)" }} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
