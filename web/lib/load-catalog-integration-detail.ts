import { buildFunctionalAreaLookupData } from "@/lib/functional-area-grouping";
import {
  buildIntegrationTypeSelectOptions,
  formatDeliveryProgressLabel,
  formatIntegrationDefinitionDisplayName,
} from "@/lib/integration-metadata";
import type { IntegrationLookupOptions } from "@/app/projects/[id]/integration-definition-fields";
import {
  isImplementationNotesHtmlEmpty,
  sanitizeImplementationNotesHtml,
} from "@/lib/sanitize-implementation-notes";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CatalogUsageRowDTO = {
  project_integration_id: string;
  project_id: string;
  customer_name: string | null;
  integration_display_name: string;
  delivery_progress: string;
  delivery_progress_label: string;
  actual_effort_hours: number;
};

export type CatalogIntegrationDetailDTO = {
  catalogIntegrationId: string;
  displayTitle: string;
  integ: {
    name: string;
    integrating_with: string | null;
    integration_code: string | null;
    internal_time_code: string | null;
    default_estimated_effort_hours: unknown;
    direction: string | null;
    integration_type_id: string | null;
    functional_area_id: string | null;
    domain_id: string | null;
    promoted_from_integration_id: string | null;
    implementation_notes: string | null;
  };
  lookups: IntegrationLookupOptions;
  usageRows: CatalogUsageRowDTO[];
  promotedFromLabel: string | null;
  defEff: string;
};

