import { describe, expect, it } from "vitest";
import {
  formatPortfolioTargetLabel,
  portfolioCapacityTone,
} from "@/app/forecast/forecast-week-cell";

describe("portfolio capacity tone", () => {
  it.each([
    [31, "below-target"],
    [32, "at-target"],
    [40, "at-target"],
    [41, "overload"],
  ] as const)("classifies %ih vs the 32h default target", (hours, expected) => {
    expect(portfolioCapacityTone(hours)).toBe(expected);
  });

  it("uses a custom weekly target for below / at-target (overload stays above 40h)", () => {
    expect(portfolioCapacityTone(15, 16)).toBe("below-target");
    expect(portfolioCapacityTone(16, 16)).toBe("at-target");
    expect(portfolioCapacityTone(40, 16)).toBe("at-target");
    expect(portfolioCapacityTone(41, 16)).toBe("overload");
  });

  it("treats 0h pace as already at target", () => {
    expect(portfolioCapacityTone(0, 0)).toBe("at-target");
    expect(portfolioCapacityTone(8, 0)).toBe("at-target");
    expect(portfolioCapacityTone(41, 0)).toBe("overload");
  });
});

describe("formatPortfolioTargetLabel", () => {
  it("formats compact hours for the All projects target line", () => {
    expect(formatPortfolioTargetLabel(32)).toBe("32h");
    expect(formatPortfolioTargetLabel(25.5)).toBe("25.5h");
    expect(formatPortfolioTargetLabel(0)).toBe("0h");
    expect(formatPortfolioTargetLabel(-1)).toBe("0h");
  });
});
