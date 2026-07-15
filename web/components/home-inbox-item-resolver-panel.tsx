"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useTransition,
  type Ref,
  type RefObject,
} from "react";

import {
  SummarizeActivityPanel,
  type SummarizeActivityEmbedUi,
  type SummarizeActivityPanelHandle,
} from "@/app/projects/[id]/summarize-activity-panel";
import { DialogCloseButton } from "@/components/dialog-close-button";
import { InboxCapacityGapsPanel } from "@/components/inbox-capacity-gaps-panel";
import { InboxForecastReviewPanel } from "@/components/inbox-forecast-review-panel";
import { InboxVariancePanel } from "@/components/inbox-variance-panel";
import {
  IntegrationProvideUpdateFormFields,
  type IntegrationProvideUpdateDraft,
  SubmitUpdateSpinner,
  seedIntegrationDrafts,
} from "@/components/integration-provide-update-form";
import { loadHomeProjectIntegrationRows, loadProjectBriefForOwner } from "@/lib/actions/home";
import { markHomeInboxItemDone } from "@/lib/actions/home-inbox";
import { submitProvideUpdateBatch } from "@/lib/actions/integration-bulk-updates";
import { formatInboxTimestamp, staleIntegrationProjectName } from "@/lib/inbox-format";
import type { HomeInboxItemRow } from "@/lib/home-inbox-rules";
import type { SerializedProjectIntegrationRow } from "@/lib/project-integration-row";

function parseStaleIntegrationLink(path: string | null): { projectId: string; projectIntegrationId: string } | null {
  if (!path?.startsWith("/")) return null;
  const m = path.match(/^\/projects\/([^/]+)\/integrations\/([^/]+)$/);
  if (!m) return null;
  return { projectId: m[1], projectIntegrationId: m[2] };
}

function parseProjectOnlyLink(path: string | null): string | null {
  if (!path?.startsWith("/")) return null;
  const m = path.match(/^\/projects\/([^/]+)$/);
  return m?.[1] ?? null;
}

/** Activity row: loading / blocked (no summarize UI) vs ready (panel mounted). */
type InboxActivityBarState =
  | { kind: "loading" }
  | { kind: "blocked" }
  | { kind: "ready"; embed: SummarizeActivityEmbedUi };

const inboxFooterBtnClass =
  "inline-flex h-10 min-h-10 shrink-0 items-center justify-center gap-2 rounded-[var(--app-radius)] px-4 text-sm font-medium leading-none";

export type StaleIntegrationResolverHandle = {
  submitUpdate: () => void;
  markDoneOnly: () => void;
};

type StaleIntegrationFooterUi = {
  submitting: boolean;
  pending: boolean;
  canSubmit: boolean;
};

