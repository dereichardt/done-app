import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  forecastActualsCutoffIso,
  isActualBeforeForecastCutoff,
  loadAllActiveForecastItems,
  loadAllActiveForecastProjects,
} from "@/lib/forecast-data";

type FakeResult = { data: unknown[]; error: null };

class FakeQuery implements PromiseLike<FakeResult> {
  constructor(private readonly result: FakeResult) {}

  select() {
    return this;
  }
  eq() {
    return this;
  }
  is() {
    return this;
  }
  in() {
    return this;
  }
  not() {
    return this;
  }
  lt() {
    return this;
  }
  order() {
    return this;
  }
  then<TResult1 = FakeResult, TResult2 = never>(
    onfulfilled?: ((value: FakeResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

function fakeSupabase(rowsByTable: Record<string, unknown[]>) {
  const calls: string[] = [];
  const client = {
    from(table: string) {
      calls.push(table);
      return new FakeQuery({ data: rowsByTable[table] ?? [], error: null });
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

const actualsContext = { todayIso: "2026-07-19", timeZone: "UTC" };

describe("forecast actuals week cutoff", () => {
  it("uses Sunday midnight in the user's timezone", () => {
    expect(
      forecastActualsCutoffIso({
        todayIso: "2025-01-08",
        timeZone: "America/New_York",
      }),
    ).toBe("2025-01-05T05:00:00.000Z");

    expect(
      forecastActualsCutoffIso({
        todayIso: "2025-07-09",
        timeZone: "America/New_York",
      }),
    ).toBe("2025-07-06T04:00:00.000Z");
  });

  it("includes only actuals completed before the current Sunday", () => {
    const cutoffIso = forecastActualsCutoffIso({
      todayIso: "2025-01-08",
      timeZone: "America/New_York",
    });

    expect(isActualBeforeForecastCutoff("2025-01-05T04:59:59.999Z", cutoffIso)).toBe(true);
    expect(isActualBeforeForecastCutoff("2025-01-05T05:00:00.000Z", cutoffIso)).toBe(false);
    expect(isActualBeforeForecastCutoff("2025-01-08T15:00:00.000Z", cutoffIso)).toBe(false);
  });
});

describe("bulk portfolio forecast loading", () => {
  it("uses a fixed nine project-side requests and attributes actuals by track", async () => {
    const { client, calls } = fakeSupabase({
      projects: [
        {
          id: "project-a",
          customer_name: "Alpha",
          starts_on: "2026-01-01",
          ends_on: "2026-12-31",
          estimated_effort_hours: 100,
          project_management_estimated_hours: 15,
          project_types: { system_key: "standard" },
        },
        {
          id: "project-b",
          customer_name: "Beta",
          starts_on: "2026-01-01",
          ends_on: "2026-12-31",
          estimated_effort_hours: 40,
          project_types: { system_key: "expert_assist" },
        },
      ],
      project_phases: [
        {
          project_id: "project-a",
          phase_key: "configure",
          start_date: "2026-01-01",
          end_date: "2026-12-31",
          sort_order: 1,
        },
      ],
      project_integrations: [
        {
          id: "integration-a",
          project_id: "project-a",
          estimated_effort_hours: 25,
          integrations: { name: "Payroll" },
        },
      ],
      project_forecasts: [],
      project_forecast_hours: [],
      project_forecast_week_locks: [],
      project_tracks: [
        { id: "track-a", project_id: "project-a" },
        { id: "track-b", project_id: "project-b" },
      ],
      integration_task_work_sessions: [
        {
          duration_hours: 2,
          finished_at: "2026-07-01T12:00:00.000Z",
          integration_tasks: { project_track_id: "track-a" },
        },
        {
          duration_hours: 3,
          finished_at: "2026-07-02T12:00:00.000Z",
          integration_tasks: { project_track_id: "track-b" },
        },
      ],
      integration_manual_effort_entries: [
        {
          duration_hours: 1,
          finished_at: "2026-07-03T12:00:00.000Z",
          project_track_id: "track-a",
        },
      ],
    });

    const projects = await loadAllActiveForecastProjects(
      client,
      "owner-1",
      actualsContext,
    );

    expect(calls).toHaveLength(9);
    expect(projects.map((project) => [project.id, project.actualHours])).toEqual([
      ["project-a", 3],
      ["project-b", 3],
    ]);
    expect(projects[1]?.forecastModel).toBe("single_track");
    expect(projects[0]?.integrations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "integration-a",
          estimatedEffortHours: 25,
        }),
        expect.objectContaining({
          key: "project_management",
          label: "Project Management",
          estimatedEffortHours: 15,
        }),
      ]),
    );
  });

  it("loads projects and initiatives in sixteen requests regardless of entity count", async () => {
    const { client, calls } = fakeSupabase({
      projects: [
        {
          id: "project-a",
          customer_name: "Alpha",
          starts_on: "2026-01-01",
          ends_on: "2026-12-31",
          estimated_effort_hours: 20,
          project_types: { system_key: "expert_assist" },
        },
      ],
      project_phases: [],
      project_integrations: [],
      project_forecasts: [],
      project_forecast_hours: [],
      project_forecast_week_locks: [],
      project_tracks: [{ id: "track-a", project_id: "project-a" }],
      integration_task_work_sessions: [],
      integration_manual_effort_entries: [],
      internal_initiatives: [
        {
          id: "initiative-a",
          title: "Internal",
          starts_on: "2026-01-01",
          ends_on: "2026-12-31",
          estimated_effort_hours: 30,
        },
      ],
      internal_tasks: [{ id: "task-a", internal_initiative_id: "initiative-a" }],
      initiative_forecasts: [],
      initiative_forecast_hours: [],
      initiative_forecast_week_locks: [],
      internal_initiative_manual_effort_entries: [],
      internal_task_work_sessions: [],
    });

    const items = await loadAllActiveForecastItems(client, "owner-1", actualsContext);

    expect(calls).toHaveLength(16);
    expect(items.map((item) => item.kind)).toEqual(["project", "initiative"]);
  });
});
