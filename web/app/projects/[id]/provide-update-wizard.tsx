"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DialogCloseButton } from "@/components/dialog-close-button";
import { CanvasSelect, type CanvasSelectOption } from "@/components/canvas-select";
import {
  projectDeliveryProgressSelectOptions,
  projectIntegrationStateSelectOptions,
} from "@/lib/integration-metadata";
import {
  submitProvideUpdateBatch,
  type ProvideUpdateEntry,
} from "@/lib/actions/integration-bulk-updates";
import type { SerializedProjectIntegrationRow } from "@/lib/project-integration-row";

const MAX_UPDATE_BODY = 300;

const deliveryOptions: CanvasSelectOption[] = projectDeliveryProgressSelectOptions();
const stateOptions: CanvasSelectOption[] = projectIntegrationStateSelectOptions();

type Draft = {
  delivery_progress: string;
  integration_state: string;
  integration_state_reason: string;
  update_body: string;
};

function seedDrafts(rows: SerializedProjectIntegrationRow[]): Record<string, Draft> {
  const out: Record<string, Draft> = {};
  for (const row of rows) {
    out[row.id] = {
      delivery_progress: row.delivery_progress,
      integration_state: row.integration_state,
      integration_state_reason: "",
      update_body: "",
    };
  }
  return out;
}

