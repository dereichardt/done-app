"use server";

import {
  CATALOG_GENERIC_INTEGRATING_WITH,
  isCatalogGenericIntegratingWithLabel,
  isDeliveryProgress,
  isIntegrationDirection,
  isIntegrationState,
} from "@/lib/integration-metadata";
import { isProjectColorKey, normalizeProjectColorKey } from "@/lib/project-colors";
import { createClient } from "@/lib/supabase/server";
import {
  isImplementationNotesHtmlEmpty,
  sanitizeImplementationNotesHtml,
} from "@/lib/sanitize-implementation-notes";
import type { CatalogIntegrationDetailDTO } from "@/lib/load-catalog-integration-detail";
import { loadCatalogIntegrationDetail } from "@/lib/load-catalog-integration-detail";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const DEFAULT_PHASES = [
  { name: "Plan", sort_order: 1, phase_key: "plan" },
  { name: "Architect & Configure", sort_order: 2, phase_key: "architect_configure" },
  { name: "Test", sort_order: 3, phase_key: "test" },
  { name: "Deploy", sort_order: 4, phase_key: "deploy" },
  { name: "Hypercare", sort_order: 5, phase_key: "hypercare" },
] as const;

export async function loadProjectHeader(projectId: string): Promise<{
  error?: string;
  project?: { id: string; customer_name: string; project_color_key: string | null };
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: project, error } = await supabase
    .from("projects")
    .select("id, customer_name, project_color_key")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!project) return { error: "Project not found" };

  const colorRaw = project.project_color_key;
  const project_color_key = normalizeProjectColorKey(colorRaw);

  return {
    project: {
      id: project.id,
      customer_name: project.customer_name ?? "",
      project_color_key,
    },
  };
}

export async function createProject(
  _prev: { error?: string } | void,
  formData: FormData,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const customer_name = String(formData.get("customer_name") ?? "").trim();
  if (!customer_name) return { error: "Customer name is required" };

  const project_type_id = String(formData.get("project_type_id") ?? "").trim();
  const primary_role_id = String(formData.get("primary_role_id") ?? "").trim();
  const project_color_key_raw = String(formData.get("project_color_key") ?? "").trim();
  const project_color_key = project_color_key_raw === "" ? null : project_color_key_raw;
  if (project_color_key != null && !isProjectColorKey(project_color_key)) {
    return { error: "Invalid project color" };
  }

  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      owner_id: user.id,
      customer_name,
      project_type_id: project_type_id || null,
      primary_role_id: primary_role_id || null,
      project_color_key,
    })
    .select("id")
    .single();

  if (error || !project) return { error: error?.message ?? "Could not create project" };

  const phases = DEFAULT_PHASES.map((p) => ({
    name: p.name,
    sort_order: p.sort_order,
    phase_key: p.phase_key,
    project_id: project.id,
  }));

  const { error: phaseError } = await supabase.from("project_phases").insert(phases);
  if (phaseError) return { error: phaseError.message };

  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}

export async function updateProjectDetails(
  projectId: string,
  data: {
    customer_name: string;
    project_type_id: string | null;
    primary_role_id: string | null;
    project_color_key: string | null;
  },
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const customer_name = data.customer_name.trim();
  if (!customer_name) return { error: "Customer name is required" };

  const project_type_id = data.project_type_id?.trim() || null;
  const primary_role_id = data.primary_role_id?.trim() || null;
  const project_color_key_raw = data.project_color_key?.trim() || null;
  const project_color_key = project_color_key_raw === "" ? null : project_color_key_raw;
  if (project_color_key != null && !isProjectColorKey(project_color_key)) {
    return { error: "Invalid project color" };
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!project) return { error: "Project not found" };

  if (project_type_id) {
    const { data: row } = await supabase
      .from("project_types")
      .select("id")
      .eq("id", project_type_id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!row) return { error: "Invalid project type" };
  }

  if (primary_role_id) {
    const { data: row } = await supabase
      .from("project_roles")
      .select("id")
      .eq("id", primary_role_id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!row) return { error: "Invalid role" };
  }

  const { error } = await supabase
    .from("projects")
    .update({
      customer_name,
      project_type_id,
      primary_role_id,
      project_color_key,
    })
    .eq("id", projectId)
    .eq("owner_id", user.id);

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  return {};
}

