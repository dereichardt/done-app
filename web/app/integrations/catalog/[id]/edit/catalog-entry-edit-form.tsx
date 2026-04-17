"use client";

import {
  CanvasSelect,
  type CanvasSelectSelectableOption,
} from "@/components/canvas-select";
import { FunctionalAreaDomainSelect } from "@/components/functional-area-domain-select";
import { ImplementationNotesEditor } from "@/components/implementation-notes-editor";
import {
  DerivedDomainReadout,
  type IntegrationLookupOptions,
} from "@/app/projects/[id]/integration-definition-fields";
import {
  createCatalogIntegrationFromFormState,
  deleteCatalogIntegration,
  updateCatalogIntegrationFromFormState,
  type CatalogEntryUpdateFormState,
} from "@/lib/actions/projects";
import {
  CATALOG_GENERIC_INTEGRATING_WITH,
  formatIntegrationDirectionLabel,
  INTEGRATION_DIRECTIONS,
  isCatalogGenericIntegratingWithLabel,
} from "@/lib/integration-metadata";
import { useActionState, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";

const empty: { value: string; label: string }[] = [{ value: "", label: "—" }];

const directionOptions: CanvasSelectSelectableOption[] = INTEGRATION_DIRECTIONS.map((d) => ({
  value: d,
  label: formatIntegrationDirectionLabel(d),
}));

export type CatalogEntryFormMode = "create" | "edit";

function CatalogEntrySubmitButton({ mode }: { mode: CatalogEntryFormMode }) {
  const { pending } = useFormStatus();
  const label = mode === "create" ? "Add entry" : "Submit";
  const pendingLabel = mode === "create" ? "Adding…" : "Submitting…";
  return (
    <button type="submit" className="btn-cta-dark" disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

type IntegratingMode = "generic" | "vendor";

export function CatalogEntryEditForm({
  mode = "edit",
  catalogIntegrationId,
  lookups,
  initial,
  onCancel,
  onSaveSuccess,
}: {
  mode?: CatalogEntryFormMode;
  catalogIntegrationId?: string;
  lookups: IntegrationLookupOptions;
  initial: {
    name: string;
    internal_time_code: string | null;
    integrating_with: string | null;
    direction: string | null;
    integration_type_id: string | null;
    functional_area_id: string | null;
    default_estimated_effort_hours: string;
    implementation_notes: string | null;
  };
  onCancel: () => void;
  onSaveSuccess: () => void;
}) {
  const idBase = useId();
  const [integratingMode, setIntegratingMode] = useState<IntegratingMode>(() =>
    isCatalogGenericIntegratingWithLabel(initial.integrating_with) ? "generic" : "vendor",
  );
  const [vendorDraft, setVendorDraft] = useState(() =>
    isCatalogGenericIntegratingWithLabel(initial.integrating_with)
      ? ""
      : (initial.integrating_with ?? "").trim(),
  );
  const [functionalAreaId, setFunctionalAreaId] = useState(initial.functional_area_id ?? "");
  const [direction, setDirection] = useState(initial.direction ?? "");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePending, startDeleteTransition] = useTransition();
  const deleteDialogRef = useRef<HTMLDialogElement>(null);

  const action = useMemo(() => {
    if (mode === "create") return createCatalogIntegrationFromFormState;
    if (!catalogIntegrationId) {
      throw new Error("catalogIntegrationId is required in edit mode");
    }
    return updateCatalogIntegrationFromFormState.bind(null, catalogIntegrationId);
  }, [mode, catalogIntegrationId]);
  const [state, formAction, pending] = useActionState(action, {} as CatalogEntryUpdateFormState);
  const prevPending = useRef(false);

  useEffect(() => {
    if (prevPending.current && !pending) {
      if (!state?.error && !state?.internalTimeCodeError && !state?.integratingWithError) {
        onSaveSuccess();
      }
    }
    prevPending.current = pending;
  }, [pending, state, onSaveSuccess]);

  useEffect(() => {
    setFunctionalAreaId(initial.functional_area_id ?? "");
    setDirection(initial.direction ?? "");
    setIntegratingMode(
      isCatalogGenericIntegratingWithLabel(initial.integrating_with) ? "generic" : "vendor",
    );
    setVendorDraft(
      isCatalogGenericIntegratingWithLabel(initial.integrating_with)
        ? ""
        : (initial.integrating_with ?? "").trim(),
    );
  }, [initial]);

  useEffect(() => {
    const d = deleteDialogRef.current;
    function onDialogClose() {
      setDeleteError(null);
    }
    d?.addEventListener("close", onDialogClose);
    return () => d?.removeEventListener("close", onDialogClose);
  }, []);

  const derivedDomainId = useMemo(() => {
    const row = lookups.functionalAreas.find((a) => a.id === functionalAreaId);
    return row?.domainId ?? null;
  }, [functionalAreaId, lookups.functionalAreas]);

  const derivedDomainLabel = useMemo(() => {
    const fromCode = lookups.areaDomainCodeById[functionalAreaId];
    if (fromCode) return fromCode;
    if (!derivedDomainId) return null;
    return lookups.domains.find((d) => d.id === derivedDomainId)?.name ?? null;
  }, [functionalAreaId, lookups.areaDomainCodeById, lookups.domains, derivedDomainId]);

  const labelClass = "block text-sm font-medium";
  const labelStyle = { color: "var(--app-text)" } as const;

  function openDeleteDialog() {
    if (mode !== "edit" || !catalogIntegrationId) return;
    setDeleteError(null);
    deleteDialogRef.current?.showModal();
  }

  function closeDeleteDialog() {
    deleteDialogRef.current?.close();
  }

  function confirmDeleteCatalogEntry() {
    if (mode !== "edit" || !catalogIntegrationId) return;
    setDeleteError(null);
    startDeleteTransition(async () => {
      try {
        const res = await deleteCatalogIntegration(catalogIntegrationId);
        if (res?.error) setDeleteError(res.error);
      } catch {
        /* redirect throws */
      }
    });
  }

  return (
    <>
    <form
      key={catalogIntegrationId ?? "new"}
      action={formAction}
      className="mt-6 flex min-h-[calc(100dvh-12rem)] max-w-5xl flex-col gap-4"
    >
      <input type="hidden" name="catalog_integrating_mode" value={integratingMode} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[11fr_9fr] lg:items-stretch lg:gap-x-6 lg:gap-y-0">
        <div className="flex min-w-0 flex-col gap-4">
          <label className={labelClass} style={labelStyle} htmlFor={`${idBase}-name`}>
            Integration name
            <input
              id={`${idBase}-name`}
              name="name"
              required
              className="input-canvas mt-1"
              placeholder="e.g. Worker Demographic, Journal Entries"
              defaultValue={initial.name}
            />
          </label>

          <div>
            <label className={labelClass} style={labelStyle} htmlFor={`${idBase}-internal-time`}>
              Internal time code
              <input
                id={`${idBase}-internal-time`}
                name="internal_time_code"
                className="input-canvas mt-1"
                placeholder="e.g. billing or time-tracking ID"
                defaultValue={initial.internal_time_code ?? ""}
                required
                autoComplete="off"
                aria-invalid={Boolean(state?.internalTimeCodeError)}
                aria-describedby={state?.internalTimeCodeError ? `${idBase}-itc-err` : undefined}
              />
            </label>
            {state?.internalTimeCodeError ? (
              <p id={`${idBase}-itc-err`} className="mt-1 text-sm" style={{ color: "var(--app-danger)" }} role="alert">
                {state.internalTimeCodeError}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-4">
            <div className="shrink-0">
              <p className={labelClass} style={labelStyle}>
                Integrating with
              </p>
              <div
                role="tablist"
                aria-label="Integrating with scope"
                className="relative mt-1 inline-flex w-full max-w-[22rem] overflow-hidden rounded-[10px] border"
                style={{ borderColor: "var(--app-border)", background: "var(--app-surface-alt)" }}
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-1/2 rounded-[10px]"
                  style={{
                    transform: integratingMode === "vendor" ? "translateX(100%)" : "translateX(0)",
                    transition: "transform 180ms cubic-bezier(0.2, 0, 0.2, 1)",
                    background: "#1f2937",
                    boxShadow: "0 0 0 2px color-mix(in oklab, var(--app-border) 70%, white)",
                  }}
                />
                <button
                  type="button"
                  role="tab"
                  aria-selected={integratingMode === "generic"}
                  className={[
                    "relative z-[2] flex-1 min-w-0 inline-flex h-9 items-center justify-center px-2 text-center text-xs transition-colors cursor-pointer",
                    integratingMode === "generic"
                      ? "font-semibold text-[#f3f5f8]"
                      : "font-normal text-muted-canvas hover:text-[var(--app-text)]",
                  ].join(" ")}
                  onClick={() => {
                    setIntegratingMode("generic");
                    setVendorDraft("");
                  }}
                >
                  Generic
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={integratingMode === "vendor"}
                  className={[
                    "relative z-[2] flex-1 min-w-0 inline-flex h-9 items-center justify-center px-2 text-center text-xs transition-colors cursor-pointer",
                    integratingMode === "vendor"
                      ? "font-semibold text-[#f3f5f8]"
                      : "font-normal text-muted-canvas hover:text-[var(--app-text)]",
                  ].join(" ")}
                  onClick={() => setIntegratingMode("vendor")}
                >
                  Vendor-Specific
                </button>
              </div>
            </div>
            {integratingMode === "vendor" ? (
              <label className={`${labelClass} min-w-0 flex-1`} style={labelStyle} htmlFor={`${idBase}-integrating-with`}>
                Integrating with
                <input
                  id={`${idBase}-integrating-with`}
                  name="integrating_with"
                  type="text"
                  className="input-canvas mt-1 w-full"
                  placeholder="Vendor or system name"
                  value={vendorDraft}
                  onChange={(e) => setVendorDraft(e.target.value)}
                  autoComplete="off"
                  aria-invalid={Boolean(state?.integratingWithError)}
                  aria-describedby={state?.integratingWithError ? `${idBase}-iw-err` : undefined}
                />
              </label>
            ) : (
              <input type="hidden" name="integrating_with" value={CATALOG_GENERIC_INTEGRATING_WITH} />
            )}
          </div>
          {state?.integratingWithError ? (
            <p id={`${idBase}-iw-err`} className="-mt-2 text-sm" style={{ color: "var(--app-danger)" }} role="alert">
              {state.integratingWithError}
            </p>
          ) : null}

          <div className="canvas-select-field flex flex-col gap-1">
            <label className={labelClass} style={labelStyle} htmlFor={`${idBase}-direction`}>
              Direction <span className="font-normal text-muted-canvas">(optional)</span>
            </label>
            <CanvasSelect
              id={`${idBase}-direction`}
              name="direction"
              placeholder="Select…"
              options={[...empty, ...directionOptions]}
              value={direction}
              onValueChange={setDirection}
            />
          </div>

          <div className="canvas-select-field flex flex-col gap-1">
            <label className={labelClass} style={labelStyle} htmlFor={`${idBase}-type`}>
              Integration type <span className="font-normal text-muted-canvas">(optional)</span>
            </label>
            <CanvasSelect
              id={`${idBase}-type`}
              name="integration_type_id"
              placeholder="Select…"
              options={[...empty, ...lookups.integrationTypes]}
              defaultValue={initial.integration_type_id ?? ""}
            />
          </div>

          <div className="canvas-select-field flex flex-col gap-1">
            <label className={labelClass} style={labelStyle} htmlFor={`${idBase}-area`}>
              Functional area <span className="font-normal text-muted-canvas">(optional)</span>
            </label>
            <FunctionalAreaDomainSelect
              id={`${idBase}-area`}
              name="functional_area_id"
              placeholder="Select…"
              functionalAreasByDomain={lookups.functionalAreasByDomain}
              areaDomainCodeById={lookups.areaDomainCodeById}
              functionalAreaGroups={lookups.functionalAreaGroups}
              defaultValue={initial.functional_area_id ?? ""}
              onValueChange={setFunctionalAreaId}
            />
          </div>
          <DerivedDomainReadout functionalAreaId={functionalAreaId} derivedDomainLabel={derivedDomainLabel} />

          <label className={labelClass} style={labelStyle} htmlFor={`${idBase}-def-eff`}>
            Estimated effort{" "}
            <span className="font-normal text-muted-canvas">(hrs, optional)</span>
            <input
              id={`${idBase}-def-eff`}
              name="default_estimated_effort_hours"
              type="text"
              inputMode="decimal"
              className="input-canvas mt-1 w-full max-w-md"
              placeholder="e.g. 80"
              defaultValue={initial.default_estimated_effort_hours}
              autoComplete="off"
            />
          </label>
        </div>

        <div className="flex min-h-0 min-w-0 flex-col gap-1 lg:h-full">
          <label className={labelClass} style={labelStyle} htmlFor={`${idBase}-impl-notes`}>
            Implementation notes
          </label>
          <ImplementationNotesEditor
            id={`${idBase}-impl-notes`}
            name="implementation_notes"
            initialValue={initial.implementation_notes}
            className="min-h-[12rem] w-full flex-1"
            placeholder="Patterns, considerations, links to docs…"
          />
        </div>
      </div>

      {state?.error ? (
        <p className="text-sm" style={{ color: "var(--app-danger)" }} role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="mt-auto mb-6 flex flex-wrap items-center justify-start gap-3 pt-8">
        <CatalogEntrySubmitButton mode={mode} />
        {mode === "edit" ? (
          <button
            type="button"
            className="btn-cta"
            disabled={deletePending || pending}
            onClick={openDeleteDialog}
          >
            Delete entry
          </button>
        ) : null}
        <button
          type="button"
          className="btn-cancel-canvas disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </button>
      </div>
    </form>

    {mode === "edit" ? (
      <dialog
        ref={deleteDialogRef}
        aria-labelledby="catalog-entry-delete-title"
        className="app-catalog-dialog fixed left-1/2 top-1/2 z-[200] w-[min(100vw-2rem,28rem)] max-w-[calc(100vw-2rem)] max-h-[min(92dvh,52rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden border-0 p-0 shadow-xl"
        style={{
          borderRadius: "12px",
          background: "var(--app-surface)",
          color: "var(--app-text)",
        }}
      >
        <div className="flex flex-col gap-4 p-5">
          <h2 id="catalog-entry-delete-title" className="text-base font-semibold" style={{ color: "var(--app-text)" }}>
            Delete this catalog entry?
          </h2>
          <p className="text-sm text-muted-canvas">
            This will permanently remove the catalog definition and cannot be undone.
          </p>
          {deleteError ? (
            <p className="text-sm" style={{ color: "var(--app-danger)" }} role="alert">
              {deleteError}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-ghost text-sm" onClick={closeDeleteDialog}>
              Cancel
            </button>
            <button
              type="button"
              className="rounded-[var(--app-radius)] px-3 py-2 text-sm font-medium cursor-pointer bg-[var(--app-danger)] text-[var(--app-surface)] transition-[background-color] duration-150 ease-out hover:bg-[color-mix(in_oklab,var(--app-danger)_78%,var(--app-text)_22%)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={deletePending}
              onClick={() => void confirmDeleteCatalogEntry()}
            >
              {deletePending ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      </dialog>
    ) : null}
    </>
  );
}
