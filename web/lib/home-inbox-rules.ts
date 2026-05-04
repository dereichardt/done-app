/**
 * Home inbox: server-side rule engine (`syncHomeInboxRules`) inserts rows into
 * `home_inbox_items` with idempotent `(owner_id, dedupe_key)`.
 *
 * | `rule_key` | When it runs | Settings / inputs |
 * |------------|----------------|-------------------|
 * | `stale_integration` | No `integration_latest_updates` (or PI `created_at`) signal in the last 7 days | Not settings-gated; evaluated for every active project integration. |
 * | `activity_summary_reminder` | On the user’s **activity summary day** (weekday), if that project has no `project_summaries` row whose `generated_at` falls in the current Mon–Sun calendar week (user TZ) | `UserPreferences.activity_summary_day` |
 * | `forecast_review_reminder` | On the user’s **forecast review day** (weekday), once per week (`dedupe_key` uses week Monday) | `UserPreferences.forecast_review_day` |
 *
 * Per-project trigger overrides are not implemented yet (future: optional overrides + `metadata`).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadUserPreferences } from "@/lib/actions/user-preferences";
import {
  formatIntegrationDefinitionDisplayName,
} from "@/lib/integration-metadata";
import {
  WEEKDAY_VALUES,
  getUserTodayIso,
  type WeekdayValue,
} from "@/lib/user-preferences";

type NarrowInteg = {
  integration_code: string | null;
  integrating_with: string | null;
  name: string | null;
  direction: string | null;
} | null;

function weekdayMon0FromYmd(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return 0;
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return (js + 6) % 7;
}

function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  return t.toISOString().slice(0, 10);
}

function todayWeekdayName(todayYmd: string): WeekdayValue {
  const mon0 = weekdayMon0FromYmd(todayYmd);
  return WEEKDAY_VALUES[mon0];
}

function mondayYmdOfWeekContaining(todayYmd: string): string {
  const mon0 = weekdayMon0FromYmd(todayYmd);
  return addDaysYmd(todayYmd, -mon0);
}

function sundayYmdOfWeekContaining(todayYmd: string): string {
  return addDaysYmd(mondayYmdOfWeekContaining(todayYmd), 6);
}

function summaryGeneratedYmdInTz(iso: string, timeZone: string | null): string {
  const tz = timeZone ?? "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(iso));
    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    /* fall through */
  }
  return new Date(iso).toISOString().slice(0, 10);
}

function ymdInInclusiveRange(ymd: string, start: string, end: string): boolean {
  return ymd >= start && ymd <= end;
}

export type HomeInboxItemRow = {
  id: string;
  rule_key: string;
  dedupe_key: string;
  title: string;
  body: string | null;
  link_path: string | null;
  status: string;
  created_at: string;
  /** Null until the user opens the item in the inbox (master–detail). */
  read_at: string | null;
};

const INBOX_LIST_COLUMNS =
  "id, rule_key, dedupe_key, title, body, link_path, status, created_at, read_at";
const INBOX_LIST_COLUMNS_LEGACY = "id, rule_key, dedupe_key, title, body, link_path, status, created_at";

function logSupabaseError(context: string, error: unknown): void {
  if (error && typeof error === "object") {
    const e = error as { message?: string; code?: string; details?: string; hint?: string };
    console.error(context, {
      message: e.message,
      code: e.code,
      details: e.details,
      hint: e.hint,
    });
  } else {
    console.error(context, error);
  }
}

