import { describe, expect, it } from "vitest";

import {
  computeHomeTaskGroups,
  homeTaskBelongsOnCard,
  homeTaskMatchesMode,
} from "@/lib/home-task-buckets";
import type { TasksPageTask } from "@/lib/tasks-page-shared";

function projectTask(
  partial: Pick<TasksPageTask, "id" | "title" | "due_date">,
): TasksPageTask {
  return {
    scope: "project",
    project_id: "p1",
    project_track_id: "t1",
    project_integration_id: null,
    status: "open",
    priority: "medium",
    completed_at: null,
    sort_order: 0,
    subtasks: [],
    ...partial,
  };
}

describe("homeTaskMatchesMode", () => {
  const today = "2026-08-17"; // Monday

  it("today includes past due and today, not later this week", () => {
    expect(homeTaskMatchesMode("2026-08-16", "today", today)).toBe(true);
    expect(homeTaskMatchesMode(today, "today", today)).toBe(true);
    expect(homeTaskMatchesMode("2026-08-19", "today", today)).toBe(false);
  });

  it("this week includes later this week through Saturday", () => {
    expect(homeTaskMatchesMode("2026-08-19", "this_week", today)).toBe(true);
    expect(homeTaskMatchesMode("2026-08-22", "this_week", today)).toBe(true);
    expect(homeTaskMatchesMode("2026-08-23", "this_week", today)).toBe(false);
  });
});

describe("homeTaskBelongsOnCard", () => {
  const today = "2026-08-17"; // Monday

  it("keeps a task moved from today to later this week", () => {
    expect(homeTaskBelongsOnCard("2026-08-19", today)).toBe(true);
  });

  it("drops a task moved to next week", () => {
    expect(homeTaskBelongsOnCard("2026-08-23", today)).toBe(false);
  });

  it("drops a task with no due date", () => {
    expect(homeTaskBelongsOnCard(null, today)).toBe(false);
  });
});

describe("computeHomeTaskGroups", () => {
  const today = "2026-08-17"; // Monday
  const laterThisWeek = projectTask({
    id: "later",
    title: "Later this week",
    due_date: "2026-08-19",
  });
  const todayTask = projectTask({
    id: "today",
    title: "Due today",
    due_date: today,
  });

  it("hides a later-this-week task from Today after a date change", () => {
    const groups = computeHomeTaskGroups({
      openTasks: [todayTask, laterThisWeek],
      todayIso: today,
      mode: "today",
    });
    const ids = groups.flatMap((g) => g.tasks.map((t) => t.id));
    expect(ids).toEqual(["today"]);
  });

  it("shows a later-this-week task under This week", () => {
    const groups = computeHomeTaskGroups({
      openTasks: [todayTask, laterThisWeek],
      todayIso: today,
      mode: "this_week",
    });
    const ids = groups.flatMap((g) => g.tasks.map((t) => t.id));
    expect(ids).toContain("later");
    expect(ids).toContain("today");
  });
});
