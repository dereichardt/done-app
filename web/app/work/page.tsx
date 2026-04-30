import { TasksPageClient } from "../tasks/tasks-page-client";
import { loadTasksPageSnapshot } from "@/lib/actions/tasks-page";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default async function WorkPage() {
  const { snapshot, error } = await loadTasksPageSnapshot();

  if (error || !snapshot) {
    return (
      <div>
        <h1 className="heading-page">Work</h1>
        <p className="subheading-page mt-2" style={{ color: "var(--app-danger)" }}>
          {error ?? "Could not load tasks."}
        </p>
      </div>
    );
  }

  if (snapshot.projects.length === 0) {
    return (
      <div>
        <h1 className="heading-page">Work</h1>
        <p className="subheading-page mt-2">
          You don't have any active projects yet. Create a project to start tracking tasks here.
        </p>
      </div>
    );
  }

  return (
    <Suspense>
      <TasksPageClient initialSnapshot={snapshot} />
    </Suspense>
  );
}
