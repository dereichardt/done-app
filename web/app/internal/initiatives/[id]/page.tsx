import { fetchInternalInitiativeTaskSnapshot } from "@/lib/actions/internal-tasks";
import { loadUserPreferences } from "@/lib/actions/user-preferences";
import { IntegrationEffortSection } from "@/components/integration-effort-section";
import type { EffortSessionInput } from "@/lib/integration-effort-buckets";
import { createClient } from "@/lib/supabase/server";
import { getUserTodayIso } from "@/lib/user-preferences";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InternalTasksWorkPanel } from "../../internal-track-panel";
import { InternalInitiativeDetailHeader } from "./internal-initiative-detail-header";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function InternalInitiativeDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: ini, error: iniErr } = await supabase
    .from("internal_initiatives")
    .select("id, title, starts_on, ends_on, estimated_effort_hours, completed_at")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (iniErr || !ini) notFound();

  const snapRes = await fetchInternalInitiativeTaskSnapshot(id);
  if (!snapRes.snapshot) {
    return (
      <div>
        <h1 className="heading-page">Initiative</h1>
        <p className="subheading-page mt-2" style={{ color: "var(--app-danger)" }}>
          {snapRes.error ?? "Could not load tasks."}
        </p>
        <p className="mt-4 text-sm">
          <Link href="/internal" className="hover:underline" style={{ color: "var(--app-action)" }}>
            Back to Internal
          </Link>
        </p>
      </div>
    );
  }

  const prefs = await loadUserPreferences();
  const todayIso = getUserTodayIso(prefs.preferences.timezone);
  const title = (ini.title ?? "").trim() || "Initiative";

  const { data: taskRows } = await supabase
    .from("internal_tasks")
    .select("id, title")
    .eq("internal_initiative_id", id)
    .is("internal_track_id", null);

  const taskIds = (taskRows ?? []).map((t) => t.id);
  const taskTitleById = Object.fromEntries((taskRows ?? []).map((t) => [t.id, t.title]));

  let workSessionRows: Array<{
    id: string;
    internal_task_id: string;
    started_at: string;
    finished_at: string | null;
    duration_hours: number | string;
    work_accomplished: string | null;
  }> = [];
  if (taskIds.length > 0) {
    const { data: ws } = await supabase
      .from("internal_task_work_sessions")
      .select("id, internal_task_id, started_at, finished_at, duration_hours, work_accomplished")
      .in("internal_task_id", taskIds)
      .not("finished_at", "is", null)
      .order("started_at", { ascending: false });
    workSessionRows = (ws ?? []) as typeof workSessionRows;
  }

  const { data: manualRows } = await supabase
    .from("internal_initiative_manual_effort_entries")
    .select("id, entry_type, title, started_at, finished_at, duration_hours, work_accomplished")
    .eq("internal_initiative_id", id)
    .order("started_at", { ascending: false });

  const taskEffortSessions: EffortSessionInput[] = workSessionRows
    .filter((w) => w.finished_at != null)
    .map((w) => ({
      source: "task_work_session" as const,
      source_id: w.id,
      started_at: w.started_at,
      finished_at: w.finished_at as string,
      duration_hours: Number(w.duration_hours),
      integration_task_id: w.internal_task_id,
      title: String(taskTitleById[w.internal_task_id] ?? "").trim() || "Task",
      work_accomplished: w.work_accomplished ?? null,
    }));

  const manualEffortSessions: EffortSessionInput[] = (manualRows ?? []).map((m) => ({
    source: "manual" as const,
    source_id: m.id,
    entry_type: m.entry_type === "meeting" ? "meeting" : "task",
    started_at: m.started_at,
    finished_at: m.finished_at,
    duration_hours: Number(m.duration_hours),
    integration_task_id: null,
    title: String(m.title ?? "").trim() || (m.entry_type === "meeting" ? "Meeting" : "Task"),
    work_accomplished: m.work_accomplished ?? null,
  }));

  const effortSessions: EffortSessionInput[] = [...taskEffortSessions, ...manualEffortSessions];

  const estimatedEffortHours =
    ini.estimated_effort_hours != null && ini.estimated_effort_hours !== ""
      ? Number(ini.estimated_effort_hours)
      : null;
  const estimatedEffortHoursNorm =
    estimatedEffortHours != null && Number.isFinite(estimatedEffortHours) ? estimatedEffortHours : null;
  const initialEstimatedEffortHoursForHeader = estimatedEffortHoursNorm;

  return (
    <div>
      <InternalInitiativeDetailHeader
        initiativeId={id}
        title={title}
        startsOn={ini.starts_on}
        endsOn={ini.ends_on}
        completedAt={ini.completed_at ?? null}
        initialEstimatedEffortHours={initialEstimatedEffortHoursForHeader}
      />
      <InternalTasksWorkPanel
        parentListId={id}
        heading={title}
        todayIso={todayIso}
        snapshot={snapRes.snapshot}
        internalTaskCreate={{ kind: "initiative", initiativeId: id }}
      />

      <section className="mt-8 mb-12">
        <div className="flex flex-col gap-2">
          <h2 className="section-heading">Effort</h2>
          <div className="max-h-[85vh] min-h-[min(28rem,55vh)] shrink-0">
            <IntegrationEffortSection
              className="h-full min-h-0 overflow-y-auto"
              effortTarget={{
                kind: "internal_initiative",
                initiativeId: id,
                projectLabel: "Internal",
                integrationLabel: title,
              }}
              initialEstimatedEffortHours={estimatedEffortHoursNorm}
              sessions={effortSessions}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
