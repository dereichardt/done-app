"use client";

import Link from "next/link";
import { CanvasSelect } from "@/components/canvas-select";
import { FormSwitch } from "@/components/form-switch";
import { ProjectColorPicker } from "@/components/project-color-picker";
import { createProject } from "@/lib/actions/projects";
import {
  deriveProjectAbbreviation,
  normalizeProjectAbbreviation,
  PROJECT_ABBREVIATION_MAX_LENGTH,
} from "@/lib/project-abbreviation";
import { EXPERT_ASSIST_SYSTEM_KEY, type ProjectTypeLookup } from "@/lib/project-types";
import { useActionState, useState } from "react";

type LookupRow = { id: string; name: string };

export function CreateProjectForm({
  projectTypes,
  projectRoles,
}: {
  projectTypes: ProjectTypeLookup[];
  projectRoles: LookupRow[];
}) {
  const [state, formAction, pending] = useActionState(createProject, {});
  const [projectTypeId, setProjectTypeId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [abbreviation, setAbbreviation] = useState("");
  const [abbreviationOverride, setAbbreviationOverride] = useState(false);
  const isExpertAssist =
    projectTypes.find((type) => type.id === projectTypeId)?.system_key ===
    EXPERT_ASSIST_SYSTEM_KEY;

  function handleCustomerNameChange(value: string) {
    setCustomerName(value);
    if (!abbreviationOverride) {
      setAbbreviation(deriveProjectAbbreviation(value));
    }
  }

  function handleAbbreviationOverrideChange(checked: boolean) {
    setAbbreviationOverride(checked);
    if (!checked) {
      setAbbreviation(deriveProjectAbbreviation(customerName));
    }
  }

  function handleAbbreviationChange(value: string) {
    setAbbreviation(normalizeProjectAbbreviation(value));
  }

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
          value={customerName}
          onChange={(e) => handleCustomerNameChange(e.target.value)}
          className="input-canvas mt-1"
          placeholder="Acme Corp"
        />
      </label>
      <div className="flex items-start gap-4">
        <div className="min-w-0">
          <label
            htmlFor="new-project-abbreviation"
            className="block text-sm font-medium"
            style={{ color: "var(--app-text)" }}
          >
            Project abbreviation
          </label>
          <input
            id="new-project-abbreviation"
            name="abbreviation"
            required
            value={abbreviation}
            onChange={(e) => handleAbbreviationChange(e.target.value)}
            readOnly={!abbreviationOverride}
            maxLength={PROJECT_ABBREVIATION_MAX_LENGTH}
            autoComplete="off"
            spellCheck={false}
            className="input-canvas mt-1 w-28 uppercase read-only:cursor-not-allowed read-only:opacity-70"
            placeholder="AC"
          />
        </div>
        <FormSwitch
          label="Override"
          checked={abbreviationOverride}
          onCheckedChange={handleAbbreviationOverrideChange}
          layout="stack"
          checkedColor="neutral"
          className="shrink-0 pt-0.5"
        />
      </div>
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
          value={projectTypeId}
          onValueChange={setProjectTypeId}
          options={projectTypes.map((t) => ({ value: t.id, label: t.name }))}
        />
      </div>
      {isExpertAssist ? (
        <div className="card-canvas flex flex-col gap-4 p-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted-canvas">
              Start date
              <input
                name="starts_on"
                type="date"
                required
                className="input-canvas h-10 text-sm"
              />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted-canvas">
              End date
              <input
                name="ends_on"
                type="date"
                required
                className="input-canvas h-10 text-sm"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs text-muted-canvas">
            Estimated effort <span className="font-normal">(hours)</span>
            <input
              name="estimated_effort_hours"
              type="number"
              min="0.25"
              step="0.25"
              inputMode="decimal"
              required
              className="input-canvas h-10 text-sm"
              placeholder="e.g. 80"
            />
          </label>
          <FormSwitch
            name="integrations_enabled"
            label="Allow integrations"
            description="Allow integrations to be added to this Expert Assist."
          />
        </div>
      ) : null}
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
