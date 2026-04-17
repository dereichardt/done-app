import { ensureDefaultLookups } from "@/lib/actions/ensure-lookups";
import { createClient } from "@/lib/supabase/server";
import { buildFunctionalAreaLookupData } from "@/lib/functional-area-grouping";
import { buildIntegrationTypeSelectOptions } from "@/lib/integration-metadata";
import { notFound } from "next/navigation";
import type { IntegrationLookupOptions } from "../../integration-definition-fields";
import { AddIntegrationClient, type CatalogIntegrationOption } from "./add-integration-client";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function AddIntegrationPage({ params }: PageProps) {
  const { id: projectId } = await params;
  await ensureDefaultLookups();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!project) notFound();

  const [
    { data: integrationTypes },
    { data: functionalAreas },
    { data: integrationDomains },
    { data: catalogIntegrations },
  ] = await Promise.all([
    supabase
      .from("integration_types")
      .select("id, name")
      .eq("owner_id", user.id)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("functional_areas")
      .select("id, name, domain_id, is_active")
      .eq("owner_id", user.id)
      .order("sort_order"),
    supabase
      .from("integration_domains")
      .select("id, name, is_active")
      .eq("owner_id", user.id)
      .order("sort_order"),
    supabase
      .from("integrations")
      .select(
        "id, name, integrating_with, integration_code, internal_time_code, default_estimated_effort_hours, direction, integration_type_id, functional_area_id, domain_id",
      )
      .eq("owner_id", user.id)
      .eq("catalog_visibility", "catalog")
      .order("name"),
  ]);

  const faLookup = buildFunctionalAreaLookupData(functionalAreas ?? [], integrationDomains ?? []);

  const lookups: IntegrationLookupOptions = {
    integrationTypes: buildIntegrationTypeSelectOptions(integrationTypes ?? []),
    functionalAreas: faLookup.functionalAreas,
    functionalAreasByDomain: faLookup.functionalAreasByDomain,
    functionalAreaGroups: faLookup.functionalAreaGroups,
    areaDomainCodeById: faLookup.areaDomainCodeById,
    domains: faLookup.domains,
  };

  const catalogRows: CatalogIntegrationOption[] = (catalogIntegrations ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    integrating_with: i.integrating_with,
    integration_code: i.integration_code,
    internal_time_code: i.internal_time_code ?? null,
    default_estimated_effort_hours:
      i.default_estimated_effort_hours != null && i.default_estimated_effort_hours !== ""
        ? Number(i.default_estimated_effort_hours)
        : null,
    direction: i.direction,
    integration_type_id: i.integration_type_id,
    functional_area_id: i.functional_area_id,
    domain_id: i.domain_id,
  }));

  return (
    <div>
      <AddIntegrationClient projectId={projectId} lookups={lookups} catalogRows={catalogRows} />
    </div>
  );
}