/** True when Postgres/PostgREST rejects `read_at` (migration not applied on this DB). */
function isReadAtColumnMissingError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  if (msg.includes("read_at")) {
    if (
      msg.includes("does not exist") ||
      msg.includes("undefined column") ||
      msg.includes("could not find") ||
      error.code === "42703"
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Upserts deterministic inbox rows for the signed-in user. Call from Home RSC
 * with a server Supabase client (RLS as the user). See file-level table for
 * `rule_key` meanings and settings linkage.
 */
export async function syncHomeInboxRules(
  supabase: SupabaseClient,
  ownerId: string,
  now: Date = new Date(),
): Promise<void> {
  const prefsRes = await loadUserPreferences();
  const tz = prefsRes.preferences.timezone;
  const todayYmd = getUserTodayIso(tz);
  const todayName = todayWeekdayName(todayYmd);
  const weekMon = mondayYmdOfWeekContaining(todayYmd);
  const weekSun = sundayYmdOfWeekContaining(todayYmd);

  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: projects } = await supabase
    .from("projects")
    .select("id, customer_name")
    .eq("owner_id", ownerId)
    .is("completed_at", null);

  const projectIds = (projects ?? []).map((p) => p.id);
  const projectNameById = new Map<string, string>();
  for (const p of projects ?? []) {
    projectNameById.set(p.id, ((p.customer_name ?? "").trim() || "Untitled project"));
  }

  if (projectIds.length === 0) return;

  const { data: piRows, error: piErr } = await supabase
    .from("project_integrations")
    .select(
      `
      id,
      project_id,
      created_at,
      integrations (
        integration_code,
        integrating_with,
        name,
        direction
      )
    `,
    )
    .in("project_id", projectIds);

  if (piErr) {
    console.error("[home-inbox] project_integrations load failed", piErr);
    return;
  }

  const piIds = (piRows ?? []).map((r) => r.id);
  const { data: latestRows } =
    piIds.length === 0
      ? { data: [] as { project_integration_id: string; created_at: string }[] }
      : await supabase
          .from("integration_latest_updates")
          .select("project_integration_id, created_at")
          .in("project_integration_id", piIds);

  const latestAtByPi = new Map<string, string>();
  for (const row of latestRows ?? []) {
    if (row.project_integration_id && row.created_at) {
      latestAtByPi.set(row.project_integration_id, row.created_at);
    }
  }

  const inserts: {
    rule_key: string;
    dedupe_key: string;
    title: string;
    body: string | null;
    link_path: string;
  }[] = [];

  for (const row of piRows ?? []) {
    const createdAt = row.created_at as string;
    const latestAt = latestAtByPi.get(row.id) ?? null;
    const lastSignal = latestAt ?? createdAt;
    if (lastSignal >= sevenDaysAgo) continue;

    const integ = row.integrations as unknown as NarrowInteg;
    const displayName =
      formatIntegrationDefinitionDisplayName({
        integration_code: integ?.integration_code ?? null,
        integrating_with: integ?.integrating_with ?? null,
        name: integ?.name ?? null,
        direction: integ?.direction ?? null,
      }).trim() || "integration";

    const dedupe_key = `stale_integration:${row.id}:${weekMon}`;
    const link_path = `/projects/${row.project_id}/integrations/${row.id}`;
    inserts.push({
      rule_key: "stale_integration",
      dedupe_key,
      title: `Integration ${displayName} requires an update`,
      body: `No update has been recorded for at least 7 days for ${displayName} on ${projectNameById.get(row.project_id) ?? "this project"}.`,
      link_path,
    });
  }

  if (todayName === prefsRes.preferences.activity_summary_day) {
    for (const pid of projectIds) {
      const { data: summaries } = await supabase
        .from("project_summaries")
        .select("generated_at")
        .eq("project_id", pid)
        .eq("owner_id", ownerId)
        .order("generated_at", { ascending: false })
        .limit(40);

      const hasSummaryThisWeek = (summaries ?? []).some((s) => {
        const ymd = summaryGeneratedYmdInTz(s.generated_at as string, tz);
        return ymdInInclusiveRange(ymd, weekMon, weekSun);
      });

      if (!hasSummaryThisWeek) {
        const dedupe_key = `activity_summary_reminder:${weekMon}:${pid}`;
        inserts.push({
          rule_key: "activity_summary_reminder",
          dedupe_key,
          title: `Summarize activity for ${projectNameById.get(pid) ?? "project"}`,
          body: "Generate an activity summary for the current week.",
          link_path: `/projects/${pid}`,
        });
      }
    }
  }

  if (todayName === prefsRes.preferences.forecast_review_day) {
    const dedupe_key = `forecast_review_reminder:${weekMon}`;
    inserts.push({
      rule_key: "forecast_review_reminder",
      dedupe_key,
      title: "Review workload and planning",
      body: "Review your tasks and time on Work; adjust planning as needed.",
      link_path: "/work",
    });
  }

  for (const row of inserts) {
    const { error } = await supabase.from("home_inbox_items").insert({
      owner_id: ownerId,
      rule_key: row.rule_key,
      dedupe_key: row.dedupe_key,
      title: row.title,
      body: row.body,
      link_path: row.link_path,
      status: "open",
      resolved_at: null,
    });
    if (error && error.code !== "23505") {
      console.error("[home-inbox] insert failed", error, row.dedupe_key);
    }
  }
}

export async function loadOpenHomeInboxItems(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<HomeInboxItemRow[]> {
  const first = await supabase
    .from("home_inbox_items")
    .select(INBOX_LIST_COLUMNS)
    .eq("owner_id", ownerId)
    .eq("status", "open")
    .order("created_at", { ascending: false });

  let rows: Record<string, unknown>[] = (first.data ?? []) as Record<string, unknown>[];
  let err = first.error;

  if (err && isReadAtColumnMissingError(err)) {
    const second = await supabase
      .from("home_inbox_items")
      .select(INBOX_LIST_COLUMNS_LEGACY)
      .eq("owner_id", ownerId)
      .eq("status", "open")
      .order("created_at", { ascending: false });
    err = second.error;
    rows = (second.data ?? []) as Record<string, unknown>[];
  }

  if (err) {
    logSupabaseError("[home-inbox] list failed", err);
    return [];
  }
  const rank = (rule: string) => {
    if (rule === "stale_integration") return 0;
    if (rule === "activity_summary_reminder") return 1;
    if (rule === "forecast_review_reminder") return 2;
    return 3;
  };
  const normalized: HomeInboxItemRow[] = rows.map((r) => ({
    id: r.id as string,
    rule_key: r.rule_key as string,
    dedupe_key: r.dedupe_key as string,
    title: r.title as string,
    body: (r.body as string | null) ?? null,
    link_path: (r.link_path as string | null) ?? null,
    status: r.status as string,
    created_at: r.created_at as string,
    read_at: (r.read_at as string | null | undefined) ?? null,
  }));

  return [...normalized].sort((a, b) => {
    const ra = rank(a.rule_key);
    const rb = rank(b.rule_key);
    if (ra !== rb) return ra - rb;
    return b.created_at.localeCompare(a.created_at);
  });
}
