/**
 * Canonical Workday-style domains (codes) and functional area → domain mapping.
 * Used for seeds, migrations, and client/server catalog consistency.
 */

export const INTEGRATION_DOMAIN_CODES = ["FIN", "HCM", "PAY", "SCM"] as const;
export type IntegrationDomainCode = (typeof INTEGRATION_DOMAIN_CODES)[number];

/** Functional area display name → domain code. */
export const FUNCTIONAL_AREA_TO_DOMAIN: ReadonlyArray<{
  area: string;
  domain: IntegrationDomainCode;
}> = [
  { area: "Absence", domain: "PAY" },
  { area: "Advanced Compensation", domain: "HCM" },
  { area: "Banking & Settlement", domain: "FIN" },
  { area: "Benefits", domain: "HCM" },
  { area: "Budgets", domain: "FIN" },
  { area: "Business Assets", domain: "FIN" },
  { area: "Compensation", domain: "HCM" },
  { area: "Customer Accounts", domain: "FIN" },
  { area: "Customer Contracts", domain: "FIN" },
  { area: "Expenses", domain: "FIN" },
  { area: "FDM/Financial Accounting", domain: "FIN" },
  { area: "Gifts", domain: "FIN" },
  { area: "Grants", domain: "FIN" },
  { area: "Core HCM", domain: "HCM" },
  { area: "Inventory", domain: "SCM" },
  { area: "Learning", domain: "HCM" },
  { area: "Payroll", domain: "PAY" },
  { area: "Peakon", domain: "HCM" },
  { area: "Procurement", domain: "SCM" },
  { area: "Projects", domain: "FIN" },
  { area: "Recruiting", domain: "HCM" },
  { area: "Strategic Sourcing", domain: "SCM" },
  { area: "Supplier Accounts", domain: "FIN" },
  { area: "Supplier Admin", domain: "FIN" },
  { area: "Talent", domain: "HCM" },
  { area: "Time Tracking", domain: "PAY" },
  { area: "Third Party Payroll", domain: "PAY" },
  { area: "Workday Help", domain: "HCM" },
  { area: "Workday Journeys", domain: "HCM" },
];

export const INTEGRATION_DOMAIN_CATALOG_SEED: ReadonlyArray<{ name: IntegrationDomainCode; sort_order: number }> =
  INTEGRATION_DOMAIN_CODES.map((name, i) => ({ name, sort_order: i + 1 }));

const areaSortGlobal = [...FUNCTIONAL_AREA_TO_DOMAIN].sort((a, b) =>
  a.area.localeCompare(b.area, undefined, { sensitivity: "base" }),
);

export const FUNCTIONAL_AREA_CATALOG_SEED: ReadonlyArray<{
  name: string;
  domainName: IntegrationDomainCode;
  sort_order: number;
}> = areaSortGlobal.map((row, i) => ({
  name: row.area,
  domainName: row.domain,
  sort_order: i + 1,
}));
