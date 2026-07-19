"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { DialogCloseButton } from "@/components/dialog-close-button";
import {
  IntegrationProvideUpdateFormFields,
  type IntegrationProvideUpdateDraft,
  SubmitUpdateSpinner,
  seedIntegrationDrafts,
} from "@/components/integration-provide-update-form";
import { submitProvideUpdateBatch, type ProvideUpdateEntry } from "@/lib/actions/integration-bulk-updates";
import type { SerializedProjectIntegrationRow } from "@/lib/project-integration-row";

export function ProvideUpdateWizard({
  dialogRef,
  projectId,
  projectCustomerName,
  integrationRows,
  onClose,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  projectId: string;
  projectCustomerName: string;
  integrationRows: SerializedProjectIntegrationRow[];
  onClose: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    dialogRef.current?.showModal();
  }, [dialogRef]);

  const [step, setStep] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, IntegrationProvideUpdateDraft>>(() =>
    seedIntegrationDrafts(integrationRows),
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);

  const total = integrationRows.length;
  const currentRow = integrationRows[step];
  const isFirst = step === 0;
  const isLast = step === total - 1;

  useEffect(() => {
    setDrafts(seedIntegrationDrafts(integrationRows));
    setStep(0);
    setSubmitError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the row identity set changes, not when parent data is re-instantiated
  }, [integrationRows.map((r) => r.id).join(",")]);

  const currentDraft = currentRow
    ? (drafts[currentRow.id] ?? seedIntegrationDrafts([currentRow])[currentRow.id])
    : null;

  const updateDraft = useCallback((id: string, patch: Partial<IntegrationProvideUpdateDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  }, []);

  const moveTo = (nextStep: number) => {
    setStep(nextStep);
    requestAnimationFrame(() => stepHeadingRef.current?.focus());
  };

  const handleDialogClose = () => {
    setDrafts(seedIntegrationDrafts(integrationRows));
    setStep(0);
    setSubmitError(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    const entries: ProvideUpdateEntry[] = integrationRows.map((row) => {
      const d = drafts[row.id] ?? seedIntegrationDrafts([row])[row.id];
      const showReason = d.integration_state === "blocked" || d.integration_state === "on_hold";
      return {
        projectIntegrationId: row.id,
        delivery_progress: d.delivery_progress,
        integration_state: d.integration_state,
        integration_state_reason: showReason ? d.integration_state_reason || null : null,
        update_body: d.update_body,
      };
    });

    const result = await submitProvideUpdateBatch(projectId, entries);
    setSubmitting(false);

    if (result.error) {
      setSubmitError(result.error);
      return;
    }

    dialogRef.current?.close();
    router.refresh();
  };

  if (!currentRow || !currentDraft) return null;

  return (
    <dialog
      ref={dialogRef}
      className="app-catalog-dialog fixed left-1/2 top-1/2 z-[200] -translate-x-1/2 -translate-y-1/2 overflow-hidden border-0 p-0 shadow-xl w-[min(100vw-2rem,38rem)] max-w-[calc(100vw-2rem)]"
      style={{
        borderRadius: "12px",
        background: "var(--app-surface)",
        color: "var(--app-text)",
        height: "min(92dvh, 36rem)",
        maxHeight: "min(92dvh, 46rem)",
      }}
      onClose={handleDialogClose}
    >
      <div className="flex h-full min-h-0 flex-col" style={{ maxHeight: "inherit" }}>
        <div
          className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3"
          style={{ borderColor: "var(--app-border)" }}
        >
          <div className="min-w-0 flex-1 pr-2">
            <h2 className="text-base font-medium" style={{ color: "var(--app-text)" }}>
              Share update
            </h2>
            <p className="mt-0.5 truncate text-sm" style={{ color: "var(--app-text-muted)" }}>
              {projectCustomerName}
            </p>
          </div>
          <DialogCloseButton onClick={() => dialogRef.current?.close()} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-3">
          <IntegrationProvideUpdateFormFields
            integrationRow={currentRow}
            draft={currentDraft}
            onDraftChange={(patch) => updateDraft(currentRow.id, patch)}
            headingRef={stepHeadingRef}
            submitError={submitError}
          />
        </div>

        <div className="grid shrink-0 grid-cols-3 items-center px-4 pb-5 pt-3">
          <div />

          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              aria-label="Previous integration"
              disabled={isFirst || submitting}
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-30"
              style={{ borderColor: "var(--app-border)", color: "var(--app-text)" }}
              onClick={() => moveTo(step - 1)}
            >
              <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden fill="none">
                <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <span
              className="min-w-[3rem] text-center text-xs tabular-nums"
              style={{ color: "var(--app-text-muted)" }}
              aria-live="polite"
            >
              {step + 1} of {total}
            </span>
            <button
              type="button"
              aria-label="Next integration"
              disabled={isLast || submitting}
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-30"
              style={{ borderColor: "var(--app-border)", color: "var(--app-text)" }}
              onClick={() => moveTo(step + 1)}
            >
              <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden fill="none">
                <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          <div className="flex justify-end">
            {isLast ? (
              <button
                type="button"
                className="btn-cta-dark inline-flex h-9 items-center gap-2 px-4 text-sm disabled:opacity-60"
                disabled={submitting}
                onClick={() => void handleSubmit()}
              >
                {submitting ? <SubmitUpdateSpinner /> : null}
                {submitting ? "Saving…" : "Submit update"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </dialog>
  );
}
