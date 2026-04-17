"use client";

import { CanvasArrowRightIcon } from "@/components/canvas-arrow-icons";
import { EditIcon, TrashIcon } from "@/components/action-icons";
import { DialogCloseButton } from "@/components/dialog-close-button";
import {
  createIntegrationUpdate,
  deleteIntegrationUpdate,
  updateIntegrationUpdate,
} from "@/lib/actions/integration-updates";
import {
  formatIntegrationUpdateWhen,
  integrationUpdateBubbleBoxClass,
} from "@/lib/integration-update-display";

export { formatIntegrationUpdateWhen };
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { flushSync } from "react-dom";

export type IntegrationUpdateRow = {
  id: string;
  body: string;
  created_at: string;
  updated_at: string;
};

const MAX = 300;
const RECENT_COUNT = 5;

const integrationUpdateRowListClass =
  "mt-1 min-h-0 flex-1 list-none overflow-y-auto overscroll-contain flex flex-col gap-2.5";

const integrationUpdateRowListModalClass = "list-none flex flex-col gap-2.5";

const integrationUpdateRowBubbleClass = `group relative ${integrationUpdateBubbleBoxClass}`;

const dialogBaseClass =
  "app-catalog-dialog fixed left-1/2 top-1/2 z-[200] max-h-[min(92dvh,52rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden border-0 p-0 shadow-xl";

/** Cap composer growth at 8rem; then scroll inside. */
const COMPOSER_MAX_HEIGHT_PX = 128;

function syncComposerTextareaHeight(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  const h = Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT_PX);
  el.style.height = `${h}px`;
  el.style.overflowY = el.scrollHeight > COMPOSER_MAX_HEIGHT_PX ? "auto" : "hidden";
}

