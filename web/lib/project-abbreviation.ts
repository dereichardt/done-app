/** Significant-word stop list for auto-derived project abbreviations. */
const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "of",
  "and",
  "for",
  "to",
  "in",
  "on",
  "at",
  "by",
]);

export const PROJECT_ABBREVIATION_MAX_LENGTH = 12;

const ABBREVIATION_PATTERN = /^[A-Z]{1,12}$/;

/** Strip non-letters, uppercase, and truncate to max length. */
export function normalizeProjectAbbreviation(raw: string): string {
  return raw
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase()
    .slice(0, PROJECT_ABBREVIATION_MAX_LENGTH);
}

export function isValidProjectAbbreviation(value: string): boolean {
  return ABBREVIATION_PATTERN.test(value);
}

/**
 * Derive an uppercase acronym from significant words in a project name.
 * Skips small words (a/an/the/of/…). If every word is a stop word, falls
 * back to initials of all words. Returns "" when no letters are present.
 */
export function deriveProjectAbbreviation(name: string): string {
  const cleaned = name.replace(/[^A-Za-z]+/g, " ").trim();
  if (!cleaned) return "";

  const words = cleaned.split(/\s+/).filter(Boolean);
  const significant = words.filter((w) => !STOP_WORDS.has(w.toLowerCase()));
  const source = significant.length > 0 ? significant : words;

  return source
    .map((w) => w[0]!.toUpperCase())
    .join("")
    .slice(0, PROJECT_ABBREVIATION_MAX_LENGTH);
}
