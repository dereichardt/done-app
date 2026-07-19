"use client";

import type { TasksFiltersValue } from "@/app/tasks/tasks-filters";
import { WorkTimesheetView } from "@/app/tasks/work-timesheet-view";
import { formatLocalYmd } from "@/lib/integration-effort-buckets";
import type { TasksPageSnapshot } from "@/lib/tasks-page-shared";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const EMPTY_FILTERS: TasksFiltersValue = {
  search: "",
  projectId: "",
  projectTrackId: "",
  priority: "",
};

export function TimesheetPageClient({ initialSnapshot }: { initialSnapshot: TasksPageSnapshot }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [anchorFallback, setAnchorFallback] = useState(initialSnapshot.todayIso);

  useEffect(() => {
    setAnchorFallback(formatLocalYmd(new Date()));
  }, []);

  const anchorYmd = searchParams.get("date") ?? anchorFallback;

  const setAnchorYmd = useCallback(
    (ymd: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("date", ymd);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  return (
    <div className="card-canvas flex min-h-0 flex-1 flex-col overflow-hidden p-3">
      <WorkTimesheetView
        anchorYmd={anchorYmd}
        onAnchorChange={setAnchorYmd}
        filters={EMPTY_FILTERS}
        projects={initialSnapshot.projects}
        tracks={initialSnapshot.tracks}
        integrations={initialSnapshot.integrations}
      />
    </div>
  );
}
