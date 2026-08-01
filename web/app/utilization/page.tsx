import { Suspense } from "react";

import { UtilizationPageClient } from "./utilization-page-client";
import { loadUtilizationPageData } from "@/lib/actions/utilization";

export const dynamic = "force-dynamic";

export default async function UtilizationPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const quarterStartYmd = typeof params.q === "string" ? params.q : null;
  const { data, error } = await loadUtilizationPageData(quarterStartYmd);

  if (error || !data) {
    return (
      <div>
        <h1 className="heading-page">Utilization</h1>
        <p className="subheading-page mt-2" style={{ color: "var(--app-danger)" }}>
          {error ?? "Could not load utilization."}
        </p>
      </div>
    );
  }

  return (
    <Suspense>
      <UtilizationPageClient initialData={data} />
    </Suspense>
  );
}
