"use client";

import { ActiveWorkSessionDialog } from "@/components/integration-tasks-panel";
import { ProjectRowSummaryMetrics } from "@/components/project-row-summary-metrics";
import { reorderActiveProjects } from "@/lib/actions/projects";
import type { ActiveWorkSessionIndicatorDTO } from "@/lib/actions/integration-tasks";
import type { ProjectListRowSummary } from "@/lib/load-project-list-summaries";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

function relationName(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) {
    const row = value[0];
    if (row && typeof row === "object" && "name" in row) {
      return String((row as { name: string }).name);
    }
    return undefined;
  }
  if (typeof value === "object" && "name" in value) {
    return String((value as { name: string }).name);
  }
  return undefined;
}

function indicatorToActiveSessionDto(i: ActiveWorkSessionIndicatorDTO) {
  return {
    integration_task_id: i.integration_task_id,
    started_at: i.started_at,
    paused_ms_accumulated: i.paused_ms_accumulated,
    pause_started_at: i.pause_started_at,
  };
}

const activeSessionIndicatorButtonClass =
  "active-work-session-indicator--live inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[var(--app-border)] bg-[color-mix(in_oklab,var(--app-info)_8%,var(--app-surface)_92%)] text-[var(--app-info)] transition-colors duration-150 hover:bg-[color-mix(in_oklab,var(--app-info)_22%,var(--app-surface-alt)_78%)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-info)]";

/** Keeps summary metrics right edge aligned with rows that have the active-session control. */
const activeSessionSlotClass = "inline-flex h-9 w-9 shrink-0";

/** Same pulse icon as work-on-task row (`integration-tasks-panel.tsx`). */
function WorkOnTaskIcon() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden className="shrink-0">
      <path
        fill="currentColor"
        d="M13 2L4 14h6l-1 8 11-14h-6l1-6z"
      />
    </svg>
  );
}

function GripHandleIcon() {
  return (
    <svg viewBox="0 0 20 20" width={16} height={16} aria-hidden fill="currentColor">
      <circle cx="7" cy="5" r="1.5" />
      <circle cx="13" cy="5" r="1.5" />
      <circle cx="7" cy="10" r="1.5" />
      <circle cx="13" cy="10" r="1.5" />
      <circle cx="7" cy="15" r="1.5" />
      <circle cx="13" cy="15" r="1.5" />
    </svg>
  );
}

export type ProjectsActiveSessionListProjectRow = {
  id: string;
  customer_name: string | null;
  completed_at: string | null;
  project_types: unknown;
  project_roles: unknown;
};

// ---------------------------------------------------------------------------
// Shared row content (used inside both sortable and static rows)
// ---------------------------------------------------------------------------

