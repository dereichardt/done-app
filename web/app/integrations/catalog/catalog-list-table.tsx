"use client";

import { fetchCatalogIntegrationDetail } from "@/lib/actions/projects";
import type { CatalogIntegrationDetailDTO } from "@/lib/load-catalog-integration-detail";
import {
  CATALOG_GENERIC_INTEGRATING_WITH,
  formatIntegrationDirectionLabel,
  isCatalogGenericIntegratingWithLabel,
} from "@/lib/integration-metadata";
import { isImplementationNotesHtmlEmpty, sanitizeImplementationNotesHtml } from "@/lib/sanitize-implementation-notes";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DialogCloseButton } from "@/components/dialog-close-button";
import { CatalogUsageTable } from "./catalog-usage-table";

function PencilIcon() {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden className="shrink-0">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
        d="M10.7 2.7 13 5l-7.2 7.2-3 .3.3-3L10.7 2.7zM9 4l3 3"
      />
    </svg>
  );
}

/** Link / chain: reads as “linked to projects” (usages). */
function UsagesLinkIcon() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden className="shrink-0">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
        d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
      />
    </svg>
  );
}

function ImplementationNotesIcon() {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden className="shrink-0">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.35"
        d="M3 2.5h10a.5.5 0 0 1 .5.5v10a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5zM4.5 5.5h7M4.5 8h7M4.5 10.5h4.5"
      />
    </svg>
  );
}

const NOTES_POPOVER_W = 288;
const NOTES_POPOVER_MAX_H = 320;

export type CatalogListRow = {
  id: string;
  name: string;
  integrating_with: string | null;
  internal_time_code: string | null;
  direction: string | null;
  default_estimated_effort_hours: number | null;
  integration_type_id: string | null;
  functional_area_id: string | null;
  integration_types: { name: string } | null;
  functional_areas: { name: string } | null;
  integration_domains: { name: string } | null;
  usageLinkCount: number;
  implementation_notes: string | null;
};

type NotesPopoverState = {
  rowId: string;
  title: string;
  left: number;
  top: number;
  html: string;
};

