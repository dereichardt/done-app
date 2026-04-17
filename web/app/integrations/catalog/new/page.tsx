import { ensureDefaultLookups } from "@/lib/actions/ensure-lookups";
import { buildFunctionalAreaLookupData } from "@/lib/functional-area-grouping";
import { buildIntegrationTypeSelectOptions } from "@/lib/integration-metadata";
import { createClient } from "@/lib/supabase/server";
import type { IntegrationLookupOptions } from "@/app/projects/[id]/integration-definition-fields";
import { CatalogEntryNewClient } from "./catalog-entry-new-client";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function sp(val: string | string[] | undefined): string {
  return typeof val === "string" ? val : "";
}

export default async function CatalogEntryNewPage({ searchParams }: PageProps) {
  const resolvedParams = await searchParams;
  const returnHref = sp(resolvedParams["return"]) || "/integrations/catalog";

  const prefill = {
    name: sp(resolvedParams["name"]),
    internal_time_code: sp(resolvedParams["internal_time_code"]) || null,
    integrating_with: sp(resolvedParams["integrating_with"]) || null,
    direction: sp(resolvedParams["direction"]) || null,
    integration_type_id: sp(resolvedParams["integration_type_id"]) || null,
    functional_area_id: sp(resolvedParams["functional_area_id"]) || null,
    default_estimated_effort_hours: "",
    implementation_notes: null,
  };

  await ensureDefaultLookups();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: integrationTypes }, { data: functionalAreas }, { data: integrationDomains }] = await Promise.all([
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

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="heading-page">Add catalog entry</h1>

      <CatalogEntryNewClient lookups={lookups} returnHref={returnHref} initial={prefill} />
    </div>
  );
}
