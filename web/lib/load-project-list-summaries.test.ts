import { describe, expect, it, vi } from "vitest";

import { loadProjectListSummariesById } from "@/lib/load-project-list-summaries";

function makeClient(integrationRows: { project_id: string; integration_state: string }[]) {
  return {
    from: vi.fn((table: string) => {
      const builder = {
        select: vi.fn(() => builder),
        in: vi.fn(() => {
          if (table === "project_phases") {
            return Promise.resolve({ data: [], error: null });
          }
          if (table === "project_integrations") {
            return Promise.resolve({ data: integrationRows, error: null });
          }
          if (table === "projects") {
            return Promise.resolve({ data: [{ id: "p1", starts_on: null, ends_on: null, project_types: null }], error: null });
          }
          return Promise.resolve({ data: [], error: null });
        }),
      };
      return builder;
    }),
  } as never;
}

describe("loadProjectListSummariesById removed_from_scope", () => {
  it("excludes removed integrations from total, active, and blocked counts", async () => {
    const summaries = await loadProjectListSummariesById(
      makeClient([
        { project_id: "p1", integration_state: "active" },
        { project_id: "p1", integration_state: "blocked" },
        { project_id: "p1", integration_state: "completed" },
        { project_id: "p1", integration_state: "removed_from_scope" },
      ]),
      ["p1"],
    );

    expect(summaries.p1.totalIntegrationCount).toBe(3);
    expect(summaries.p1.activeIntegrationCount).toBe(1);
    expect(summaries.p1.blockedOnHoldCount).toBe(1);
  });
});
