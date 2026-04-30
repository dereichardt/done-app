"use client";

import { CanvasArrowLeftIcon } from "@/components/canvas-arrow-icons";
import { CanvasSelect } from "@/components/canvas-select";
import { ProjectColorPicker } from "@/components/project-color-picker";
import { reopenProject, updateProjectDetails } from "@/lib/actions/projects";
import type { ProjectColorKey } from "@/lib/project-colors";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CompleteProjectDialog } from "./complete-project-dialog";

type LookupRow = { id: string; name: string };

export function ProjectDetailHeader({
  projectId,
  customerName,
  completedAt,
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
  completedAt: string | null;
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [reopening, setReopening] = useState(false);
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
    setEditing(true);
    setError(null);
  }

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

      <CompleteProjectDialog
        projectId={projectId}
        dialogRef={completeDialogRef}
        onClose={() => {}}
      />
    </div>
  );
}
