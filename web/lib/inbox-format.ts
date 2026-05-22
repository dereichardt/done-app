/** Shared inbox timestamp formatting (list + detail views). */
export function formatInboxTimestamp(iso: string, timeZone: string | null): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const tz = timeZone?.trim() || undefined;
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  }
}
