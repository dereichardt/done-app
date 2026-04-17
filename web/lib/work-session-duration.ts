/** Live stopwatch for the work row: `mm:ss` until an hour elapses, then `h:mm:ss` (hours not zero-padded). */
export function formatElapsedTimerMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const s = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const m = totalMinutes % 60;
  const h = Math.floor(totalMinutes / 60);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  if (h > 0) return `${h}:${pad2(m)}:${pad2(s)}`;
  return `${pad2(m)}:${pad2(s)}`;
}

/** Round elapsed time to 15-minute bands: remainder under 4 min stays in lower band; 4+ min bumps up. */
export function roundDurationMsTo15MinBands(totalMs: number): number {
  const totalMinutes = Math.max(0, totalMs) / 60_000;
  const blocks = Math.floor(totalMinutes / 15);
  const remainder = totalMinutes - blocks * 15;
  const extra = remainder >= 4 ? 1 : 0;
  return (blocks + extra) * 15 * 60_000;
}

export function roundedMsToDurationHours(roundedMs: number): number {
  return roundedMs / 3_600_000;
}

/** Display e.g. 0.25 hr, 0.5 hr, 1 hr — one space before `hr`. */
export function formatRoundedHoursLabelFromRoundedMs(roundedMs: number): string {
  const h = roundedMs / 3_600_000;
  if (h === 0) return "0 hr";
  const s = Number.isInteger(h) ? String(h) : String(parseFloat(h.toFixed(2)));
  return `${s} hr`;
}

type ActivePauseParams = {
  startMs: number;
  endMs: number;
  pausedMsAccumulated: number;
  pauseStartedAtMs: number | null;
};

/**
 * Working time between `startMs` and `endMs`, excluding completed pauses and any in-progress pause
 * segment that ends at `endMs` (when still paused).
 */
export function activeSessionElapsedMs({
  startMs,
  endMs,
  pausedMsAccumulated,
  pauseStartedAtMs,
}: ActivePauseParams): number {
  const pauseOpen =
    pauseStartedAtMs != null && endMs > pauseStartedAtMs ? endMs - pauseStartedAtMs : 0;
  return Math.max(0, endMs - startMs - pausedMsAccumulated - pauseOpen);
}

/** Total paused ms through `atMs` (accumulated + open pause segment capped at `atMs`). Read-only display. */
export function totalPausedMsForDisplay({
  pausedMsAccumulated,
  pauseStartedAtMs,
  atMs,
}: {
  pausedMsAccumulated: number;
  pauseStartedAtMs: number | null;
  atMs: number;
}): number {
  const open =
    pauseStartedAtMs != null && atMs > pauseStartedAtMs ? atMs - pauseStartedAtMs : 0;
  return Math.max(0, pausedMsAccumulated + open);
}
