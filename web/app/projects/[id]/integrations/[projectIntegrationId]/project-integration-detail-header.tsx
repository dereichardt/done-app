"use client";

import { CanvasArrowLeftIcon } from "@/components/canvas-arrow-icons";
import { CanvasSelect, type CanvasSelectOption } from "@/components/canvas-select";
import { DialogCloseButton } from "@/components/dialog-close-button";
import { IntegrationStatePill } from "@/components/integration-state-pill";
import { patchProjectIntegrationStateOnly } from "@/lib/actions/projects";
import { projectIntegrationStateSelectOptions } from "@/lib/integration-metadata";
import { updateIntegrationFromForm } from "@/lib/actions/projects";
import { formatIntegrationDefinitionDisplayName } from "@/lib/integration-metadata";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { IntegrationDefinitionFields, type IntegrationLookupOptions } from "../../integration-definition-fields";

const stateOptions: CanvasSelectOption[] = projectIntegrationStateSelectOptions();

export function ProjectIntegrationDetailHeader({
  projectId,
  projectIntegrationId,
  projectCustomerName,
  integrationDisplayTitle,
  typeLabel,
  functionalAreaLabel,
  domainLabel,
  integrationId,
  lookups,
  integrationDefaults,
  catalogVisibility,
  initialIntegrationState,
  initialIntegrationStateReason,
}: {
  projectId: string;
  projectIntegrationId: string;
  projectCustomerName: string;
  integrationDisplayTitle: string;
  typeLabel: string | null;
  functionalAreaLabel: string | null;
  domainLabel: string | null;
  integrationId: string;
  lookups: IntegrationLookupOptions;
  integrationDefaults: {
    name: string;
    integration_code: string | null;
    internal_time_code: string | null;
    integrating_with: string | null;
    direction: string | null;
    integration_type_id: string | null;
    functional_area_id: string | null;
    domain_id: string | null;
  };
  catalogVisibility: string;
  initialIntegrationState: string;
  initialIntegrationStateReason: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [editKey, setEditKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [definitionPreview, setDefinitionPreview] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [integrationState, setIntegrationState] = useState(initialIntegrationState);
  const [stateReason, setStateReason] = useState(initialIntegrationStateReason ?? "");
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const statusDialogRef = useRef<HTMLDialogElement>(null);
  const statusSaveGen = useRef(0);

  const canAddToCatalog = catalogVisibility === "project_only";

  const onDefinitionPreviewChange = useCallback((displayName: string) => {
    setDefinitionPreview(displayName);
  }, []);

  function openEditMode() {
    setEditKey((k) => k + 1);
    setDefinitionPreview(
      formatIntegrationDefinitionDisplayName({
        integration_code: integrationDefaults.integration_code,
        integrating_with: integrationDefaults.integrating_with,
        name: integrationDefaults.name,
        direction: integrationDefaults.direction,
      }) || integrationDefaults.name,
    );
    setEditing(true);
    setError(null);
  }

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

  function handleAddToCatalog() {
    setMenuOpen(false);
    const returnHref = `/projects/${projectId}/integrations/${projectIntegrationId}`;
    const params = new URLSearchParams({
      name: integrationDefaults.name,
      internal_time_code: integrationDefaults.internal_time_code ?? "",
      integrating_with: integrationDefaults.integrating_with ?? "",
      direction: integrationDefaults.direction ?? "",
      integration_type_id: integrationDefaults.integration_type_id ?? "",
      functional_area_id: integrationDefaults.functional_area_id ?? "",
      return: returnHref,
    });
    router.push(`/integrations/catalog/new?${params.toString()}`);
  }

  const subline =
    [typeLabel, functionalAreaLabel, domainLabel].filter(Boolean).join(" · ") ||
    "No type, area, or domain selected";
  const showReason = integrationState === "blocked" || integrationState === "on_hold";
  const reasonTooltip = showReason && stateReason.trim().length > 0 ? stateReason.trim() : "";

  async function saveStatus(nextState: string, reasonText: string) {
    const gen = ++statusSaveGen.current;
    setStatusSaving(true);
    setStatusError(null);
    const result = await patchProjectIntegrationStateOnly(projectIntegrationId, {
      integration_state: nextState,
      integration_state_reason: nextState === "active" ? null : reasonText.trim() || null,
    });
    if (gen !== statusSaveGen.current) return;
    setStatusSaving(false);
    if (result.error) {
      setStatusError(result.error);
      return;
    }
    setStatusDialogOpen(false);
    statusDialogRef.current?.close();
    router.refresh();
  }

  useEffect(() => {
    setIntegrationState(initialIntegrationState);
    setStateReason(initialIntegrationStateReason ?? "");
  }, [initialIntegrationState, initialIntegrationStateReason]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    try {
      const result = await updateIntegrationFromForm(integrationId, fd);
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        {!editing ? (
          <>
            <div className="hover-reveal-edit">
              <div className="flex w-max max-w-full items-center gap-2">
                <h1 className="heading-page min-w-0 shrink truncate">{integrationDisplayTitle}</h1>
                <div className="relative shrink-0" ref={menuRef}>
                  <button
                    type="button"
                    className="hover-reveal-edit-btn flex h-9 w-9 shrink-0 items-center justify-center border bg-[var(--app-surface)] text-[var(--app-text-muted)]"
                    style={{ borderColor: "var(--app-border)" }}
                    aria-label="Integration actions"
                    aria-expanded={menuOpen}
                    aria-haspopup="menu"
                    onClick={() => setMenuOpen((o) => !o)}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
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
                      className="absolute right-0 z-[100] mt-1 min-w-[16rem] rounded-lg border py-1 shadow-lg"
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
                        Edit integration definition
                      </button>
                      {canAddToCatalog ? (
                        <button
                          type="button"
                          role="menuitem"
                          className="flex w-full px-3 py-2.5 text-left text-sm transition-colors hover:bg-[var(--app-surface-alt)]"
                          style={{ color: "var(--app-text)" }}
                          onClick={handleAddToCatalog}
                        >
                          Add definition to integration catalog
                        </button>
                      ) : null}
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full px-3 py-2.5 text-left text-sm transition-colors hover:bg-[var(--app-surface-alt)]"
                        style={{ color: "var(--app-danger)" }}
                        onClick={() => {
                          setMenuOpen(false);
                          router.push(`/projects/${projectId}/integrations/${projectIntegrationId}/delete`);
                        }}
                      >
                        Delete integration
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="subheading-page">{subline}</p>
                <span className="group relative inline-flex">
                  <button
                    type="button"
                    className="cursor-pointer"
                    aria-label="Edit integration status"
                    title={reasonTooltip || undefined}
                    onClick={() => {
                      setStatusError(null);
                      setStatusDialogOpen(true);
                      statusDialogRef.current?.showModal();
                    }}
                  >
                    <IntegrationStatePill state={integrationState} />
                  </button>
                  {reasonTooltip ? (
                    <span
                      role="tooltip"
                      className="pointer-events-none absolute left-1/2 top-[calc(100%+0.4rem)] z-[120] w-max max-w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 rounded-md border px-2 py-1 text-xs leading-snug opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                      style={{
                        color: "var(--app-text)",
                        background: "var(--app-surface)",
                        borderColor: "var(--app-border)",
                      }}
                    >
                      {reasonTooltip}
                    </span>
                  ) : null}
                </span>
              </div>
            </div>
          </>
        ) : (
          <form key={editKey} onSubmit={handleSubmit} className="flex max-w-3xl flex-col gap-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <h2 className="heading-page shrink-0">Edit Integration</h2>
              <div
                className="min-w-0 flex-1 border-l pl-4"
                style={{ borderColor: "var(--app-border)" }}
              >
                <p
                  className={`min-h-[1.625rem] truncate text-xl leading-snug ${definitionPreview.trim() !== "" ? "text-muted-canvas" : ""}`}
                  title={definitionPreview.trim() !== "" ? definitionPreview : undefined}
                >
                  {definitionPreview.trim() !== "" ? definitionPreview : null}
                </p>
              </div>
            </div>
            <IntegrationDefinitionFields
              fieldLayout="default"
              lookups={lookups}
              defaultName={integrationDefaults.name}
              defaultIntegrationCode={integrationDefaults.integration_code ?? ""}
              defaultInternalTimeCode={integrationDefaults.internal_time_code ?? ""}
              defaultIntegratingWith={integrationDefaults.integrating_with ?? ""}
              defaultDirection={integrationDefaults.direction ?? ""}
              defaultIntegrationTypeId={integrationDefaults.integration_type_id ?? ""}
              defaultFunctionalAreaId={integrationDefaults.functional_area_id ?? ""}
              internalTimeCodeMode="optional"
              onDefinitionPreviewChange={onDefinitionPreviewChange}
            />
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
      <Link href={`/projects/${projectId}`} className="btn-cta whitespace-nowrap self-start">
        <CanvasArrowLeftIcon />
        {projectCustomerName}
      </Link>
      <dialog
        ref={statusDialogRef}
        className="app-catalog-dialog fixed left-1/2 top-1/2 z-[200] w-[min(100vw-2rem,28rem)] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden border-0 p-0 shadow-xl"
        style={{ borderRadius: "12px", background: "var(--app-surface)", color: "var(--app-text)" }}
        onClose={() => setStatusDialogOpen(false)}
      >
        <div className="flex min-h-0 flex-col">
          <div
            className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3"
            style={{ borderColor: "var(--app-border)" }}
          >
            <div className="min-w-0 flex-1 pr-2">
              <h2 className="text-base font-semibold" style={{ color: "var(--app-text)" }}>
                Update status
              </h2>
            </div>
            <DialogCloseButton onClick={() => statusDialogRef.current?.close()} />
          </div>
          <form
            className="flex flex-col gap-3 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void saveStatus(integrationState, stateReason);
            }}
          >
            <label
              className="canvas-select-field flex flex-col gap-1 text-xs"
              style={{ color: "var(--app-text-muted)" }}
            >
              Integration state
              <CanvasSelect
                name="integration_state"
                options={stateOptions}
                value={integrationState}
                onValueChange={(next) => {
                  setIntegrationState(next);
                  if (next === "active") setStateReason("");
                }}
              />
            </label>
            {integrationState === "blocked" || integrationState === "on_hold" ? (
              <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--app-text-muted)" }}>
                Blocked / on hold reason
                <textarea
                  className="input-canvas min-h-[4.5rem] resize-y"
                  rows={3}
                  value={stateReason}
                  placeholder="Optional"
                  onChange={(e) => setStateReason(e.target.value)}
                />
              </label>
            ) : null}
            {statusError ? (
              <p className="text-sm" style={{ color: "var(--app-danger)" }} role="alert">
                {statusError}
              </p>
            ) : null}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                className="btn-ghost text-sm"
                disabled={statusSaving}
                onClick={() => statusDialogRef.current?.close()}
              >
                Cancel
              </button>
              <button type="submit" className="btn-cta-dark text-sm" disabled={statusSaving || !statusDialogOpen}>
                {statusSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </div>
  );
}