export type TimelinePhaseInput = {
  id?: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
};

export async function saveProjectTimeline(
  projectId: string,
  phases: TimelinePhaseInput[],
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!project) return { error: "Project not found" };

  const normalized = phases.map((p) => ({
    id: p.id,
    name: p.name.trim(),
    start_date: (p.start_date ?? "").trim() === "" ? null : (p.start_date ?? "").trim(),
    end_date: (p.end_date ?? "").trim() === "" ? null : (p.end_date ?? "").trim(),
  }));

  if (normalized.length === 0) {
    return { error: "Add at least one phase" };
  }

  if (normalized.some((p) => !p.name)) {
    return { error: "Every phase needs a name" };
  }

  const { data: existingRows } = await supabase
    .from("project_phases")
    .select("id")
    .eq("project_id", projectId);

  const validIds = new Set((existingRows ?? []).map((r) => r.id));

  for (let i = 0; i < normalized.length; i++) {
    const p = normalized[i];
    const sort_order = i + 1;

    if (p.id) {
      if (!validIds.has(p.id)) return { error: "Invalid phase" };
      const { error } = await supabase
        .from("project_phases")
        .update({
          name: p.name,
          start_date: p.start_date,
          end_date: p.end_date,
          sort_order,
        })
        .eq("id", p.id)
        .eq("project_id", projectId);

      if (error) return { error: error.message };
    } else {
      const { error } = await supabase.from("project_phases").insert({
        project_id: projectId,
        name: p.name,
        start_date: p.start_date,
        end_date: p.end_date,
        sort_order,
        phase_key: null,
      });

      if (error) return { error: error.message };
    }
  }

  revalidatePath(`/projects/${projectId}`);
  return {};
}

export type ParseIntegrationDefinitionFormOptions = {
  /** When true (catalog rows), internal time code must be non-empty after trim. */
  requireInternalTimeCode?: boolean;
  /** Catalog edit: never persist integration_code from the form (always null). */
  forceIntegrationCodeNull?: boolean;
};

/** Definition fields from integration forms (no catalog_visibility — that is server-controlled). */
function parseIntegrationDefinitionForm(
  formData: FormData,
  userId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
  opts?: ParseIntegrationDefinitionFormOptions,
): Promise<
  | {
      ok: true;
      row: {
        owner_id: string;
        name: string;
        integrating_with: string | null;
        integration_code: string | null;
        internal_time_code: string | null;
        direction: string | null;
        integration_type_id: string | null;
        functional_area_id: string | null;
        domain_id: string | null;
      };
    }
  | { ok: false; error: string }
> {
  return (async () => {
    const name = String(formData.get("name") ?? "").trim();
    const integrating_with = String(formData.get("integrating_with") ?? "").trim();
    const integration_code_raw = String(formData.get("integration_code") ?? "").trim();
    const internalTimeRaw = String(formData.get("internal_time_code") ?? "").trim();
    const internal_time_code = internalTimeRaw.length > 0 ? internalTimeRaw : null;
    const directionRaw = String(formData.get("direction") ?? "").trim();
    const integration_type_id = String(formData.get("integration_type_id") ?? "").trim();
    const functional_area_id = String(formData.get("functional_area_id") ?? "").trim();

    if (!name) return { ok: false, error: "Integration name is required" };

    if (opts?.requireInternalTimeCode && !internal_time_code) {
      return { ok: false, error: "Internal time code is required for catalog integrations" };
    }

    let direction_val: string | null = null;
    if (directionRaw !== "") {
      if (!isIntegrationDirection(directionRaw)) return { ok: false, error: "Invalid direction" };
      direction_val = directionRaw;
    }

    const integration_type_id_val = integration_type_id || null;
    const functional_area_id_val = functional_area_id || null;

    if (integration_type_id_val) {
      const { data: row } = await supabase
        .from("integration_types")
        .select("id")
        .eq("id", integration_type_id_val)
        .eq("owner_id", userId)
        .maybeSingle();
      if (!row) return { ok: false, error: "Invalid integration type" };
    }

    let domain_id_val: string | null = null;
    if (functional_area_id_val) {
      const { data: faRow } = await supabase
        .from("functional_areas")
        .select("id, domain_id")
        .eq("id", functional_area_id_val)
        .eq("owner_id", userId)
        .maybeSingle();
      if (!faRow) return { ok: false, error: "Invalid functional area" };
      domain_id_val = faRow.domain_id ?? null;
    }

    return {
      ok: true,
      row: {
        owner_id: userId,
        name,
        integrating_with: integrating_with || null,
        integration_code: opts?.forceIntegrationCodeNull
          ? null
          : integration_code_raw.length > 0
            ? integration_code_raw
            : null,
        internal_time_code,
        direction: direction_val,
        integration_type_id: integration_type_id_val,
        functional_area_id: functional_area_id_val,
        domain_id: domain_id_val,
      },
    };
  })();
}

