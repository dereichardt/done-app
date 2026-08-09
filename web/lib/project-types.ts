export const EXPERT_ASSIST_SYSTEM_KEY = "expert_assist";

export type ProjectTypeLookup = {
  id: string;
  name: string;
  system_key: string | null;
};

export function isExpertAssistType(
  projectType: Pick<ProjectTypeLookup, "system_key"> | null | undefined,
): boolean {
  return projectType?.system_key === EXPERT_ASSIST_SYSTEM_KEY;
}

export type ExpertAssistDetails = {
  starts_on: string;
  ends_on: string;
  estimated_effort_hours: number;
  integrations_enabled: boolean;
};

export function parseExpertAssistDetails(input: {
  starts_on: string;
  ends_on: string;
  estimated_effort_hours: string;
  integrations_enabled: boolean;
}): { details?: ExpertAssistDetails; error?: string } {
  const starts_on = input.starts_on.trim();
  const ends_on = input.ends_on.trim();
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(starts_on) || !datePattern.test(ends_on)) {
    return { error: "Start and end dates are required" };
  }
  if (starts_on > ends_on) return { error: "Start date must be on or before end date" };

  const estimated_effort_hours = Number(input.estimated_effort_hours);
  if (!Number.isFinite(estimated_effort_hours) || estimated_effort_hours <= 0) {
    return { error: "A positive estimated effort is required for Expert Assist projects" };
  }
  if (Math.round(estimated_effort_hours * 4) !== estimated_effort_hours * 4) {
    return { error: "Estimated effort must use quarter-hour increments" };
  }

  return {
    details: {
      starts_on,
      ends_on,
      estimated_effort_hours,
      integrations_enabled: input.integrations_enabled,
    },
  };
}

/** Optional project-management estimate for standard (non–Expert Assist) projects. */
export function parseProjectManagementEstimatedHours(
  raw: string | null | undefined,
): { hours?: number | null; error?: string } {
  const t = String(raw ?? "").trim();
  if (t === "") return { hours: null };
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) {
    return { error: "Project management hours must be a non-negative number" };
  }
  if (Math.round(n * 4) !== n * 4) {
    return { error: "Project management hours must use quarter-hour increments" };
  }
  return { hours: n };
}
