"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ProvideUpdateWizard } from "./provide-update-wizard";
import { SummarizeActivityDialog } from "./summarize-activity-dialog";
import type { SerializedProjectIntegrationRow } from "@/lib/project-integration-row";

const EMPTY_HINT_ID = "quick-actions-no-integrations-hint";

export function ProjectQuickActionsBar({
  projectId,
  projectCustomerName,
  integrationRows,
}: {
  projectId: string;
  projectCustomerName: string;
  integrationRows: SerializedProjectIntegrationRow[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [summarizeOpen, setSummarizeOpen] = useState(false);

  const hasIntegrations = integrationRows.length > 0;

  const openWizard = () => {
    setWizardOpen(true);
    // showModal() is called inside ProvideUpdateWizard's mount effect to avoid
    // race conditions with conditional rendering.
  };

  // Called from ProvideUpdateWizard's handleDialogClose, which fires after the dialog
  // has already been closed by the native onClose event. Just update React state.
  const closeWizard = () => {
    setWizardOpen(false);
  };

  return (
    <>
      <section aria-label="Project quick actions" className="mt-6">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn-quick-action"
            disabled={!hasIntegrations}
            onClick={openWizard}
            aria-describedby={!hasIntegrations ? EMPTY_HINT_ID : undefined}
          >
            Share update
          </button>
          <Link
            href={`/projects/${projectId}/integrations/new`}
            className="btn-quick-action"
          >
            Add integration
          </Link>
          <button
            type="button"
            className="btn-quick-action"
            onClick={() => setSummarizeOpen(true)}
          >
            Summarize activity
          </button>
          {!hasIntegrations ? (
            <span
              id={EMPTY_HINT_ID}
              className="text-xs"
              style={{ color: "var(--app-text-muted)" }}
            >
              Add an integration to enable updates.
            </span>
          ) : null}
        </div>
      </section>

      {wizardOpen ? (
        <ProvideUpdateWizard
          dialogRef={dialogRef}
          projectId={projectId}
          projectCustomerName={projectCustomerName}
          integrationRows={integrationRows}
          onClose={closeWizard}
        />
      ) : null}

      {summarizeOpen ? (
        <SummarizeActivityDialog
          projectId={projectId}
          projectCustomerName={projectCustomerName}
          onClose={() => setSummarizeOpen(false)}
        />
      ) : null}
    </>
  );
}
