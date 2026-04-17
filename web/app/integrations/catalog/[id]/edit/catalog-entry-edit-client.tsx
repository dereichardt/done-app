"use client";

import type { IntegrationLookupOptions } from "@/app/projects/[id]/integration-definition-fields";
import { useRouter } from "next/navigation";
import { CatalogEntryEditForm } from "./catalog-entry-edit-form";

type Initial = {
  name: string;
  internal_time_code: string | null;
  integrating_with: string | null;
  direction: string | null;
  integration_type_id: string | null;
  functional_area_id: string | null;
  default_estimated_effort_hours: string;
  implementation_notes: string | null;
};

export function CatalogEntryEditClient({
  catalogIntegrationId,
  lookups,
  initial,
  returnHref,
}: {
  catalogIntegrationId: string;
  lookups: IntegrationLookupOptions;
  initial: Initial;
  returnHref: string;
}) {
  const router = useRouter();

  return (
    <CatalogEntryEditForm
      mode="edit"
      catalogIntegrationId={catalogIntegrationId}
      lookups={lookups}
      initial={initial}
      onCancel={() => router.push(returnHref)}
      onSaveSuccess={() => {
        router.refresh();
        router.push(returnHref);
      }}
    />
  );
}
