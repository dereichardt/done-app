"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useId, useMemo, useState } from "react";

import { patchProjectIntegrationDeliveryProgress } from "@/lib/actions/projects";
import {
  deliveryProgressIndex,
  formatStatusHours,
  groupIntegrationsByDeliveryProgress,
  hoursRemaining,
  type HomeProjectStatusIntegration,
} from "@/lib/home-project-status";
import {
  formatDeliveryProgressLabel,
  isDeliveryProgress,
  PROJECT_DELIVERY_PROGRESS_VALUES,
  type ProjectDeliveryProgress,
} from "@/lib/integration-metadata";

const VISIBLE_CARDS = 3;
const COLUMN_ID_PREFIX = "progress-col:";

function columnDroppableId(progress: ProjectDeliveryProgress): string {
  return `${COLUMN_ID_PREFIX}${progress}`;
}

function parseColumnDroppableId(id: string): ProjectDeliveryProgress | null {
  if (!id.startsWith(COLUMN_ID_PREFIX)) return null;
  const value = id.slice(COLUMN_ID_PREFIX.length);
  return isDeliveryProgress(value) ? value : null;
}

function withDeliveryProgress(
  integ: HomeProjectStatusIntegration,
  progress: ProjectDeliveryProgress,
): HomeProjectStatusIntegration {
  return {
    ...integ,
    delivery_progress: progress,
    deliveryProgressLabel: formatDeliveryProgressLabel(progress),
    deliveryProgressIndex: deliveryProgressIndex(progress),
  };
}

function IntegrationProgressCardBody({ integ }: { integ: HomeProjectStatusIntegration }) {
  const rem = hoursRemaining(integ.actualHours, integ.estimatedHours);
  const effortCaption =
    integ.estimatedHours != null && integ.estimatedHours > 0
      ? `${formatStatusHours(integ.actualHours)} / ${formatStatusHours(integ.estimatedHours)}`
      : integ.actualHours > 0
        ? `${formatStatusHours(integ.actualHours)} logged`
        : "No estimate";

  let remainingCaption: string;
  let remainingColor = "var(--app-text-muted)";
  if (rem.remaining == null) {
    remainingCaption = "—";
  } else if (rem.overEstimate) {
    remainingCaption = `${formatStatusHours(rem.overage)} over`;
    remainingColor = "var(--app-danger)";
  } else {
    remainingCaption = `${formatStatusHours(rem.remaining)} remaining`;
  }

  return (
    <>
      <h4 className="text-sm font-medium leading-snug text-[var(--app-text)]">{integ.title}</h4>
      <p className="mt-1.5 text-xs tabular-nums text-muted-canvas">{effortCaption}</p>
      <p className="mt-0.5 text-xs tabular-nums font-medium" style={{ color: remainingColor }}>
        {remainingCaption}
      </p>
    </>
  );
}

function DraggableIntegrationCard({
  integ,
  disabled,
}: {
  integ: HomeProjectStatusIntegration;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: integ.id,
    data: { progress: integ.delivery_progress },
    disabled,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.35 : 1,
    borderColor: "var(--app-border)",
    background: "var(--app-surface)",
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className="cursor-grab rounded-[var(--app-radius)] border px-3 py-2.5 touch-none active:cursor-grabbing"
      {...listeners}
      {...attributes}
      aria-roledescription="draggable integration"
    >
      <IntegrationProgressCardBody integ={integ} />
    </article>
  );
}

