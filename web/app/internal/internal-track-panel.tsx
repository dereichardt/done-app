"use client";

import {
  IntegrationTasksPanel,
  type IntegrationTaskRow,
  type IntegrationTasksPanelInternalCreate,
  type IntegrationTaskWorkSessionRow,
} from "@/components/integration-tasks-panel";
import type {
  ActiveWorkSessionDTO,
  IntegrationTaskSnapshot,
} from "@/lib/actions/integration-tasks";

type InternalTasksWorkPanelSingle = {
  variant?: "single";
  parentListId: string;
  heading: string;
  todayIso: string;
  snapshot: IntegrationTaskSnapshot;
  internalTaskCreate: Extract<
    IntegrationTasksPanelInternalCreate,
    { kind: "initiative" } | { kind: "track" }
  >;
};

type InternalTasksWorkPanelCombined = {
  variant: "combined_admin_dev";
  adminTrackId: string;
  developmentTrackId: string;
  heading: string;
  todayIso: string;
  snapshot: IntegrationTaskSnapshot;
};

export type InternalTasksWorkPanelProps = InternalTasksWorkPanelSingle | InternalTasksWorkPanelCombined;

/** Renders the shared integration task panel for internal tracks, combined tracks, or an initiative. */
export function InternalTasksWorkPanel(props: InternalTasksWorkPanelProps) {
  const { heading, todayIso, snapshot } = props;

  const projectTrackId =
    props.variant === "combined_admin_dev" ? props.adminTrackId : props.parentListId;

  const internalTaskCreate: IntegrationTasksPanelInternalCreate | undefined =
    props.variant === "combined_admin_dev"
      ? { kind: "combined", adminId: props.adminTrackId, developmentId: props.developmentTrackId }
      : props.internalTaskCreate;

  return (
    <section className="mt-10 flex min-h-0 flex-col gap-2">
      <h2 className="section-heading">{heading}</h2>
      <div className="h-[min(36rem,60vh)] max-h-[75vh] min-h-0 shrink-0">
        <IntegrationTasksPanel
          className="h-full min-h-0"
          projectTrackId={projectTrackId}
          internalTaskCreate={internalTaskCreate}
          tasks={snapshot.tasks as IntegrationTaskRow[]}
          workSessionsByTaskId={snapshot.workSessionsByTaskId as Record<string, IntegrationTaskWorkSessionRow[]>}
          activeWorkSession={snapshot.activeWorkSession as ActiveWorkSessionDTO | null}
          globalActiveWorkSession={snapshot.globalActiveWorkSession as ActiveWorkSessionDTO | null}
          globalActiveWorkSessionTaskTitle={snapshot.globalActiveWorkSessionTaskTitle ?? null}
          globalActiveWorkSessionIntegrationLabel={snapshot.globalActiveWorkSessionIntegrationLabel ?? null}
          globalActiveWorkSessionProjectName={snapshot.globalActiveWorkSessionProjectName ?? null}
          finishSessionIntegrationLabel={heading}
          finishSessionProjectLabel="Internal"
          todayIso={todayIso}
        />
      </div>
    </section>
  );
}