/** Catalog-only; enforced NULL on project_only rows at DB. Accepts HTML from rich editor; sanitizes server-side. */
function parseImplementationNotesFromForm(
  formData: FormData,
): { ok: true; notes: string | null } | { ok: false; error: string } {
  const raw = String(formData.get("implementation_notes") ?? "");
  const sanitized = sanitizeImplementationNotesHtml(raw);
  if (sanitized.length > 32000) {
    return { ok: false, error: "Implementation notes are too long (max 32,000 characters)." };
  }
  if (isImplementationNotesHtmlEmpty(sanitized)) {
    return { ok: true, notes: null };
  }
  return { ok: true, notes: sanitized };
}

/** Optional catalog-only field on `integrations` when `catalog_visibility = 'catalog'`. */
function parseDefaultCatalogEstimatedEffortFromForm(
  formData: FormData,
): { ok: true; hours: number | null } | { ok: false; error: string } {
  const raw = String(formData.get("default_estimated_effort_hours") ?? "").trim();
  if (raw === "") return { ok: true, hours: null };
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: "Default estimated effort must be a non-negative number" };
  const q = Math.round(n * 4) / 4;
  if (Math.abs(n - q) > 1e-6) {
    return { ok: false, error: "Default estimated effort must be in quarter-hour steps (e.g. 80, 80.25)" };
  }
  return { ok: true, hours: q };
}

/** Optional form field; empty → null. Values rounded to quarter hours like work session durations. */
function parseEstimatedEffortHoursFromForm(formData: FormData): { ok: true; hours: number | null } | { ok: false; error: string } {
  const raw = String(formData.get("estimated_effort_hours") ?? "").trim();
  if (raw === "") return { ok: true, hours: null };
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: "Estimated effort must be a non-negative number" };
  const q = Math.round(n * 4) / 4;
  if (Math.abs(n - q) > 1e-6) return { ok: false, error: "Estimated effort must be in quarter-hour steps (e.g. 80, 80.25)" };
  return { ok: true, hours: q };
}

export async function createIntegration(
  _prev: { error?: string } | void,
  formData: FormData,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const redirectProjectId = String(formData.get("project_id") ?? "").trim();
  const parsed = await parseIntegrationDefinitionForm(formData, user.id, supabase, {
    requireInternalTimeCode: true,
  });
  if (!parsed.ok) return { error: parsed.error };

  const { error } = await supabase.from("integrations").insert({
    ...parsed.row,
    catalog_visibility: "catalog",
    prefilled_from_integration_id: null,
    promoted_from_integration_id: null,
  });

  if (error) return { error: error.message };
  if (redirectProjectId) revalidatePath(`/projects/${redirectProjectId}`);
  revalidatePath("/projects");
  revalidatePath("/integrations/catalog");
  return {};
}

