"use client";

import Link from "next/link";
import { type RefObject } from "react";

import { CanvasSelect, type CanvasSelectOption } from "@/components/canvas-select";
import {
  integrationStateShowsReason,
  projectDeliveryProgressSelectOptions,
  projectIntegrationStateSelectOptions,
} from "@/lib/integration-metadata";
import type { SerializedProjectIntegrationRow } from "@/lib/project-integration-row";

export const MAX_UPDATE_BODY_LENGTH = 300;

const deliveryOptions: CanvasSelectOption[] = projectDeliveryProgressSelectOptions();
const stateOptions: CanvasSelectOption[] = projectIntegrationStateSelectOptions();

export type IntegrationProvideUpdateDraft = {
  delivery_progress: string;
  integration_state: string;
  integration_state_reason: string;
  update_body: string;
};

export function seedIntegrationDrafts(rows: SerializedProjectIntegrationRow[]): Record<string, IntegrationProvideUpdateDraft> {
  const out: Record<string, IntegrationProvideUpdateDraft> = {};
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

export function SubmitUpdateSpinner() {
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

type Props = {
  integrationRow: SerializedProjectIntegrationRow;
  draft: IntegrationProvideUpdateDraft;
  onDraftChange: (patch: Partial<IntegrationProvideUpdateDraft>) => void;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  headingAsLinkHref?: string;
  submitError?: string | null;
  /** When true, omit integration title + catalog line. */
  hideIntegrationHeading?: boolean;
};

/** Share-update fields for one integration (used by the provide-update wizard). */
export function IntegrationProvideUpdateFormFields({
  integrationRow,
  draft,
  onDraftChange,
  headingRef,
  headingAsLinkHref,
  submitError,
  hideIntegrationHeading = false,
}: Props) {
  const showReason = integrationStateShowsReason(draft.integration_state);

  const titleContent = headingAsLinkHref ? (
    <Link
      href={headingAsLinkHref}
      className="font-medium text-[var(--app-action)] underline outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)]"
    >
      {integrationRow.title}
    </Link>
  ) : (
    integrationRow.title
  );

  return (
    <>
      {!hideIntegrationHeading ? (
        <div className="mb-4">
          <h3
            ref={headingRef}
            tabIndex={-1}
            className="text-sm font-medium leading-snug outline-none"
            style={{ color: "var(--app-text)" }}
          >
            {titleContent}
          </h3>
          {integrationRow.catalogMeta ? (
            <p className="mt-0.5 text-xs" style={{ color: "var(--app-text-muted)" }}>
              {integrationRow.catalogMeta}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "var(--app-text-muted)" }}>
          Integration state
          <CanvasSelect
            name="integration_state"
            options={stateOptions}
            value={draft.integration_state}
            onValueChange={(v) => {
              onDraftChange({
                integration_state: v,
                integration_state_reason: v === "active" ? "" : draft.integration_state_reason,
              });
            }}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "var(--app-text-muted)" }}>
          Delivery progress
          <CanvasSelect
            name="delivery_progress"
            options={deliveryOptions}
            value={draft.delivery_progress}
            onValueChange={(v) => onDraftChange({ delivery_progress: v })}
          />
        </label>

        {showReason ? (
          <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "var(--app-text-muted)" }}>
            Reason
            <textarea
              className="input-canvas min-h-[4.5rem] resize-y"
              rows={3}
              value={draft.integration_state_reason}
              placeholder="Optional"
              onChange={(e) => onDraftChange({ integration_state_reason: e.target.value })}
            />
          </label>
        ) : null}

        <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "var(--app-text-muted)" }}>
          Update
          <textarea
            className="input-canvas min-h-[5rem] resize-y"
            rows={3}
            maxLength={MAX_UPDATE_BODY_LENGTH}
            value={draft.update_body}
            placeholder="Share your update"
            onChange={(e) => onDraftChange({ update_body: e.target.value })}
          />
          <span className="self-end tabular-nums text-xs" style={{ color: "var(--app-text-muted)" }}>
            {draft.update_body.length}/{MAX_UPDATE_BODY_LENGTH}
          </span>
        </label>
      </div>

      {submitError ? (
        <p className="mt-3 text-sm" role="alert" style={{ color: "var(--app-danger)" }}>
          {submitError}
        </p>
      ) : null}
    </>
  );
}
