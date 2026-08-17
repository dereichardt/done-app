"use client";

import { SubtaskCheckbox } from "@/components/subtask-checkbox";
import type { TaskSubtask } from "@/lib/tasks-page-shared";

export function subtaskBulletLine(title: string) {
  return `- ${title.trim()}`;
}

export function syncWorkAccomplishedBullets(text: string, title: string, checked: boolean): string {
  const line = subtaskBulletLine(title);
  const lines = text.split("\n");
  if (checked) {
    if (lines.some((entry) => entry.trim() === line)) return text;
    const trimmed = text.replace(/\s+$/, "");
    return trimmed ? `${trimmed}\n${line}` : line;
  }
  const next = lines.filter((entry) => entry.trim() !== line);
  while (next.length > 0 && next[next.length - 1] === "") next.pop();
  return next.join("\n");
}

export function WorkAccomplishedField({
  value,
  onChange,
  subtasks = [],
  checkedIds,
  onCheckedIdsChange,
  disabled = false,
}: {
  value: string;
  onChange: (next: string) => void;
  subtasks?: TaskSubtask[];
  checkedIds: ReadonlySet<string>;
  onCheckedIdsChange: (next: Set<string>) => void;
  disabled?: boolean;
}) {
  const openSubtasks = subtasks.filter((row) => !row.completed);

  function toggle(row: TaskSubtask, checked: boolean) {
    const next = new Set(checkedIds);
    if (checked) next.add(row.id);
    else next.delete(row.id);
    onCheckedIdsChange(next);
    onChange(syncWorkAccomplishedBullets(value, row.title, checked));
  }

  return (
    <div className="flex flex-col gap-3">
      {openSubtasks.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>
            Subtasks
          </span>
          <ul className="flex list-none flex-col gap-1">
            {openSubtasks.map((row) => {
              const titleId = `finish-subtask-${row.id}`;
              const checked = checkedIds.has(row.id);
              return (
                <li key={row.id} className="flex min-h-6 min-w-0 items-center gap-2">
                  <SubtaskCheckbox
                    checked={checked}
                    disabled={disabled}
                    labelledBy={titleId}
                    onChange={(next) => toggle(row, next)}
                  />
                  <span
                    id={titleId}
                    className="min-w-0 flex-1 text-sm"
                    style={{
                      color: checked ? "var(--app-text-muted)" : "var(--app-text)",
                      textDecoration: checked ? "line-through" : "none",
                    }}
                  >
                    {row.title}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--app-text-muted)" }}>
        Work accomplished
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder="What did you accomplish?"
          disabled={disabled}
          className="input-canvas resize-y text-sm"
          style={{ color: "var(--app-text)" }}
        />
      </label>
    </div>
  );
}