export function CatalogListTable({ rows }: { rows: CatalogListRow[] }) {
  const router = useRouter();
  const usagesDialogRef = useRef<HTMLDialogElement>(null);
  const [detail, setDetail] = useState<CatalogIntegrationDetailDTO | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [notesPopover, setNotesPopover] = useState<NotesPopoverState | null>(null);
  const notesHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesPopoverId = useId();

  const clearNotesHideTimer = useCallback(() => {
    if (notesHideTimerRef.current != null) {
      clearTimeout(notesHideTimerRef.current);
      notesHideTimerRef.current = null;
    }
  }, []);

  const scheduleNotesPopoverHide = useCallback(() => {
    clearNotesHideTimer();
    notesHideTimerRef.current = setTimeout(() => {
      setNotesPopover(null);
      notesHideTimerRef.current = null;
    }, 140);
  }, [clearNotesHideTimer]);

  const positionNotesPopover = useCallback((anchor: DOMRect, title: string, rowId: string, rawNotes: string) => {
    const html = sanitizeImplementationNotesHtml(rawNotes);
    if (isImplementationNotesHtmlEmpty(html)) return;

    const margin = 8;
    let left = anchor.left;
    let top = anchor.bottom + margin;

    left = Math.min(Math.max(margin, left), window.innerWidth - NOTES_POPOVER_W - margin);

    if (top + NOTES_POPOVER_MAX_H > window.innerHeight - margin) {
      top = Math.max(margin, anchor.top - NOTES_POPOVER_MAX_H - margin);
    }

    setNotesPopover({ rowId, title, left, top, html });
  }, []);

  const onNotesTriggerEnter = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>, row: CatalogListRow) => {
      if (!row.implementation_notes) return;
      const html = sanitizeImplementationNotesHtml(row.implementation_notes);
      if (isImplementationNotesHtmlEmpty(html)) return;
      clearNotesHideTimer();
      positionNotesPopover(e.currentTarget.getBoundingClientRect(), row.name, row.id, row.implementation_notes);
    },
    [clearNotesHideTimer, positionNotesPopover],
  );

  useEffect(() => {
    const onScrollOrResize = () => {
      setNotesPopover(null);
    };
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, []);

  useEffect(() => {
    return () => clearNotesHideTimer();
  }, [clearNotesHideTimer]);

  const openUsages = useCallback(async (id: string) => {
    setLoadError(null);
    setLoading(true);
    setDetail(null);
    usagesDialogRef.current?.showModal();
    try {
      const res = await fetchCatalogIntegrationDetail(id);
      if (!res.ok) {
        setLoadError(res.error);
        return;
      }
      setDetail(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  const closeUsages = useCallback(() => {
    usagesDialogRef.current?.close();
    setDetail(null);
    setLoadError(null);
  }, []);

  useEffect(() => {
    const u = usagesDialogRef.current;
    function onClose() {
      setDetail(null);
      setLoadError(null);
    }
    u?.addEventListener("close", onClose);
    return () => u?.removeEventListener("close", onClose);
  }, []);

  const actionBtnClass =
    "inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border text-[var(--app-text-muted)] opacity-0 transition-opacity duration-150 hover:bg-[var(--app-surface-alt)] group-hover:opacity-100";

  return (
    <>
      <div
        className="overflow-x-auto rounded-lg border"
        style={{ borderColor: "var(--app-border)" }}
      >
        <table className="min-w-[56rem] w-max border-collapse text-sm">
          <thead
            className="border-b text-left text-xs text-muted-canvas"
            style={{
              borderColor: "var(--app-border)",
              background: "var(--app-surface-muted-solid)",
            }}
          >
            <tr>
              <th className="sticky left-0 z-[2] whitespace-nowrap px-3 py-2 pl-4 font-medium shadow-[4px_0_8px_-4px_color-mix(in_oklab,var(--app-text)_18%,transparent)]" style={{ background: "var(--app-surface-muted-solid)" }} scope="col">
                Actions
              </th>
              <th className="whitespace-nowrap px-3 py-2 font-medium" scope="col">
                Internal time code
              </th>
              <th className="min-w-[20rem] whitespace-nowrap px-3 py-2 font-medium" scope="col">
                Name
              </th>
              <th className="min-w-[8rem] whitespace-nowrap px-3 py-2 font-medium" scope="col">
                Integrating with
              </th>
              <th className="whitespace-nowrap px-3 py-2 font-medium" scope="col">
                Direction
              </th>
              <th className="whitespace-nowrap px-3 py-2 font-medium" scope="col">
                Integration type
              </th>
              <th className="whitespace-nowrap px-3 py-2 font-medium" scope="col">
                Functional area
              </th>
              <th className="whitespace-nowrap px-3 py-2 font-medium" scope="col">
                Domain
              </th>
              <th className="whitespace-nowrap px-3 py-2 pr-4 font-medium" scope="col">
                Hrs
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const typeName = r.integration_types?.name ?? "—";
              const areaName = r.functional_areas?.name ?? "—";
              const domainName = r.integration_domains?.name ?? "—";
              const defEff =
                r.default_estimated_effort_hours != null && Number.isFinite(r.default_estimated_effort_hours)
                  ? String(r.default_estimated_effort_hours)
                  : "—";
              const dirLabel = r.direction ? formatIntegrationDirectionLabel(r.direction) : "—";
              const notesSanitized = r.implementation_notes
                ? sanitizeImplementationNotesHtml(r.implementation_notes)
                : "";
              const hasNotesPreview = notesSanitized.length > 0 && !isImplementationNotesHtmlEmpty(notesSanitized);

              return (
                <tr
                  key={r.id}
                  className="group border-b last:border-b-0"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  <td
                    className="sticky left-0 z-[1] whitespace-nowrap px-2 py-2 pl-3 align-middle shadow-[4px_0_8px_-4px_color-mix(in_oklab,var(--app-text)_12%,transparent)]"
                    style={{ background: "var(--app-surface)" }}
                  >
                    <div className="flex items-center justify-end gap-1.5 pr-1">
                      <button
                        type="button"
                        className={actionBtnClass}
                        style={{ borderColor: "var(--app-border)" }}
                        aria-label={`Edit catalog entry: ${r.name}`}
                        onClick={() => router.push(`/integrations/catalog/${r.id}/edit`)}
                      >
                        <PencilIcon />
                      </button>
                      <button
                        type="button"
                        className={actionBtnClass}
                        style={{ borderColor: "var(--app-border)" }}
                        aria-label={`Project usages for ${r.name}${r.usageLinkCount > 0 ? ` (${r.usageLinkCount} links)` : ""}`}
                        onClick={() => void openUsages(r.id)}
                      >
                        <UsagesLinkIcon />
                      </button>
                      <button
                        type="button"
                        className={[actionBtnClass, hasNotesPreview ? "" : "!pointer-events-none !opacity-0"].join(" ")}
                        style={{ borderColor: "var(--app-border)" }}
                        aria-label={hasNotesPreview ? `Implementation notes for ${r.name}` : "No implementation notes"}
                        aria-expanded={hasNotesPreview && notesPopover?.rowId === r.id}
                        disabled={!hasNotesPreview}
                        onMouseEnter={(e) => onNotesTriggerEnter(e, r)}
                        onMouseLeave={scheduleNotesPopoverHide}
                      >
                        <ImplementationNotesIcon />
                      </button>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium" style={{ color: "var(--app-text)" }}>
                    {r.internal_time_code ?? "—"}
                  </td>
                  <td
                    className="min-w-[22rem] max-w-[32rem] whitespace-normal px-3 py-2.5"
                    style={{ color: "var(--app-text)" }}
                  >
                    {r.name}
                  </td>
                  <td className="min-w-[8rem] max-w-[20rem] whitespace-normal px-3 py-2.5 text-muted-canvas">
                    {isCatalogGenericIntegratingWithLabel(r.integrating_with)
                      ? CATALOG_GENERIC_INTEGRATING_WITH
                      : (r.integrating_with ?? "—")}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-muted-canvas">{dirLabel}</td>
                  <td className="max-w-[12rem] whitespace-normal px-3 py-2.5 text-muted-canvas">{typeName}</td>
                  <td className="max-w-[12rem] whitespace-normal px-3 py-2.5 text-muted-canvas">{areaName}</td>
                  <td className="max-w-[12rem] whitespace-normal px-3 py-2.5 text-muted-canvas">{domainName}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 pr-4 text-muted-canvas">{defEff}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {notesPopover && typeof document !== "undefined"
        ? createPortal(
            <div
              id={notesPopoverId}
              role="dialog"
              aria-label={`Implementation notes: ${notesPopover.title}`}
              className="catalog-notes-popover fixed z-[250] w-[18rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border p-3 shadow-lg"
              style={{
                left: notesPopover.left,
                top: notesPopover.top,
                maxHeight: `${NOTES_POPOVER_MAX_H}px`,
                borderColor: "var(--app-border)",
                background: "var(--app-surface)",
                boxShadow: "0 8px 24px color-mix(in oklab, var(--app-text) 12%, transparent)",
                pointerEvents: "auto",
              }}
              onMouseEnter={clearNotesHideTimer}
              onMouseLeave={scheduleNotesPopoverHide}
            >
              <p className="text-xs font-medium text-muted-canvas">Implementation notes</p>
              <div
                className="catalog-notes-popover__body mt-2 text-sm"
                style={{ color: "var(--app-text)" }}
                // eslint-disable-next-line react/no-danger -- HTML is server-sanitized subset; sanitized again on display
                dangerouslySetInnerHTML={{ __html: notesPopover.html }}
              />
            </div>,
            document.body,
          )
        : null}

      <dialog
        ref={usagesDialogRef}
        className="app-catalog-dialog fixed left-1/2 top-1/2 z-[200] max-h-[min(88dvh,40rem)] w-[min(100vw-2rem,60rem)] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden border-0 p-0 shadow-xl"
        style={{
          borderRadius: "12px",
          background: "var(--app-surface)",
          color: "var(--app-text)",
        }}
      >
        <div className="flex max-h-[min(88dvh,40rem)] flex-col">
          <div
            className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3"
            style={{ borderColor: "var(--app-border)" }}
          >
            <h2 className="text-base font-medium" style={{ color: "var(--app-text)" }}>
              Project usages
            </h2>
            <DialogCloseButton onClick={closeUsages} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {loading ? <p className="text-sm text-muted-canvas">Loading…</p> : null}
            {loadError ? (
              <p className="text-sm" style={{ color: "var(--app-danger)" }} role="alert">
                {loadError}
              </p>
            ) : null}
            {!loading && detail ? (
              <>
                <p className="text-sm text-muted-canvas">
                  <span className="font-medium text-[var(--app-text)]">{detail.displayTitle}</span>
                </p>
                <div className="mt-4">
                  <CatalogUsageTable usageRows={detail.usageRows} />
                </div>
              </>
            ) : null}
          </div>
        </div>
      </dialog>
    </>
  );
}