export async function loadCatalogIntegrationDetail(
  supabase: SupabaseClient,
  userId: string,
  catalogIntegrationId: string,
): Promise<CatalogIntegrationDetailDTO | null> {
  const { data: integ, error: integErr } = await supabase
    .from("integrations")
    .select(
      `
      id,
      name,
      integrating_with,
      integration_code,
      internal_time_code,
      default_estimated_effort_hours,
      direction,
      catalog_visibility,
      integration_type_id,
      functional_area_id,
      domain_id,
      promoted_from_integration_id,
      implementation_notes
    `,
    )
    .eq("id", catalogIntegrationId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (integErr || !integ || integ.catalog_visibility !== "catalog") return null;

  const [{ data: integrationTypes }, { data: functionalAreas }, { data: integrationDomains }, { data: childDefs }] =
    await Promise.all([
      supabase
        .from("integration_types")
        .select("id, name")
        .eq("owner_id", userId)
        .eq("is_active", true)
        .order("sort_order"),
      supabase
        .from("functional_areas")
        .select("id, name, domain_id, is_active")
        .eq("owner_id", userId)
        .order("sort_order"),
      supabase
        .from("integration_domains")
        .select("id, name, is_active")
        .eq("owner_id", userId)
        .order("sort_order"),
      supabase
        .from("integrations")
        .select("id, name, integrating_with, integration_code, direction")
        .eq("owner_id", userId)
        .eq("prefilled_from_integration_id", catalogIntegrationId),
    ]);

  const childList = childDefs ?? [];
  const childIds = childList.map((c) => c.id);
  const childDisplayNameById = new Map<string, string>();
  for (const c of childList) {
    const display =
      formatIntegrationDefinitionDisplayName({
        integration_code: c.integration_code,
        integrating_with: c.integrating_with,
        name: c.name,
        direction: c.direction,
      }) || (c.name ?? "");
    childDisplayNameById.set(c.id, display);
  }
  let usageRows: CatalogUsageRowDTO[] = [];

  if (childIds.length > 0) {
    const { data: piRows } = await supabase
      .from("project_integrations")
      .select("id, project_id, integration_id, delivery_progress, projects ( customer_name )")
      .in("integration_id", childIds);

    const piList = piRows ?? [];
    const piIds = piList.map((p) => p.id);

    let taskRows: { id: string; project_track_id: string }[] = [];
    if (piIds.length > 0) {
      const { data: tracks } = await supabase
        .from("project_tracks")
        .select("id, project_integration_id")
        .eq("kind", "integration")
        .in("project_integration_id", piIds);
      const trackIds = (tracks ?? []).map((t) => t.id);
      if (trackIds.length > 0) {
        const { data: tr } = await supabase
          .from("integration_tasks")
          .select("id, project_track_id")
          .in("project_track_id", trackIds);
        taskRows = tr ?? [];
      }
      const projectIntegrationIdByTrackId = new Map<string, string>();
      for (const t of tracks ?? []) {
        if (t.project_integration_id) {
          projectIntegrationIdByTrackId.set(t.id, t.project_integration_id);
        }
      }
      const piIdByTaskId = new Map<string, string>();
      for (const t of taskRows) {
        const piId = projectIntegrationIdByTrackId.get(t.project_track_id);
        if (piId) piIdByTaskId.set(t.id, piId);
      }

      const actualByPi = new Map<string, number>();
      const taskIds = taskRows.map((t) => t.id);
      if (taskIds.length > 0) {
        const { data: ws } = await supabase
          .from("integration_task_work_sessions")
          .select("integration_task_id, duration_hours")
          .in("integration_task_id", taskIds);
        for (const row of ws ?? []) {
          const piId = piIdByTaskId.get(row.integration_task_id);
          if (!piId) continue;
          const hours = Number(row.duration_hours);
          if (!Number.isFinite(hours)) continue;
          actualByPi.set(piId, (actualByPi.get(piId) ?? 0) + hours);
        }
      }

      usageRows = piList.map((pi) => {
        const proj = pi.projects as { customer_name?: string | null } | null;
        const deliveryProgress = typeof pi.delivery_progress === "string" ? pi.delivery_progress : "";
        return {
          project_integration_id: pi.id,
          project_id: pi.project_id,
          customer_name: proj?.customer_name ?? null,
          integration_display_name: childDisplayNameById.get(pi.integration_id as string) ?? "",
          delivery_progress: deliveryProgress,
          delivery_progress_label: deliveryProgress ? formatDeliveryProgressLabel(deliveryProgress) : "—",
          actual_effort_hours: actualByPi.get(pi.id) ?? 0,
        };
      });
      usageRows.sort((a, b) => (a.customer_name ?? "").localeCompare(b.customer_name ?? ""));
    }
  }

  let promotedFromLabel: string | null = null;
  if (typeof integ.promoted_from_integration_id === "string") {
    const { data: src } = await supabase
      .from("integrations")
      .select("name, integration_code, integrating_with, direction")
      .eq("id", integ.promoted_from_integration_id)
      .eq("owner_id", userId)
      .maybeSingle();
    if (src) {
      promotedFromLabel =
        formatIntegrationDefinitionDisplayName({
          integration_code: src.integration_code,
          integrating_with: src.integrating_with,
          name: src.name,
          direction: src.direction,
        }) || src.name;
    }
  }

  const faLookup = buildFunctionalAreaLookupData(functionalAreas ?? [], integrationDomains ?? []);
  const lookups: IntegrationLookupOptions = {
    integrationTypes: buildIntegrationTypeSelectOptions(integrationTypes ?? []),
    functionalAreas: faLookup.functionalAreas,
    functionalAreasByDomain: faLookup.functionalAreasByDomain,
    functionalAreaGroups: faLookup.functionalAreaGroups,
    areaDomainCodeById: faLookup.areaDomainCodeById,
    domains: faLookup.domains,
  };

  const baseDisplayTitle =
    formatIntegrationDefinitionDisplayName({
      integration_code: integ.integration_code,
      integrating_with: integ.integrating_with,
      name: integ.name,
      direction: integ.direction,
    }) || integ.name;
  const timeCode = (integ.internal_time_code ?? "").trim();
  const displayTitle = timeCode ? `${timeCode} ${baseDisplayTitle}` : baseDisplayTitle;

  const defEff =
    integ.default_estimated_effort_hours != null && integ.default_estimated_effort_hours !== ""
      ? String(Number(integ.default_estimated_effort_hours))
      : "";

  return {
    catalogIntegrationId,
    displayTitle,
    integ: {
      name: integ.name,
      integrating_with: integ.integrating_with,
      integration_code: integ.integration_code,
      internal_time_code: integ.internal_time_code,
      default_estimated_effort_hours: integ.default_estimated_effort_hours,
      direction: integ.direction,
      integration_type_id: integ.integration_type_id,
      functional_area_id: integ.functional_area_id,
      domain_id: integ.domain_id,
      promoted_from_integration_id: integ.promoted_from_integration_id,
      implementation_notes:
        typeof integ.implementation_notes === "string"
          ? (() => {
              const s = sanitizeImplementationNotesHtml(integ.implementation_notes);
              return isImplementationNotesHtmlEmpty(s) ? null : s;
            })()
          : null,
    },
    lookups,
    usageRows,
    promotedFromLabel,
    defEff,
  };
}
