import { ensureDefaultLookups } from "@/lib/actions/ensure-lookups";
import { createClient } from "@/lib/supabase/server";
import { loadCatalogIntegrationDetail } from "@/lib/load-catalog-integration-detail";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogUsageTable } from "../catalog-usage-table";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function CatalogIntegrationDetailPage({ params }: PageProps) {
  const { id: catalogIntegrationId } = await params;
  await ensureDefaultLookups();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const payload = await loadCatalogIntegrationDetail(supabase, user.id, catalogIntegrationId);
  if (!payload) notFound();

  const { integ, usageRows, promotedFromLabel, displayTitle } = payload;

  return (
    <div className="max-w-5xl">
      <p className="text-sm">
        <Link href="/integrations/catalog" className="text-muted-canvas underline-offset-2 hover:underline">
          Integration catalog
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="heading-page">{displayTitle}</h1>
          <p className="mt-2 text-sm text-muted-canvas">
            Internal time code:{" "}
            <span className="font-medium text-[var(--app-text)]">{integ.internal_time_code ?? "—"}</span>
          </p>
          {promotedFromLabel ? (
            <p className="mt-1 text-sm text-muted-canvas">
              Promoted from project integration:{" "}
              <span className="font-medium text-[var(--app-text)]">{promotedFromLabel}</span>
            </p>
          ) : null}
        </div>
        <Link
          href={`/integrations/catalog/${catalogIntegrationId}/edit`}
          className="btn-cta-dark shrink-0 text-sm no-underline"
        >
          Edit catalog entry
        </Link>
      </div>

      <section className="mt-10">
        <h2 className="section-heading">Project usage</h2>
        <p className="mt-1 text-sm text-muted-canvas">
          Project integrations created from this catalog entry (via Populate from catalog).
        </p>
        <div className="mt-4">
          <CatalogUsageTable usageRows={usageRows} />
        </div>
      </section>
    </div>
  );
}
