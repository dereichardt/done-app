"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import { HomeProjectPickerDialog } from "@/components/home-project-picker-dialog";
import { ProvideUpdateWizard } from "@/app/projects/[id]/provide-update-wizard";
import { SummarizeActivityDialog } from "@/app/projects/[id]/summarize-activity-dialog";
import { loadHomeProjectIntegrationRows, type HomeProjectPickerRow } from "@/lib/actions/home";
import type { SerializedProjectIntegrationRow } from "@/lib/project-integration-row";

type PickerMode = "share" | "summarize" | "add_integration" | null;

const EMPTY_HINT_ID = "home-quick-actions-no-integrations-hint";

export function HomeQuickActions({ projects }: { projects: HomeProjectPickerRow[] }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [summarizeOpen, setSummarizeOpen] = useState(false);
  const [wizardProject, setWizardProject] = useState<{
    id: string;
    customer_name: string;
    rows: SerializedProjectIntegrationRow[];
  } | null>(null);
  const [summarizeProject, setSummarizeProject] = useState<{
    id: string;
    customer_name: string;
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const openPicker = (mode: Exclude<PickerMode, null>) => {
    setLoadError(null);
    setPickerMode(mode);
  };

  const closePicker = useCallback(() => setPickerMode(null), []);

  const handlePick = useCallback(
    async (row: HomeProjectPickerRow) => {
      setLoadError(null);
      if (pickerMode === "add_integration") {
        router.push(`/projects/${row.id}/integrations/new`);
        setPickerMode(null);
        return;
      }

      const res = await loadHomeProjectIntegrationRows(row.id);
      if (res.error) {
        setLoadError(res.error);
        return;
      }
      const rows = res.rows ?? [];

      if (pickerMode === "share") {
        if (rows.length === 0) {
          setLoadError("Add an integration to this project before sharing an update.");
          return;
        }
        setWizardProject({ id: row.id, customer_name: row.customer_name, rows });
        setWizardOpen(true);
        setPickerMode(null);
        return;
      }

      if (pickerMode === "summarize") {
        setSummarizeProject({ id: row.id, customer_name: row.customer_name });
        setSummarizeOpen(true);
        setPickerMode(null);
      }
    },
    [pickerMode, router],
  );

  const pickerTitle =
    pickerMode === "share"
      ? "Choose a project — Share update"
      : pickerMode === "summarize"
        ? "Choose a project — Summarize activity"
        : pickerMode === "add_integration"
          ? "Choose a project — Add integration"
          : "";

  return (
    <>
      <section aria-label="Home quick actions" className="mt-8">
        <h2 className="section-heading">Quick actions</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn-quick-action"
            disabled={projects.length === 0}
            onClick={() => openPicker("share")}
            aria-describedby={projects.length === 0 ? EMPTY_HINT_ID : undefined}
          >
            Share update
          </button>
          <Link href="/projects/new" className="btn-quick-action">
            Add project
          </Link>
          <button type="button" className="btn-quick-action" onClick={() => openPicker("summarize")}>
            Summarize activity
          </button>
          <button
            type="button"
            className="btn-quick-action"
            disabled={projects.length === 0}
            onClick={() => openPicker("add_integration")}
          >
            Add integration
          </button>
          {projects.length === 0 ? (
            <span id={EMPTY_HINT_ID} className="text-xs" style={{ color: "var(--app-text-muted)" }}>
              Create a project to enable project-scoped actions.
            </span>
          ) : null}
        </div>
        {loadError ? (
          <p className="mt-2 text-sm" style={{ color: "var(--app-danger)" }}>
            {loadError}
          </p>
        ) : null}
      </section>

      <HomeProjectPickerDialog
        open={pickerMode != null}
        title={pickerTitle}
        projects={projects}
        onClose={closePicker}
        onPick={handlePick}
      />

      {wizardOpen && wizardProject ? (
        <ProvideUpdateWizard
          dialogRef={dialogRef}
          projectId={wizardProject.id}
          projectCustomerName={wizardProject.customer_name}
          integrationRows={wizardProject.rows}
          onClose={() => {
            setWizardOpen(false);
            setWizardProject(null);
          }}
        />
      ) : null}

      {summarizeOpen && summarizeProject ? (
        <SummarizeActivityDialog
          projectId={summarizeProject.id}
          projectCustomerName={summarizeProject.customer_name}
          onClose={() => {
            setSummarizeOpen(false);
            setSummarizeProject(null);
          }}
        />
      ) : null}
    </>
  );
}
