"use client";

import { CanvasArrowLeftIcon } from "@/components/canvas-arrow-icons";
import { CanvasSelect } from "@/components/canvas-select";
import { ProjectColorPicker } from "@/components/project-color-picker";
import { updateProjectDetails } from "@/lib/actions/projects";
import type { ProjectColorKey } from "@/lib/project-colors";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type LookupRow = { id: string; name: string };

export function ProjectDetailHeader({
  projectId,
  customerName,
  typeLabel,
  roleLabel,
  initialProjectTypeId,
  initialPrimaryRoleId,
  initialProjectColorKey,
  projectTypes,
  projectRoles,
}: {
  projectId: string;
  customerName: string;
  typeLabel: string | null;
  roleLabel: string | null;
  initialProjectTypeId: string | null;
  initialPrimaryRoleId: string | null;
  initialProjectColorKey: ProjectColorKey | null;
  projectTypes: LookupRow[];
  projectRoles: LookupRow[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [editKey, setEditKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const customer_name = String(fd.get("customer_name") ?? "").trim();
    const project_type_id = String(fd.get("project_type_id") ?? "").trim() || null;
    const primary_role_id = String(fd.get("primary_role_id") ?? "").trim() || null;
    const project_color_key = String(fd.get("project_color_key") ?? "").trim() || null;

    setSaving(true);
    try {
      const result = await updateProjectDetails(projectId, {
        customer_name,
        project_type_id,
        primary_role_id,
        project_color_key,
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

  const subline =
    [typeLabel, roleLabel].filter(Boolean).join(" · ") || "No type or role selected";

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        {!editing ? (
          <div className="hover-reveal-edit">
            <div className="flex w-max max-w-full items-center gap-2">
              <h1 id="project-title-sentinel" className="heading-page min-w-0 shrink truncate">
                {customerName}
              </h1>
              <button
                type="button"
                className="hover-reveal-edit-btn shrink-0 border bg-[var(--app-surface)] text-[var(--app-text-muted)]"
                style={{ borderColor: "var(--app-border)" }}
                aria-label="Edit project details"
                onClick={() => {
                  setEditKey((k) => k + 1);
                  setEditing(true);
                  setError(null);
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-[18px] w-[18px]"
                  aria-hidden
                >
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </button>
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
                defaultValue={customerName}
                className="input-canvas mt-1"
                placeholder="Customer or project name"
              />
            </label>
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
                defaultValue={initialProjectTypeId ?? ""}
                options={projectTypes.map((t) => ({ value: t.id, label: t.name }))}
              />
            </div>
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
    </div>
  );
}
