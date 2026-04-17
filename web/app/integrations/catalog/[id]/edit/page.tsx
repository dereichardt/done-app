import { ensureDefaultLookups } from "@/lib/actions/ensure-lookups";
import { loadCatalogIntegrationDetail } from "@/lib/load-catalog-integration-detail";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { CatalogEntryEditClient } from "./catalog-entry-edit-client";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function CatalogEntryEditPage({ params }: PageProps) {
  const { id: catalogIntegrationId } = await params;
  await ensureDefaultLookups();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const payload = await loadCatalogIntegrationDetail(supabase, user.id, catalogIntegrationId);
  if (!payload) notFound();

  const { integ, lookups, promotedFromLabel, defEff } = payload;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="heading-page">Edit catalog entry</h1>
      {promotedFromLabel ? (
        <p className="mt-1 text-sm text-muted-canvas">
          Promoted from project integration:{" "}
          <span className="font-medium text-[var(--app-text)]">{promotedFromLabel}</span>
        </p>
      ) : null}

      <CatalogEntryEditClient
        catalogIntegrationId={catalogIntegrationId}
        lookups={lookups}
        returnHref="/integrations/catalog"
        initial={{
          name: integ.name,
          internal_time_code: integ.internal_time_code,
          integrating_with: integ.integrating_with,
          direction: integ.direction,
          integration_type_id: integ.integration_type_id,
          functional_area_id: integ.functional_area_id,
          default_estimated_effort_hours: defEff,
          implementation_notes: integ.implementation_notes,
        }}
      />
    </div>
  );
}
