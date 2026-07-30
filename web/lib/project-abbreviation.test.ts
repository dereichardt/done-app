import { describe, expect, it } from "vitest";

import {
  deriveProjectAbbreviation,
  isValidProjectAbbreviation,
  normalizeProjectAbbreviation,
} from "@/lib/project-abbreviation";

describe("deriveProjectAbbreviation", () => {
  it("takes initials of significant words", () => {
    expect(deriveProjectAbbreviation("North Wind Solar Farm")).toBe("NWSF");
    expect(deriveProjectAbbreviation("The North Wind Farm")).toBe("NWF");
    expect(deriveProjectAbbreviation("Acme Corp")).toBe("AC");
  });

  it("skips stop words and falls back when all words are stop words", () => {
    expect(deriveProjectAbbreviation("A Project of the Year")).toBe("PY");
    expect(deriveProjectAbbreviation("The And Of")).toBe("TAO");
  });

  it("handles punctuation, single words, and empty input", () => {
    expect(deriveProjectAbbreviation("North-Wind Solar")).toBe("NWS");
    expect(deriveProjectAbbreviation("Acme")).toBe("A");
    expect(deriveProjectAbbreviation("")).toBe("");
    expect(deriveProjectAbbreviation("123 !!!")).toBe("");
  });

  it("truncates to 12 characters", () => {
    expect(deriveProjectAbbreviation("Alpha Bravo Charlie Delta Echo Foxtrot Golf")).toBe(
      "ABCDEFG",
    );
    expect(
      deriveProjectAbbreviation(
        "One Two Three Four Five Six Seven Eight Nine Ten Eleven Twelve Thirteen",
      ),
    ).toBe("OTTFFSSENTET");
  });
});

describe("normalizeProjectAbbreviation", () => {
  it("strips non-letters, uppercases, and truncates", () => {
    expect(normalizeProjectAbbreviation("  nw-sf ")).toBe("NWSF");
    expect(normalizeProjectAbbreviation("abc123def")).toBe("ABCDEF");
    expect(normalizeProjectAbbreviation("abcdefghijklmnop")).toBe("ABCDEFGHIJKL");
  });
});

describe("isValidProjectAbbreviation", () => {
  it("accepts A–Z length 1–12 only", () => {
    expect(isValidProjectAbbreviation("A")).toBe(true);
    expect(isValidProjectAbbreviation("NWSF")).toBe(true);
    expect(isValidProjectAbbreviation("ABCDEFGHIJKL")).toBe(true);
    expect(isValidProjectAbbreviation("")).toBe(false);
    expect(isValidProjectAbbreviation("nw")).toBe(false);
    expect(isValidProjectAbbreviation("AB1")).toBe(false);
    expect(isValidProjectAbbreviation("ABCDEFGHIJKLM")).toBe(false);
  });
});
