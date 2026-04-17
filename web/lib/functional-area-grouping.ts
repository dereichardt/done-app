import {
  FUNCTIONAL_AREA_TO_DOMAIN,
  INTEGRATION_DOMAIN_CODES,
  type IntegrationDomainCode,
} from "@/lib/functional-area-catalog";

export type DomainLookupRow = { id: string; name: string };

export type FunctionalAreaLookupRow = {
  id: string;
  name: string;
  domainId: string | null;
  isActive: boolean;
};

/** Legacy `integration_domains.name` → canonical code (before FIN/HCM/PAY/SCM migration). */
const LEGACY_DOMAIN_NAME_TO_CODE: Record<string, IntegrationDomainCode> = {
  "Human Capital Management": "HCM",
  "Payroll Services": "PAY",
  "Financial Management": "FIN",
  Talent: "HCM",
  "Supply Chain Management": "SCM",
};

function normAreaName(name: string): string {
  return String(name ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normLabel(name: string): string {
  return String(name ?? "").trim();
}

function toCanonicalDomainCode(name: string): IntegrationDomainCode | null {
  const u = normLabel(name).toUpperCase();
  if ((INTEGRATION_DOMAIN_CODES as readonly string[]).includes(u)) {
    return u as IntegrationDomainCode;
  }
  return null;
}

function legacyDomainNameToCode(name: string): IntegrationDomainCode | null {
  const n = normLabel(name);
  if (LEGACY_DOMAIN_NAME_TO_CODE[n]) return LEGACY_DOMAIN_NAME_TO_CODE[n];
  const lower = n.toLowerCase();
  for (const [k, v] of Object.entries(LEGACY_DOMAIN_NAME_TO_CODE)) {
    if (k.toLowerCase() === lower) return v;
  }
  return null;
}

/** Map integration_domains row → FIN/HCM/PAY/SCM using code-style names or legacy labels. */
function resolveDomainRowToCode(domainName: string): IntegrationDomainCode | null {
  return toCanonicalDomainCode(domainName) ?? legacyDomainNameToCode(domainName);
}

function buildAreaNameToDomainCode(): Map<string, IntegrationDomainCode> {
  const m = new Map<string, IntegrationDomainCode>();
  for (const row of FUNCTIONAL_AREA_TO_DOMAIN) {
    m.set(normAreaName(row.area), row.domain);
  }
  m.set(normAreaName("Benefits Administration"), "HCM");
  return m;
}

export type FunctionalAreaGroup = { label: string; areas: FunctionalAreaLookupRow[] };

export type FunctionalAreaDbRow = {
  id: string;
  name: string | null;
  domain_id: string | null;
  is_active: boolean | null;
};

export type IntegrationDomainDbRow = {
  id: string;
  name: string;
  is_active?: boolean | null;
};

/**
 * One place (server) resolves catalog name + legacy FK → FIN/HCM/PAY/SCM buckets.
 * Domain rows are normalized to canonical codes so client drill keys always match.
 */
export function buildFunctionalAreaLookupData(
  areaRows: FunctionalAreaDbRow[],
  domainRows: IntegrationDomainDbRow[],
): {
  functionalAreas: FunctionalAreaLookupRow[];
  functionalAreasByDomain: Record<IntegrationDomainCode, FunctionalAreaLookupRow[]>;
  functionalAreaGroups: FunctionalAreaGroup[];
  areaDomainCodeById: Record<string, IntegrationDomainCode>;
  domains: DomainLookupRow[];
} {
  const nameToCode = buildAreaNameToDomainCode();
  const domainIdToName = new Map(domainRows.map((d) => [d.id, normLabel(d.name)]));
  const domainIdToCode = new Map<string, IntegrationDomainCode>();
  for (const d of domainRows ?? []) {
    const code = resolveDomainRowToCode(d.name);
    if (code) domainIdToCode.set(d.id, code);
  }

  const functionalAreas: FunctionalAreaLookupRow[] = (areaRows ?? []).map((r) => ({
    id: r.id,
    name: String(r.name ?? ""),
    domainId: r.domain_id ?? null,
    isActive: r.is_active !== false,
  }));

  const functionalAreasByDomain = Object.fromEntries(
    INTEGRATION_DOMAIN_CODES.map((c) => [c, [] as FunctionalAreaLookupRow[]]),
  ) as Record<IntegrationDomainCode, FunctionalAreaLookupRow[]>;

  const areaDomainCodeById: Record<string, IntegrationDomainCode> = {};

  function resolveCode(area: FunctionalAreaLookupRow): IntegrationDomainCode | null {
    const fromCatalog = nameToCode.get(normAreaName(area.name));
    if (fromCatalog) return fromCatalog;
    if (!area.domainId) return null;
    const fromFk = domainIdToCode.get(area.domainId);
    if (fromFk) return fromFk;
    const dName = domainIdToName.get(area.domainId);
    if (!dName) return null;
    return resolveDomainRowToCode(dName);
  }

  const catalogOrder = new Map<string, number>();
  FUNCTIONAL_AREA_TO_DOMAIN.forEach((row, i) => {
    catalogOrder.set(normAreaName(row.area), i);
  });

  for (const area of functionalAreas) {
    if (area.isActive === false) continue;
    const code = resolveCode(area);
    if (!code) continue;
    functionalAreasByDomain[code].push(area);
    areaDomainCodeById[area.id] = code;
  }

  for (const code of INTEGRATION_DOMAIN_CODES) {
    functionalAreasByDomain[code].sort((a, b) => {
      const ia = catalogOrder.get(normAreaName(a.name));
      const ib = catalogOrder.get(normAreaName(b.name));
      if (ia !== undefined && ib !== undefined) return ia - ib;
      if (ia !== undefined) return -1;
      if (ib !== undefined) return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }

  const domains: DomainLookupRow[] = (domainRows ?? [])
    .filter((d) => d.is_active !== false && toCanonicalDomainCode(d.name) != null)
    .map((d) => ({
      id: d.id,
      name: toCanonicalDomainCode(d.name)!,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  const placedIds = new Set(Object.keys(areaDomainCodeById));
  const unmapped: FunctionalAreaLookupRow[] = [];
  for (const area of functionalAreas) {
    if (area.isActive === false) continue;
    if (placedIds.has(area.id)) continue;
    unmapped.push(area);
  }

  const functionalAreaGroups: FunctionalAreaGroup[] = INTEGRATION_DOMAIN_CODES.filter(
    (code) => (functionalAreasByDomain[code] ?? []).length > 0,
  ).map((code) => ({ label: code, areas: functionalAreasByDomain[code] }));

  if (unmapped.length > 0) {
    const extra = new Map<string, FunctionalAreaLookupRow[]>();
    for (const area of unmapped) {
      let label: string;
      if (area.domainId) {
        label = domainIdToName.get(area.domainId) ?? "Unknown domain";
      } else {
        label = "Uncategorized";
      }
      if (!extra.has(label)) extra.set(label, []);
      extra.get(label)!.push(area);
    }
    const sortedEntries = [...extra.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], undefined, { sensitivity: "base" }),
    );
    for (const [, areas] of sortedEntries) {
      areas.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    }
    for (const [label, areas] of sortedEntries) {
      functionalAreaGroups.push({ label, areas });
    }
  }

  /** Last resort: active rows exist but nothing was grouped (unexpected); still show them. */
  if (functionalAreaGroups.length === 0) {
    const visible = functionalAreas.filter((a) => a.isActive !== false);
    if (visible.length > 0) {
      visible.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
      functionalAreaGroups.push({ label: "Functional areas", areas: visible });
    }
  }

  return {
    functionalAreas,
    functionalAreasByDomain,
    functionalAreaGroups,
    areaDomainCodeById,
    domains,
  };
}
