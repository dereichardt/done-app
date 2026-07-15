import {
  DEFAULT_PHASES,
  type DefaultPhaseKey,
} from "@/lib/project-phases";

export const WEEKDAY_VALUES = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type WeekdayValue = (typeof WEEKDAY_VALUES)[number];

export const DEFAULT_ACTIVITY_SUMMARY_DAY: WeekdayValue = "friday";
export const DEFAULT_FORECAST_REVIEW_DAY: WeekdayValue = "monday";

/** 0-based calendar month when Q1 begins: Jan=0, Feb=1, Mar=2. */
export const EFFORT_QUARTER_START_MONTH_VALUES = [0, 1, 2] as const;

export type EffortQuarterStartMonth = (typeof EFFORT_QUARTER_START_MONTH_VALUES)[number];

export const DEFAULT_EFFORT_QUARTER_START_MONTH: EffortQuarterStartMonth = 1;

export const EFFORT_QUARTER_START_MONTH_OPTIONS: Array<{
  value: EffortQuarterStartMonth;
  label: string;
  quartersLabel: string;
}> = [
  { value: 0, label: "January", quartersLabel: "Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec" },
  { value: 1, label: "February", quartersLabel: "Feb–Apr, May–Jul, Aug–Oct, Nov–Jan" },
  { value: 2, label: "March", quartersLabel: "Mar–May, Jun–Aug, Sep–Nov, Dec–Feb" },
];

export type DeploymentPhaseKey = DefaultPhaseKey;

export type DeploymentEffortByPhase = Record<DeploymentPhaseKey, number>;

export const DEPLOYMENT_EFFORT_PHASES: Array<{
  phase_key: DeploymentPhaseKey;
  label: string;
}> = DEFAULT_PHASES.map((p) => ({
  phase_key: p.phase_key,
  label: p.name,
}));

export const DEFAULT_DEPLOYMENT_EFFORT_BY_PHASE: DeploymentEffortByPhase = {
  plan: 10,
  architect_configure: 60,
  test: 20,
  deploy: 5,
  hypercare: 5,
};

/** Allowed per-phase percentages in settings (0–100 in steps of 5). */
export const DEPLOYMENT_EFFORT_PERCENT_STEP = 5;

export const DEPLOYMENT_EFFORT_PERCENT_VALUES = Array.from(
  { length: 100 / DEPLOYMENT_EFFORT_PERCENT_STEP + 1 },
  (_, i) => i * DEPLOYMENT_EFFORT_PERCENT_STEP,
);

export const DEPLOYMENT_EFFORT_PERCENT_OPTIONS = DEPLOYMENT_EFFORT_PERCENT_VALUES.map((n) => ({
  value: String(n),
  label: `${n}%`,
}));

export type UserPreferences = {
  timezone: string | null;
  activity_summary_day: WeekdayValue;
  forecast_review_day: WeekdayValue;
  effort_quarter_start_month: EffortQuarterStartMonth;
  deployment_effort_by_phase: DeploymentEffortByPhase;
};

export function deploymentEffortFormFieldName(phaseKey: DeploymentPhaseKey): string {
  return `deployment_effort_${phaseKey}`;
}

function isDeploymentEffortPercent(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 100 &&
    value % DEPLOYMENT_EFFORT_PERCENT_STEP === 0
  );
}

export function isValidDeploymentEffortByPhase(
  value: unknown,
): value is DeploymentEffortByPhase {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  let sum = 0;
  for (const phase of DEPLOYMENT_EFFORT_PHASES) {
    const n = record[phase.phase_key];
    if (!isDeploymentEffortPercent(n)) return false;
    sum += n;
  }
  if (Object.keys(record).length !== DEPLOYMENT_EFFORT_PHASES.length) return false;
  return sum === 100;
}

export function parseDeploymentEffortByPhase(value: unknown): DeploymentEffortByPhase {
  if (isValidDeploymentEffortByPhase(value)) return { ...value };
  return { ...DEFAULT_DEPLOYMENT_EFFORT_BY_PHASE };
}

export function parseDeploymentEffortByPhaseFromFormData(
  formData: FormData,
): DeploymentEffortByPhase | null {
  const next = {} as DeploymentEffortByPhase;
  for (const phase of DEPLOYMENT_EFFORT_PHASES) {
    const raw = String(formData.get(deploymentEffortFormFieldName(phase.phase_key)) ?? "").trim();
    if (raw.length === 0) return null;
    const n = Number(raw);
    if (!isDeploymentEffortPercent(n)) return null;
    next[phase.phase_key] = n;
  }
  return isValidDeploymentEffortByPhase(next) ? next : null;
}

export function sumDeploymentEffort(effort: DeploymentEffortByPhase): number {
  return DEPLOYMENT_EFFORT_PHASES.reduce((sum, phase) => sum + effort[phase.phase_key], 0);
}

export function isWeekdayValue(value: string): value is WeekdayValue {
  return WEEKDAY_VALUES.includes(value as WeekdayValue);
}

export function isEffortQuarterStartMonth(value: unknown): value is EffortQuarterStartMonth {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    (EFFORT_QUARTER_START_MONTH_VALUES as readonly number[]).includes(value)
  );
}

export function parseEffortQuarterStartMonth(value: unknown): EffortQuarterStartMonth | null {
  if (typeof value === "number") {
    return isEffortQuarterStartMonth(value) ? value : null;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const n = Number(value);
    return isEffortQuarterStartMonth(n) ? n : null;
  }
  return null;
}

export function effortQuarterStartMonthQuartersLabel(
  startMonth: EffortQuarterStartMonth,
): string {
  return (
    EFFORT_QUARTER_START_MONTH_OPTIONS.find((o) => o.value === startMonth)?.quartersLabel ??
    EFFORT_QUARTER_START_MONTH_OPTIONS[1].quartersLabel
  );
}

export function normalizeTimezone(value: string | null | undefined): string | null {
  const candidate = value?.trim();
  return candidate ? candidate : null;
}

export function isValidIanaTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function getUserTodayIso(timezone: string | null | undefined): string {
  if (!timezone) return new Date().toISOString().slice(0, 10);
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // Fall back to UTC date when an unsupported timezone is encountered.
  }
  return new Date().toISOString().slice(0, 10);
}
