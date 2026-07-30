"use client";

import { CanvasArrowLeftIcon } from "@/components/canvas-arrow-icons";
import { CanvasSelect } from "@/components/canvas-select";
import { FormSwitch } from "@/components/form-switch";
import { ProjectColorPicker } from "@/components/project-color-picker";
import { reopenProject, updateProjectDetails } from "@/lib/actions/projects";
import {
  deriveProjectAbbreviation,
  normalizeProjectAbbreviation,
  PROJECT_ABBREVIATION_MAX_LENGTH,
} from "@/lib/project-abbreviation";
import type { ProjectColorKey } from "@/lib/project-colors";
import {
  EXPERT_ASSIST_SYSTEM_KEY,
  type ProjectTypeLookup,
} from "@/lib/project-types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CompleteProjectDialog } from "./complete-project-dialog";

type LookupRow = { id: string; name: string };

export function ProjectDetailHeader({
  projectId,
  customerName,
  initialAbbreviation,
  completedAt,
  typeLabel,
  roleLabel,
  initialProjectTypeId,
  initialPrimaryRoleId,
  initialProjectColorKey,
  initialStartsOn,
  initialEndsOn,
  initialEstimatedEffortHours,
  initialIntegrationsEnabled,
  projectTypes,
  projectRoles,
}: {
  projectId: string;
  customerName: string;
  initialAbbreviation: string;
  completedAt: string | null;
  typeLabel: string | null;
  roleLabel: string | null;
  initialProjectTypeId: string | null;
  initialPrimaryRoleId: string | null;
  initialProjectColorKey: ProjectColorKey | null;
  initialStartsOn: string | null;
  initialEndsOn: string | null;
  initialEstimatedEffortHours: number | null;
  initialIntegrationsEnabled: boolean;
  projectTypes: ProjectTypeLookup[];
  projectRoles: LookupRow[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [editKey, setEditKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [projectTypeId, setProjectTypeId] = useState(initialProjectTypeId ?? "");
  const [editCustomerName, setEditCustomerName] = useState(customerName);
  const [abbreviation, setAbbreviation] = useState(initialAbbreviation);
  const [abbreviationOverride, setAbbreviationOverride] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const completeDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handlePointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  function openEditMode() {
    setEditKey((k) => k + 1);
    setProjectTypeId(initialProjectTypeId ?? "");
    setEditCustomerName(customerName);
    setAbbreviation(initialAbbreviation);
    setAbbreviationOverride(
      initialAbbreviation !== deriveProjectAbbreviation(customerName),
    );
    setEditing(true);
    setError(null);
  }

  function handleCustomerNameChange(value: string) {
    setEditCustomerName(value);
    if (!abbreviationOverride) {
      setAbbreviation(deriveProjectAbbreviation(value));
    }
  }

  function handleAbbreviationOverrideChange(checked: boolean) {
    setAbbreviationOverride(checked);
    if (!checked) {
      setAbbreviation(deriveProjectAbbreviation(editCustomerName));
    }
  }

  function handleAbbreviationChange(value: string) {
    setAbbreviation(normalizeProjectAbbreviation(value));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const customer_name = String(fd.get("customer_name") ?? "").trim();
    const abbreviationValue = String(fd.get("abbreviation") ?? "").trim();
    const project_type_id = String(fd.get("project_type_id") ?? "").trim() || null;
    const primary_role_id = String(fd.get("primary_role_id") ?? "").trim() || null;
    const project_color_key = String(fd.get("project_color_key") ?? "").trim() || null;
    const starts_on = String(fd.get("starts_on") ?? "").trim();
    const ends_on = String(fd.get("ends_on") ?? "").trim();
    const estimated_effort_hours = String(fd.get("estimated_effort_hours") ?? "").trim();
    const integrations_enabled = fd.has("integrations_enabled");

    setSaving(true);
    try {
      const result = await updateProjectDetails(projectId, {
        customer_name,
        abbreviation: abbreviationValue,
        project_type_id,
        primary_role_id,
        project_color_key,
        starts_on,
        ends_on,
        estimated_effort_hours,
        integrations_enabled,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditing(false);
      window.dispatchEvent(
        new CustomEvent("project:headerUpdated", {
          detail: {
            projectId,
            customer_name,
            project_color_key: (project_color_key || null) as ProjectColorKey | null,
          },
        }),
      );
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleReopen() {
    setMenuOpen(false);
    setReopening(true);
    try {
      await reopenProject(projectId);
      router.refresh();
    } finally {
      setReopening(false);
    }
  }

  const subline =
    [typeLabel, roleLabel].filter(Boolean).join(" · ") || "No type or role selected";

  const isCompleted = completedAt !== null;
  const isExpertAssist =
    projectTypes.find((type) => type.id === projectTypeId)?.system_key ===
    EXPERT_ASSIST_SYSTEM_KEY;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        {!editing ? (
          <div className="hover-reveal-edit">
            <div className="flex w-max max-w-full items-center gap-2">
              <h1 id="project-title-sentinel" className="heading-page min-w-0 shrink truncate">
                {customerName}
              </h1>
              <div className="relative shrink-0" ref={menuRef}>
                <button
                  type="button"
                  className="hover-reveal-edit-btn flex h-9 w-9 shrink-0 items-center justify-center border bg-[var(--app-surface)] text-[var(--app-text-muted)]"
                  style={{ borderColor: "var(--app-border)" }}
                  aria-label="Project actions"
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  onClick={() => setMenuOpen((o) => !o)}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-5 w-5"
                    aria-hidden
                  >
                    <circle cx="12" cy="5" r="1.75" />
                    <circle cx="12" cy="12" r="1.75" />
                    <circle cx="12" cy="19" r="1.75" />
                  </svg>
                </button>
                {menuOpen ? (
                  <div
                    role="menu"
                    aria-orientation="vertical"
                    className="absolute left-0 z-[100] mt-1 min-w-[16rem] rounded-lg border py-1 shadow-lg"
                    style={{
                      background: "var(--app-surface)",
                      borderColor: "var(--app-border)",
                      boxShadow: "0 8px 24px color-mix(in oklab, var(--app-text) 12%, transparent)",
                    }}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full px-3 py-2.5 text-left text-sm transition-colors hover:bg-[var(--app-surface-alt)]"
                      style={{ color: "var(--app-text)" }}
                      onClick={() => {
                        setMenuOpen(false);
                        openEditMode();
                      }}
                    >
                      Edit project details
                    </button>
                    {isCompleted ? (
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full px-3 py-2.5 text-left text-sm transition-colors hover:bg-[var(--app-surface-alt)]"
                        style={{ color: "var(--app-text)" }}
                        disabled={reopening}
                        onClick={handleReopen}
                      >
                        {reopening ? "Reopening…" : "Reopen project"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full px-3 py-2.5 text-left text-sm transition-colors hover:bg-[var(--app-surface-alt)]"
                        style={{ color: "var(--app-text)" }}
                        onClick={() => {
                          setMenuOpen(false);
                          completeDialogRef.current?.showModal();
                        }}
                      >
                        Mark project as completed
                      </button>
                    )}
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full px-3 py-2.5 text-left text-sm transition-colors hover:bg-[var(--app-surface-alt)]"
                      style={{ color: "var(--app-danger)" }}
                      onClick={() => {
                        setMenuOpen(false);
                        router.push(`/projects/${projectId}/delete`);
                      }}
                    >
                      Delete project
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            <p className="subheading-page mt-1">{subline}</p>
          </div>
        ) : (
          <form key={editKey} onSubmit={handleSubmit} className="flex max-w-3xl flex-col gap-4">
            <label className="block text-sm font-medium" style={{ color: "var(--app-text)" }}>
              Customer name
              <input
                name="customer_name"
                required
                value={editCustomerName}
                onChange={(e) => handleCustomerNameChange(e.target.value)}
                className="input-canvas mt-1"
                placeholder="Customer or project name"
              />
            </label>
            <div className="flex items-start gap-4">
              <div className="min-w-0">
                <label
                  htmlFor="project-detail-abbreviation"
                  className="block text-sm font-medium"
                  style={{ color: "var(--app-text)" }}
                >
                  Project abbreviation
                </label>
                <input
                  id="project-detail-abbreviation"
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
                htmlFor="project-detail-type"
              >
                Project type
              </label>
              <CanvasSelect
                id="project-detail-type"
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
                      defaultValue={initialStartsOn ?? ""}
                      className="input-canvas h-10 text-sm"
                    />
                  </label>
                  <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted-canvas">
                    End date
                    <input
                      name="ends_on"
                      type="date"
                      required
                      defaultValue={initialEndsOn ?? ""}
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
                    defaultValue={initialEstimatedEffortHours ?? ""}
                    className="input-canvas h-10 text-sm"
                  />
                </label>
                <FormSwitch
                  name="integrations_enabled"
                  label="Allow integrations"
                  description="Allow new integrations to be added to this Expert Assist."
                  defaultChecked={
                    initialIntegrationsEnabled &&
                    projectTypes.find((type) => type.id === initialProjectTypeId)
                      ?.system_key === EXPERT_ASSIST_SYSTEM_KEY
                  }
                />
              </div>
            ) : null}
            <div className="canvas-select-field flex flex-col gap-1">
              <label
                className="block text-sm font-medium"
                style={{ color: "var(--app-text)" }}
                htmlFor="project-detail-role"
              >
                Your role
              </label>
              <CanvasSelect
                id="project-detail-role"
                name="primary_role_id"
                placeholder="Select…"
                defaultValue={initialPrimaryRoleId ?? ""}
                options={projectRoles.map((r) => ({ value: r.id, label: r.name }))}
              />
            </div>

            <div className="mb-3">
              <ProjectColorPicker
                name="project_color_key"
                defaultValue={initialProjectColorKey}
                legend="Project color"
              />
            </div>
            {error ? (
              <p className="text-sm" style={{ color: "var(--app-danger)" }} role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={saving} className="btn-cta-dark whitespace-nowrap">
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                className="btn-cta whitespace-nowrap text-xs"
                disabled={saving}
                onClick={() => {
                  setEditing(false);
                  setError(null);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
      <Link href="/projects" className="btn-cta whitespace-nowrap self-start">
        <CanvasArrowLeftIcon />
        Back to projects
      </Link>

      <CompleteProjectDialog
        projectId={projectId}
        dialogRef={completeDialogRef}
        onClose={() => {}}
      />
    </div>
  );
}