export function HomeInboxItemResolverPanel({
  item,
  timezone,
  onDeselect,
  onItemCompleted,
}: {
  item: HomeInboxItemRow;
  timezone: string | null;
  onDeselect: () => void;
  /** Called after mark done / submit update removes the item; parent advances selection. */
  onItemCompleted: (id: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const summarizePanelRef = useRef<SummarizeActivityPanelHandle | null>(null);
  const staleResolverRef = useRef<StaleIntegrationResolverHandle | null>(null);
  const [inboxActivityBar, setInboxActivityBar] = useState<InboxActivityBarState>({ kind: "loading" });
  const [staleFooterUi, setStaleFooterUi] = useState<StaleIntegrationFooterUi>({
    submitting: false,
    pending: false,
    canSubmit: false,
  });

  const handleMarkDone = () => {
    startTransition(async () => {
      const res = await markHomeInboxItemDone(item.id);
      if (!res.error) {
        onItemCompleted(item.id);
        router.refresh();
      }
    });
  };

  const projectName = staleIntegrationProjectName(item);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3"
        style={{ borderColor: "var(--app-border)" }}
      >
        <div className="min-w-0 flex-1 pr-2">
          <h2 id="home-inbox-resolver-title" className="text-base font-medium" style={{ color: "var(--app-text)" }}>
            {item.title}
          </h2>
          {projectName ? (
            <p className="mt-0.5 truncate text-sm font-medium" style={{ color: "var(--app-text)" }}>
              {projectName}
            </p>
          ) : null}
          <p className="mt-0.5 truncate text-sm" style={{ color: "var(--app-text-muted)" }}>
            {formatInboxTimestamp(item.created_at, timezone)}
          </p>
        </div>
        <DialogCloseButton onClick={onDeselect} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {item.rule_key === "stale_integration" ? (
          <StaleIntegrationResolverBody
            ref={staleResolverRef}
            item={item}
            onItemCompleted={onItemCompleted}
            onStaleFooterUiChange={setStaleFooterUi}
          />
        ) : item.rule_key === "activity_summary_reminder" ? (
          <ActivitySummaryResolverBody
            item={item}
            panelRef={summarizePanelRef}
            onInboxActivityBar={setInboxActivityBar}
          />
        ) : item.rule_key === "forecast_review_reminder" ? (
          <InboxForecastReviewPanel
            onSaveAndDone={() => {
              startTransition(async () => {
                const res = await markHomeInboxItemDone(item.id);
                if (!res.error) {
                  onItemCompleted(item.id);
                  router.refresh();
                }
              });
            }}
          />
        ) : item.rule_key === "variance_review" ? (
          <InboxVariancePanel fallbackBody={item.body} />
        ) : item.rule_key === "capacity_gaps" ? (
          <InboxCapacityGapsPanel fallbackBody={item.body} metadata={item.metadata} />
        ) : (
          <GenericResolverBody item={item} />
        )}
      </div>

      {item.rule_key === "activity_summary_reminder" ? (
        <div className="shrink-0 border-t px-4 py-3" style={{ borderColor: "var(--app-border)" }}>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {item.link_path ? (
              <Link
                href={item.link_path}
                className={`${inboxFooterBtnClass} border bg-transparent btn-ghost text-[var(--app-text-muted)] hover:bg-[var(--app-surface-alt)]`}
                style={{ borderColor: "var(--app-border)" }}
              >
                Open project
              </Link>
            ) : null}

            {inboxActivityBar.kind === "loading" ? (
              <button type="button" className={`${inboxFooterBtnClass} btn-cta-dark opacity-50`} disabled>
                Generate summary
              </button>
            ) : null}

            {inboxActivityBar.kind === "ready" ? (
              <ActivitySummaryFooterActions
                embed={inboxActivityBar.embed}
                summarizePanelRef={summarizePanelRef}
                pending={pending}
                onMarkDone={() => handleMarkDone()}
              />
            ) : null}
          </div>
        </div>
      ) : item.rule_key === "stale_integration" ? (
        <div className="shrink-0 border-t px-4 py-3" style={{ borderColor: "var(--app-border)" }}>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {item.link_path ? (
              <Link
                href={item.link_path}
                className={`${inboxFooterBtnClass} border bg-transparent btn-ghost text-[var(--app-text-muted)] hover:bg-[var(--app-surface-alt)]`}
                style={{ borderColor: "var(--app-border)" }}
              >
                Open integration
              </Link>
            ) : null}
            <button
              type="button"
              className={`${inboxFooterBtnClass} border bg-transparent btn-ghost text-sm`}
              style={{ borderColor: "var(--app-border)" }}
              disabled={staleFooterUi.submitting || staleFooterUi.pending}
              onClick={() => staleResolverRef.current?.markDoneOnly()}
            >
              {staleFooterUi.pending ? "Saving…" : "Mark done"}
            </button>
            <button
              type="button"
              className={`${inboxFooterBtnClass} btn-cta-dark inline-flex items-center gap-2 text-sm`}
              disabled={staleFooterUi.submitting || staleFooterUi.pending || !staleFooterUi.canSubmit}
              onClick={() => void staleResolverRef.current?.submitUpdate()}
            >
              {staleFooterUi.submitting ? <SubmitUpdateSpinner /> : null}
              {staleFooterUi.submitting ? "Saving…" : "Submit update"}
            </button>
          </div>
        </div>
      ) : item.rule_key === "forecast_review_reminder" ? null : item.rule_key === "variance_review" ||
        item.rule_key === "capacity_gaps" ? (
        <div className="shrink-0 border-t px-4 py-3" style={{ borderColor: "var(--app-border)" }}>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {item.link_path && item.rule_key === "capacity_gaps" ? (
              <Link href={item.link_path} className={`${inboxFooterBtnClass} btn-ghost text-sm`}>
                Open Forecast
              </Link>
            ) : null}
            <button
              type="button"
              className={`${inboxFooterBtnClass} btn-cta-dark text-sm`}
              disabled={pending}
              onClick={() => handleMarkDone()}
            >
              {pending ? "Saving…" : "Mark done"}
            </button>
          </div>
        </div>
      ) : (
        <div className="shrink-0 border-t px-4 py-3" style={{ borderColor: "var(--app-border)" }}>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {item.link_path ? (
              <Link href={item.link_path} className={`${inboxFooterBtnClass} btn-ghost text-sm`}>
                Open linked page
              </Link>
            ) : null}
            <button
              type="button"
              className={`${inboxFooterBtnClass} btn-cta-dark text-sm`}
              disabled={pending}
              onClick={() => handleMarkDone()}
            >
              {pending ? "Saving…" : "Mark done"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ActivitySummaryFooterActions({
  embed,
  summarizePanelRef,
  pending,
  onMarkDone,
}: {
  embed: SummarizeActivityEmbedUi;
  summarizePanelRef: RefObject<SummarizeActivityPanelHandle | null>;
  pending: boolean;
  onMarkDone: () => void;
}) {
  if (embed.summaryReady) {
    return (
      <button
        type="button"
        className={`${inboxFooterBtnClass} btn-cta-dark text-sm`}
        disabled={pending}
        onClick={onMarkDone}
      >
        {pending ? "Saving…" : "Mark done"}
      </button>
    );
  }
  if (embed.hasError) {
    return (
      <button
        type="button"
        className={`${inboxFooterBtnClass} border bg-transparent btn-ghost text-sm`}
        style={{ borderColor: "var(--app-border)" }}
        onClick={() => summarizePanelRef.current?.backToPicker()}
      >
        Back to options
      </button>
    );
  }
  if (embed.view === "result" && embed.generating) {
    return (
      <button type="button" className={`${inboxFooterBtnClass} btn-cta-dark cursor-not-allowed opacity-70`} disabled>
        Generating…
      </button>
    );
  }
  if (embed.view === "picker") {
    return (
      <button
        type="button"
        className={`${inboxFooterBtnClass} btn-cta-dark text-sm`}
        disabled={!embed.canSubmit}
        onClick={() => summarizePanelRef.current?.startGeneration()}
      >
        Generate summary
      </button>
    );
  }
  return (
    <button type="button" className={`${inboxFooterBtnClass} btn-cta-dark cursor-not-allowed opacity-70`} disabled>
      Generating…
    </button>
  );
}

function ActivitySummaryResolverBody({
  item,
  panelRef,
  onInboxActivityBar,
}: {
  item: HomeInboxItemRow;
  panelRef: RefObject<SummarizeActivityPanelHandle | null>;
  onInboxActivityBar: (s: InboxActivityBarState) => void;
}) {
  const projectIdParsed = useMemo(() => parseProjectOnlyLink(item.link_path), [item.link_path]);
  const structuralErr = projectIdParsed ? null : "Could not resolve this reminder.";
  const [brief, setBrief] = useState<{ id: string; customer_name: string } | null>(null);
  const [asyncErr, setAsyncErr] = useState<string | null>(null);

  useEffect(() => {
    if (structuralErr) {
      onInboxActivityBar({ kind: "blocked" });
      return;
    }
    if (!projectIdParsed) return;

    onInboxActivityBar({ kind: "loading" });
    let cancelled = false;
    void loadProjectBriefForOwner(projectIdParsed).then((res) => {
      if (cancelled) return;
      if (res.error) {
        setAsyncErr(res.error);
        onInboxActivityBar({ kind: "blocked" });
        return;
      }
      setBrief({ id: projectIdParsed, customer_name: res.customer_name ?? "Project" });
    });
    return () => {
      cancelled = true;
    };
  }, [projectIdParsed, structuralErr, onInboxActivityBar]);

  const handleEmbedUiChange = useCallback(
    (embed: SummarizeActivityEmbedUi) => {
      onInboxActivityBar({ kind: "ready", embed });
    },
    [onInboxActivityBar],
  );

  const displayErr = structuralErr ?? asyncErr;

  return (
    <div className="flex flex-col gap-4">
      {displayErr ? (
        <p className="text-sm" role="alert" style={{ color: "var(--app-danger)" }}>
          {displayErr}
        </p>
      ) : brief ? (
        <div className="min-h-0 flex-1">
          <SummarizeActivityPanel
            ref={panelRef}
            projectId={brief.id}
            projectCustomerName={brief.customer_name}
            variant="embedded"
            embedInbox
            onEmbedUiChange={handleEmbedUiChange}
          />
        </div>
      ) : (
        <p className="text-sm text-muted-canvas">Loading…</p>
      )}
    </div>
  );
}

function GenericResolverBody({ item }: { item: HomeInboxItemRow }) {
  return (
    <div className="flex flex-col gap-4">
      {item.body ? <p className="text-sm text-muted-canvas whitespace-pre-wrap">{item.body}</p> : null}
      {item.link_path ? (
        <p className="text-sm">
          <Link href={item.link_path} className="font-medium text-[var(--app-action)] underline">
            Open linked page
          </Link>
        </p>
      ) : null}
    </div>
  );
}

const StaleIntegrationResolverBody = forwardRef(function StaleIntegrationResolverBody(
  {
    item,
    onItemCompleted,
    onStaleFooterUiChange,
  }: {
    item: HomeInboxItemRow;
    onItemCompleted: (id: string) => void;
    onStaleFooterUiChange: (ui: StaleIntegrationFooterUi) => void;
  },
  ref: Ref<StaleIntegrationResolverHandle | null>,
) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const [asyncIntegrationErr, setAsyncIntegrationErr] = useState<string | null>(null);
  const [integrationRow, setIntegrationRow] = useState<SerializedProjectIntegrationRow | null>(null);
  const [draft, setDraft] = useState<IntegrationProvideUpdateDraft | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const parsedSt = useMemo(() => parseStaleIntegrationLink(item.link_path), [item.link_path]);
  const structuralErrSt = parsedSt ? null : "Could not resolve this integration.";

  useEffect(() => {
    if (!parsedSt) return;
    void loadHomeProjectIntegrationRows(parsedSt.projectId).then((res) => {
      if (res.error || !res.rows) {
        setAsyncIntegrationErr(res.error ?? "Failed to load integration.");
        return;
      }
      const row = res.rows.find((r) => r.id === parsedSt.projectIntegrationId) ?? null;
      if (!row) {
        setAsyncIntegrationErr("Integration was removed or not found.");
        return;
      }
      setIntegrationRow(row);
      setDraft(seedIntegrationDrafts([row])[row.id]);
    });
  }, [parsedSt]);

  const integrationDisplayErr = structuralErrSt ?? asyncIntegrationErr;

  useEffect(() => {
    onStaleFooterUiChange({
      submitting,
      pending,
      canSubmit: Boolean(integrationRow && draft && !integrationDisplayErr),
    });
  }, [onStaleFooterUiChange, submitting, pending, integrationRow, draft, integrationDisplayErr]);

  const handleSubmitUpdate = useCallback(async () => {
    if (!integrationRow || !draft || !parsedSt || submitting || pending) return;
    setSubmitting(true);
    setSubmitError(null);
    const showReason = draft.integration_state === "blocked" || draft.integration_state === "on_hold";
    const result = await submitProvideUpdateBatch(parsedSt.projectId, [
      {
        projectIntegrationId: integrationRow.id,
        delivery_progress: draft.delivery_progress,
        integration_state: draft.integration_state,
        integration_state_reason: showReason ? draft.integration_state_reason || null : null,
        update_body: draft.update_body,
      },
    ]);
    if (result.error) {
      setSubmitError(result.error);
      setSubmitting(false);
      return;
    }
    const doneRes = await markHomeInboxItemDone(item.id);
    if (doneRes.error) {
      setSubmitError(doneRes.error);
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    onItemCompleted(item.id);
    router.refresh();
  }, [draft, integrationRow, item.id, onItemCompleted, parsedSt, pending, router, submitting]);

  const handleMarkDoneOnly = useCallback(() => {
    startTransition(async () => {
      const res = await markHomeInboxItemDone(item.id);
      if (!res.error) {
        onItemCompleted(item.id);
        router.refresh();
      }
    });
  }, [item.id, onItemCompleted, router]);

  useImperativeHandle(
    ref,
    () => ({
      submitUpdate: () => {
        void handleSubmitUpdate();
      },
      markDoneOnly: () => {
        handleMarkDoneOnly();
      },
    }),
    [handleMarkDoneOnly, handleSubmitUpdate],
  );

  return (
    <div className="flex flex-col gap-4">
      {item.body ? <p className="text-sm text-muted-canvas whitespace-pre-wrap">{item.body}</p> : null}
      {integrationDisplayErr ? (
        <p className="text-sm" role="alert" style={{ color: "var(--app-danger)" }}>
          {integrationDisplayErr}
        </p>
      ) : integrationRow && draft ? (
        <IntegrationProvideUpdateFormFields
          integrationRow={integrationRow}
          draft={draft}
          onDraftChange={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))}
          submitError={submitError}
          hideIntegrationHeading
        />
      ) : (
        <p className="text-sm text-muted-canvas">Loading…</p>
      )}
    </div>
  );
});
StaleIntegrationResolverBody.displayName = "StaleIntegrationResolverBody";