function SubmitSpinner() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={14}
      height={14}
      aria-hidden
      className="shrink-0 animate-spin"
      fill="none"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export function ProvideUpdateWizard({
  dialogRef,
  projectId,
  projectCustomerName,
  integrationRows,
  onClose,
}: {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  projectId: string;
  projectCustomerName: string;
  integrationRows: SerializedProjectIntegrationRow[];
  onClose: () => void;
}) {
  const router = useRouter();

  // Open the dialog as soon as this component mounts (the bar conditionally renders it).
  useEffect(() => {
    dialogRef.current?.showModal();
  }, [dialogRef]);

  const [step, setStep] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => seedDrafts(integrationRows));
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);

  const total = integrationRows.length;
  const currentRow = integrationRows[step];
  const isFirst = step === 0;
  const isLast = step === total - 1;

  // Sync drafts when rows change (e.g. dialog reopened with updated data).
  // Only re-seed fields that aren't in the draft yet so in-progress edits survive a hot reload.
  useEffect(() => {
    setDrafts(seedDrafts(integrationRows));
    setStep(0);
    setSubmitError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integrationRows.map((r) => r.id).join(",")]);

  const currentDraft = currentRow ? (drafts[currentRow.id] ?? seedDrafts([currentRow])[currentRow.id]) : null;

  const updateDraft = useCallback(
    (id: string, patch: Partial<Draft>) => {
      setDrafts((prev) => ({
        ...prev,
        [id]: { ...prev[id], ...patch },
      }));
    },
    [],
  );

  const moveTo = (nextStep: number) => {
    setStep(nextStep);
    // Move focus to step heading on navigation.
    requestAnimationFrame(() => stepHeadingRef.current?.focus());
  };

  // Called by the native dialog onClose event (Esc, programmatic .close(), DialogCloseButton).
  // Buttons inside the dialog call dialogRef.current?.close() to trigger this chain.
  const handleDialogClose = () => {
    setDrafts(seedDrafts(integrationRows));
    setStep(0);
    setSubmitError(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    const entries: ProvideUpdateEntry[] = integrationRows.map((row) => {
      const d = drafts[row.id] ?? seedDrafts([row])[row.id];
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

    // Closing the dialog triggers handleDialogClose which resets state and calls onClose.
    dialogRef.current?.close();
    router.refresh();
  };

  if (!currentRow || !currentDraft) return null;

  const showReason =
    currentDraft.integration_state === "blocked" ||
    currentDraft.integration_state === "on_hold";

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
        {/* Header */}
        <div
          className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3"
          style={{ borderColor: "var(--app-border)" }}
        >
          <div className="min-w-0 flex-1 pr-2">
            <h2
              className="text-base font-medium"
              style={{ color: "var(--app-text)" }}
            >
              Share update
            </h2>
            <p
              className="mt-0.5 text-sm truncate"
              style={{ color: "var(--app-text-muted)" }}
            >
              {projectCustomerName}
            </p>
          </div>
          <DialogCloseButton onClick={() => dialogRef.current?.close()} />
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-3">
          {/* Integration identity */}
          <div className="mb-4">
            <h3
              ref={stepHeadingRef}
              tabIndex={-1}
              className="text-sm font-medium leading-snug outline-none"
              style={{ color: "var(--app-text)" }}
            >
              {currentRow.title}
            </h3>
            {currentRow.catalogMeta ? (
              <p className="mt-0.5 text-xs" style={{ color: "var(--app-text-muted)" }}>
                {currentRow.catalogMeta}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-3">
            {/* Integration state */}
            <label
              className="flex flex-col gap-1 text-xs font-medium"
              style={{ color: "var(--app-text-muted)" }}
            >
              Integration state
              <CanvasSelect
                name="integration_state"
                options={stateOptions}
                value={currentDraft.integration_state}
                onValueChange={(v) => {
                  updateDraft(currentRow.id, {
                    integration_state: v,
                    integration_state_reason: v === "active" ? "" : currentDraft.integration_state_reason,
                  });
                }}
              />
            </label>

            {/* Delivery progress */}
            <label
              className="flex flex-col gap-1 text-xs font-medium"
              style={{ color: "var(--app-text-muted)" }}
            >
              Delivery progress
              <CanvasSelect
                name="delivery_progress"
                options={deliveryOptions}
                value={currentDraft.delivery_progress}
                onValueChange={(v) => updateDraft(currentRow.id, { delivery_progress: v })}
              />
            </label>

            {/* Reason (blocked / on_hold only) */}
            {showReason ? (
              <label
                className="flex flex-col gap-1 text-xs font-medium"
                style={{ color: "var(--app-text-muted)" }}
              >
                Blocked / on hold reason
                <textarea
                  className="input-canvas min-h-[4.5rem] resize-y"
                  rows={3}
                  value={currentDraft.integration_state_reason}
                  placeholder="Optional"
                  onChange={(e) =>
                    updateDraft(currentRow.id, { integration_state_reason: e.target.value })
                  }
                />
              </label>
            ) : null}

            {/* Written update */}
            <label
              className="flex flex-col gap-1 text-xs font-medium"
              style={{ color: "var(--app-text-muted)" }}
            >
              Update
              <textarea
                className="input-canvas min-h-[5rem] resize-y"
                rows={3}
                maxLength={MAX_UPDATE_BODY}
                value={currentDraft.update_body}
                placeholder="Share your update"
                onChange={(e) => updateDraft(currentRow.id, { update_body: e.target.value })}
              />
              <span className="self-end tabular-nums text-xs" style={{ color: "var(--app-text-muted)" }}>
                {currentDraft.update_body.length}/{MAX_UPDATE_BODY}
              </span>
            </label>
          </div>

          {/* Submit error */}
          {submitError ? (
            <p
              className="mt-3 text-sm"
              role="alert"
              style={{ color: "var(--app-danger)" }}
            >
              {submitError}
            </p>
          ) : null}
        </div>

        {/* Footer: prev/next arrows centered, submit right-aligned on last step */}
        <div className="grid shrink-0 grid-cols-3 items-center px-4 pb-5 pt-3">
          {/* Left: placeholder to balance the grid */}
          <div />

          {/* Center: navigation arrows */}
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

          {/* Right: submit on last step */}
          <div className="flex justify-end">
            {isLast ? (
              <button
                type="button"
                className="btn-cta-dark inline-flex h-9 items-center gap-2 px-4 text-sm disabled:opacity-60"
                disabled={submitting}
                onClick={handleSubmit}
              >
                {submitting ? <SubmitSpinner /> : null}
                {submitting ? "Saving…" : "Submit update"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </dialog>
  );
}
