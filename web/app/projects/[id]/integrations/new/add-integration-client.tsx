"use client";

import { createIntegrationAndLink } from "@/lib/actions/projects";
import { formatIntegrationDefinitionDisplayName, formatIntegrationDirectionLabel } from "@/lib/integration-metadata";
import Link from "next/link";
import { useActionState, useCallback, useMemo, useRef, useState } from "react";
import { DialogCloseButton } from "@/components/dialog-close-button";
import { IntegrationDefinitionFields, type IntegrationLookupOptions } from "../../integration-definition-fields";

export type CatalogIntegrationOption = {
  id: string;
  name: string;
  integrating_with: string | null;
  integration_code: string | null;
  internal_time_code: string | null;
  default_estimated_effort_hours: number | null;
  direction: string | null;
  integration_type_id: string | null;
  functional_area_id: string | null;
  domain_id: string | null;
};

export function AddIntegrationClient({
  projectId,
  lookups,
  catalogRows,
}: {
  projectId: string;
  lookups: IntegrationLookupOptions;
  catalogRows: CatalogIntegrationOption[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedCatalog, setSelectedCatalog] = useState<CatalogIntegrationOption | null>(null);
  const [formSeed, setFormSeed] = useState(0);
  const [modalHighlight, setModalHighlight] = useState<CatalogIntegrationOption | null>(null);
  const [modalQuery, setModalQuery] = useState("");
  const [definitionPreview, setDefinitionPreview] = useState("");

  const [createState, createAction, createPending] = useActionState(createIntegrationAndLink, {});

  const onDefinitionPreviewChange = useCallback((displayName: string) => {
    setDefinitionPreview(displayName);
  }, []);

  const mq = modalQuery.trim().toLowerCase();
  const filteredModalCatalog = useMemo(() => {
    if (!mq) return catalogRows;
    return catalogRows.filter((r) => {
      const blob = [
        r.name,
        r.integrating_with ?? "",
        r.integration_code ?? "",
        r.internal_time_code ?? "",
        r.direction,
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(mq);
    });
  }, [catalogRows, mq]);

  function pickRow(row: CatalogIntegrationOption) {
    setSelectedCatalog(row);
    setFormSeed((k) => k + 1);
  }

  function openCatalogModal() {
    setModalHighlight(null);
    setModalQuery("");
    dialogRef.current?.showModal();
  }

  function closeCatalogModal() {
    dialogRef.current?.close();
  }

  function applyCatalogTemplate() {
    if (!modalHighlight) return;
    pickRow(modalHighlight);
    closeCatalogModal();
  }

  const hasPreview = definitionPreview.trim() !== "";

  return (
    <>
      <div className="mb-8 flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="heading-page shrink-0">Add integration</h1>
        <div
          className="min-w-0 flex-1 border-l pl-4"
          style={{ borderColor: "var(--app-border)" }}
        >
          <p
            className={`min-h-[1.625rem] truncate text-xl leading-snug ${hasPreview ? "text-muted-canvas" : ""}`}
            title={hasPreview ? definitionPreview : undefined}
          >
            {hasPreview ? definitionPreview : null}
          </p>
        </div>
      </div>
      <form
        action={createAction}
        className="flex min-h-[calc(100dvh-12rem)] max-w-3xl flex-col gap-4"
      >
        <input type="hidden" name="project_id" value={projectId} />
        <input
          type="hidden"
          name="prefilled_from_integration_id"
          value={selectedCatalog?.id ?? ""}
        />
        <IntegrationDefinitionFields
          key={formSeed}
          fieldLayout="createStyle"
          lookups={lookups}
          defaultName={selectedCatalog?.name ?? ""}
          defaultIntegratingWith={selectedCatalog?.integrating_with ?? ""}
          defaultIntegrationCode={selectedCatalog?.integration_code ?? ""}
          defaultInternalTimeCode={selectedCatalog?.internal_time_code ?? ""}
          defaultDirection={selectedCatalog?.direction ?? ""}
          defaultIntegrationTypeId={selectedCatalog?.integration_type_id ?? ""}
          defaultFunctionalAreaId={selectedCatalog?.functional_area_id ?? ""}
          defaultEstimatedEffortHours={
            selectedCatalog?.default_estimated_effort_hours != null
              ? String(selectedCatalog.default_estimated_effort_hours)
              : ""
          }
          internalTimeCodeMode="optional"
          onDefinitionPreviewChange={onDefinitionPreviewChange}
        />
        {createState?.error ? (
          <p className="text-sm" style={{ color: "var(--app-danger)" }} role="alert">
            {createState.error}
          </p>
        ) : null}
        <div className="mt-auto mb-6 flex flex-wrap items-center justify-start gap-3 pt-8">
          <button type="submit" disabled={createPending} className="btn-cta-dark whitespace-nowrap">
            {createPending ? "Saving…" : "Add Integration"}
          </button>
          <button type="button" className="btn-cta whitespace-nowrap text-xs" onClick={openCatalogModal}>
            Populate from catalog
          </button>
          <Link
            href={`/projects/${projectId}`}
            className="btn-ghost btn-ghost-match-cta no-underline whitespace-nowrap"
          >
            Cancel
          </Link>
        </div>
      </form>

      <dialog
        ref={dialogRef}
        className="app-catalog-dialog fixed left-1/2 top-1/2 z-[200] h-[min(92dvh,52rem)] w-[min(100vw-2rem,56rem)] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden border-0 p-0 shadow-xl"
        style={{
          borderRadius: "12px",
          background: "var(--app-surface)",
          color: "var(--app-text)",
        }}
        onClose={() => setModalHighlight(null)}
      >
        <div className="flex h-full min-h-0 max-h-full flex-col">
          <div
            className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3"
            style={{ borderColor: "var(--app-border)" }}
          >
            <h2 className="text-base font-semibold" style={{ color: "var(--app-text)" }}>
              Integration catalog
            </h2>
            <DialogCloseButton onClick={closeCatalogModal} />
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
            <label className="block text-sm font-medium shrink-0" style={{ color: "var(--app-text)" }}>
              Search templates
              <input
                type="search"
                value={modalQuery}
                onChange={(e) => setModalQuery(e.target.value)}
                placeholder="Name, integration ID, integrating with…"
                className="input-canvas mt-1 w-full"
                autoComplete="off"
                autoFocus
              />
            </label>
            <div
              className="min-h-[min(24rem,45dvh)] flex-1 overflow-auto rounded-lg border"
              style={{ borderColor: "var(--app-border)" }}
            >
              <table className="w-full min-w-0 border-collapse text-sm">
                <thead
                  className="sticky top-0 z-[1] border-b text-left text-xs text-muted-canvas"
                  style={{
                    borderColor: "var(--app-border)",
                    background: "var(--app-surface-muted-solid)",
                  }}
                >
                  <tr>
                    <th className="px-3 py-2 font-medium" scope="col">
                      Definition
                    </th>
                    <th className="px-3 py-2 font-medium" scope="col">
                      Integration ID
                    </th>
                    <th className="px-3 py-2 font-medium" scope="col">
                      Internal time code
                    </th>
                    <th className="px-3 py-2 font-medium" scope="col">
                      Direction
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredModalCatalog.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-muted-canvas">
                        {catalogRows.length === 0 ? (
                          <span>
                            No templates in your catalog yet. Open an integration, set an internal time code, then
                            use Add to catalog — or browse{" "}
                            <Link href="/integrations/catalog" className="underline-offset-2 hover:underline">
                              Integration catalog
                            </Link>
                            .
                          </span>
                        ) : (
                          "No matches."
                        )}
                      </td>
                    </tr>
                  ) : (
                    filteredModalCatalog.map((r) => {
                      const active = modalHighlight?.id === r.id;
                      return (
                        <tr
                          key={r.id}
                          className="cursor-pointer border-b last:border-b-0"
                          style={{
                            borderColor: "color-mix(in oklab, var(--app-border) 75%, transparent)",
                            background: active ? "var(--app-info-surface)" : undefined,
                          }}
                          onClick={() => setModalHighlight(r)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setModalHighlight(r);
                            }
                          }}
                          tabIndex={0}
                          aria-selected={active}
                        >
                          <td className="max-w-[min(28rem,55vw)] px-3 py-2.5 text-muted-canvas">
                            <span className="line-clamp-2 break-words">
                              {formatIntegrationDefinitionDisplayName({
                                integration_code: r.integration_code,
                                integrating_with: r.integrating_with,
                                name: r.name,
                                direction: r.direction,
                              }) || r.name}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-muted-canvas">{r.integration_code ?? "—"}</td>
                          <td className="px-3 py-2.5 font-mono text-xs text-muted-canvas">
                            {r.internal_time_code ?? "—"}
                          </td>
                          <td className="px-3 py-2.5 text-muted-canvas">
                            {r.direction ? formatIntegrationDirectionLabel(r.direction) : "—"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div
            className="flex shrink-0 flex-wrap justify-end gap-3 border-t px-4 py-3"
            style={{ borderColor: "var(--app-border)" }}
          >
            <button type="button" className="btn-cta whitespace-nowrap text-xs" onClick={closeCatalogModal}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-cta-dark whitespace-nowrap"
              disabled={!modalHighlight}
              onClick={applyCatalogTemplate}
            >
              Use this template
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
