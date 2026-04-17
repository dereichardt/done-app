"use client";

import { saveProjectTimeline } from "@/lib/actions/projects";
import { getTimelinePhaseRowStatus } from "@/lib/project-phase-status";
import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";

export type ProjectTimelinePhase = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
};

type DraftRow = {
  clientKey: string;
  id?: string;
  name: string;
  start_date: string;
  end_date: string;
};

const rowBorder = { borderColor: "color-mix(in oklab, var(--app-border) 75%, transparent)" };

/** Pale tint for the current phase (`--app-info-surface` in globals.css); radii match `.card-canvas`. */
function currentPhaseRowBackgroundStyle(isFirst: boolean, isLast: boolean): CSSProperties {
  const radius = "var(--app-radius)";
  const style: CSSProperties = {
    backgroundColor: "var(--app-info-surface)",
  };
  if (isFirst) {
    style.borderTopLeftRadius = radius;
    style.borderTopRightRadius = radius;
  }
  if (isLast) {
    style.borderBottomLeftRadius = radius;
    style.borderBottomRightRadius = radius;
  }
  return style;
}

function toDraft(p: ProjectTimelinePhase): DraftRow {
  return {
    clientKey: p.id,
    id: p.id,
    name: p.name,
    start_date: p.start_date ?? "",
    end_date: p.end_date ?? "",
  };
}

