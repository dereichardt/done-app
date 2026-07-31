export const ACTIVE_WORK_SESSION_CHANGED_EVENT = "activeWorkSession:changed";

export type ActiveWorkSessionChangedDetail = {
  /** When true, listeners should clear local UI without refetching (optimistic discard/finish). */
  cleared?: boolean;
};

/** Notify the shell header (and any other listeners) that the user's active work session changed. */
export function notifyActiveWorkSessionChanged(detail?: ActiveWorkSessionChangedDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ACTIVE_WORK_SESSION_CHANGED_EVENT, { detail }));
}
