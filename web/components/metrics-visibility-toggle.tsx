"use client";

/**
 * Sliding-pill toggle — visual language matches the Meeting/Task and Day/Week/Month
 * toggles in `integration-effort-section.tsx`. Two segments: "On Hover" / "Show".
 */

export const ROW_METRICS_PROJECTS_STORAGE_KEY = "done-app-projects-summary-always";
export const ROW_METRICS_INITIATIVES_STORAGE_KEY = "done-app-initiatives-summary-always";

const listenersByKey = new Map<string, Set<() => void>>();

export function readRowMetricsAlwaysFromStorage(storageKey: string): boolean {
  try {
    const v = localStorage.getItem(storageKey);
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

export function subscribeRowMetricsAlways(storageKey: string, onStoreChange: () => void): () => void {
  let set = listenersByKey.get(storageKey);
  if (!set) {
    set = new Set();
    listenersByKey.set(storageKey, set);
  }
  set.add(onStoreChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === storageKey || e.key === null) onStoreChange();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    set!.delete(onStoreChange);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

function notifyRowMetricsListeners(storageKey: string) {
  for (const cb of listenersByKey.get(storageKey) ?? []) cb();
}

export function toggleRowMetricsAlways(storageKey: string) {
  const next = !readRowMetricsAlwaysFromStorage(storageKey);
  try {
    localStorage.setItem(storageKey, next ? "1" : "0");
  } catch {
    /* ignore */
  }
  notifyRowMetricsListeners(storageKey);
}

export function MetricsVisibilityToggle({
  showAlways,
  onToggle,
  ariaLabel = "Row metrics visibility",
}: {
  showAlways: boolean;
  onToggle: () => void;
  /** Optional override when multiple toggles exist on one page. */
  ariaLabel?: string;
}) {
  const segWidth = 88; // px per segment — fits "On Hover" on a single line
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-canvas">Metrics</span>
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="relative inline-flex overflow-visible rounded-[10px] border"
        style={{ borderColor: "var(--app-border)", background: "var(--app-surface-alt)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-y-px left-0 z-[1] rounded-[10px]"
          style={{
            width: segWidth,
            transform: `translateX(${showAlways ? segWidth : 0}px)`,
            transition: "transform 180ms cubic-bezier(0.2, 0, 0.2, 1)",
            background: "#1f2937",
            boxShadow: "0 0 0 2px color-mix(in oklab, var(--app-border) 70%, white)",
          }}
        />
        <button
          type="button"
          role="tab"
          aria-selected={!showAlways}
          className={[
            "relative z-[2] inline-flex h-8 items-center justify-center whitespace-nowrap px-3 text-center text-xs transition-colors cursor-pointer rounded-l-[10px]",
            !showAlways
              ? "font-semibold text-[#f3f5f8]"
              : "font-normal text-muted-canvas hover:text-[var(--app-text)]",
          ].join(" ")}
          style={{ width: segWidth }}
          onClick={() => {
            if (showAlways) onToggle();
          }}
        >
          On Hover
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={showAlways}
          className={[
            "relative z-[2] inline-flex h-8 items-center justify-center whitespace-nowrap px-3 text-center text-xs transition-colors cursor-pointer rounded-r-[10px]",
            showAlways
              ? "font-semibold text-[#f3f5f8]"
              : "font-normal text-muted-canvas hover:text-[var(--app-text)]",
          ].join(" ")}
          style={{ width: segWidth }}
          onClick={() => {
            if (!showAlways) onToggle();
          }}
        >
          Show
        </button>
      </div>
    </div>
  );
}
