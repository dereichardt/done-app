import type { CanvasSelectOption } from "@/components/canvas-select";

/** Stored on `integrations.integrating_with` when a catalog entry is Generic (not vendor-specific). */
export const CATALOG_GENERIC_INTEGRATING_WITH = "Generic";

export function isCatalogGenericIntegratingWithLabel(value: string | null | undefined): boolean {
  const t = String(value ?? "").trim();
  return t === "" || t === CATALOG_GENERIC_INTEGRATING_WITH;
}

/** Legacy types removed from the catalog UI (DB cleanup in migrations). */
export const INTEGRATION_TYPE_NAMES_REMOVED_FROM_CATALOG = new Set([
  "Payroll",
  "Benefits",
  "HCM Core",
  "Recruiting",
  "Financials",
  "Custom / Studio",
]);

/** Shown first in the integration type dropdown when present. */
export const INTEGRATION_TYPES_MOST_COMMON = ["Orchestrate", "EIB", "RaaS"] as const;

/**
 * Default integration type rows (per owner); merged on app load if missing.
 * sort_order: most common first (1–3), then alphabetical A–Z for the rest.
 */
export const INTEGRATION_TYPE_CATALOG_SEED: ReadonlyArray<{ name: string; sort_order: number }> = [
  { name: "Orchestrate", sort_order: 1 },
  { name: "EIB", sort_order: 2 },
  { name: "RaaS", sort_order: 3 },
  { name: "API", sort_order: 4 },
  { name: "Configuration", sort_order: 5 },
  { name: "Connector (standalone)", sort_order: 6 },
  { name: "Connector + Document Transformation", sort_order: 7 },
  { name: "Connector + Orchestrate", sort_order: 8 },
  { name: "Connector + Studio", sort_order: 9 },
  { name: "Document Transformation", sort_order: 10 },
  { name: "EIB + Orchestrate", sort_order: 11 },
  { name: "EIB + Studio", sort_order: 12 },
  { name: "External", sort_order: 13 },
  { name: "Studio", sort_order: 14 },
];

