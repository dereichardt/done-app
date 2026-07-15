"use client";

import { CanvasSelect } from "@/components/canvas-select";
import { saveUserPreferences } from "@/lib/actions/user-preferences";
import {
  DEFAULT_ACTIVITY_SUMMARY_DAY,
  DEFAULT_DEPLOYMENT_EFFORT_BY_PHASE,
  DEFAULT_EFFORT_QUARTER_START_MONTH,
  DEFAULT_FORECAST_REVIEW_DAY,
  DEPLOYMENT_EFFORT_PERCENT_OPTIONS,
  DEPLOYMENT_EFFORT_PERCENT_STEP,
  DEPLOYMENT_EFFORT_PHASES,
  EFFORT_QUARTER_START_MONTH_OPTIONS,
  deploymentEffortFormFieldName,
  effortQuarterStartMonthQuartersLabel,
  sumDeploymentEffort,
  type DeploymentEffortByPhase,
  type DeploymentPhaseKey,
  type EffortQuarterStartMonth,
  type UserPreferences,
  type WeekdayValue,
} from "@/lib/user-preferences";
import { useActionState, useEffect, useMemo, useState } from "react";

const weekdayOptions: Array<{ value: WeekdayValue; label: string }> = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
];

const quarterStartOptions = EFFORT_QUARTER_START_MONTH_OPTIONS.map((o) => ({
  value: String(o.value),
  label: o.label,
}));

function snapDeploymentEffortPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const snapped =
    Math.round(value / DEPLOYMENT_EFFORT_PERCENT_STEP) * DEPLOYMENT_EFFORT_PERCENT_STEP;
  return Math.max(0, Math.min(100, snapped));
}

