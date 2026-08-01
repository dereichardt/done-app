import { describe, expect, it, vi } from "vitest";

import {
  applyEnteringRemovedFromScope,
  maybeApplyEnteringRemovedFromScope,
} from "@/lib/project-integration-removed-from-scope";

function chainable(result: { data?: unknown; error?: { message: string } | null } = { data: [], error: null }) {
  const api: Record<string, unknown> = {};
  const self = new Proxy(api, {
    get(target, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject);
      }
      if (!(prop in target)) {
        target[prop as string] = vi.fn(() => self);
      }
      return target[prop as string];
    },
  });
  return self;
}

describe("maybeApplyEnteringRemovedFromScope", () => {
  it("no-ops when not entering removed_from_scope", async () => {
    const from = vi.fn();
    const supabase = { from } as never;
    await expect(
      maybeApplyEnteringRemovedFromScope(supabase, {
        projectIntegrationId: "pi1",
        ownerId: "u1",
        previousState: "active",
        nextState: "blocked",
      }),
    ).resolves.toEqual({});
    expect(from).not.toHaveBeenCalled();
  });

  it("no-ops when already removed", async () => {
    const from = vi.fn();
    const supabase = { from } as never;
    await expect(
      maybeApplyEnteringRemovedFromScope(supabase, {
        projectIntegrationId: "pi1",
        ownerId: "u1",
        previousState: "removed_from_scope",
        nextState: "removed_from_scope",
      }),
    ).resolves.toEqual({});
    expect(from).not.toHaveBeenCalled();
  });
});

describe("applyEnteringRemovedFromScope", () => {
  it("stops timers and deletes open tasks", async () => {
    const trackSelect = chainable({ data: [{ id: "track1" }], error: null });
    const openTaskSelect = chainable({ data: [{ id: "task1" }, { id: "task2" }], error: null });
    const sessionDelete = chainable({ data: null, error: null });
    const taskDelete = chainable({ data: null, error: null });

    const from = vi.fn((table: string) => {
      if (table === "project_tracks") return trackSelect;
      if (table === "integration_tasks") {
        // first call is select open tasks, second is delete
        if ((from as unknown as { _taskCalls?: number })._taskCalls) {
          (from as unknown as { _taskCalls: number })._taskCalls += 1;
          return taskDelete;
        }
        (from as unknown as { _taskCalls: number })._taskCalls = 1;
        return openTaskSelect;
      }
      if (table === "integration_task_active_work_sessions") return sessionDelete;
      return chainable();
    });

    const result = await applyEnteringRemovedFromScope({ from } as never, "pi1", "u1");
    expect(result).toEqual({});
    expect(from).toHaveBeenCalledWith("project_tracks");
    expect(from).toHaveBeenCalledWith("integration_tasks");
    expect(from).toHaveBeenCalledWith("integration_task_active_work_sessions");
    expect(from).not.toHaveBeenCalledWith("home_inbox_items");
  });
});
