import { ensureDefaultLookups } from "@/lib/actions/ensure-lookups";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { CatalogListTable, type CatalogListRow } from "./catalog-list-table";

export const dynamic = "force-dynamic";

function relationName(v: unknown): { name: string } | null {
  if (v == null) return null;
  const row = Array.isArray(v) ? v[0] : v;
  if (row && typeof row === "object" && "name" in row && typeof (row as { name: unknown }).name === "string") {
    return { name: (row as { name: string }).name };
  }
  return null;
}

export default async function IntegrationCatalogListPage() {
  await ensureDefaultLookups();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: rows } = await supabase
    .from("integrations")
    .select(
      `
      id,
      name,
      integrating_with,
      internal_time_code,
      direction,
      default_estimated_effort_hours,
      integration_type_id,
      functional_area_id,
      implementation_notes,
      integration_types ( name ),
      functional_areas ( name ),
      integration_domains ( name )
    `,
    )
    .eq("owner_id", user.id)
    .eq("catalog_visibility", "catalog")
    .order("name", { ascending: true });

  const list = rows ?? [];
  const catalogIds = list.map((r) => r.id);
  const usageLinkCountById = new Map<string, number>();
  if (catalogIds.length > 0) {
    const { data: children } = await supabase
      .from("integrations")
      .select("id, prefilled_from_integration_id")
      .eq("owner_id", user.id)
      .in("prefilled_from_integration_id", catalogIds);

    const childIds = (children ?? []).map((c) => c.id);
    const childIdToTemplate = new Map(
      (children ?? []).map((c) => [c.id, c.prefilled_from_integration_id as string]),
    );
    if (childIds.length > 0) {
      const { data: pis } = await supabase
        .from("project_integrations")
        .select("integration_id")
        .in("integration_id", childIds);
      for (const pi of pis ?? []) {
        const tmpl = childIdToTemplate.get(pi.integration_id);
        if (tmpl) usageLinkCountById.set(tmpl, (usageLinkCountById.get(tmpl) ?? 0) + 1);
      }
    }
  }

  const tableRows: CatalogListRow[] = list.map((r) => ({
    id: r.id,
    name: r.name,
    integrating_with: r.integrating_with,
    internal_time_code: r.internal_time_code,
    direction: r.direction,
    integration_type_id: r.integration_type_id,
    functional_area_id: r.functional_area_id,
    default_estimated_effort_hours:
      r.default_estimated_effort_hours != null && r.default_estimated_effort_hours !== ""
        ? Number(r.default_estimated_effort_hours)
        : null,
    integration_types: relationName(r.integration_types),
    functional_areas: relationName(r.functional_areas),
    integration_domains: relationName(r.integration_domains),
    usageLinkCount: usageLinkCountById.get(r.id) ?? 0,
    implementation_notes:
      typeof r.implementation_notes === "string" ? r.implementation_notes : null,
  }));

  return (
    <div className="max-w-[min(100vw-2rem,96rem)]">
      <h1 className="heading-page">Integration Catalog</h1>

      <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <h2 className="section-heading">Catalog entries</h2>
            <span className="text-sm tabular-nums text-muted-canvas" aria-label={`${tableRows.length} total`}>
              ({tableRows.length})
            </span>
          </div>
          <Link
            href="/integrations/catalog/new"
            className="btn-cta shrink-0 whitespace-nowrap text-xs"
            style={{ padding: "0.4rem 0.85rem" }}
          >
            Add entry
          </Link>
        </div>
        <div className="mt-4">
          {tableRows.length === 0 ? (
            <p className="text-sm text-muted-canvas">
              No catalog entries yet. From a project integration, use{" "}
              <span className="font-medium text-[var(--app-text)]">Add definition to integration catalog</span>{" "}
              (set an internal time code on the integration first).
            </p>
          ) : (
            <CatalogListTable rows={tableRows} />
          )}
        </div>
      </section>
    </div>
  );
}