export function SettingsForm({
  initialPreferences,
  timezoneOptions,
}: {
  initialPreferences: UserPreferences;
  timezoneOptions: string[];
}) {
  const [state, formAction, pending] = useActionState(saveUserPreferences, {});
  const [timezone, setTimezone] = useState(initialPreferences.timezone ?? "");
  const [quarterStartMonth, setQuarterStartMonth] = useState<EffortQuarterStartMonth>(
    initialPreferences.effort_quarter_start_month || DEFAULT_EFFORT_QUARTER_START_MONTH,
  );
  const [deploymentEffort, setDeploymentEffort] = useState<DeploymentEffortByPhase>(() => {
    const initial = { ...initialPreferences.deployment_effort_by_phase };
    for (const phase of DEPLOYMENT_EFFORT_PHASES) {
      initial[phase.phase_key] = snapDeploymentEffortPercent(initial[phase.phase_key]);
    }
    return initial;
  });

  useEffect(() => {
    if (timezone.trim().length > 0) return;
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    if (detected.trim().length > 0) setTimezone(detected);
  }, [timezone]);

  const timezoneListId = useMemo(() => "timezone-options", []);
  const effortTotal = sumDeploymentEffort(deploymentEffort);
  const effortTotalValid = effortTotal === 100;

  function updateDeploymentEffort(phaseKey: DeploymentPhaseKey, raw: string) {
    const n = Number(raw);
    setDeploymentEffort((prev) => ({
      ...prev,
      [phaseKey]: snapDeploymentEffortPercent(n),
    }));
  }

  return (
    <form action={formAction} className="mt-6 flex max-w-3xl flex-col gap-6">
      <section className="rounded-xl border p-5" style={{ borderColor: "var(--app-border)" }}>
        <h2 className="text-base font-medium" style={{ color: "var(--app-text)" }}>
          Preferences
        </h2>
        <p className="mt-1 text-sm text-muted-canvas">
          Personal defaults used across date grouping and recurring review workflows.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-medium" style={{ color: "var(--app-text)" }}>
            Timezone (IANA)
            <input
              className="input-canvas mt-1"
              name="timezone"
              list={timezoneListId}
              value={timezone}
              onChange={(e) => setTimezone(e.currentTarget.value)}
              placeholder="America/New_York"
              autoComplete="off"
              spellCheck={false}
            />
            <span className="mt-1 block text-xs font-normal text-muted-canvas">
              Example: America/New_York
            </span>
          </label>
          <datalist id={timezoneListId}>
            {timezoneOptions.map((tz) => (
              <option key={tz} value={tz} />
            ))}
          </datalist>

          <div className="canvas-select-field flex flex-col gap-1">
            <label
              className="block text-sm font-medium"
              style={{ color: "var(--app-text)" }}
              htmlFor="settings-activity-summary-day"
            >
              Activity summary day
            </label>
            <CanvasSelect
              id="settings-activity-summary-day"
              name="activity_summary_day"
              defaultValue={
                initialPreferences.activity_summary_day || DEFAULT_ACTIVITY_SUMMARY_DAY
              }
              options={weekdayOptions}
            />
          </div>

          <div className="canvas-select-field flex flex-col gap-1">
            <label
              className="block text-sm font-medium"
              style={{ color: "var(--app-text)" }}
              htmlFor="settings-forecast-review-day"
            >
              Forecast review day
            </label>
            <CanvasSelect
              id="settings-forecast-review-day"
              name="forecast_review_day"
              defaultValue={
                initialPreferences.forecast_review_day || DEFAULT_FORECAST_REVIEW_DAY
              }
              options={weekdayOptions}
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border p-5" style={{ borderColor: "var(--app-border)" }}>
        <h2 className="text-base font-medium" style={{ color: "var(--app-text)" }}>
          Quarter system
        </h2>
        <p className="mt-1 text-sm text-muted-canvas">
          Defines which month starts Q1 for quarter-based metrics, such as project Effort “This
          Quarter”.
        </p>

        <div className="mt-5 max-w-sm">
          <div className="canvas-select-field flex flex-col gap-1">
            <label
              className="block text-sm font-medium"
              style={{ color: "var(--app-text)" }}
              htmlFor="settings-effort-quarter-start-month"
            >
              Quarter start month
            </label>
            <CanvasSelect
              id="settings-effort-quarter-start-month"
              name="effort_quarter_start_month"
              value={String(quarterStartMonth)}
              onValueChange={(value) => {
                const next = Number(value);
                if (next === 0 || next === 1 || next === 2) setQuarterStartMonth(next);
              }}
              options={quarterStartOptions}
            />
            <span className="mt-1 block text-xs font-normal text-muted-canvas">
              Quarters: {effortQuarterStartMonthQuartersLabel(quarterStartMonth)}
            </span>
          </div>
        </div>
      </section>

      <section className="rounded-xl border p-5" style={{ borderColor: "var(--app-border)" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-medium" style={{ color: "var(--app-text)" }}>
              Deployment effort by stage
            </h2>
            <p className="mt-1 text-sm text-muted-canvas">
              Default effort split across deployment stages. Choose multiples of 5% that total
              100%.
            </p>
          </div>
          <button
            type="button"
            className="btn-cta-tertiary shrink-0"
            onClick={() => setDeploymentEffort({ ...DEFAULT_DEPLOYMENT_EFFORT_BY_PHASE })}
          >
            Reset to defaults
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {DEPLOYMENT_EFFORT_PHASES.map((phase) => (
            <div key={phase.phase_key} className="canvas-select-field flex flex-col gap-1">
              <label
                className="block text-sm font-medium"
                style={{ color: "var(--app-text)" }}
                htmlFor={`settings-deployment-effort-${phase.phase_key}`}
              >
                {phase.label}
              </label>
              <CanvasSelect
                id={`settings-deployment-effort-${phase.phase_key}`}
                name={deploymentEffortFormFieldName(phase.phase_key)}
                value={String(deploymentEffort[phase.phase_key])}
                onValueChange={(value) => updateDeploymentEffort(phase.phase_key, value)}
                options={DEPLOYMENT_EFFORT_PERCENT_OPTIONS}
              />
            </div>
          ))}
        </div>

        <p
          className="mt-4 text-sm font-medium"
          role="status"
          style={{
            color: effortTotalValid ? "var(--app-text)" : "var(--app-danger)",
          }}
        >
          Total: {effortTotal}%
          {!effortTotalValid ? " — must equal 100%" : null}
        </p>
      </section>

      {state?.error ? (
        <p className="text-sm" role="alert" style={{ color: "var(--app-danger)" }}>
          {state.error}
        </p>
      ) : null}
      {state?.success ? (
        <p className="text-sm text-muted-canvas" role="status">
          Settings saved.
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !effortTotalValid}
          className="btn-cta-dark"
        >
          {pending ? "Saving..." : "Save settings"}
        </button>
      </div>
    </form>
  );
}
