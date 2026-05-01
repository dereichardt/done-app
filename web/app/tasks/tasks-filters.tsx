"use client";

import { CanvasSelect } from "@/components/canvas-select";
import type { TasksPageProject, TasksPageTrack } from "@/lib/tasks-page-shared";
import { useMemo, type ReactNode } from "react";

export type TasksFiltersValue = {
  search: string;
  projectId: string;
  projectTrackId: string;
  priority: "" | "low" | "medium" | "high";
};

const ALL = "";

export function TasksFilters({
  value,
  onChange,
  projects,
  tracks,
  trailingSlot,
}: {
  value: TasksFiltersValue;
  onChange: (next: TasksFiltersValue) => void;
  projects: TasksPageProject[];
  tracks: TasksPageTrack[];
  /** Rendered after the Priority control (e.g. Add Task). */
  trailingSlot?: ReactNode;
}) {
  const projectOptions = useMemo(
    () => [
      { value: ALL, label: "All projects" },
      ...projects.map((p) => ({ value: p.id, label: p.name })),
    ],
    [projects],
  );

  const trackOptions = useMemo(() => {
    const scoped = value.projectId
      ? tracks.filter((i) => i.projectId === value.projectId)
      : tracks;
    return [
      { value: ALL, label: "All tracks" },
      ...scoped.map((i) => ({ value: i.id, label: i.label })),
    ];
  }, [tracks, value.projectId]);

  const priorityOptions = useMemo(
    () => [
      { value: ALL, label: "Any priority" },
      { value: "high", label: "High" },
      { value: "medium", label: "Medium" },
      { value: "low", label: "Low" },
    ],
    [],
  );

  function update(patch: Partial<TasksFiltersValue>) {
    onChange({ ...value, ...patch });
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1 sm:flex-none sm:basis-[18rem]">
        <input
          type="search"
          value={value.search}
          onChange={(e) => update({ search: e.target.value })}
          placeholder="Search tasks…"
          aria-label="Search tasks"
          className="input-canvas h-9 w-full text-sm"
        />
      </div>

      <label className="flex items-center gap-2 text-xs text-muted-canvas">
        <span className="whitespace-nowrap">Project</span>
        <div className="task-sort-compact w-[12rem]">
          <CanvasSelect
            name="tasks_filter_project"
            options={projectOptions}
            value={value.projectId}
            onValueChange={(v) =>
              update({
                projectId: v,
                projectTrackId: "",
              })
            }
          />
        </div>
      </label>

      <label className="flex items-center gap-2 text-xs text-muted-canvas">
        <span className="whitespace-nowrap">Track</span>
        <div className="task-sort-compact w-[14rem]">
          <CanvasSelect
            name="tasks_filter_track"
            options={trackOptions}
            value={value.projectTrackId}
            onValueChange={(v) => update({ projectTrackId: v })}
          />
        </div>
      </label>

      <label className="flex items-center gap-2 text-xs text-muted-canvas">
        <span className="whitespace-nowrap">Priority</span>
        <div className="task-sort-compact w-[8.5rem]">
          <CanvasSelect
            name="tasks_filter_priority"
            options={priorityOptions}
            value={value.priority}
            onValueChange={(v) => {
              if (v === "" || v === "low" || v === "medium" || v === "high") {
                update({ priority: v });
              }
            }}
          />
        </div>
      </label>

      {trailingSlot ? (
        <div className="ml-auto flex shrink-0 items-center">{trailingSlot}</div>
      ) : null}
    </div>
  );
}
