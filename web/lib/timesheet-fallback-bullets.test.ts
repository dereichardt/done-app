import { describe, expect, it } from "vitest";

import { timesheetFallbackBullets } from "@/lib/timesheet-fallback-bullets";

describe("timesheetFallbackBullets", () => {
  it("normalizes whitespace and removes case-insensitive duplicates", () => {
    expect(
      timesheetFallbackBullets([
        "  Reviewed   payroll mapping  ",
        "reviewed payroll mapping",
        "Updated test scenarios",
      ]),
    ).toEqual(["- Reviewed payroll mapping", "- Updated test scenarios"]);
  });

  it("caps output at five bullets and truncates long lines", () => {
    const bullets = timesheetFallbackBullets([
      "a".repeat(200),
      "two",
      "three",
      "four",
      "five",
      "six",
    ]);

    expect(bullets).toHaveLength(5);
    expect(bullets[0]).toBe(`- ${"a".repeat(157)}…`);
    expect(bullets).not.toContain("- six");
  });

  it("returns an explicit placeholder when no detail is logged", () => {
    expect(timesheetFallbackBullets(["", "   "])).toEqual(["- (no detail logged)"]);
  });
});
