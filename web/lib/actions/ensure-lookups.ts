"use server";

import {
  FUNCTIONAL_AREA_CATALOG_SEED,
  INTEGRATION_DOMAIN_CATALOG_SEED,
} from "@/lib/functional-area-catalog";
import { INTEGRATION_TYPE_CATALOG_SEED } from "@/lib/integration-metadata";
import { createClient } from "@/lib/supabase/server";

function normDomainName(name: string): string {
  return name.trim().toUpperCase();
}

/** Backfill defaults if the auth trigger did not run (e.g. user existed before migration). */
export async function ensureDefaultLookups(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { count, error: countError } = await supabase
    .from("project_types")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", user.id);

  if (!countError && (count === null || count === 0)) {
    await supabase.from("project_types").insert([
      { owner_id: user.id, name: "Launch Flex - Base", sort_order: 1 },
      { owner_id: user.id, name: "Launch Flex - Extended", sort_order: 2 },
      { owner_id: user.id, name: "Launch Flex - Tailored", sort_order: 3 },
      { owner_id: user.id, name: "Launch Express", sort_order: 4 },
    ]);

    await supabase.from("project_roles").insert([
      { owner_id: user.id, name: "Lead", sort_order: 1 },
      { owner_id: user.id, name: "Architect", sort_order: 2 },
      { owner_id: user.id, name: "Builder", sort_order: 3 },
      { owner_id: user.id, name: "Advisor", sort_order: 4 },
    ]);
  }

  const { count: intTypeCount, error: intTypeError } = await supabase
    .from("integration_types")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", user.id);

  if (!intTypeError && (intTypeCount === null || intTypeCount === 0)) {
    await supabase.from("integration_types").insert(
      INTEGRATION_TYPE_CATALOG_SEED.map((row) => ({
        owner_id: user.id,
        name: row.name,
        sort_order: row.sort_order,
      })),
    );

    await supabase.from("integration_domains").insert(
      INTEGRATION_DOMAIN_CATALOG_SEED.map((row) => ({
        owner_id: user.id,
        name: row.name,
        sort_order: row.sort_order,
      })),
    );

    const { data: domRows } = await supabase
      .from("integration_domains")
      .select("id, name")
      .eq("owner_id", user.id);

    const dom = (code: string) =>
      domRows?.find((d) => normDomainName(d.name) === normDomainName(code))?.id ?? null;

    const faRows = FUNCTIONAL_AREA_CATALOG_SEED.map((row) => ({
      owner_id: user.id,
      name: row.name,
      sort_order: row.sort_order,
      domain_id: dom(row.domainName),
    })).filter((r) => r.domain_id != null);

    if (faRows.length > 0) {
      await supabase.from("functional_areas").insert(faRows);
    }
  }

  const { data: existingTypes, error: existingTypesError } = await supabase
    .from("integration_types")
    .select("name")
    .eq("owner_id", user.id);

  if (!existingTypesError) {
    const haveName = new Set((existingTypes ?? []).map((r) => r.name));
    const missing = INTEGRATION_TYPE_CATALOG_SEED.filter((row) => !haveName.has(row.name));
    if (missing.length > 0) {
      await supabase.from("integration_types").insert(
        missing.map((row) => ({
          owner_id: user.id,
          name: row.name,
          sort_order: row.sort_order,
        })),
      );
    }
  }

  /** Domain codes (FIN / HCM / PAY / SCM) — never skip this block because of unrelated query errors. */
  const { data: domainList } = await supabase
    .from("integration_domains")
    .select("id, name")
    .eq("owner_id", user.id);

  const haveDomainNorm = new Set((domainList ?? []).map((d) => normDomainName(d.name)));
  const missingDomains = INTEGRATION_DOMAIN_CATALOG_SEED.filter(
    (row) => !haveDomainNorm.has(normDomainName(row.name)),
  );
  if (missingDomains.length > 0) {
    await supabase.from("integration_domains").insert(
      missingDomains.map((row) => ({
        owner_id: user.id,
        name: row.name,
        sort_order: row.sort_order,
      })),
    );
  }

  await supabase
    .from("functional_areas")
    .update({ name: "Benefits" })
    .eq("owner_id", user.id)
    .eq("name", "Benefits Administration");

  const { data: domainRows } = await supabase
    .from("integration_domains")
    .select("id, name")
    .eq("owner_id", user.id);

  const domId = (code: string) =>
    domainRows?.find((d) => normDomainName(d.name) === normDomainName(code))?.id ?? null;

  const { data: existingFaNames } = await supabase
    .from("functional_areas")
    .select("name")
    .eq("owner_id", user.id);

  const haveFa = new Set((existingFaNames ?? []).map((r) => r.name));

  const toInsert = FUNCTIONAL_AREA_CATALOG_SEED.filter((row) => !haveFa.has(row.name))
    .map((row) => {
      const domain_id = domId(row.domainName);
      if (!domain_id) return null;
      return {
        owner_id: user.id,
        name: row.name,
        sort_order: row.sort_order,
        domain_id,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r != null);

  if (toInsert.length > 0) {
    await supabase.from("functional_areas").insert(toInsert);
  }

  /** Repair domain_id / sort_order for existing catalog rows. */
  for (const row of FUNCTIONAL_AREA_CATALOG_SEED) {
    const domain_id = domId(row.domainName);
    if (!domain_id) continue;

    const { data: fa } = await supabase
      .from("functional_areas")
      .select("id, domain_id")
      .eq("owner_id", user.id)
      .eq("name", row.name)
      .maybeSingle();

    if (fa && fa.domain_id !== domain_id) {
      await supabase
        .from("functional_areas")
        .update({ domain_id, sort_order: row.sort_order })
        .eq("id", fa.id);
    }
  }

  await supabase
    .from("integration_domains")
    .update({ is_active: false })
    .eq("owner_id", user.id)
    .in("name", ["Human Capital Management", "Payroll Services", "Financial Management", "Talent"]);

  await supabase
    .from("functional_areas")
    .update({ is_active: false })
    .eq("owner_id", user.id)
    .eq("name", "Integrations Platform");
}