/** Same `project · integration` line as `WorkSessionFinishModalHeader` in the tasks panel. */
function projectIntegrationModalSubtitle(projectLabel: string, integrationLabel: string): string {
  const show = (s: string) => (s.trim().length > 0 ? s.trim() : "—");
  return `${show(projectLabel)} · ${show(integrationLabel)}`;
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
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export function IntegrationUpdatesPanel({
  projectIntegrationId,
  projectLabel = "",
  integrationDisplayTitle,
  updates,
  className = "",
}: {
  projectIntegrationId: string;
  /** Project customer name; shown in the “All updates” dialog subtitle (matches finish-session modal). */
  projectLabel?: string;
  /** Integration display line; paired with `projectLabel` in the dialog subtitle. */
  integrationDisplayTitle: string;
  updates: IntegrationUpdateRow[];
  className?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const draftTextareaRef = useRef<HTMLTextAreaElement>(null);
  const allUpdatesDialogRef = useRef<HTMLDialogElement>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);

  const [createError, setCreateError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLen, setDraftLen] = useState(0);
  const [createPending, setCreatePending] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<IntegrationUpdateRow | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [allUpdatesModalOpen, setAllUpdatesModalOpen] = useState(false);

  const recentFive = useMemo(() => updates.slice(0, RECENT_COUNT), [updates]);

  useEffect(() => {
    if (editingId && !updates.some((u) => u.id === editingId)) {
      setEditingId(null);
    }
  }, [updates, editingId]);

  const handleDraftChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setDraftLen(e.target.value.length);
    syncComposerTextareaHeight(e.target);
  }, []);

  useLayoutEffect(() => {
    syncComposerTextareaHeight(draftTextareaRef.current);
  }, []);

  return (
    <div className={`card-canvas flex h-full min-h-0 flex-col overflow-hidden p-3 ${className}`.trim()}>
      <form
        ref={formRef}
        className="flex shrink-0 flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);
          setCreatePending(true);
          setCreateError(null);
          void (async () => {
            const res = await createIntegrationUpdate(projectIntegrationId, fd);
            setCreatePending(false);
            if (res.error) {
              setCreateError(res.error);
              return;
            }
            form.reset();
            setDraftLen(0);
            requestAnimationFrame(() => syncComposerTextareaHeight(draftTextareaRef.current));
          })();
        }}
      >
        <div className="flex flex-col gap-0.5">
          <div className="input-canvas input-canvas--shell flex min-h-[2.25rem] items-center gap-2 py-1.5 pl-3 pr-2">
            <textarea
              ref={draftTextareaRef}
              name="body"
              required
              maxLength={MAX}
              rows={1}
              className="max-h-32 min-h-[1.25rem] min-w-0 flex-1 resize-none overflow-x-hidden break-words border-0 bg-transparent py-0.5 text-sm leading-snug outline-none ring-0 placeholder:text-muted-canvas"
              style={{ color: "var(--app-text)" }}
              placeholder="Share your update"
              aria-label="Share your update"
              onChange={handleDraftChange}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" && !ev.shiftKey) {
                  ev.preventDefault();
                  formRef.current?.requestSubmit();
                }
              }}
            />
            <button
              type="submit"
              disabled={createPending}
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border text-[#f3f5f8] shadow-sm transition-[background-color,border-color,opacity] hover:enabled:bg-[color-mix(in_oklab,#1f2937_90%,#f3f5f8_10%)] hover:enabled:border-[color-mix(in_oklab,#4b5563_55%,#f3f5f8_12%)] disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                borderColor: "color-mix(in oklab, #1f2937 78%, #4b5563 22%)",
                background: "#1f2937",
              }}
              aria-label="Submit update"
            >
              {createPending ? <SubmitSpinner /> : <CanvasArrowRightIcon />}
            </button>
          </div>
          <div className="flex justify-end pr-0.5">
            <span className="text-xs tabular-nums text-muted-canvas">
              {draftLen}/{MAX}
            </span>
          </div>
        </div>
        {createError ? (
          <p className="text-sm" style={{ color: "var(--app-danger)" }} role="alert">
            {createError}
          </p>
        ) : null}
      </form>

      <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between gap-2">
          <h3 className="text-sm font-semibold" style={{ color: "var(--app-text-muted)" }}>
            Last 5 Updates
          </h3>
          {updates.length > 0 ? (
            <button
              type="button"
              className="btn-cta-tertiary shrink-0 whitespace-nowrap"
              onClick={() => {
                setEditingId(null);
                setAllUpdatesModalOpen(true);
                allUpdatesDialogRef.current?.showModal();
              }}
            >
              View All Updates
            </button>
          ) : null}
        </div>
        {updates.length === 0 ? (
          <p className="mt-1 min-h-0 flex-1 text-sm text-muted-canvas">No updates yet.</p>
        ) : (
          <ul className={integrationUpdateRowListClass}>
            {recentFive.map((row) => (
              <li
                key={row.id}
                className={integrationUpdateRowBubbleClass}
              >
                {editingId === row.id && !allUpdatesModalOpen ? (
                  <InlineEditRow
                    row={row}
                    onCancel={() => setEditingId(null)}
                    onSaved={() => setEditingId(null)}
                  />
                ) : (
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <time
                        className="min-w-0 truncate text-xs text-muted-canvas"
                        dateTime={row.created_at}
                      >
                        {formatIntegrationUpdateWhen(row.created_at)}
                      </time>
                      <div className="flex shrink-0 gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border bg-[var(--app-surface)] text-muted-canvas transition-colors hover:bg-[var(--app-surface-alt)] hover:text-[var(--app-text)]"
                          style={{ borderColor: "var(--app-border)" }}
                          aria-label="Edit update"
                          onClick={() => setEditingId(row.id)}
                        >
                          <EditIcon size={14} />
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border bg-[var(--app-surface)] text-muted-canvas transition-colors hover:bg-[var(--app-surface-alt)] hover:text-[var(--app-danger)]"
                          style={{ borderColor: "var(--app-border)" }}
                          aria-label="Delete update"
                          onClick={() => {
                            flushSync(() => {
                              setDeleteTarget(row);
                              setDeleteError(null);
                            });
                            deleteDialogRef.current?.showModal();
                          }}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                    <p
                      className="mt-1 whitespace-pre-wrap break-words text-sm leading-snug"
                      style={{ color: "var(--app-text)" }}
                    >
                      {row.body}
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <dialog
        ref={allUpdatesDialogRef}
        className={`${dialogBaseClass} h-[min(92dvh,52rem)] w-[min(100vw-2rem,42rem)] max-w-[calc(100vw-2rem)]`}
        style={{
          borderRadius: "12px",
          background: "var(--app-surface)",
          color: "var(--app-text)",
        }}
        onClose={() => {
          setAllUpdatesModalOpen(false);
          setEditingId(null);
        }}
      >
        <div className="flex h-full min-h-0 max-h-full flex-col">
          <div
            className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3"
            style={{ borderColor: "var(--app-border)" }}
          >
            <div className="min-w-0 flex-1 pr-2">
              <h2
                className="flex flex-wrap items-baseline gap-x-2 text-base font-semibold"
                style={{ color: "var(--app-text)" }}
              >
                <span>All updates</span>
                <span className="text-sm font-medium tabular-nums text-muted-canvas">
                  ({updates.length})
                </span>
              </h2>
              <p
                className="mt-0.5 truncate text-sm text-muted-canvas"
                title={projectIntegrationModalSubtitle(projectLabel, integrationDisplayTitle)}
              >
                {projectIntegrationModalSubtitle(projectLabel, integrationDisplayTitle)}
              </p>
            </div>
            <DialogCloseButton onClick={() => allUpdatesDialogRef.current?.close()} />
          </div>
          <div
            className="min-h-0 flex-1 overflow-y-auto p-4"
            style={{ background: "var(--app-surface)" }}
          >
            {updates.length === 0 ? (
              <p className="text-sm text-muted-canvas">No updates yet.</p>
            ) : (
              <ul className={integrationUpdateRowListModalClass}>
                {updates.map((row) => (
                  <li
                    key={row.id}
                    className={integrationUpdateRowBubbleClass}
                  >
                    {editingId === row.id ? (
                      <InlineEditRow
                        row={row}
                        onCancel={() => setEditingId(null)}
                        onSaved={() => setEditingId(null)}
                      />
                    ) : (
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center justify-between gap-2">
                          <time
                            className="min-w-0 truncate text-xs text-muted-canvas"
                            dateTime={row.created_at}
                          >
                            {formatIntegrationUpdateWhen(row.created_at)}
                          </time>
                          <div className="flex shrink-0 gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border bg-[var(--app-surface)] text-muted-canvas transition-colors hover:bg-[var(--app-surface-alt)] hover:text-[var(--app-text)]"
                              style={{ borderColor: "var(--app-border)" }}
                              aria-label="Edit update"
                              onClick={() => setEditingId(row.id)}
                            >
                              <EditIcon size={14} />
                            </button>
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border bg-[var(--app-surface)] text-muted-canvas transition-colors hover:bg-[var(--app-surface-alt)] hover:text-[var(--app-danger)]"
                              style={{ borderColor: "var(--app-border)" }}
                              aria-label="Delete update"
                              onClick={() => {
                                flushSync(() => {
                                  setDeleteTarget(row);
                                  setDeleteError(null);
                                });
                                deleteDialogRef.current?.showModal();
                              }}
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        </div>
                        <p
                          className="mt-1 whitespace-pre-wrap break-words text-sm leading-snug"
                          style={{ color: "var(--app-text)" }}
                        >
                          {row.body}
                        </p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </dialog>

      <dialog
        ref={deleteDialogRef}
        className={`${dialogBaseClass} w-[min(100vw-2rem,26rem)] max-w-[calc(100vw-2rem)] p-0`}
        style={{
          borderRadius: "12px",
          background: "var(--app-surface)",
          color: "var(--app-text)",
        }}
        onClose={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
      >
        <div className="flex flex-col gap-4 p-5">
          <h2 className="text-base font-semibold" style={{ color: "var(--app-text)" }}>
            Delete this update?
          </h2>
          {deleteTarget ? (
            <p
              className="max-h-24 overflow-y-auto whitespace-pre-wrap break-words text-sm text-muted-canvas"
              style={{ color: "var(--app-text-muted)" }}
            >
              {deleteTarget.body}
            </p>
          ) : null}
          {deleteError ? (
            <p className="text-sm" style={{ color: "var(--app-danger)" }} role="alert">
              {deleteError}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="btn-ghost text-sm"
              disabled={deletePending}
              onClick={() => deleteDialogRef.current?.close()}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-[var(--app-radius)] px-3 py-2 text-sm font-medium disabled:opacity-50"
              style={{ background: "var(--app-danger)", color: "var(--app-surface)" }}
              disabled={deletePending || !deleteTarget}
              onClick={() => {
                const id = deleteTarget?.id;
                if (!id) return;
                setDeletePending(true);
                setDeleteError(null);
                void (async () => {
                  const res = await deleteIntegrationUpdate(id);
                  setDeletePending(false);
                  if (res.error) {
                    setDeleteError(res.error);
                    return;
                  }
                  setEditingId((prev) => (prev === id ? null : prev));
                  deleteDialogRef.current?.close();
                })();
              }}
            >
              {deletePending ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}

function InlineEditRow({
  row,
  onCancel,
  onSaved,
}: {
  row: IntegrationUpdateRow;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [len, setLen] = useState(row.body.length);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setPending(true);
        setError(null);
        void (async () => {
          const res = await updateIntegrationUpdate(row.id, fd);
          setPending(false);
          if (res.error) {
            setError(res.error);
            return;
          }
          onSaved();
        })();
      }}
    >
      <textarea
        name="body"
        required
        maxLength={MAX}
        rows={4}
        className="input-canvas min-h-[5rem] w-full resize-y"
        defaultValue={row.body}
        onChange={(e) => setLen(e.target.value.length)}
        autoFocus
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-canvas">
          {len}/{MAX}
        </span>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost text-xs" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
          <button type="submit" disabled={pending} className="btn-cta-dark text-xs">
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      {error ? (
        <p className="text-sm" style={{ color: "var(--app-danger)" }} role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
