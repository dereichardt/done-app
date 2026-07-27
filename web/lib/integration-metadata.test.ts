import { describe, expect, it } from "vitest";

import {
  formatIntegrationStateLabel,
  integrationStateShowsReason,
  isIntegrationCountedInScope,
  isIntegrationState,
  isRemovedFromScope,
  PROJECT_INTEGRATION_STATE_VALUES,
  projectIntegrationStateSelectOptions,
} from "@/lib/integration-metadata";

describe("removed_from_scope integration state", () => {
  it("is included in state values and select options", () => {
    expect(PROJECT_INTEGRATION_STATE_VALUES).toContain("removed_from_scope");
    expect(isIntegrationState("removed_from_scope")).toBe(true);
    expect(projectIntegrationStateSelectOptions()).toEqual(
      expect.arrayContaining([{ value: "removed_from_scope", label: "Removed from scope" }]),
    );
    expect(formatIntegrationStateLabel("removed_from_scope")).toBe("Removed from scope");
  });

  it("is out of scope for metrics and shows an optional reason field", () => {
    expect(isRemovedFromScope("removed_from_scope")).toBe(true);
    expect(isRemovedFromScope("active")).toBe(false);
    expect(isIntegrationCountedInScope("removed_from_scope")).toBe(false);
    expect(isIntegrationCountedInScope("active")).toBe(true);
    expect(isIntegrationCountedInScope("completed")).toBe(true);
    expect(integrationStateShowsReason("removed_from_scope")).toBe(true);
    expect(integrationStateShowsReason("blocked")).toBe(true);
    expect(integrationStateShowsReason("active")).toBe(false);
  });
});
