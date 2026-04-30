"use client";

import { CanvasSelect } from "@/components/canvas-select";
import {
  ADD_TASK_TITLE_MAX_PX,
  DueDatePickerControl,
  syncAddTaskTitleHeight,
} from "@/components/task-row";
import { createIntegrationTask } from "@/lib/actions/integration-tasks";
import {
  taskPriorityOptions,
  type IntegrationTaskRow,
} from "@/lib/integration-task-helpers";
import {
  useActionState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type TaskQuickAddProjectOption = {
  /** Project id (uuid). */
  id: string;
  /** Display label, typically the customer name. */
  label: string;
  /** Optional CSS variable name for an accent dot, e.g. "--project-accent-1". */
  colorVar?: string | null;
};

export type TaskQuickAddIntegrationOption = {
  /** project_tracks.id (uuid). */
  id: string;
  /** Display label, e.g. "Workday → ADP" or "Project Management". */
  label: string;
  /** Owning project id, used for cascade filtering. */
  projectId: string;
};

type TaskQuickAddCommonProps = {
  /** Today as YYYY-MM-DD (server-provided to avoid hydration drift). */
  todayIso: string;
  /** Run after a successful create — used to trigger client-side snapshot refresh. */
  onCreated?: () => void | Promise<void>;
  /** Visual surface tweaks: panels render in `card` mode, dialogs render in `plain`. */
  className?: string;
  /**
   * `inline` (default): one no-wrap row that expands the title input (matches the integration panel header).
   * `dialog`: stacked rows (Title / Project + Track / Priority + Due / Cancel + Add Task) for modals.
   */
  layout?: "inline" | "dialog";
  /** Only consumed in `dialog` layout — renders a Cancel button left of Add Task. */
  onCancel?: () => void;
};

type TaskQuickAddIntegrationModeProps = TaskQuickAddCommonProps & {
  mode: "integration";
  projectTrackId: string;
};

type TaskQuickAddGlobalModeProps = TaskQuickAddCommonProps & {
  mode: "global";
  projects: TaskQuickAddProjectOption[];
  integrations: TaskQuickAddIntegrationOption[];
  /** Optional initial selection (sticky from URL on the Tasks page). */
  initialProjectId?: string | null;
  initialProjectTrackId?: string | null;
};

export type TaskQuickAddProps = TaskQuickAddIntegrationModeProps | TaskQuickAddGlobalModeProps;

const PRIORITY_DEFAULT: IntegrationTaskRow["priority"] = "medium";

export function TaskQuickAdd(props: TaskQuickAddProps) {
  const { todayIso, onCreated, className = "", layout = "inline", onCancel } = props;
  const isGlobal = props.mode === "global";
  const isDialogLayout = layout === "dialog";

  const projects = isGlobal ? props.projects : [];
  const integrations = isGlobal ? props.integrations : [];

  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => {
    if (!isGlobal) return "";
    return props.initialProjectId ?? props.projects[0]?.id ?? "";
  });

  const integrationsForSelectedProject = useMemo(() => {
    if (!isGlobal) return [];
    return integrations.filter((row) => row.projectId === selectedProjectId);
  }, [integrations, isGlobal, selectedProjectId]);

  const [selectedProjectIntegrationId, setSelectedProjectIntegrationId] = useState<string>(() => {
    if (!isGlobal) return props.projectTrackId;
    if (props.initialProjectTrackId) return props.initialProjectTrackId;
    return integrationsForSelectedProject[0]?.id ?? "";
  });

  useEffect(() => {
    if (!isGlobal) {
      setSelectedProjectIntegrationId(props.projectTrackId);
    }
  }, [isGlobal, !isGlobal ? props.projectTrackId : ""]);

  useEffect(() => {
    if (!isGlobal) return;
    const stillValid = integrationsForSelectedProject.some(
      (row) => row.id === selectedProjectIntegrationId,
    );
    if (!stillValid) {
      setSelectedProjectIntegrationId(integrationsForSelectedProject[0]?.id ?? "");
    }
  }, [isGlobal, integrationsForSelectedProject, selectedProjectIntegrationId]);

  const effectiveProjectIntegrationId = isGlobal
    ? selectedProjectIntegrationId
    : props.projectTrackId;

  const [createState, createAction, createPending] = useActionState(
    async (_prev: { error?: string } | void, formData: FormData) => {
      if (!effectiveProjectIntegrationId) {
        return { error: "Select a project track before adding a task." };
      }
      return createIntegrationTask(effectiveProjectIntegrationId, formData);
    },
    {},
  );

  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<IntegrationTaskRow["priority"]>(PRIORITY_DEFAULT);
  const [dueDate, setDueDate] = useState(todayIso);
  const submitDidRunRef = useRef(false);
  const titleTextareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    syncAddTaskTitleHeight(titleTextareaRef.current);
  }, [title]);

  useEffect(() => {
    if (!submitDidRunRef.current) setDueDate(todayIso);
  }, [todayIso]);

  useEffect(() => {
    if (!submitDidRunRef.current) return;
    if (createPending) return;
    if (createState?.error) return;
    setTitle("");
    setPriority(PRIORITY_DEFAULT);
    setDueDate(todayIso);
    submitDidRunRef.current = false;
    void onCreated?.();
  }, [createState, createPending, todayIso, onCreated]);

  const projectOptions = useMemo(
    () => projects.map((p) => ({ value: p.id, label: p.label })),
    [projects],
  );

  const integrationOptions = useMemo(
    () => integrationsForSelectedProject.map((row) => ({ value: row.id, label: row.label })),
    [integrationsForSelectedProject],
  );

  const noIntegrationsForProject = isGlobal && integrationsForSelectedProject.length === 0;

  const titleField = (
    <label
      className={`canvas-select-field flex min-w-0 flex-col gap-1 text-xs ${
        isDialogLayout ? "w-full" : "flex-1"
      }`}
      style={{ color: "var(--app-text-muted)" }}
    >
      Title
      <textarea
        ref={titleTextareaRef}
        name="title"
        value={title}
        required
        rows={1}
        placeholder="What needs to be done"
        onChange={(e) => {
          setTitle(e.target.value);
          syncAddTaskTitleHeight(e.target);
        }}
        className="input-canvas w-full min-w-0 resize-none text-[0.6875rem] leading-snug placeholder:text-muted-canvas"
        style={{ maxHeight: `${ADD_TASK_TITLE_MAX_PX}px` }}
      />
    </label>
  );

  const projectField = isGlobal ? (
    <label
      className={`canvas-select-field flex min-w-0 flex-col gap-1 text-xs ${
        isDialogLayout ? "sm:flex-[28_1_0%]" : "w-[10rem] shrink-0 sm:w-[11rem]"
      }`}
      style={{ color: "var(--app-text-muted)" }}
    >
      Project
      <CanvasSelect
        name="project"
        options={projectOptions}
        value={selectedProjectId}
        onValueChange={(v) => setSelectedProjectId(v)}
      />
    </label>
  ) : null;

  const integrationField = isGlobal ? (
    <label
      className={`canvas-select-field flex min-w-0 flex-col gap-1 text-xs ${
        isDialogLayout ? "sm:flex-[72_1_0%]" : "w-[10rem] shrink-0 sm:w-[11rem]"
      }`}
      style={{ color: "var(--app-text-muted)" }}
    >
      Track
      <CanvasSelect
        name="project_track"
        options={
          integrationOptions.length > 0
            ? integrationOptions
            : [{ value: "", label: "No tracks" }]
        }
        value={selectedProjectIntegrationId}
        onValueChange={(v) => setSelectedProjectIntegrationId(v)}
      />
    </label>
  ) : null;

  const priorityField = (
    <label
      className={`canvas-select-field flex min-w-0 flex-col gap-1 text-xs ${
        isDialogLayout ? "sm:flex-[0_0_28%]" : "w-[6.75rem] shrink-0 sm:w-[7rem]"
      }`}
      style={{ color: "var(--app-text-muted)" }}
    >
      Priority
      <CanvasSelect
        name="priority"
        options={taskPriorityOptions}
        value={priority}
        onValueChange={(v) => {
          if (v === "low" || v === "medium" || v === "high") setPriority(v);
        }}
      />
    </label>
  );

  const dueField = (
    <label
      className={`canvas-select-field flex min-w-0 flex-col gap-1 text-xs ${
        isDialogLayout ? "w-fit max-w-full shrink-0" : "w-fit max-w-full shrink-0"
      }`}
      style={{ color: "var(--app-text-muted)" }}
    >
      Due
      <DueDatePickerControl
        variant="inline"
        name="due_date"
        todayIso={todayIso}
        dueDate={dueDate}
        onDueDateChange={setDueDate}
        quickSelectMode
      />
    </label>
  );

  const submitButton = (
    <button
      type="submit"
      disabled={createPending || noIntegrationsForProject}
      className="btn-cta-dark h-9 min-h-9 shrink-0 px-3 text-xs whitespace-nowrap"
    >
      {createPending ? "Adding…" : "Add task"}
    </button>
  );

  return (
    <form
      action={createAction}
      className={`flex min-w-0 flex-col gap-2 ${className}`.trim()}
      onSubmit={() => {
        submitDidRunRef.current = true;
      }}
    >
      {isDialogLayout ? (
        <div className="add-task-inline-row flex flex-col gap-3">
          {titleField}
          {isGlobal ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-2">
              {projectField}
              {integrationField}
            </div>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-2">
            {priorityField}
            {dueField}
          </div>
          <div className="mt-30 flex items-center justify-end gap-2">
            {onCancel ? (
              <button
                type="button"
                className="btn-ghost h-9 min-h-9 px-3 text-xs"
                disabled={createPending}
                onClick={onCancel}
              >
                Cancel
              </button>
            ) : null}
            {submitButton}
          </div>
        </div>
      ) : (
        <div className="add-task-inline-row flex w-full min-w-0 flex-nowrap items-start gap-2 pb-0.5">
          {titleField}
          {projectField}
          {integrationField}
          {priorityField}
          {dueField}
          <div className="flex min-h-0 shrink-0 flex-col items-end">
            <div className="flex shrink-0 flex-col gap-1">
              <span
                className="select-none text-xs leading-normal text-transparent"
                aria-hidden="true"
              >
                Title
              </span>
              {submitButton}
            </div>
          </div>
        </div>
      )}

      {createState?.error ? (
        <p className="text-sm" style={{ color: "var(--app-danger)" }} role="alert">
          {createState.error}
        </p>
      ) : null}
      {noIntegrationsForProject ? (
        <p className="text-xs text-muted-canvas">
          This project has no tracks yet. Add one before creating a task.
        </p>
      ) : null}
    </form>
  );
}
