import { TimesheetPageClient } from "./timesheet-page-client";
import { loadTasksPageSnapshot } from "@/lib/actions/tasks-page";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default async function TimesheetPage() {
  const { snapshot, error } = await loadTasksPageSnapshot();

  if (error || !snapshot) {
    return (
      <div>
        <h1 className="heading-page">Timesheet</h1>
        <p className="subheading-page mt-2" style={{ color: "var(--app-danger)" }}>
          {error ?? "Could not load timesheet."}
        </p>
      </div>
    );
  }

  if (snapshot.projects.length === 0) {
    return (
      <div>
        <h1 className="heading-page">Timesheet</h1>
        <p className="subheading-page mt-2">
          You don&apos;t have any active projects yet. Create a project to start tracking time here, or use{" "}
          <a href="/internal" className="font-medium hover:underline" style={{ color: "var(--app-action)" }}>
            Internal
          </a>{" "}
          for Admin, Development, and initiative work.
        </p>
      </div>
    );
  }

  return (
    <Suspense>
      <TimesheetPageClient initialSnapshot={snapshot} />
    </Suspense>
  );
}
