import {
  formatDeliveryProgressLabel,
  formatIntegrationDefinitionDisplayName,
} from "@/lib/integration-metadata";

export type ProjectIntegrationListInteg = {
  name: string;
  integration_code: string | null;
  integrating_with: string | null;
  direction: string | null;
  catalog_visibility: string;
  integration_types: unknown;
  functional_areas: unknown;
  integration_domains: unknown;
};

function lookupName(row: unknown): string | null {
  if (row && typeof row === "object" && "name" in row && typeof (row as { name: unknown }).name === "string") {
    return (row as { name: string }).name;
  }
  return null;
}

export function narrowProjectIntegration(integ: unknown): ProjectIntegrationListInteg | null {
  if (integ && typeof integ === "object" && !Array.isArray(integ)) {
    return integ as ProjectIntegrationListInteg;
  }
  return null;
}

export function integrationTypeLabel(integObj: { integration_types: unknown } | null): string | null {
  return integObj ? lookupName(integObj.integration_types) : null;
}

export function integrationFunctionalAreaLabel(integObj: { functional_areas: unknown } | null): string | null {
  return integObj ? lookupName(integObj.functional_areas) : null;
}

/** Integration type · functional area only (summary dialog secondary line). */
export function integrationCatalogMeta(integObj: { integration_types: unknown; functional_areas: unknown } | null): string {
  const parts: string[] = [];
  const typeLabel = integrationTypeLabel(integObj);
  if (typeLabel) parts.push(typeLabel);
  const areaLabel = integrationFunctionalAreaLabel(integObj);
  if (areaLabel) parts.push(areaLabel);
  return parts.join(" · ");
}

export function projectIntegrationTitle(integObj: ProjectIntegrationListInteg | null): string {
  if (integObj == null) return "Integration";
  return (
    formatIntegrationDefinitionDisplayName({
      integration_code: integObj.integration_code,
      integrating_with: integObj.integrating_with,
      name: integObj.name,
      direction: integObj.direction,
    }) || integObj.name
  );
}

export type SerializedProjectIntegrationRow = {
  id: string;
  delivery_progress: string;
  integration_state: string;
  title: string;
  /** Type · functional area (same as `meta`; explicit name for project list UI). */
  catalogMeta: string;
  /** Secondary line for summary dialog; catalog context only. */
  meta: string;
  integrationTypeLabel: string | null;
  functionalAreaLabel: string | null;
  deliveryProgressLabel: string;
  /** Filled on the project detail page after loading `integration_updates`. */
  latestUpdateBody?: string | null;
  /** ISO timestamp for the latest update (same source as `latestUpdateBody`). */
  latestUpdateCreatedAt?: string | null;
  /** Filled on the project detail page after loading `integration_tasks`. */
  openTaskCount?: number;
};

export function serializeProjectIntegrationRow(row: {
  id: string;
  delivery_progress: string;
  integration_state: string;
  integrations: unknown;
}): SerializedProjectIntegrationRow {
  const integObj = narrowProjectIntegration(row.integrations);
  const catalog = integrationCatalogMeta(integObj);
  return {
    id: row.id,
    delivery_progress: row.delivery_progress,
    integration_state: row.integration_state,
    title: projectIntegrationTitle(integObj),
    catalogMeta: catalog,
    meta: catalog,
    integrationTypeLabel: integrationTypeLabel(integObj),
    functionalAreaLabel: integrationFunctionalAreaLabel(integObj),
    deliveryProgressLabel: formatDeliveryProgressLabel(row.delivery_progress),
  };
}
