import { z } from "zod";

import { formatIntegrationDefinitionDisplayName } from "@/lib/integration-metadata";
import { loadProjectActivity } from "@/lib/project-activity";
import {
  SUMMARY_RANGE_PRESETS,
  buildDeterministicProjectReport,
  resolveSummaryRange,
  type SummaryRangePreset,
} from "@/lib/project-summaries";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const BodySchema = z
  .object({
    preset: z.enum(SUMMARY_RANGE_PRESETS),
    customStart: z.string().datetime().optional(),
    customEnd: z.string().datetime().optional(),
  })
  .refine(
    (v) =>
      v.preset !== "custom" || (typeof v.customStart === "string" && typeof v.customEnd === "string"),
    { message: "custom range requires customStart and customEnd" },
  );

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { id: projectId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request body";
    return Response.json({ error: message }, { status: 400 });
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, customer_name")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (projectError) {
    return Response.json({ error: projectError.message }, { status: 500 });
  }
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  // Resolve "since last summary" server-side so the client doesn't have to
  // hold onto the latest range_end across dialog reopens.
  let sinceLastSummaryStart: string | null = null;
  if (body.preset === "since_last_summary") {
    const { data: last } = await supabase
      .from("project_summaries")
      .select("range_end")
      .eq("project_id", projectId)
      .eq("owner_id", user.id)
      .gt("expires_at", new Date().toISOString())
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    sinceLastSummaryStart = last?.range_end ?? null;
  }

  let rangeStart: string;
  let rangeEnd: string;
  try {
    ({ rangeStart, rangeEnd } = resolveSummaryRange(
      body.preset as SummaryRangePreset,
      new Date(),
      {
        customStart: body.customStart,
        customEnd: body.customEnd,
        sinceLastSummaryStart,
      },
    ));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid range";
    return Response.json({ error: message }, { status: 400 });
  }

  if (new Date(rangeEnd) <= new Date(rangeStart)) {
    return Response.json({ error: "Range end must be after range start" }, { status: 400 });
  }

  const [eventsRaw, phasesRes, piRes] = await Promise.all([
    loadProjectActivity(projectId, {
      limitPerSource: 500,
      since: rangeStart,
      until: rangeEnd,
    }),
    supabase
      .from("project_phases")
      .select("name, sort_order, start_date, end_date, phase_key")
      .eq("project_id", projectId)
      .order("sort_order"),
    supabase
      .from("project_integrations")
      .select(
        `
      delivery_progress,
      integration_state,
      integrations (
        integration_code,
        integrating_with,
        name,
        direction,
        catalog_visibility
      )
    `,
      )
      .eq("project_id", projectId)
      .order("created_at", { ascending: true }),
  ]);

  if (phasesRes.error) {
    console.error("[summarize-activity] phases load failed", phasesRes.error);
  }
  if (piRes.error) {
    console.error("[summarize-activity] integrations snapshot failed", piRes.error);
  }

  const eventsForSummary = eventsRaw.filter((e) => e.kind !== "task_created");

  const asOfCalendarDay = rangeEnd.slice(0, 10);
  const phases = (phasesRes.data ?? []).map((r) => ({
    name: r.name,
    sort_order: r.sort_order,
    start_date: r.start_date,
    end_date: r.end_date,
    phase_key: r.phase_key ?? null,
  }));
  const integrations = (piRes.data ?? []).map((r) => {
    const integData = r.integrations as unknown as {
      integration_code: string | null;
      integrating_with: string | null;
      name: string | null;
      direction: string | null;
      catalog_visibility: string | null;
    } | null;
    const displayName =
      formatIntegrationDefinitionDisplayName({
        integration_code: integData?.integration_code,
        integrating_with: integData?.integrating_with,
        name: integData?.name,
        direction: integData?.direction,
      }).trim() || "integration";
    return {
      displayName,
      delivery_progress: r.delivery_progress ?? null,
      integration_state: r.integration_state ?? null,
    };
  });

  const report = buildDeterministicProjectReport({
    customerName: project.customer_name,
    rangeStart,
    rangeEnd,
    events: eventsForSummary,
    asOfCalendarDay,
    phases,
    integrations,
  });

  const { error: insertError } = await supabase.from("project_summaries").insert({
    project_id: projectId,
    owner_id: user.id,
    range_start: rangeStart,
    range_end: rangeEnd,
    range_preset: body.preset === "custom" ? null : body.preset,
    model: "deterministic:v1",
    event_count: eventsForSummary.length,
    body: report,
  });
  if (insertError) {
    console.error("[summarize-activity] persistence failed", insertError);
  }

  // Headers echo the resolved range so the client can render it without a
  // second round-trip.
  return new Response(report, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Range-Start": rangeStart,
      "X-Range-End": rangeEnd,
      "X-Event-Count": String(eventsForSummary.length),
    },
  });
}
