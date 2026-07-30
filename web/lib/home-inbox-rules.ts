/**
 * Home inbox: server-side rule engine (`syncHomeInboxRules`) inserts rows into
 * `home_inbox_items` with idempotent `(owner_id, dedupe_key)`.
 *
 * | `rule_key` | When it runs | Settings / inputs |
 * |------------|----------------|-------------------|
 * | `forecast_review_reminder` | On the user’s **forecast review day** (weekday), once per week | `UserPreferences.forecast_review_day` |
 * | `variance_review` | Same day as forecast review | last 4 completed weeks snapshot |
 * | `capacity_gaps` | Same day as forecast review | weeks +4…+8 vs 32h capacity target |
 *
 * Per-project trigger overrides are not implemented yet (future: optional overrides + `metadata`).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadUserPreferences } from "@/lib/actions/user-preferences";
import {
  capacityGapWeekStarts,
  synthesizeCapacityGaps,
} from "@/lib/home-capacity-gaps";
import {
  loadHomeActualsVsForecast,
  variancePercentLabel,
} from "@/lib/home-actuals-vs-forecast";
import { formatEffortHoursLabel } from "@/lib/integration-effort-buckets";
import { currentSundayWeekYmd } from "@/lib/project-forecast";
import {
  WEEKDAY_VALUES,
  getUserTodayIso,
  type WeekdayValue,
} from "@/lib/user-preferences";

/** Legacy operational rules removed from generation; soft-dismissed on sync. */
const LEGACY_OPERATIONAL_RULE_KEYS = ["stale_integration", "activity_summary_reminder"] as const;

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
  metadata?: Record<string, unknown> | null;
};

const INBOX_LIST_COLUMNS =
  "id, rule_key, dedupe_key, title, body, link_path, status, created_at, read_at, metadata";
const INBOX_LIST_COLUMNS_LEGACY =
  "id, rule_key, dedupe_key, title, body, link_path, status, created_at, read_at";
const INBOX_LIST_COLUMNS_LEGACY_NO_READ =
  "id, rule_key, dedupe_key, title, body, link_path, status, created_at";

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

