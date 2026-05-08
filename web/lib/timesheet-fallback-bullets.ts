/** Shared with `/api/work/timesheet-cell-summary` — immediate copyable bullets before AI returns. */
export function timesheetFallbackBullets(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) continue;
    out.push(`- ${t.length > 160 ? `${t.slice(0, 157)}…` : t}`);
    if (out.length >= 5) break;
  }
  return out.length > 0 ? out : ["- (no detail logged)"];
}
