/** Build stable, copyable timesheet bullets locally without external services. */
export function timesheetFallbackBullets(lines: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of lines) {
    const t = raw.trim().replace(/\s+/g, " ");
    if (!t) continue;
    const dedupeKey = t.toLocaleLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push(`- ${t.length > 160 ? `${t.slice(0, 157)}…` : t}`);
    if (out.length >= 5) break;
  }
  return out.length > 0 ? out : ["- (no detail logged)"];
}
