import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  loadForecastProjectDTO: vi.fn(),
  loadUserPreferences: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/actions/user-preferences", () => ({
  loadUserPreferences: mocks.loadUserPreferences,
}));

vi.mock("@/lib/forecast-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/forecast-data")>();
  return {
    ...actual,
    loadForecastProjectDTO: mocks.loadForecastProjectDTO,
  };
});

import {
  generateProjectForecast,
  saveProjectForecastDraft,
} from "@/lib/actions/project-forecast";

const project = {
  kind: "project" as const,
  forecastModel: "phased_integrations" as const,
  id: "project-1",
  customer_name: "Project",
  phases: [
    {
      phase_key: "plan",
      start_date: "2026-07-19",
      end_date: "2026-08-01",
    },
  ],
  integrations: [
    {
      key: "integration-1",
      label: "Integration",
      estimatedEffortHours: 10,
    },
  ],
  timelineStartYmd: "2026-07-19",
  timelineEndYmd: "2026-08-01",
  actualHours: 0,
  forecast: null,
  hours: [],
  lockedWeekStarts: [],
  hoursByWeek: {},
};

function createSupabaseMock(rpcError: { message: string } | null = null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
      }),
    },
    rpc: vi.fn().mockResolvedValue({ error: rpcError }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadUserPreferences.mockResolvedValue({
    preferences: {
      timezone: "UTC",
      deployment_effort_by_phase: {
        plan: 10,
        architect_configure: 60,
        test: 20,
        deploy: 5,
        hypercare: 5,
      },
    },
  });
  mocks.loadForecastProjectDTO.mockResolvedValue(project);
});

describe("project forecast persistence", () => {
  it("regenerates through one atomic database call", async () => {
    const supabase = createSupabaseMock();
    mocks.createClient.mockResolvedValue(supabase);

    const result = await generateProjectForecast("project-1", {
      startMode: "this_week",
      spreadMode: "even",
      includePastPhaseHours: true,
      todayIso: "2026-07-19",
    });

    expect(result.error).toBeUndefined();
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "replace_project_forecast",
      expect.objectContaining({
        p_project_id: "project-1",
        p_start_date: "2026-07-19",
        p_replace_weeks: ["2026-07-19", "2026-07-26"],
        p_cells: expect.any(Array),
      }),
    );
  });

  it("returns an atomic regeneration failure without loading mutated data", async () => {
    const supabase = createSupabaseMock({ message: "transaction rolled back" });
    mocks.createClient.mockResolvedValue(supabase);

    const result = await generateProjectForecast("project-1", {
      startMode: "this_week",
      spreadMode: "even",
      todayIso: "2026-07-19",
    });

    expect(result).toEqual({ error: "transaction rolled back" });
    expect(mocks.loadForecastProjectDTO).toHaveBeenCalledTimes(1);
  });

  it("saves edited hours, zero deletes, and reserve in one database call", async () => {
    const supabase = createSupabaseMock();
    mocks.createClient.mockResolvedValue(supabase);

    const result = await saveProjectForecastDraft("project-1", {
      todayIso: "2026-07-19",
      cells: [
        { weekStartDate: "2026-07-19", hours: 4 },
        { weekStartDate: "2026-07-26", hours: 0 },
      ],
      reserveHours: 2,
    });

    expect(result).toEqual({});
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "save_project_forecast_draft",
      expect.objectContaining({
        p_project_id: "project-1",
        p_cells: [{ week_start_date: "2026-07-19", hours: 4 }],
        p_delete_weeks: ["2026-07-26"],
        p_reserve_hours: 2,
      }),
    );
  });
});