function formatDateDisplay(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

export function ProjectTimeline({
  projectId,
  initialPhases,
  todayIso,
}: {
  projectId: string;
  initialPhases: ProjectTimelinePhase[];
  /** Calendar day (YYYY-MM-DD) from the server so row status matches the summary strip. */
  todayIso: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<DraftRow[]>(() => initialPhases.map(toDraft));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) {
      setRows(initialPhases.map(toDraft));
    }
  }, [initialPhases, editing]);

  function moveRow(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= rows.length) return;
    setRows((prev) => {
      const copy = [...prev];
      [copy[index], copy[next]] = [copy[next], copy[index]];
      return copy;
    });
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        clientKey:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `new-${Date.now()}`,
        name: "",
        start_date: "",
        end_date: "",
      },
    ]);
  }

  function updateRow(index: number, patch: Partial<Pick<DraftRow, "name" | "start_date" | "end_date">>) {
    setRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...patch };
      return copy;
    });
  }

  function handleCancel() {
    setRows(initialPhases.map(toDraft));
    setEditing(false);
    setError(null);
  }

  async function handleSave() {
    setError(null);
    const payload = rows.map((r) => ({
      id: r.id,
      name: r.name,
      start_date: r.start_date.trim() === "" ? null : r.start_date.trim(),
      end_date: r.end_date.trim() === "" ? null : r.end_date.trim(),
    }));

    setSaving(true);
    try {
      const result = await saveProjectTimeline(projectId, payload);
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const hasRows = rows.length > 0;

  return (
    <div>
      <div className="hover-reveal-edit flex items-center gap-2">
        <h2 className="section-heading">Timeline</h2>
        {!editing ? (
          <button
            type="button"
            className="hover-reveal-edit-btn cursor-pointer border bg-[var(--app-surface)] text-[var(--app-text-muted)]"
            style={{
              borderColor: "var(--app-border)",
            }}
            aria-label="Edit timeline"
            onClick={() => setEditing(true)}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-[18px] w-[18px]"
              aria-hidden
            >
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </button>
        ) : null}
      </div>
      <ul className="card-canvas mt-3 overflow-hidden p-0">
        {!editing && !hasRows ? (
          <li className="px-4 py-8 text-center text-sm text-muted-canvas">
            No phases for this project.
          </li>
        ) : null}
        {!editing && hasRows
          ? rows.map((row, rowIndex) => {
              const rowStatus = getTimelinePhaseRowStatus(todayIso, row.start_date || null, row.end_date || null);
              const isFirst = rowIndex === 0;
              const isLast = rowIndex === rows.length - 1;
              return (
                <li key={row.clientKey} className="border-t first:border-t-0" style={rowBorder}>
                  <div
                    className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-10"
                    style={
                      rowStatus.kind === "current" ? currentPhaseRowBackgroundStyle(isFirst, isLast) : undefined
                    }
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium leading-snug" style={{ color: "var(--app-text)" }}>
                        {row.name}
                      </p>
                      {rowStatus.kind !== "none" ? (
                        <p className="mt-1 text-xs text-muted-canvas">{rowStatus.label}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-end justify-end gap-4 sm:ml-auto sm:gap-5">
                      <div className="flex min-w-[7rem] flex-col items-end text-right text-xs text-muted-canvas">
                        <span>Start</span>
                        <span className="mt-0.5 text-sm tabular-nums" style={{ color: "var(--app-text)" }}>
                          {formatDateDisplay(row.start_date || null)}
                        </span>
                      </div>
                      <div className="flex min-w-[7rem] flex-col items-end text-right text-xs text-muted-canvas">
                        <span>End</span>
                        <span className="mt-0.5 text-sm tabular-nums" style={{ color: "var(--app-text)" }}>
                          {formatDateDisplay(row.end_date || null)}
                        </span>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })
          : null}
        {editing && rows.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-muted-canvas">
            No phases yet. Use &quot;Add phase&quot; below.
          </li>
        ) : null}
        {editing && rows.length > 0
          ? rows.map((row, index) => (
              <li key={row.clientKey} className="border-t first:border-t-0" style={rowBorder}>
                <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-10">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <div
                      className="flex shrink-0 flex-col gap-0.5"
                      role="group"
                      aria-label="Reorder phase"
                    >
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded border text-sm leading-none transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-35"
                        style={{
                          borderColor: "var(--app-border)",
                          color: "var(--app-text-muted)",
                          background: "var(--app-surface)",
                        }}
                        aria-label="Move phase up"
                        onClick={() => moveRow(index, -1)}
                        disabled={index === 0 || saving}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded border text-sm leading-none transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-35"
                        style={{
                          borderColor: "var(--app-border)",
                          color: "var(--app-text-muted)",
                          background: "var(--app-surface)",
                        }}
                        aria-label="Move phase down"
                        onClick={() => moveRow(index, 1)}
                        disabled={index === rows.length - 1 || saving}
                      >
                        ↓
                      </button>
                    </div>
                    <label className="flex min-w-0 flex-1 flex-col text-xs text-muted-canvas">
                      Phase name
                      <input
                        value={row.name}
                        onChange={(e) => updateRow(index, { name: e.target.value })}
                        className="input-canvas mt-0.5 py-1 text-sm"
                        placeholder="Phase name"
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap items-end justify-end gap-3 sm:ml-auto sm:shrink-0 sm:gap-4">
                    <label className="flex min-w-[9.5rem] flex-col items-end text-right text-xs text-muted-canvas">
                      Start
                      <input
                        type="date"
                        value={row.start_date}
                        onChange={(e) => updateRow(index, { start_date: e.target.value })}
                        className="input-canvas mt-0.5 w-full py-1 text-sm text-end"
                      />
                    </label>
                    <label className="flex min-w-[9.5rem] flex-col items-end text-right text-xs text-muted-canvas">
                      End
                      <input
                        type="date"
                        value={row.end_date}
                        onChange={(e) => updateRow(index, { end_date: e.target.value })}
                        className="input-canvas mt-0.5 w-full py-1 text-sm text-end"
                      />
                    </label>
                  </div>
                </div>
              </li>
            ))
          : null}
      </ul>

      {error ? (
        <p className="mt-3 text-sm" style={{ color: "var(--app-danger)" }} role="alert">
          {error}
        </p>
      ) : null}

      {editing ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className="btn-cta-dark whitespace-nowrap" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" className="btn-cta whitespace-nowrap text-xs" onClick={addRow} disabled={saving}>
            Add phase
          </button>
          <button type="button" className="btn-cta whitespace-nowrap text-xs" onClick={handleCancel} disabled={saving}>
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}