/** Builds dropdown items: “Most common” section, then remaining types A–Z. Filters removed legacy names. */
export function buildIntegrationTypeSelectOptions(
  rows: ReadonlyArray<{ id: string; name: string }>,
): CanvasSelectOption[] {
  const filtered = rows.filter((r) => !INTEGRATION_TYPE_NAMES_REMOVED_FROM_CATALOG.has(r.name));
  const byName = new Map(filtered.map((r) => [r.name, r] as const));

  const common = INTEGRATION_TYPES_MOST_COMMON.flatMap((name) => {
    const r = byName.get(name);
    return r ? [{ value: r.id, label: r.name } as const] : [];
  });

  const commonNames = new Set<string>(INTEGRATION_TYPES_MOST_COMMON);
  const rest = filtered
    .filter((r) => !commonNames.has(r.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    .map((r) => ({ value: r.id, label: r.name }));

  const out: CanvasSelectOption[] = [];
  if (common.length > 0) {
    out.push({ kind: "heading", label: "Most common" }, ...common);
  }
  if (common.length > 0 && rest.length > 0) {
    out.push({ kind: "separator" });
  }
  out.push(...rest);
  return out;
}

export const INTEGRATION_DIRECTIONS = ["inbound", "outbound", "bidirectional"] as const;
export type IntegrationDirection = (typeof INTEGRATION_DIRECTIONS)[number];

/** Human label for a stored direction value (matches integration definition dropdowns). */
export function formatIntegrationDirectionLabel(direction: string): string {
  const d = direction.trim();
  if (!d) return "";
  return d.charAt(0).toUpperCase() + d.slice(1).replace("_", " ");
}

export type IntegrationDefinitionDisplayParts = {
  integration_code: string | null | undefined;
  integrating_with: string | null | undefined;
  name: string | null | undefined;
  direction: string | null | undefined;
};

/**
 * Canonical integration title for lists and page headings: ID, integrating with, name, direction
 * joined with single spaces. Omits empty segments. Returns "" if none present — callers may fall back.
 */
export function formatIntegrationDefinitionDisplayName(parts: IntegrationDefinitionDisplayParts): string {
  const segments: string[] = [];
  const code = (parts.integration_code ?? "").trim();
  const withVendor = (parts.integrating_with ?? "").trim();
  const name = (parts.name ?? "").trim();
  const dirRaw = (parts.direction ?? "").trim();
  const dir = dirRaw ? formatIntegrationDirectionLabel(dirRaw) : "";
  if (code) segments.push(code);
  if (withVendor) segments.push(withVendor);
  if (name) segments.push(name);
  if (dir) segments.push(dir);
  return segments.join(" ");
}

export const CATALOG_VISIBILITY = ["catalog", "project_only"] as const;
export type CatalogVisibility = (typeof CATALOG_VISIBILITY)[number];

export const PROJECT_DELIVERY_PROGRESS_VALUES = [
  "not_started",
  "gathering_requirements",
  "in_development",
  "in_unit_testing",
  "in_fit_and_format_testing",
  "in_e2e_testing",
  "in_production_cutover",
  "in_hypercare",
] as const;
export type ProjectDeliveryProgress = (typeof PROJECT_DELIVERY_PROGRESS_VALUES)[number];

export const PROJECT_INTEGRATION_STATE_VALUES = ["active", "blocked", "on_hold"] as const;
export type ProjectIntegrationState = (typeof PROJECT_INTEGRATION_STATE_VALUES)[number];

const DELIVERY_PROGRESS_LABELS: Record<ProjectDeliveryProgress, string> = {
  not_started: "Not Started",
  gathering_requirements: "Gathering Requirements",
  in_development: "In Development",
  in_unit_testing: "In Unit Testing",
  in_fit_and_format_testing: "In Fit and Format Testing",
  in_e2e_testing: "In E2E Testing",
  in_production_cutover: "In Production Cutover",
  in_hypercare: "In Hypercare",
};

const INTEGRATION_STATE_LABELS: Record<ProjectIntegrationState, string> = {
  active: "Active",
  blocked: "Blocked",
  on_hold: "On Hold",
};

export function isDeliveryProgress(v: string): v is ProjectDeliveryProgress {
  return (PROJECT_DELIVERY_PROGRESS_VALUES as readonly string[]).includes(v);
}

export function isIntegrationState(v: string): v is ProjectIntegrationState {
  return (PROJECT_INTEGRATION_STATE_VALUES as readonly string[]).includes(v);
}

export function formatDeliveryProgressLabel(value: string): string {
  if (isDeliveryProgress(value)) return DELIVERY_PROGRESS_LABELS[value];
  return value.replace(/_/g, " ");
}

export function formatIntegrationStateLabel(value: string): string {
  if (isIntegrationState(value)) return INTEGRATION_STATE_LABELS[value];
  return value.replace(/_/g, " ");
}

/** Options for CanvasSelect: delivery progress dropdown. */
export function projectDeliveryProgressSelectOptions(): { value: string; label: string }[] {
  return PROJECT_DELIVERY_PROGRESS_VALUES.map((v) => ({
    value: v,
    label: DELIVERY_PROGRESS_LABELS[v],
  }));
}

/** Options for CanvasSelect: integration state dropdown. */
export function projectIntegrationStateSelectOptions(): { value: string; label: string }[] {
  return PROJECT_INTEGRATION_STATE_VALUES.map((v) => ({
    value: v,
    label: INTEGRATION_STATE_LABELS[v],
  }));
}

export function isIntegrationDirection(v: string): v is IntegrationDirection {
  return (INTEGRATION_DIRECTIONS as readonly string[]).includes(v);
}

export function isCatalogVisibility(v: string): v is CatalogVisibility {
  return (CATALOG_VISIBILITY as readonly string[]).includes(v);
}
