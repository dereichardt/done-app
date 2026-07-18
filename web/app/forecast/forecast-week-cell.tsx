"use client";

import {
  useCallback,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { LockIcon, UndoIcon } from "@/components/action-icons";

const BAR_MAX_PX = 100;
/**
 * Hours that fill a forecast week bar to capacity (target weekly load).
 * May become a user setting later.
 */
export const TARGET_WEEKLY_FORECAST_HOURS = 32;
/** Portfolio “All projects” bar: full height at this load. */
export const PORTFOLIO_BAR_MAX_HOURS = 42;
/** Portfolio load above this uses warning (pale yellow) instead of success green. */
export const PORTFOLIO_OVERLOAD_HOURS = 40;

function barHeightPx(hours: number, scaleHours: number, maxPx = BAR_MAX_PX): number {
  const scale = Math.max(1, scaleHours);
  if (hours <= 0) return 4;
  return Math.min(maxPx, Math.max(8, Math.round((hours / scale) * maxPx)));
}

function capacityBarFillClass(hours: number): string {
  if (hours > PORTFOLIO_OVERLOAD_HOURS) {
    return "bg-[color-mix(in_oklab,var(--app-warning)_75%,transparent)]";
  }
  if (hours >= TARGET_WEEKLY_FORECAST_HOURS) {
    return "bg-[color-mix(in_oklab,var(--app-success)_75%,transparent)]";
  }
  return "bg-[color-mix(in_oklab,var(--app-text)_22%,transparent)]";
}

const WHOLE_HOURS_INPUT_RE = /^\d+$/;

function normalizeHoursInput(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "";
  const match = trimmed.match(/^(\d+)/);
  return match?.[1] ?? "";
}

function parseWholeHoursInput(value: string): number | null {
  if (!WHOLE_HOURS_INPUT_RE.test(value)) return null;
  return Number(value);
}

export function ForecastWeekCell({
  hours,
  editable,
  locked = false,
  lockState = "unlocked",
  lockable = false,
  lockPending = false,
  lockLabel,
  cellId,
  barScaleHours = TARGET_WEEKLY_FORECAST_HOURS,
  /**
   * Portfolio capacity chrome: scale to {@link PORTFOLIO_BAR_MAX_HOURS}, draw a
   * target line at {@link TARGET_WEEKLY_FORECAST_HOURS}, tint grey / green / yellow.
   */
  capacityTint = false,
  /** Session-start hours for this cell (edit session only). */
  sessionBaselineHours = null,
  onRevertToSession,
  saving = false,
  saveError = null,
  onCommitHours,
  onNavigateWeek,
  onToggleLock,
}: {
  hours: number;
  editable: boolean;
  /** Past / out-of-window weeks that cannot be edited. */
  locked?: boolean;
  /** User-controlled project-week state; mixed is used by the portfolio total. */
  lockState?: "unlocked" | "locked" | "mixed";
  lockable?: boolean;
  lockPending?: boolean;
  lockLabel?: string;
  /** Stable id for cross-cell focus (`projectId:rowKey:week`). */
  cellId?: string;
  /** Hours that fill the bar to max height (defaults to {@link TARGET_WEEKLY_FORECAST_HOURS}). */
  barScaleHours?: number;
  capacityTint?: boolean;
  sessionBaselineHours?: number | null;
  onRevertToSession?: () => void;
  saving?: boolean;
  saveError?: string | null;
  onCommitHours: (next: number) => void;
  onNavigateWeek?: (direction: -1 | 1) => void;
  onToggleLock?: () => void;
}) {
  const [text, setText] = useState(String(hours));
  const [previewHours, setPreviewHours] = useState<number | null>(null);
  const [sourceHours, setSourceHours] = useState(hours);
  const dragRef = useRef<{ startY: number; startHours: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const draggedRef = useRef(false);

  if (hours !== sourceHours) {
    setSourceHours(hours);
    setText(String(hours));
    setPreviewHours(null);
  }

  const displayHours = previewHours ?? hours;
  const scaleHours = capacityTint ? PORTFOLIO_BAR_MAX_HOURS : barScaleHours;
  const visualBarMaxPx = lockable && !capacityTint ? 84 : BAR_MAX_PX;
  const fillPx = barHeightPx(displayHours, scaleHours, visualBarMaxPx);
  const targetLineBottomPx = Math.round(
    (TARGET_WEEKLY_FORECAST_HOURS / PORTFOLIO_BAR_MAX_HOURS) * BAR_MAX_PX,
  );

  const commit = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.round(next));
      setPreviewHours(null);
      onCommitHours(clamped);
    },
    [onCommitHours],
  );

  function onPointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!editable) return;
    e.preventDefault();
    draggedRef.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startHours: hours };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!editable || !dragRef.current) return;
    const dy = dragRef.current.startY - e.clientY;
    if (Math.abs(dy) >= 3) draggedRef.current = true;
    const deltaHours = Math.round(dy / 4);
    const next = Math.max(0, dragRef.current.startHours + deltaHours);
    setPreviewHours(next);
    setText(String(next));
  }

  function onPointerUp(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!dragRef.current) return;
    const dy = dragRef.current.startY - e.clientY;
    const deltaHours = Math.round(dy / 4);
    const next = Math.max(0, dragRef.current.startHours + deltaHours);
    const didDrag = draggedRef.current;
    dragRef.current = null;
    draggedRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (didDrag) {
      commit(next);
    } else {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }

  function onBarKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (!editable) return;
    if (e.key === "ArrowUp") {
      e.preventDefault();
      commit(hours + 1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      commit(Math.max(0, hours - 1));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      onNavigateWeek?.(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      onNavigateWeek?.(1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }

  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const parsed = parseWholeHoursInput(text);
      const base = parsed ?? hours;
      commit(base + 1);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const parsed = parseWholeHoursInput(text);
      const base = parsed ?? hours;
      commit(Math.max(0, base - 1));
      return;
    }
    if (e.key === "ArrowLeft" && (e.currentTarget.selectionStart ?? 0) === 0) {
      e.preventDefault();
      onNavigateWeek?.(-1);
      return;
    }
    if (
      e.key === "ArrowRight" &&
      (e.currentTarget.selectionStart ?? 0) >= e.currentTarget.value.length
    ) {
      e.preventDefault();
      onNavigateWeek?.(1);
    }
  }

  const originalHours = sessionBaselineHours ?? hours;
  const userLocked = lockState === "locked";
  const hasUserLock = lockState !== "unlocked";
  const sessionChanged =
    !hasUserLock &&
    sessionBaselineHours != null &&
    Math.round(displayHours) !== Math.round(sessionBaselineHours);
  const inputInvalid =
    text.length === 0 || (text.length > 0 && parseWholeHoursInput(text) === null);

  const shellClass = sessionChanged
    ? "rounded-md border border-[color-mix(in_oklab,var(--app-info)_50%,var(--app-border))] bg-[color-mix(in_oklab,var(--app-info-surface)_65%,var(--app-surface))] px-1.5 py-1"
    : userLocked
      ? "rounded-md border border-[var(--app-border)] bg-[var(--app-surface-alt)] px-1.5 py-1"
      : lockState === "mixed"
        ? "rounded-md border border-dashed border-[var(--app-border)] bg-[color-mix(in_oklab,var(--app-surface-alt)_65%,var(--app-surface))] px-1.5 py-1"
        : locked
      ? "rounded-md border border-transparent px-1.5 py-1 opacity-60"
      : "rounded-md border border-transparent px-1.5 py-1";

  const editableBarFillClass = sessionChanged
    ? "bg-[var(--app-info)] hover:bg-[color-mix(in_oklab,var(--app-info)_88%,var(--app-action))]"
    : editable
      ? "bg-[color-mix(in_oklab,var(--app-action)_75%,transparent)] hover:bg-[var(--app-action)]"
      : locked || hasUserLock
        ? "bg-[color-mix(in_oklab,var(--app-text)_12%,transparent)]"
        : "bg-[color-mix(in_oklab,var(--app-text)_18%,transparent)]";

  const capacityTone =
    displayHours > PORTFOLIO_OVERLOAD_HOURS
      ? "overload"
      : displayHours >= TARGET_WEEKLY_FORECAST_HOURS
        ? "at-target"
        : "below-target";

  return (
    <div
      className={`group relative flex h-[168px] min-w-[4.5rem] flex-col items-center justify-end gap-0.5 ${shellClass}`}
      data-forecast-cell={cellId}
      onClick={() => {
        if (!editable) return;
        inputRef.current?.focus();
        inputRef.current?.select();
      }}
    >
      {lockable && !locked && onToggleLock ? (
        <button
          type="button"
          aria-label={lockLabel ?? (userLocked ? "Unlock forecast week" : "Lock forecast week")}
          aria-pressed={lockState === "mixed" ? "mixed" : userLocked}
          disabled={lockPending}
          title={lockLabel}
          className={`absolute left-1/2 top-1 z-[2] inline-flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full text-[var(--app-text-muted)] transition-opacity hover:bg-[var(--app-surface-muted-solid)] hover:text-[var(--app-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color-mix(in_oklab,var(--app-text)_35%,transparent)] disabled:cursor-wait disabled:opacity-60 ${
            hasUserLock
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          }`}
          onClick={(event) => {
            event.stopPropagation();
            onToggleLock();
          }}
        >
          {userLocked ? (
            <>
              <span className="inline-flex group-hover:hidden group-focus-within:hidden">
                <LockIcon size={16} />
              </span>
              <span className="hidden group-hover:inline-flex group-focus-within:inline-flex">
                <LockIcon size={16} open />
              </span>
            </>
          ) : (
            <LockIcon size={16} />
          )}
        </button>
      ) : null}

      {capacityTint ? (
        <div
          className="relative w-7 shrink-0"
          style={{ height: BAR_MAX_PX }}
          role="img"
          aria-label={
            capacityTone === "overload"
              ? `Portfolio ${displayHours} hours (above ${PORTFOLIO_OVERLOAD_HOURS}h)`
              : capacityTone === "at-target"
                ? `Portfolio ${displayHours} hours (at or above ${TARGET_WEEKLY_FORECAST_HOURS}h target)`
                : `Portfolio ${displayHours} hours (below ${TARGET_WEEKLY_FORECAST_HOURS}h target)`
          }
        >
          <div
            className="absolute inset-0 rounded-sm bg-[color-mix(in_oklab,var(--app-text)_8%,transparent)]"
            aria-hidden
          />
          <div
            className={`absolute inset-x-0 bottom-0 rounded-sm ${capacityBarFillClass(displayHours)}`}
            style={{ height: fillPx }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-x-[-2px] z-[1] h-px bg-[var(--app-text-muted)]"
            style={{ bottom: targetLineBottomPx }}
            title={`${TARGET_WEEKLY_FORECAST_HOURS}h target`}
            aria-hidden
          />
        </div>
      ) : (
        <div
          className="flex flex-col items-center justify-end"
          style={{ height: visualBarMaxPx + 8 }}
        >
          <button
            type="button"
            disabled={!editable}
            aria-label={
              locked || userLocked
                ? `Forecast ${displayHours} hours (locked)`
                : `Forecast ${displayHours} hours. Drag to adjust, or click to type.`
            }
            aria-valuenow={displayHours}
            aria-valuemin={0}
            role="slider"
            tabIndex={editable ? 0 : -1}
            title={
              userLocked
                ? "This project week is locked"
                : locked
                  ? "Past weeks are locked"
                  : undefined
            }
            className={`relative w-7 cursor-ns-resize rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)] disabled:cursor-default ${editableBarFillClass}`}
            style={{ height: fillPx }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onBarKeyDown}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {editable ? (
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={inputInvalid}
          className={`input-canvas w-14 px-1 py-0.5 text-center text-xs tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
            inputInvalid
              ? "border-[var(--app-danger)] focus:border-[var(--app-danger)] focus:shadow-[inset_0_0_0_1px_var(--app-danger)]"
              : ""
          }`}
          value={text}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setText(normalizeHoursInput(e.target.value))}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => {
            const parsed = parseWholeHoursInput(text);
            if (parsed === null) {
              setText(String(hours));
              return;
            }
            if (parsed !== hours) commit(parsed);
            else setText(String(hours));
          }}
          onKeyDown={onInputKeyDown}
        />
      ) : (
        <span
          className="text-xs tabular-nums text-[var(--app-text)]"
          title={
            userLocked
              ? "This project week is locked"
              : locked
                ? "Past weeks are locked"
                : undefined
          }
        >
          {hours}
        </span>
      )}

      {capacityTint ? null : (
        <div
          className="flex h-[22px] w-full items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          {saving ? (
          <span className="text-[10px] font-medium text-[var(--app-text-muted)]" role="status">
            Saving…
          </span>
        ) : saveError ? (
          <span
            className="text-[10px] font-medium text-[var(--app-danger)]"
            role="alert"
            title={saveError}
          >
            Error
          </span>
        ) : sessionChanged && onRevertToSession ? (
          <div className="flex items-center gap-1">
            <span className="text-[10px] tabular-nums text-[var(--app-text-muted)]">
              <span className="opacity-70">{originalHours}</span>
              {" → "}
              <span className="font-medium text-[var(--app-text)]">{displayHours}</span>
            </span>
            <button
              type="button"
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[var(--app-action)] hover:bg-[var(--app-surface-alt)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color-mix(in_oklab,var(--app-text)_35%,transparent)]"
              title={`Undo change (${originalHours} → ${displayHours})`}
              aria-label={`Undo change, restore ${originalHours} hours`}
              onClick={onRevertToSession}
            >
              <UndoIcon size={12} />
            </button>
          </div>
        ) : (
          <span className="invisible text-[10px]" aria-hidden>
            —
          </span>
          )}
        </div>
      )}
    </div>
  );
}
