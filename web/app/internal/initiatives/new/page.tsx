import { loadUserPreferences } from "@/lib/actions/user-preferences";
import { getUserTodayIso } from "@/lib/user-preferences";
import { CreateInitiativeForm } from "./create-initiative-form";

export const dynamic = "force-dynamic";

export default async function NewInternalInitiativePage() {
  const prefs = await loadUserPreferences();
  const todayIso = getUserTodayIso(prefs.preferences.timezone);

  return (
    <div>
      <h1 className="heading-page">New initiative</h1>
      <p className="subheading-page mt-2 text-muted-canvas">
        Initiatives are date-bounded buckets for internal tasks. You can add tasks after saving.
      </p>
      <CreateInitiativeForm defaultStartsOn={todayIso} />
    </div>
  );
}