function RowContent({
  project,
  attrs,
  summary,
  metricsVisible,
  showIndicator,
  activeSessionSlot,
  metricsVariant = "default",
}: {
  project: ProjectsActiveSessionListProjectRow;
  attrs: string;
  summary: ProjectListRowSummary | undefined;
  metricsVisible: string;
  showIndicator: boolean;
  activeSessionSlot: React.ReactNode;
  metricsVariant?: "default" | "completed";
}) {
  return (
    <>
      <div className="min-w-0 flex-1">
        <p className="font-medium leading-snug" style={{ color: "var(--app-text)" }}>
          {project.customer_name}
        </p>
        <p className="mt-0.5 text-xs leading-snug text-muted-canvas">{attrs}</p>
      </div>
      {summary ? (
        <div className={`${metricsVisible} min-w-0 items-center`}>
          <ProjectRowSummaryMetrics {...summary} metricsVariant={metricsVariant} />
        </div>
      ) : null}
      {showIndicator ? activeSessionSlot : <span className={activeSessionSlotClass} aria-hidden />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Sortable row — grip-only drag handle, full-row hover highlight, Link navigates
// ---------------------------------------------------------------------------

function SortableRow({
  project,
  attrs,
  summary,
  metricsVisible,
  showIndicator,
  activeSessionSlot,
  metricsVariant = "default",
  isDragOverlay = false,
}: {
  project: ProjectsActiveSessionListProjectRow;
  attrs: string;
  summary: ProjectListRowSummary | undefined;
  metricsVisible: string;
  showIndicator: boolean;
  activeSessionSlot: React.ReactNode;
  metricsVariant?: "default" | "completed";
  isDragOverlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging && !isDragOverlay ? 0.4 : 1,
  };

  const liStyle: React.CSSProperties = isDragOverlay
    ? {
        ...style,
        borderColor: "color-mix(in oklab, var(--app-border) 75%, transparent)",
        boxShadow: "0 4px 16px color-mix(in oklab, var(--app-text) 12%, transparent)",
        borderRadius: 8,
      }
    : { ...style, borderColor: "color-mix(in oklab, var(--app-border) 75%, transparent)" };

  return (
    <li
      ref={setNodeRef}
      style={liStyle}
      className="group border-t first:border-t-0 hover:bg-[var(--app-surface-alt)]"
    >
      <div className="flex items-center">
        {/* Grip handle — drag listeners attached here only */}
        <button
          type="button"
          aria-label={`Reorder ${project.customer_name ?? "project"}`}
          className={[
            "ml-3 inline-flex h-9 w-6 shrink-0 items-center justify-center",
            "text-[var(--app-text-muted)] transition-opacity",
            "cursor-grab active:cursor-grabbing",
            isDragOverlay
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
          ].join(" ")}
          style={{ touchAction: "none" }}
          onClick={(e) => e.preventDefault()}
          {...attributes}
          {...listeners}
        >
          <GripHandleIcon />
        </button>
        {/* Navigation link covers the rest of the row */}
        <Link
          href={`/projects/${project.id}`}
          className="flex min-w-0 flex-1 items-center gap-3 px-3 py-4 cursor-pointer focus-visible:bg-[var(--app-surface-alt)] focus-visible:outline-none"
        >
          <RowContent
            project={project}
            attrs={attrs}
            summary={summary}
            metricsVisible={metricsVisible}
            showIndicator={showIndicator}
            activeSessionSlot={activeSessionSlot}
            metricsVariant={metricsVariant}
          />
        </Link>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Static (non-sortable) row — completed list
// ---------------------------------------------------------------------------

function StaticRow({
  project,
  attrs,
  summary,
  metricsVisible,
  showIndicator,
  activeSessionSlot,
  metricsVariant = "default",
}: {
  project: ProjectsActiveSessionListProjectRow;
  attrs: string;
  summary: ProjectListRowSummary | undefined;
  metricsVisible: string;
  showIndicator: boolean;
  activeSessionSlot: React.ReactNode;
  metricsVariant?: "default" | "completed";
}) {
  return (
    <li
      className="group border-t first:border-t-0"
      style={{ borderColor: "color-mix(in oklab, var(--app-border) 75%, transparent)" }}
    >
      <Link
        href={`/projects/${project.id}`}
        className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-[var(--app-surface-alt)] focus-visible:bg-[var(--app-surface-alt)] focus-visible:outline-none"
      >
        <RowContent
          project={project}
          attrs={attrs}
          summary={summary}
          metricsVisible={metricsVisible}
          showIndicator={showIndicator}
          activeSessionSlot={activeSessionSlot}
          metricsVariant={metricsVariant}
        />
      </Link>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Main list component
// ---------------------------------------------------------------------------

export function ProjectsActiveSessionList({
  projects,
  initialActiveSessionIndicator = null,
  emptyLabel = "active",
  summaryByProjectId = {},
  showSummaryAlways = false,
  summaryMetricsVariant = "default",
  allowReorder = false,
}: {
  projects: ProjectsActiveSessionListProjectRow[];
  initialActiveSessionIndicator?: ActiveWorkSessionIndicatorDTO | null;
  emptyLabel?: "active" | "completed";
  summaryByProjectId?: Record<string, ProjectListRowSummary>;
  showSummaryAlways?: boolean;
  summaryMetricsVariant?: "default" | "completed";
  allowReorder?: boolean;
}) {
  const router = useRouter();
  const [activeSessionIndicator, setActiveSessionIndicator] = useState<ActiveWorkSessionIndicatorDTO | null>(
    initialActiveSessionIndicator ?? null,
  );
  const activeWorkSessionDialogRef = useRef<HTMLDialogElement>(null);

  // Local ordered list — synced from props, updated optimistically on drag end.
  const [orderedProjects, setOrderedProjects] = useState(projects);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  // Sync if props change (e.g. router.refresh() after save).
  useEffect(() => {
    setOrderedProjects(projects);
  }, [projects]);

  const openActiveWorkSessionModal = useCallback(() => {
    requestAnimationFrame(() => activeWorkSessionDialogRef.current?.showModal());
  }, []);

  const afterActiveWorkSessionCleared = useCallback(async () => {
    setActiveSessionIndicator(null);
    router.refresh();
  }, [router]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = orderedProjects.findIndex((p) => p.id === active.id);
      const newIndex = orderedProjects.findIndex((p) => p.id === over.id);
      const next = arrayMove(orderedProjects, oldIndex, newIndex);

      // Apply optimistic update first, then persist asynchronously.
      setOrderedProjects(next);
      reorderActiveProjects(next.map((p) => p.id)).then((res) => {
        if (res?.error) {
          setOrderedProjects(projects);
        } else {
          router.refresh();
        }
      });
    },
    [orderedProjects, projects, router],
  );

  const emptyMessage =
    emptyLabel === "completed"
      ? "No completed engagements yet. When you mark a project complete, it will appear here."
      : "No active engagements yet. Create a project to get started.";

  const displayProjects = allowReorder ? orderedProjects : projects;
  const activeDragProject = activeDragId ? orderedProjects.find((p) => p.id === activeDragId) : null;

  function buildRowProps(p: ProjectsActiveSessionListProjectRow) {
    const attrs =
      [relationName(p.project_types), relationName(p.project_roles)].filter(Boolean).join(" · ") || "—";
    const showIndicator =
      activeSessionIndicator != null && activeSessionIndicator.project_id === p.id;
    const metricsVisible = showSummaryAlways
      ? "flex"
      : "hidden group-hover:flex group-focus-within:flex";
    const summary = summaryByProjectId[p.id];

    const activeSessionSlot = (
      <button
        type="button"
        className={activeSessionIndicatorButtonClass}
        aria-label="Open active work session"
        title="Active work session"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openActiveWorkSessionModal();
        }}
      >
        <WorkOnTaskIcon />
      </button>
    );

    return { attrs, showIndicator, metricsVisible, summary, activeSessionSlot };
  }

  const listContent = (
    <ul className="card-canvas overflow-hidden p-0">
      {displayProjects.length === 0 ? (
        <li className="px-4 py-8 text-center text-sm text-muted-canvas">{emptyMessage}</li>
      ) : allowReorder ? (
        <SortableContext items={orderedProjects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          {orderedProjects.map((p) => {
            const rowProps = buildRowProps(p);
            return (
              <SortableRow
                key={p.id}
                project={p}
                {...rowProps}
                metricsVariant={summaryMetricsVariant}
              />
            );
          })}
        </SortableContext>
      ) : (
        displayProjects.map((p) => {
          const rowProps = buildRowProps(p);
          return (
            <StaticRow
              key={p.id}
              project={p}
              {...rowProps}
              metricsVariant={summaryMetricsVariant}
            />
          );
        })
      )}
    </ul>
  );

  return (
    <>
      {allowReorder ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {listContent}
          <DragOverlay>
            {activeDragProject
              ? (() => {
                  const rowProps = buildRowProps(activeDragProject);
                  return (
                    <ul className="card-canvas overflow-hidden p-0">
                      <SortableRow
                        project={activeDragProject}
                        {...rowProps}
                        metricsVariant={summaryMetricsVariant}
                        isDragOverlay
                      />
                    </ul>
                  );
                })()
              : null}
          </DragOverlay>
        </DndContext>
      ) : (
        listContent
      )}

      {activeSessionIndicator ? (
        <ActiveWorkSessionDialog
          key={activeSessionIndicator.integration_task_id}
          dialogRef={activeWorkSessionDialogRef}
          taskId={activeSessionIndicator.integration_task_id}
          taskTitle={activeSessionIndicator.task_title}
          integrationLabel={activeSessionIndicator.integration_label}
          projectLabel={activeSessionIndicator.project_name}
          activeSession={indicatorToActiveSessionDto(activeSessionIndicator)}
          onActiveSessionChange={(s) => {
            setActiveSessionIndicator((prev) =>
              prev && prev.integration_task_id === s.integration_task_id
                ? {
                    ...prev,
                    started_at: s.started_at,
                    paused_ms_accumulated: s.paused_ms_accumulated,
                    pause_started_at: s.pause_started_at,
                  }
                : prev,
            );
          }}
          onAfterSessionCleared={afterActiveWorkSessionCleared}
        />
      ) : null}
    </>
  );
}
