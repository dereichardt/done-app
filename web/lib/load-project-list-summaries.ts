import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePhaseStatus, type PhaseStatusResult } from "@/lib/project-phase-status";

export type ProjectListRowSummary = {
  phaseStatus: PhaseStatusResult;
  activeIntegrationCount: number;
  blockedOnHoldCount: number;
};

export async function loadProjectListSummariesById(
  supabase: SupabaseClient,
  projectIds: string[],
): Promise<Record<string, ProjectListRowSummary>> {
  if (projectIds.length === 0) return {};

  const [{ data: phaseRows }, { data: integrationRows }] = await Promise.all([
    supabase
      .from("project_phases")
      .select("project_id, name, sort_order, start_date, end_date")
      .in("project_id", projectIds),
    supabase
      .from("project_integrations")
      .select("project_id, integration_state")
      .in("project_id", projectIds),
  ]);

  const phasesByProject = new Map<
    string,
    { name: string; sort_order: number; start_date: string | null; end_date: string | null }[]
  >();
  for (const row of phaseRows ?? []) {
    const pid = row.project_id;
    if (!pid) continue;
    const list = phasesByProject.get(pid) ?? [];
    list.push({
      name: row.name,
      sort_order: row.sort_order,
      start_date: row.start_date,
      end_date: row.end_date,
    });
    phasesByProject.set(pid, list);
  }
  for (const [, phases] of phasesByProject) {
    phases.sort((a, b) => a.sort_order - b.sort_order);
  }

  const integrationsByProject = new Map<string, { integration_state: string | null }[]>();
  for (const row of integrationRows ?? []) {
    const pid = row.project_id;
    if (!pid) continue;
    const list = integrationsByProject.get(pid) ?? [];
    list.push({ integration_state: row.integration_state });
    integrationsByProject.set(pid, list);
  }

  const result: Record<string, ProjectListRowSummary> = {};
  for (const id of projectIds) {
    const phases = phasesByProject.get(id) ?? [];
    const phaseStatus = resolvePhaseStatus(phases);
    const piRows = integrationsByProject.get(id) ?? [];
    let activeIntegrationCount = 0;
    let blockedOnHoldCount = 0;
    for (const r of piRows) {
      const s = r.integration_state;
      if (s === "active") activeIntegrationCount++;
      else if (s === "blocked" || s === "on_hold") blockedOnHoldCount++;
    }
    result[id] = { phaseStatus, activeIntegrationCount, blockedOnHoldCount };
  }
  return result;
}
