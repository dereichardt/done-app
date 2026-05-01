import { fetchInternalCombinedAdminDevTaskSnapshot } from "@/lib/actions/internal-tasks";
import { ensureInternalTracks } from "@/lib/actions/internal-work";
import { InternalInitiativesSection } from "@/components/internal-initiatives-section";
import { loadUserPreferences } from "@/lib/actions/user-preferences";
import { createClient } from "@/lib/supabase/server";
import { getUserTodayIso } from "@/lib/user-preferences";
import { InternalTasksWorkPanel } from "./internal-track-panel";

export const dynamic = "force-dynamic";

export default async function InternalPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  await ensureInternalTracks();
  const prefs = await loadUserPreferences();
  const todayIso = getUserTodayIso(prefs.preferences.timezone);

  const { data: tracks, error: trErr } = await supabase
    .from("internal_tracks")
    .select("id, kind")
    .eq("owner_id", user.id);
  if (trErr) {
    return (
      <div>
        <h1 className="heading-page">Internal</h1>
        <p className="subheading-page mt-2" style={{ color: "var(--app-danger)" }}>
          {trErr.message}
        </p>
      </div>
    );
  }

  const adminId = tracks?.find((t) => t.kind === "admin")?.id;
  const developmentId = tracks?.find((t) => t.kind === "development")?.id;

  const combinedSnap =
    adminId && developmentId ? await fetchInternalCombinedAdminDevTaskSnapshot(adminId, developmentId) : null;

  const { data: initiatives } = await supabase
    .from("internal_initiatives")
    .select("id, title, starts_on, ends_on, completed_at")
    .eq("owner_id", user.id)
    .order("starts_on", { ascending: false });

  const iniList = [...(initiatives ?? [])].sort((a, b) => {
    const aDone = a.completed_at != null ? 1 : 0;
    const bDone = b.completed_at != null ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    return (b.starts_on ?? "").localeCompare(a.starts_on ?? "");
  });
  const iniIds = iniList.map((i) => i.id);
  const countsByInitiativeId: Record<string, { open: number }> = {};
  for (const id of iniIds) {
    countsByInitiativeId[id] = { open: 0 };
  }
  if (iniIds.length > 0) {
    const { data: taskRows } = await supabase
      .from("internal_tasks")
      .select("internal_initiative_id, status")
      .in("internal_initiative_id", iniIds);
    for (const row of taskRows ?? []) {
      const id = row.internal_initiative_id as string | null;
      if (!id || countsByInitiativeId[id] == null) continue;
      if (row.status !== "done") countsByInitiativeId[id].open += 1;
    }
  }

  return (
    <div>
      <h1 className="heading-page">Internal</h1>

      <InternalInitiativesSection
        initiatives={iniList}
        countsByInitiativeId={countsByInitiativeId}
        todayIso={todayIso}
      />

      {combinedSnap?.snapshot && adminId && developmentId ? (
        <InternalTasksWorkPanel
          variant="combined_admin_dev"
          adminTrackId={adminId}
          developmentTrackId={developmentId}
          heading="Admin & Development"
          todayIso={todayIso}
          snapshot={combinedSnap.snapshot}
        />
      ) : (
        <p className="mt-10 text-sm" style={{ color: "var(--app-danger)" }}>
          {combinedSnap?.error ??
            (!adminId ? "Missing Admin track." : !developmentId ? "Missing Development track." : "Tasks could not be loaded.")}
        </p>
      )}
    </div>
  );
}
