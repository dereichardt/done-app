"use client";

import {
  addAnyTaskSubtask,
  deleteAnyTaskSubtask,
  reorderAnyTaskSubtasks,
  toggleAnyTaskSubtask,
  updateAnyTaskSubtaskTitle,
} from "@/lib/actions/task-subtasks";
import { SubtaskCheckbox } from "@/components/subtask-checkbox";
import type { TaskSubtask } from "@/lib/tasks-page-shared";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useId, useRef, useState, useSyncExternalStore } from "react";

const subscribeToHydration = () => () => {};
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

function newDraftId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isUnpersistedId(id: string) {
  return id.startsWith("temp-") || id.startsWith("draft-");
}

function withSortOrder(rows: TaskSubtask[]): TaskSubtask[] {
  return rows.map((row, index) => ({ ...row, sort_order: index }));
}

function GripHandleIcon() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden>
      <circle cx="9" cy="6" r="1.4" fill="currentColor" />
      <circle cx="15" cy="6" r="1.4" fill="currentColor" />
      <circle cx="9" cy="12" r="1.4" fill="currentColor" />
      <circle cx="15" cy="12" r="1.4" fill="currentColor" />
      <circle cx="9" cy="18" r="1.4" fill="currentColor" />
      <circle cx="15" cy="18" r="1.4" fill="currentColor" />
    </svg>
  );
}

function SortableSubtaskRow({
  row,
  titleValue,
  disabled,
  busy,
  dndReady,
  onTitleChange,
  onCommitTitle,
  onToggle,
  onRemove,
  onFocusDraft,
}: {
  row: TaskSubtask;
  titleValue: string;
  disabled: boolean;
  busy: boolean;
  dndReady: boolean;
  onTitleChange: (value: string) => void;
  onCommitTitle: (value: string) => Promise<void>;
  onToggle: (completed: boolean) => void;
  onRemove: () => void;
  onFocusDraft: () => void;
}) {
  const titleId = `subtask-title-${row.id}`;
  const dragDisabled = disabled || busy || isUnpersistedId(row.id) || !dndReady;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
    disabled: dragDisabled,
  });

  return (
    <li
      ref={setNodeRef}
      className="group flex min-h-6 min-w-0 items-center gap-2"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      <button
        type="button"
        className="inline-flex h-5 w-5 shrink-0 cursor-grab items-center justify-center rounded text-[var(--app-text-muted)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 active:cursor-grabbing hover:text-[var(--app-text)] disabled:cursor-default disabled:opacity-0"
        aria-label="Drag to reorder"
        title="Drag to reorder"
        disabled={dragDisabled}
        style={{ touchAction: "none" }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        {...(dragDisabled ? {} : attributes)}
        {...(dragDisabled ? {} : listeners)}
        onPointerDown={(e) => {
          e.stopPropagation();
          if (!dragDisabled) listeners?.onPointerDown?.(e);
        }}
      >
        <GripHandleIcon />
      </button>
      <SubtaskCheckbox
        checked={row.completed}
        disabled={disabled || busy}
        labelledBy={titleId}
        onChange={onToggle}
      />
      <input
        id={titleId}
        type="text"
        value={titleValue}
        disabled={disabled || busy}
        aria-label="Subtask"
        className="min-w-0 flex-1 border-0 bg-transparent px-0 py-0.5 text-sm outline-none focus-visible:ring-0"
        style={{
          color: row.completed ? "var(--app-text-muted)" : "var(--app-text)",
          textDecoration: row.completed ? "line-through" : "none",
        }}
        onChange={(e) => onTitleChange(e.target.value)}
        onBlur={(e) => void onCommitTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void onCommitTitle(e.currentTarget.value).then(() => onFocusDraft());
          }
          if (e.key === "Backspace" && e.currentTarget.value === "") {
            e.preventDefault();
            onRemove();
          }
        }}
      />
      <button
        type="button"
        className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--app-text-muted)] transition-colors hover:bg-[var(--app-surface-alt)] hover:text-[var(--app-text)]"
        aria-label="Remove subtask"
        title="Remove subtask"
        disabled={disabled || busy}
        onClick={onRemove}
      >
        <span className="text-sm leading-none" aria-hidden>
          ×
        </span>
      </button>
    </li>
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
  const dndContextId = useId();
  const dndReady = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
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
    if (!persist || isUnpersistedId(row.id)) return;
    const res = await deleteAnyTaskSubtask(persist.taskId, row.id, persist.scope);
    if (res.error) {
      onSubtasksChange(prev);
      setError(res.error);
    }
  }

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = subtasks.findIndex((s) => s.id === active.id);
      const newIndex = subtasks.findIndex((s) => s.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;

      const prev = subtasks;
      const next = withSortOrder(arrayMove(subtasks, oldIndex, newIndex));
      onSubtasksChange(next);
      if (!persist) return;

      const orderedIds = next.map((s) => s.id).filter((id) => !isUnpersistedId(id));
      void reorderAnyTaskSubtasks(persist.taskId, orderedIds, persist.scope).then((res) => {
        if (res.error) {
          onSubtasksChange(prev);
          setError(res.error);
        }
      });
    },
    [onSubtasksChange, persist, subtasks],
  );

  const sortableIds = subtasks.map((row) => row.id);

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

      <DndContext
        id={dndContextId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <ul className={scrollable ? scrollableListClass : "flex list-none flex-col gap-1"}>
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            {subtasks.map((row) => (
              <SortableSubtaskRow
                key={row.id}
                row={row}
                titleValue={titleEdits[row.id] ?? row.title}
                disabled={disabled}
                busy={busyId === row.id}
                dndReady={dndReady}
                onTitleChange={(value) => {
                  setTitleEdits((prev) => ({ ...prev, [row.id]: value }));
                  setError(null);
                }}
                onCommitTitle={(value) => commitTitle(row, value)}
                onToggle={(completed) => void toggleRow(row, completed)}
                onRemove={() => void removeRow(row)}
                onFocusDraft={focusDraft}
              />
            ))}
          </SortableContext>
          <li className="flex min-h-6 min-w-0 items-center gap-2">
            <span className="inline-flex h-5 w-5 shrink-0" aria-hidden />
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
      </DndContext>
      {error ? (
        <p className="text-xs" style={{ color: "var(--app-danger)" }} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
