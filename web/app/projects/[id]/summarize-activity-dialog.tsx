"use client";

import { DialogCloseButton } from "@/components/dialog-close-button";
import { loadRecentProjectSummaries } from "@/lib/actions/project-summaries";
import {
  SUMMARY_EXPIRY_DAYS,
  type ProjectSummaryRecord,
  type SummaryRangePreset,
} from "@/lib/project-summaries";
import { summaryMarkdownToSafeHtml } from "@/lib/project-summary-markdown";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type DialogView = "picker" | "result";

type ActiveSummary = {
  rangeStart: string | null;
  rangeEnd: string | null;
  eventCount: number | null;
  text: string;
  done: boolean;
  error: string | null;
};

const EMPTY_ACTIVE: ActiveSummary = {
  rangeStart: null,
  rangeEnd: null,
  eventCount: null,
  text: "",
  done: false,
  error: null,
};

const PRESET_OPTIONS: { value: SummaryRangePreset; label: string; description: string }[] = [
  { value: "7d", label: "Last 7 days", description: "Activity in the past week" },
  { value: "30d", label: "Last 30 days", description: "Activity in the past month" },
  {
    value: "since_last_summary",
    label: "Since last summary",
    description: "Picks up where the most recent summary left off",
  },
  { value: "custom", label: "Custom range", description: "Choose your own start and end dates" },
];

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatRangeLabel(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const sameYear = start.getFullYear() === end.getFullYear();
  const endFmt = sameYear
    ? fmt(end)
    : end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${fmt(start)} – ${endFmt}`;
}

function formatGeneratedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatActivitiesIncludedLabel(count: number): string {
  if (count === 1) return "1 activity included";
  return `${count} activities included`;
}

function toDateInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateInputToStartOfDayIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function dateInputToEndOfDayIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(`${value}T23:59:59.999`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SummarizeActivityDialog({
  projectId,
  projectCustomerName,
  onClose,
}: {
  projectId: string;
  projectCustomerName: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [view, setView] = useState<DialogView>("picker");
  const [preset, setPreset] = useState<SummaryRangePreset>("7d");
  const today = useMemo(() => new Date(), []);
  const [customStart, setCustomStart] = useState<string>(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 14);
    return toDateInputValue(d.toISOString());
  });
  const [customEnd, setCustomEnd] = useState<string>(() => toDateInputValue(today.toISOString()));

  const [history, setHistory] = useState<ProjectSummaryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  const [active, setActive] = useState<ActiveSummary>(EMPTY_ACTIVE);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  // Open the native dialog once on mount, close cleanly on unmount.
  useEffect(() => {
    dialogRef.current?.showModal();
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Load history whenever the picker view is visible.
  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    const res = await loadRecentProjectSummaries(projectId);
    setHistoryLoading(false);
    if (!res.ok) {
      setHistoryError(res.error);
      return;
    }
    setHistory(res.summaries);
  }, [projectId]);

  useEffect(() => {
    if (view === "picker") void refreshHistory();
  }, [view, refreshHistory]);

  const handleDialogClose = () => {
    abortRef.current?.abort();
    onClose();
  };

  const closeDialog = () => {
    dialogRef.current?.close();
  };

  const startGeneration = useCallback(async () => {
    setGenerating(true);
    setCopied(false);
    setActive({ ...EMPTY_ACTIVE });
    setView("result");

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const body: {
      preset: SummaryRangePreset;
      customStart?: string;
      customEnd?: string;
    } = { preset };

    if (preset === "custom") {
      const startIso = dateInputToStartOfDayIso(customStart);
      const endIso = dateInputToEndOfDayIso(customEnd);
      if (!startIso || !endIso || new Date(endIso) <= new Date(startIso)) {
        setActive({
          ...EMPTY_ACTIVE,
          done: true,
          error: "Pick a start date before the end date.",
        });
        setGenerating(false);
        return;
      }
      body.customStart = startIso;
      body.customEnd = endIso;
    }

    try {
      const res = await fetch(`/api/projects/${projectId}/summaries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        let message = `Request failed (${res.status})`;
        try {
          const json = (await res.json()) as { error?: string };
          if (json.error) message = json.error;
        } catch {
          /* response body wasn't JSON — keep the default message */
        }
        setActive((prev) => ({ ...prev, done: true, error: message }));
        return;
      }

      const rangeStart = res.headers.get("X-Range-Start");
      const rangeEnd = res.headers.get("X-Range-End");
      const eventCountHeader = res.headers.get("X-Event-Count");
      const eventCount = eventCountHeader ? Number.parseInt(eventCountHeader, 10) : null;
      setActive((prev) => ({
        ...prev,
        rangeStart,
        rangeEnd,
        eventCount: Number.isFinite(eventCount) ? eventCount : null,
      }));

      if (!res.body) {
        setActive((prev) => ({ ...prev, done: true, error: "Empty response from server." }));
        return;
      }

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let accumulated = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        accumulated += value;
        setActive((prev) => ({ ...prev, text: accumulated }));
      }
      setActive((prev) => ({ ...prev, done: true }));
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // User cancelled or dialog closed — no UI feedback needed.
        return;
      }
      const message = err instanceof Error ? err.message : "Unexpected error";
      setActive((prev) => ({ ...prev, done: true, error: message }));
    } finally {
      setGenerating(false);
    }
  }, [customEnd, customStart, preset, projectId]);

  const handleBackToPicker = () => {
    abortRef.current?.abort();
    setView("picker");
    setActive(EMPTY_ACTIVE);
    setCopied(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(active.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Clipboard can fail in unfocused tabs / insecure contexts; silently skip. */
    }
  };

  const canSubmit = useMemo(() => {
    if (preset !== "custom") return true;
    const startIso = dateInputToStartOfDayIso(customStart);
    const endIso = dateInputToEndOfDayIso(customEnd);
    return Boolean(startIso && endIso && new Date(endIso) > new Date(startIso));
  }, [customEnd, customStart, preset]);

  return (
    <dialog
      ref={dialogRef}
      className="app-catalog-dialog fixed left-1/2 top-1/2 z-[200] -translate-x-1/2 -translate-y-1/2 overflow-hidden border-0 p-0 shadow-xl w-[min(100vw-2rem,42rem)] max-w-[calc(100vw-2rem)]"
      style={{
        borderRadius: "12px",
        background: "var(--app-surface)",
        color: "var(--app-text)",
        height: "min(92dvh, 44rem)",
        maxHeight: "min(92dvh, 52rem)",
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
            <h2 className="text-base font-medium" style={{ color: "var(--app-text)" }}>
              Summarize activity
            </h2>
            <p
              className="mt-0.5 text-sm truncate"
              style={{ color: "var(--app-text-muted)" }}
            >
              {projectCustomerName}
            </p>
          </div>
          <DialogCloseButton onClick={closeDialog} />
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {view === "picker" ? (
            <PickerView
              preset={preset}
              onPresetChange={setPreset}
              customStart={customStart}
              customEnd={customEnd}
              onCustomStartChange={setCustomStart}
              onCustomEndChange={setCustomEnd}
              history={history}
              historyLoading={historyLoading}
              historyError={historyError}
              expandedHistoryId={expandedHistoryId}
              onToggleHistory={(id) =>
                setExpandedHistoryId((prev) => (prev === id ? null : id))
              }
            />
          ) : (
            <ResultView active={active} generating={generating} />
          )}
        </div>

        {/* Footer */}
        <div
          className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t px-4 py-3"
          style={{ borderColor: "var(--app-border)" }}
        >
          {view === "picker" ? (
            <>
              <button type="button" className="btn-cta text-xs" onClick={closeDialog}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-cta-dark"
                onClick={startGeneration}
                disabled={!canSubmit}
              >
                Generate summary
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn-cta text-xs" onClick={handleBackToPicker}>
                Back
              </button>
              <button
                type="button"
                className="btn-cta text-xs"
                onClick={handleCopy}
                disabled={!active.done || !active.text || !!active.error}
              >
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                type="button"
                className="btn-cta-dark"
                onClick={startGeneration}
                disabled={generating}
              >
                {generating ? "Generating…" : "Regenerate"}
              </button>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}

// ---------------------------------------------------------------------------
// Picker view
// ---------------------------------------------------------------------------

function PickerView({
  preset,
  onPresetChange,
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
  history,
  historyLoading,
  historyError,
  expandedHistoryId,
  onToggleHistory,
}: {
  preset: SummaryRangePreset;
  onPresetChange: (next: SummaryRangePreset) => void;
  customStart: string;
  customEnd: string;
  onCustomStartChange: (next: string) => void;
  onCustomEndChange: (next: string) => void;
  history: ProjectSummaryRecord[];
  historyLoading: boolean;
  historyError: string | null;
  expandedHistoryId: string | null;
  onToggleHistory: (id: string) => void;
}) {
  return (
    <div className="p-4">
      <fieldset className="flex flex-col gap-2">
        <legend
          className="mb-2 text-xs font-medium uppercase tracking-wide"
          style={{ color: "var(--app-text-muted)" }}
        >
          Time frame
        </legend>
        {PRESET_OPTIONS.map((opt) => {
          const selected = opt.value === preset;
          return (
            <label
              key={opt.value}
              className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors"
              style={{
                borderColor: selected ? "var(--app-text)" : "var(--app-border)",
                background: selected ? "var(--app-surface-alt)" : "var(--app-surface)",
              }}
            >
              <input
                type="radio"
                name="summary-range"
                value={opt.value}
                checked={selected}
                onChange={() => onPresetChange(opt.value)}
                className="mt-0.5"
                style={{ accentColor: "var(--app-text)" }}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span
                  className="text-sm font-medium"
                  style={{ color: "var(--app-text)" }}
                >
                  {opt.label}
                </span>
                <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>
                  {opt.description}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {preset === "custom" ? (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "var(--app-text-muted)" }}>
            Start date
            <input
              type="date"
              className="input-canvas"
              value={customStart}
              max={customEnd || undefined}
              onChange={(e) => onCustomStartChange(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "var(--app-text-muted)" }}>
            End date
            <input
              type="date"
              className="input-canvas"
              value={customEnd}
              min={customStart || undefined}
              onChange={(e) => onCustomEndChange(e.target.value)}
            />
          </label>
        </div>
      ) : null}

      <div className="mt-6">
        <div className="flex items-baseline justify-between gap-2">
          <h3
            className="text-xs font-medium uppercase tracking-wide"
            style={{ color: "var(--app-text-muted)" }}
          >
            Recent summaries
          </h3>
          <span className="text-[11px]" style={{ color: "var(--app-text-muted)" }}>
            Kept for {SUMMARY_EXPIRY_DAYS} days
          </span>
        </div>

        {historyError ? (
          <p className="mt-2 text-sm" style={{ color: "var(--app-danger)" }}>
            {historyError}
          </p>
        ) : historyLoading ? (
          <p className="mt-2 text-sm" style={{ color: "var(--app-text-muted)" }}>
            Loading history…
          </p>
        ) : history.length === 0 ? (
          <p className="mt-2 text-sm" style={{ color: "var(--app-text-muted)" }}>
            No summaries yet for this project.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {history.map((s) => {
              const expanded = expandedHistoryId === s.id;
              return (
                <li
                  key={s.id}
                  className="rounded-lg border"
                  style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}
                >
                  <button
                    type="button"
                    onClick={() => onToggleHistory(s.id)}
                    aria-expanded={expanded}
                    className="flex w-full cursor-pointer flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-[var(--app-surface-alt)]"
                  >
                    <span className="text-sm font-medium" style={{ color: "var(--app-text)" }}>
                      {formatRangeLabel(s.rangeStart, s.rangeEnd)}
                    </span>
                    <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>
                      {formatGeneratedAt(s.generatedAt)} · {formatActivitiesIncludedLabel(s.eventCount)}
                    </span>
                  </button>
                  {expanded ? (
                    <div
                      className="border-t px-3 py-3"
                      style={{ borderColor: "var(--app-border)" }}
                    >
                      <SummaryBody markdown={s.body} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Renders stored or streamed summary Markdown as sanitized HTML. */
function SummaryBody({ markdown }: { markdown: string }) {
  const html = useMemo(() => summaryMarkdownToSafeHtml(markdown), [markdown]);
  if (!html) return null;
  return (
    <div
      className="project-summary-body text-sm leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_strong]:font-semibold [&_a]:font-medium [&_a]:text-[var(--app-action)] [&_a]:underline"
      style={{ color: "var(--app-text)" }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ---------------------------------------------------------------------------
// Result view
// ---------------------------------------------------------------------------

function ResultView({
  active,
  generating,
}: {
  active: ActiveSummary;
  generating: boolean;
}) {
  if (active.error) {
    return (
      <div className="p-4">
        <p className="text-sm" style={{ color: "var(--app-danger)" }}>
          {active.error}
        </p>
      </div>
    );
  }

  const headingRange =
    active.rangeStart && active.rangeEnd
      ? formatRangeLabel(active.rangeStart, active.rangeEnd)
      : null;

  return (
    <div className="flex flex-col gap-3 p-4">
      {headingRange ? (
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-medium" style={{ color: "var(--app-text)" }}>
            {headingRange}
          </p>
          <p className="text-xs" style={{ color: "var(--app-text-muted)" }}>
            {formatActivitiesIncludedLabel(active.eventCount ?? 0)}
          </p>
        </div>
      ) : null}

      {!active.text && generating ? (
        <p className="text-sm" style={{ color: "var(--app-text-muted)" }}>
          Reading activity and drafting summary…
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          <SummaryBody markdown={active.text} />
          {generating ? (
            <span className="inline-flex items-center text-sm" style={{ color: "var(--app-text)" }}>
              <StreamingCaret />
            </span>
          ) : null}
        </div>
      )}

      {active.done && !active.error ? (
        <p className="mt-2 text-[11px]" style={{ color: "var(--app-text-muted)" }}>
          Generated by AI · saved for {SUMMARY_EXPIRY_DAYS} days.
        </p>
      ) : null}
    </div>
  );
}

function StreamingCaret() {
  return (
    <span
      aria-hidden
      className="ms-0.5 inline-block h-[1em] w-[2px] animate-pulse align-[-2px] motion-reduce:animate-none"
      style={{ background: "var(--app-text-muted)" }}
    />
  );
}
