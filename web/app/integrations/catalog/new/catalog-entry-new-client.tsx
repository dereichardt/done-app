"use client";

import type { IntegrationLookupOptions } from "@/app/projects/[id]/integration-definition-fields";
import { CatalogEntryEditForm } from "@/app/integrations/catalog/[id]/edit/catalog-entry-edit-form";
import { useRouter } from "next/navigation";

type CatalogEntryInitial = {
  name: string;
  internal_time_code: string | null;
  integrating_with: string | null;
  direction: string | null;
  integration_type_id: string | null;
  functional_area_id: string | null;
  default_estimated_effort_hours: string;
  implementation_notes: string | null;
};

const emptyInitial: CatalogEntryInitial = {
  name: "",
  internal_time_code: null,
  integrating_with: null,
  direction: null,
  integration_type_id: null,
  functional_area_id: null,
  default_estimated_effort_hours: "",
  implementation_notes: null,
};

export function CatalogEntryNewClient({
  lookups,
  returnHref,
  initial = emptyInitial,
}: {
  lookups: IntegrationLookupOptions;
  returnHref: string;
  initial?: CatalogEntryInitial;
}) {
  const router = useRouter();

  return (
    <CatalogEntryEditForm
      mode="create"
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
