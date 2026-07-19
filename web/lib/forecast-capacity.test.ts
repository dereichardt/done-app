import { describe, expect, it } from "vitest";
import { portfolioCapacityTone } from "@/app/forecast/forecast-week-cell";

describe("portfolio capacity tone", () => {
  it.each([
    [31, "below-target"],
    [32, "at-target"],
    [40, "at-target"],
    [41, "overload"],
  ] as const)("classifies %ih consistently with portfolio bars", (hours, expected) => {
    expect(portfolioCapacityTone(hours)).toBe(expected);
  });
});
