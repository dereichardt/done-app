"use client";

import Link from "next/link";
import { CanvasSelect } from "@/components/canvas-select";
import { ProjectColorPicker } from "@/components/project-color-picker";
import { createProject } from "@/lib/actions/projects";
import { useActionState } from "react";

type LookupRow = { id: string; name: string };

export function CreateProjectForm({
  projectTypes,
  projectRoles,
}: {
  projectTypes: LookupRow[];
  projectRoles: LookupRow[];
}) {
  const [state, formAction, pending] = useActionState(createProject, {});

  return (
    <form
      action={formAction}
      className="flex min-h-[calc(100dvh-12rem)] max-w-3xl flex-col gap-4"
    >
      <label className="block text-sm font-medium" style={{ color: "var(--app-text)" }}>
        Customer Name
        <input
          name="customer_name"
          required
          className="input-canvas mt-1"
          placeholder="Acme Corp"
        />
      </label>
      <div className="canvas-select-field flex flex-col gap-1">
        <label
          className="block text-sm font-medium"
          style={{ color: "var(--app-text)" }}
          htmlFor="new-project-type"
        >
          Project Type
        </label>
        <CanvasSelect
          id="new-project-type"
          name="project_type_id"
          placeholder="Select…"
          defaultValue=""
          options={projectTypes.map((t) => ({ value: t.id, label: t.name }))}
        />
      </div>
      <div className="canvas-select-field flex flex-col gap-1">
        <label
          className="block text-sm font-medium"
          style={{ color: "var(--app-text)" }}
          htmlFor="new-project-role"
        >
          Your Role
        </label>
        <CanvasSelect
          id="new-project-role"
          name="primary_role_id"
          placeholder="Select…"
          defaultValue=""
          options={projectRoles.map((r) => ({ value: r.id, label: r.name }))}
        />
      </div>

      <ProjectColorPicker name="project_color_key" defaultValue={null} legend="Project color" />
      {state?.error ? (
        <p className="text-sm" style={{ color: "var(--app-danger)" }} role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="mt-auto mb-6 flex flex-wrap items-center justify-start gap-3 pt-8">
        <button type="submit" disabled={pending} className="btn-cta-dark">
          {pending ? "Creating…" : "Create Project"}
        </button>
        <Link href="/projects" className="btn-cancel-canvas">
          Cancel
        </Link>
      </div>
    </form>
  );
}