/** Create catalog row and link to project in one step (project-first flow). */
export async function createIntegrationAndLink(
  _prev: { error?: string } | void,
  formData: FormData,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const projectId = String(formData.get("project_id") ?? "").trim();
  if (!projectId) return { error: "Project is required" };

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!project) return { error: "Project not found" };

  const parsed = await parseIntegrationDefinitionForm(formData, user.id, supabase);
  if (!parsed.ok) return { error: parsed.error };

  const effortParsed = parseEstimatedEffortHoursFromForm(formData);
  if (!effortParsed.ok) return { error: effortParsed.error };

  let prefilled_from_integration_id: string | null = null;
  let templateDefaultEffort: number | null = null;
  const templateId = String(formData.get("prefilled_from_integration_id") ?? "").trim();
  if (templateId) {
    const { data: template } = await supabase
      .from("integrations")
      .select("id, catalog_visibility, default_estimated_effort_hours")
      .eq("id", templateId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!template || template.catalog_visibility !== "catalog") {
      return { error: "Invalid catalog template" };
    }
    prefilled_from_integration_id = template.id;
    if (template.default_estimated_effort_hours != null && template.default_estimated_effort_hours !== "") {
      const n = Number(template.default_estimated_effort_hours);
      if (Number.isFinite(n)) templateDefaultEffort = n;
    }
  }

  const effortForLink = effortParsed.hours ?? templateDefaultEffort;

  const row = {
    ...parsed.row,
    catalog_visibility: "project_only" as const,
    prefilled_from_integration_id,
  };

  const { data: created, error: insertError } = await supabase
    .from("integrations")
    .insert(row)
    .select("id")
    .single();

  if (insertError || !created) return { error: insertError?.message ?? "Could not create integration" };

  const { data: linkRow, error: linkError } = await supabase
    .from("project_integrations")
    .insert({
      project_id: projectId,
      integration_id: created.id,
      estimated_effort_hours: effortForLink,
    })
    .select("id")
    .single();

  if (linkError || !linkRow) {
    await supabase.from("integrations").delete().eq("id", created.id).eq("owner_id", user.id);
    return { error: linkError?.message ?? "Could not link integration" };
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/integrations/new`);
  revalidatePath("/projects");
  if (prefilled_from_integration_id) {
    revalidatePath(`/integrations/catalog/${prefilled_from_integration_id}`);
  }
  revalidatePath("/integrations/catalog");
  redirect(`/projects/${projectId}`);
}

export type CatalogEntryUpdateFormState = {
  error?: string;
  internalTimeCodeError?: string;
  integratingWithError?: string;
};

/** Catalog entry editor only: notes, duplicate time code messaging, clears integration_code. */
export async function updateCatalogIntegrationFromFormState(
  integrationId: string,
  _prev: CatalogEntryUpdateFormState | void,
  formData: FormData,
): Promise<CatalogEntryUpdateFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: existing } = await supabase
    .from("integrations")
    .select("catalog_visibility")
    .eq("id", integrationId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!existing || existing.catalog_visibility !== "catalog") {
    return { error: "Catalog entry not found" };
  }

  const integratingMode = String(formData.get("catalog_integrating_mode") ?? "generic").trim();
  if (integratingMode === "vendor") {
    const iw = String(formData.get("integrating_with") ?? "").trim();
    if (!iw) {
      return {
        integratingWithError: "Enter who you are integrating with, or choose Generic.",
      };
    }
  }

  const parsed = await parseIntegrationDefinitionForm(formData, user.id, supabase, {
    requireInternalTimeCode: true,
    forceIntegrationCodeNull: true,
  });
  if (!parsed.ok) return { error: parsed.error };

  const notesParsed = parseImplementationNotesFromForm(formData);
  if (!notesParsed.ok) return { error: notesParsed.error };

  const defEff = parseDefaultCatalogEstimatedEffortFromForm(formData);
  if (!defEff.ok) return { error: defEff.error };

  const internalKey = parsed.row.internal_time_code;
  if (internalKey) {
    const { data: dup } = await supabase
      .from("integrations")
      .select("id")
      .eq("owner_id", user.id)
      .eq("catalog_visibility", "catalog")
      .eq("internal_time_code", internalKey)
      .neq("id", integrationId)
      .maybeSingle();
    if (dup) {
      return {
        internalTimeCodeError: "Duplicate internal time entry code.",
      };
    }
  }

  const integrating_with =
    integratingMode === "vendor"
      ? String(formData.get("integrating_with") ?? "").trim() || null
      : CATALOG_GENERIC_INTEGRATING_WITH;

  const patch: Record<string, unknown> = {
    name: parsed.row.name,
    integrating_with,
    integration_code: null,
    internal_time_code: parsed.row.internal_time_code,
    direction: parsed.row.direction,
    integration_type_id: parsed.row.integration_type_id,
    functional_area_id: parsed.row.functional_area_id,
    domain_id: parsed.row.domain_id,
    default_estimated_effort_hours: defEff.hours,
    implementation_notes: notesParsed.notes,
  };

  const { error } = await supabase.from("integrations").update(patch).eq("id", integrationId).eq("owner_id", user.id);

  if (error) return { error: error.message };

  const { data: links } = await supabase
    .from("project_integrations")
    .select("id, project_id")
    .eq("integration_id", integrationId);

  for (const l of links ?? []) {
    revalidatePath(`/projects/${l.project_id}`);
    revalidatePath(`/projects/${l.project_id}/integrations/${l.id}`);
  }
  revalidatePath("/projects");
  revalidatePath("/integrations/catalog");
  revalidatePath(`/integrations/catalog/${integrationId}`);
  revalidatePath(`/integrations/catalog/${integrationId}/edit`);
  return {};
}

/** Catalog entry creator: mirrors update (notes, default effort, duplicate time code, generic/vendor toggle). */
export async function createCatalogIntegrationFromFormState(
  _prev: CatalogEntryUpdateFormState | void,
  formData: FormData,
): Promise<CatalogEntryUpdateFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const integratingMode = String(formData.get("catalog_integrating_mode") ?? "generic").trim();
  if (integratingMode === "vendor") {
    const iw = String(formData.get("integrating_with") ?? "").trim();
    if (!iw) {
      return {
        integratingWithError: "Enter who you are integrating with, or choose Generic.",
      };
    }
  }

  const parsed = await parseIntegrationDefinitionForm(formData, user.id, supabase, {
    requireInternalTimeCode: true,
    forceIntegrationCodeNull: true,
  });
  if (!parsed.ok) return { error: parsed.error };

  const notesParsed = parseImplementationNotesFromForm(formData);
  if (!notesParsed.ok) return { error: notesParsed.error };

  const defEff = parseDefaultCatalogEstimatedEffortFromForm(formData);
  if (!defEff.ok) return { error: defEff.error };

  const internalKey = parsed.row.internal_time_code;
  if (internalKey) {
    const { data: dup } = await supabase
      .from("integrations")
      .select("id")
      .eq("owner_id", user.id)
      .eq("catalog_visibility", "catalog")
      .eq("internal_time_code", internalKey)
      .maybeSingle();
    if (dup) {
      return {
        internalTimeCodeError: "Duplicate internal time entry code.",
      };
    }
  }

  const integrating_with =
    integratingMode === "vendor"
      ? String(formData.get("integrating_with") ?? "").trim() || null
      : CATALOG_GENERIC_INTEGRATING_WITH;

  const row = {
    ...parsed.row,
    integrating_with,
    integration_code: null,
    catalog_visibility: "catalog" as const,
    prefilled_from_integration_id: null,
    promoted_from_integration_id: null,
    default_estimated_effort_hours: defEff.hours,
    implementation_notes: notesParsed.notes,
  };

  const { error } = await supabase.from("integrations").insert(row);

  if (error) return { error: error.message };

  revalidatePath("/projects");
  revalidatePath("/integrations/catalog");
  return {};
}

export async function deleteCatalogIntegration(integrationId: string): Promise<{ error: string } | void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: row } = await supabase
    .from("integrations")
    .select("id, catalog_visibility")
    .eq("id", integrationId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!row || row.catalog_visibility !== "catalog") {
    return { error: "Catalog entry not found" };
  }

  const { error } = await supabase.from("integrations").delete().eq("id", integrationId).eq("owner_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/integrations/catalog");
  revalidatePath(`/integrations/catalog/${integrationId}`);
  revalidatePath(`/integrations/catalog/${integrationId}/edit`);
  redirect("/integrations/catalog");
}

/** For `useActionState` / form actions that must return `Promise<{ error?: string }>`. */
export async function updateIntegrationFromFormState(
  integrationId: string,
  _prev: { error?: string } | void,
  formData: FormData,
): Promise<{ error?: string }> {
  return updateIntegrationFromForm(integrationId, formData);
}

export async function updateIntegrationFromForm(
  integrationId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: existing } = await supabase
    .from("integrations")
    .select("catalog_visibility")
    .eq("id", integrationId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!existing) return { error: "Integration not found" };

  const parsed = await parseIntegrationDefinitionForm(formData, user.id, supabase, {
    requireInternalTimeCode: existing.catalog_visibility === "catalog",
  });
  if (!parsed.ok) return { error: parsed.error };

  const patch: Record<string, unknown> = {
    name: parsed.row.name,
    integrating_with: parsed.row.integrating_with,
    integration_code: parsed.row.integration_code,
    internal_time_code: parsed.row.internal_time_code,
    direction: parsed.row.direction,
    integration_type_id: parsed.row.integration_type_id,
    functional_area_id: parsed.row.functional_area_id,
    domain_id: parsed.row.domain_id,
  };

  if (existing.catalog_visibility === "catalog") {
    const defEff = parseDefaultCatalogEstimatedEffortFromForm(formData);
    if (!defEff.ok) return { error: defEff.error };
    patch.default_estimated_effort_hours = defEff.hours;
  }

  const { error } = await supabase.from("integrations").update(patch).eq("id", integrationId).eq("owner_id", user.id);

  if (error) return { error: error.message };

  const { data: links } = await supabase
    .from("project_integrations")
    .select("id, project_id")
    .eq("integration_id", integrationId);

  for (const l of links ?? []) {
    revalidatePath(`/projects/${l.project_id}`);
    revalidatePath(`/projects/${l.project_id}/integrations/${l.id}`);
  }
  revalidatePath("/projects");
  revalidatePath("/integrations/catalog");
  revalidatePath(`/integrations/catalog/${integrationId}`);
  revalidatePath(`/integrations/catalog/${integrationId}/edit`);
  return {};
}

export type PatchProjectIntegrationStatusInput = {
  delivery_progress: string;
  integration_state: string;
  integration_state_reason: string | null;
};

export async function patchProjectIntegrationStatus(
  projectIntegrationId: string,
  input: PatchProjectIntegrationStatusInput,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const dp = String(input.delivery_progress ?? "").trim();
  const st = String(input.integration_state ?? "").trim();
  const reasonRaw = input.integration_state_reason;
  const reason = reasonRaw == null ? "" : String(reasonRaw).trim();

  if (!isDeliveryProgress(dp)) return { error: "Invalid delivery progress" };
  if (!isIntegrationState(st)) return { error: "Invalid integration state" };

  const { data: row } = await supabase
    .from("project_integrations")
    .select("id, project_id")
    .eq("id", projectIntegrationId)
    .maybeSingle();

  if (!row) return { error: "Not found" };

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", row.project_id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!project) return { error: "Not found" };

  const { error } = await supabase
    .from("project_integrations")
    .update({
      delivery_progress: dp,
      integration_state: st,
      integration_state_reason: st === "active" ? null : reason || null,
    })
    .eq("id", projectIntegrationId);

  if (error) return { error: error.message };

  revalidatePath(`/projects/${row.project_id}`);
  revalidatePath(`/projects/${row.project_id}/integrations/${projectIntegrationId}`);
  return {};
}

export async function patchProjectIntegrationEstimatedEffort(
  projectIntegrationId: string,
  hours: number | null,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  if (hours != null) {
    if (!Number.isFinite(hours) || hours < 0) return { error: "Invalid estimated effort" };
    const q = Math.round(hours * 4) / 4;
    if (Math.abs(hours - q) > 1e-6) return { error: "Estimated effort must be in quarter-hour steps" };
  }

  const { data: row } = await supabase
    .from("project_integrations")
    .select("id, project_id")
    .eq("id", projectIntegrationId)
    .maybeSingle();

  if (!row) return { error: "Not found" };

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", row.project_id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!project) return { error: "Not found" };

  const { error } = await supabase
    .from("project_integrations")
    .update({ estimated_effort_hours: hours })
    .eq("id", projectIntegrationId);

  if (error) return { error: error.message };

  revalidatePath(`/projects/${row.project_id}`);
  revalidatePath(`/projects/${row.project_id}/integrations/${projectIntegrationId}`);
  return {};
}

/** Insert a new catalog template row copied from this project instance; the instance stays project_only. */
export async function promoteIntegrationToCatalog(integrationId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: src, error: fetchError } = await supabase
    .from("integrations")
    .select(
      "name, integrating_with, integration_code, internal_time_code, direction, integration_type_id, functional_area_id, domain_id, catalog_visibility",
    )
    .eq("id", integrationId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (fetchError || !src) return { error: fetchError?.message ?? "Integration not found" };
  if (src.catalog_visibility !== "project_only") {
    return { error: "Only project integrations can be added to the catalog this way" };
  }

  const itc =
    typeof src.internal_time_code === "string" && src.internal_time_code.trim().length > 0
      ? src.internal_time_code.trim()
      : null;
  if (!itc) {
    return {
      error: "Set an internal time code on this integration (edit definition) before adding it to the catalog",
    };
  }

  const { data: effortRows } = await supabase
    .from("project_integrations")
    .select("estimated_effort_hours")
    .eq("integration_id", integrationId);

  let default_estimated_effort_hours: number | null = null;
  for (const r of effortRows ?? []) {
    if (r.estimated_effort_hours != null && r.estimated_effort_hours !== "") {
      const n = Number(r.estimated_effort_hours);
      if (Number.isFinite(n)) {
        default_estimated_effort_hours = n;
        break;
      }
    }
  }

  const { data: newCatalog, error: insertError } = await supabase
    .from("integrations")
    .insert({
      owner_id: user.id,
      name: src.name,
      integrating_with: isCatalogGenericIntegratingWithLabel(src.integrating_with)
        ? CATALOG_GENERIC_INTEGRATING_WITH
        : src.integrating_with,
      integration_code: null,
      internal_time_code: itc,
      direction: src.direction,
      integration_type_id: src.integration_type_id,
      functional_area_id: src.functional_area_id,
      domain_id: src.domain_id,
      catalog_visibility: "catalog",
      prefilled_from_integration_id: null,
      promoted_from_integration_id: integrationId,
      default_estimated_effort_hours,
      implementation_notes: null,
    })
    .select("id")
    .single();

  if (insertError || !newCatalog) return { error: insertError?.message ?? "Could not create catalog row" };

  const { data: links } = await supabase
    .from("project_integrations")
    .select("id, project_id")
    .eq("integration_id", integrationId);

  for (const l of links ?? []) {
    revalidatePath(`/projects/${l.project_id}`);
    revalidatePath(`/projects/${l.project_id}/integrations/${l.id}`);
    revalidatePath(`/projects/${l.project_id}/integrations/new`);
  }
  revalidatePath("/projects");
  revalidatePath("/integrations/catalog");
  return {};
}

export async function deleteProjectIntegration(
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string } | undefined> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const projectIntegrationId = String(formData.get("project_integration_id") ?? "").trim();
  if (!projectIntegrationId) return { error: "Missing integration" };

  const { data: pi, error: piError } = await supabase
    .from("project_integrations")
    .select("id, project_id, integration_id")
    .eq("id", projectIntegrationId)
    .maybeSingle();

  if (piError || !pi) return { error: "Not found" };

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", pi.project_id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!project) return { error: "Not found" };

  const { data: integ, error: integError } = await supabase
    .from("integrations")
    .select("id, catalog_visibility")
    .eq("id", pi.integration_id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (integError || !integ) return { error: "Not found" };

  const projectId = pi.project_id;
  const integrationId = pi.integration_id;

  const { error: delPiError } = await supabase.from("project_integrations").delete().eq("id", projectIntegrationId);

  if (delPiError) return { error: delPiError.message };

  const { count, error: countErr } = await supabase
    .from("project_integrations")
    .select("*", { count: "exact", head: true })
    .eq("integration_id", integrationId);

  if (!countErr && (count ?? 0) === 0 && integ.catalog_visibility === "project_only") {
    await supabase.from("integrations").delete().eq("id", integrationId).eq("owner_id", user.id);
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/integrations/${projectIntegrationId}`);
  revalidatePath(`/projects/${projectId}/integrations/new`);
  revalidatePath("/projects");
  redirect(`/projects/${projectId}`);
}

export async function fetchCatalogIntegrationDetail(
  catalogIntegrationId: string,
): Promise<{ ok: true; data: CatalogIntegrationDetailDTO } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const id = catalogIntegrationId.trim();
  if (!id) return { ok: false, error: "Missing id" };
  const data = await loadCatalogIntegrationDetail(supabase, user.id, id);
  if (!data) return { ok: false, error: "Not found" };
  return { ok: true, data };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