function isMetadataColumnMissingError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  if (msg.includes("metadata")) {
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

type InboxInsert = {
  rule_key: string;
  dedupe_key: string;
  title: string;
  body: string | null;
  link_path: string;
  metadata?: Record<string, unknown> | null;
};

export async function persistHomeInboxItems(
  supabase: SupabaseClient,
  ownerId: string,
  inserts: InboxInsert[],
): Promise<void> {
  const payloads = inserts.map((row) => {
    const payload: Record<string, unknown> = {
      owner_id: ownerId,
      rule_key: row.rule_key,
      dedupe_key: row.dedupe_key,
      title: row.title,
      body: row.body,
      link_path: row.link_path,
      status: "open",
      resolved_at: null,
    };
    if (row.metadata != null) {
      payload.metadata = row.metadata;
    }
    return payload;
  });

  if (payloads.length === 0) return;

  const write = () =>
    supabase
      .from("home_inbox_items")
      .upsert(payloads, {
        onConflict: "owner_id,dedupe_key",
        ignoreDuplicates: true,
      });

  const { error } = await write();
  if (isMetadataColumnMissingError(error)) {
    for (const payload of payloads) delete payload.metadata;
    const retry = await write();
    if (retry.error) {
      console.error("[home-inbox] batch upsert failed", retry.error);
    }
  } else if (error) {
    console.error("[home-inbox] batch upsert failed", error);
  }
}

async function dismissLegacyOperationalInboxItems(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<void> {
  const { error } = await supabase
    .from("home_inbox_items")
    .update({ status: "dismissed", resolved_at: new Date().toISOString() })
    .eq("owner_id", ownerId)
    .eq("status", "open")
    .in("rule_key", [...LEGACY_OPERATIONAL_RULE_KEYS]);

  if (error) {
    console.error("[home-inbox] dismiss legacy operational items failed", error);
  }
}

/**
 * Upserts deterministic inbox rows for the signed-in user. Call from Home RSC
 * with a server Supabase client (RLS as the user). See file-level table for
 * `rule_key` meanings and settings linkage.
 */
export async function syncHomeInboxRules(
  supabase: SupabaseClient,
  ownerId: string,
  _now: Date = new Date(),
): Promise<void> {
  await dismissLegacyOperationalInboxItems(supabase, ownerId);

  const prefsRes = await loadUserPreferences();
  const tz = prefsRes.preferences.timezone;
  const todayYmd = getUserTodayIso(tz);
  const todayName = todayWeekdayName(todayYmd);
  const weekMon = mondayYmdOfWeekContaining(todayYmd);
  const currentSunday = currentSundayWeekYmd(todayYmd);

  if (todayName !== prefsRes.preferences.forecast_review_day) {
    return;
  }

  const { data: projects } = await supabase
    .from("projects")
    .select("id, customer_name")
    .eq("owner_id", ownerId)
    .is("completed_at", null);

  const projectIds = (projects ?? []).map((p) => p.id);

  const inserts: InboxInsert[] = [];

  inserts.push({
    rule_key: "forecast_review_reminder",
    dedupe_key: `forecast_review_reminder:${weekMon}`,
    title: "Review forecast for the next 4 weeks",
    body: "Adjust project-level forecast hours for the coming weeks. Current week is shown for context.",
    link_path: "/forecast",
  });

  const variance = await loadHomeActualsVsForecast(supabase, ownerId, todayYmd);
  const prior = variance.priorWeek;
  const priorLabel = variancePercentLabel(prior.forecast, prior.variance);
  const trendWeeks = variance.weeks.slice(-5, -1); // last 4 completed weeks before this week
  let trendBlurb = "No 4-week trend yet.";
  if (trendWeeks.length > 0) {
    const parts = trendWeeks.map((w) => {
      const totals = variance.projects.reduce(
        (acc, p) => {
          const t = p.byWeek[w];
          return {
            forecast: acc.forecast + (t?.forecast ?? 0),
            actual: acc.actual + (t?.actual ?? 0),
          };
        },
        { forecast: 0, actual: 0 },
      );
      const v = totals.forecast - totals.actual;
      const lbl = variancePercentLabel(totals.forecast, v) ?? "n/a";
      return lbl;
    });
    trendBlurb = `4-week trend: ${parts.join(" → ")}.`;
  }

  const priorBody =
    prior.forecast > 0 || prior.actual > 0
      ? `Last week: ${formatEffortHoursLabel(prior.forecast)} forecast vs ${formatEffortHoursLabel(prior.actual)} actual${priorLabel ? ` (${priorLabel})` : ""}. ${trendBlurb}`
      : `No last-week forecast/actuals yet. ${trendBlurb}`;

  inserts.push({
    rule_key: "variance_review",
    dedupe_key: `variance_review:${weekMon}`,
    title: "Review last 4 weeks’ variance",
    body: priorBody,
    link_path: "/home",
    metadata: {
      priorWeek: prior,
      trendWeekStarts: trendWeeks,
      thisWeek: variance.thisWeek,
    },
  });

  const gapWeeks = capacityGapWeekStarts(currentSunday);
  const gapStart = gapWeeks[0]!;
  const gapEnd = gapWeeks[gapWeeks.length - 1]!;
  const { data: forecastInitiatives } = await supabase
    .from("internal_initiatives")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("include_in_forecast", true)
    .is("completed_at", null);
  const initiativeIds = (forecastInitiatives ?? []).map((row) => row.id as string);
  const [{ data: hoursRows }, { data: initiativeHoursRows }] = await Promise.all([
    projectIds.length === 0
      ? Promise.resolve({ data: [] as Array<{ week_start_date: string; hours: number }> })
      : supabase
          .from("project_forecast_hours")
          .select("week_start_date, hours")
          .in("project_id", projectIds)
          .gte("week_start_date", gapStart)
          .lte("week_start_date", gapEnd),
    initiativeIds.length === 0
      ? Promise.resolve({ data: [] as Array<{ week_start_date: string; hours: number }> })
      : supabase
          .from("initiative_forecast_hours")
          .select("week_start_date, hours")
          .in("initiative_id", initiativeIds)
          .gte("week_start_date", gapStart)
          .lte("week_start_date", gapEnd),
  ]);

  const weekHours: Record<string, number> = {};
  for (const w of gapWeeks) weekHours[w] = 0;
  for (const row of [...(hoursRows ?? []), ...(initiativeHoursRows ?? [])]) {
    const week = String(row.week_start_date).slice(0, 10);
    if (!(week in weekHours)) continue;
    weekHours[week] = (weekHours[week] ?? 0) + Math.max(0, Math.round(Number(row.hours) || 0));
  }

  const synthesis = synthesizeCapacityGaps({ weekHours, weekStarts: gapWeeks });
  inserts.push({
    rule_key: "capacity_gaps",
    dedupe_key: `capacity_gaps:${weekMon}`,
    title: "Upcoming capacity gaps",
    body: synthesis.body,
    link_path: "/forecast",
    metadata: {
      weeks: synthesis.weeks,
      freeHoursPerWeek: synthesis.freeHoursPerWeek,
      freeStartingWeek: synthesis.freeStartingWeek,
    },
  });

  await persistHomeInboxItems(supabase, ownerId, inserts);
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

  if (err && isMetadataColumnMissingError(err)) {
    const second = await supabase
      .from("home_inbox_items")
      .select(INBOX_LIST_COLUMNS_LEGACY)
      .eq("owner_id", ownerId)
      .eq("status", "open")
      .order("created_at", { ascending: false });
    err = second.error;
    rows = (second.data ?? []) as Record<string, unknown>[];
  }

  if (err && isReadAtColumnMissingError(err)) {
    const third = await supabase
      .from("home_inbox_items")
      .select(INBOX_LIST_COLUMNS_LEGACY_NO_READ)
      .eq("owner_id", ownerId)
      .eq("status", "open")
      .order("created_at", { ascending: false });
    err = third.error;
    rows = (third.data ?? []) as Record<string, unknown>[];
  }

  if (err) {
    logSupabaseError("[home-inbox] list failed", err);
    return [];
  }
  const rank = (rule: string) => {
    if (rule === "forecast_review_reminder") return 0;
    if (rule === "variance_review") return 1;
    if (rule === "capacity_gaps") return 2;
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
    metadata: (r.metadata as Record<string, unknown> | null | undefined) ?? null,
  }));

  return [...normalized].sort((a, b) => {
    const ra = rank(a.rule_key);
    const rb = rank(b.rule_key);
    if (ra !== rb) return ra - rb;
    return b.created_at.localeCompare(a.created_at);
  });
}
