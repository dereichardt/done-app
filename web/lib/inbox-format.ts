/** Shared inbox timestamp formatting (list + detail views). */
import type { HomeInboxItemRow } from "@/lib/home-inbox-rules";

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

/** Project subtitle for stale-integration rows (metadata, then body fallback). */
export function staleIntegrationProjectName(item: HomeInboxItemRow): string | null {
  if (item.rule_key !== "stale_integration") return null;
  const fromMeta = item.metadata?.project_name;
  if (typeof fromMeta === "string" && fromMeta.trim()) return fromMeta.trim();
  const body = item.body ?? "";
  const m = body.match(/\son\s(.+)\.\s*$/);
  if (m?.[1]?.trim()) return m[1].trim();
  return null;
}