function KanbanColumn({
  progress,
  integrations,
  disabled,
}: {
  progress: ProjectDeliveryProgress;
  integrations: HomeProjectStatusIntegration[];
  disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { setNodeRef, isOver } = useDroppable({
    id: columnDroppableId(progress),
    data: { progress },
  });
  const visible = expanded ? integrations : integrations.slice(0, VISIBLE_CARDS);
  const hiddenCount = Math.max(0, integrations.length - VISIBLE_CARDS);

  return (
    <div
      ref={setNodeRef}
      className="flex w-[14rem] shrink-0 flex-col rounded-[var(--app-radius)] border"
      style={{
        borderColor: isOver ? "var(--app-action)" : "var(--app-border)",
        background: isOver
          ? "color-mix(in oklab, var(--app-info-surface) 70%, var(--app-surface-alt))"
          : "var(--app-surface-alt)",
        boxShadow: isOver
          ? "inset 0 0 0 1px color-mix(in oklab, var(--app-action) 35%, transparent)"
          : undefined,
      }}
    >
      <header
        className="sticky top-0 z-[1] border-b px-3 py-2.5"
        style={{ borderColor: "var(--app-border)", background: "inherit" }}
      >
        <p className="text-sm font-medium leading-snug text-[var(--app-text)]">
          {formatDeliveryProgressLabel(progress)}
        </p>
        <p className="mt-0.5 text-xs tabular-nums text-muted-canvas">
          {integrations.length} {integrations.length === 1 ? "integration" : "integrations"}
        </p>
      </header>
      <div className="flex min-h-[6.5rem] flex-col gap-2 p-2">
        {integrations.length === 0 ? (
          <p className="px-1 py-3 text-center text-xs text-muted-canvas">Drop here</p>
        ) : (
          <>
            {visible.map((integ) => (
              <DraggableIntegrationCard key={integ.id} integ={integ} disabled={disabled} />
            ))}
            {hiddenCount > 0 ? (
              <button
                type="button"
                className="cursor-pointer rounded-[var(--app-radius)] px-2 py-1.5 text-xs font-medium text-[var(--app-action)] transition-colors hover:bg-[var(--app-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)]"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? "See less" : `See more (${hiddenCount})`}
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export function HomeProgressKanban({
  integrations: initialIntegrations,
}: {
  integrations: HomeProjectStatusIntegration[];
}) {
  const dndContextId = useId();
  const [dndReady, setDndReady] = useState(false);
  const [integrations, setIntegrations] = useState(initialIntegrations);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    setDndReady(true);
  }, []);

  useEffect(() => {
    setIntegrations(initialIntegrations);
  }, [initialIntegrations]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const byProgress = useMemo(
    () => groupIntegrationsByDeliveryProgress(integrations),
    [integrations],
  );

  const activeInteg = useMemo(
    () => (activeId ? integrations.find((i) => i.id === activeId) ?? null : null),
    [activeId, integrations],
  );

  function resolveTargetProgress(
    overId: string | number,
    overData: Record<string, unknown> | undefined,
  ): ProjectDeliveryProgress | null {
    if (overData && typeof overData.progress === "string" && isDeliveryProgress(overData.progress)) {
      return overData.progress;
    }
    const asColumn = parseColumnDroppableId(String(overId));
    if (asColumn) return asColumn;
    const overInteg = integrations.find((i) => i.id === String(overId));
    if (overInteg && isDeliveryProgress(overInteg.delivery_progress)) {
      return overInteg.delivery_progress;
    }
    return null;
  }

  function handleDragStart(event: DragStartEvent) {
    setSaveError(null);
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const integId = String(active.id);
    const integ = integrations.find((i) => i.id === integId);
    if (!integ) return;

    const target = resolveTargetProgress(
      over.id,
      over.data.current as Record<string, unknown> | undefined,
    );
    if (!target) return;
    if (integ.delivery_progress === target) return;

    const previous = integrations;
    setIntegrations((rows) => {
      const next = rows.map((row) => (row.id === integId ? withDeliveryProgress(row, target) : row));
      const moved = next.find((row) => row.id === integId);
      if (!moved) return next;
      return [moved, ...next.filter((row) => row.id !== integId)];
    });
    setPendingId(integId);

    void (async () => {
      const res = await patchProjectIntegrationDeliveryProgress(integId, target);
      setPendingId(null);
      if (res.error) {
        setIntegrations(previous);
        setSaveError(res.error);
      }
    })();
  }

  if (initialIntegrations.length === 0) {
    return (
      <div aria-label="Delivery progress by integration">
        <h3 className="text-sm font-medium text-muted-canvas">Details by integration</h3>
        <p className="mt-3 text-sm text-muted-canvas">No integrations on this project yet.</p>
      </div>
    );
  }

  return (
    <div aria-label="Delivery progress by integration">
      <h3 className="text-sm font-medium text-muted-canvas">Details by integration</h3>
      <p className="mt-1 text-xs text-muted-canvas">Drag cards between columns to update delivery progress.</p>
      {saveError ? (
        <p className="mt-2 text-sm" style={{ color: "var(--app-danger)" }} role="alert">
          {saveError}
        </p>
      ) : null}

      <DndContext
        id={dndContextId}
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="mt-3 overflow-x-auto pb-2">
          <div className="flex min-w-min gap-3">
            {PROJECT_DELIVERY_PROGRESS_VALUES.map((progress) => (
              <KanbanColumn
                key={progress}
                progress={progress}
                integrations={byProgress[progress]}
                disabled={!dndReady || pendingId != null}
              />
            ))}
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {activeInteg ? (
            <article
              className="w-[12.5rem] cursor-grabbing rounded-[var(--app-radius)] border px-3 py-2.5 shadow-lg"
              style={{
                borderColor: "var(--app-action)",
                background: "var(--app-surface)",
                boxShadow: "0 8px 24px color-mix(in oklab, var(--app-text) 18%, transparent)",
              }}
            >
              <IntegrationProgressCardBody integ={activeInteg} />
            </article>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
