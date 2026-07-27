/** Dev-only timing logs for navigation performance work (no-op in production). */
export function devPerfLog(label: string, detail?: string) {
  if (process.env.NODE_ENV !== "development") return;
  const suffix = detail ? ` ${detail}` : "";
  console.log(`[perf] ${label}${suffix}`);
}

export function devPerfDuration(label: string, startedAt: number) {
  if (process.env.NODE_ENV !== "development") return;
  console.log(`[perf] ${label}: ${(performance.now() - startedAt).toFixed(1)}ms`);
}
