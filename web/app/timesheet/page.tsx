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

  return (
    <Suspense>
      <TimesheetPageClient initialSnapshot={snapshot} />
    </Suspense>
  );
}
