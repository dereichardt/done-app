"use client";

import { CanvasSelect } from "@/components/canvas-select";
import { saveUserPreferences } from "@/lib/actions/user-preferences";
import {
  DEFAULT_ACTIVITY_SUMMARY_DAY,
  DEFAULT_FORECAST_REVIEW_DAY,
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

export function SettingsForm({
  initialPreferences,
  timezoneOptions,
}: {
  initialPreferences: UserPreferences;
  timezoneOptions: string[];
}) {
  const [state, formAction, pending] = useActionState(saveUserPreferences, {});
  const [timezone, setTimezone] = useState(initialPreferences.timezone ?? "");

  useEffect(() => {
    if (timezone.trim().length > 0) return;
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    if (detected.trim().length > 0) setTimezone(detected);
  }, [timezone]);

  const timezoneListId = useMemo(() => "timezone-options", []);

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

        {state?.error ? (
          <p className="mt-4 text-sm" role="alert" style={{ color: "var(--app-danger)" }}>
            {state.error}
          </p>
        ) : null}
        {state?.success ? (
          <p className="mt-4 text-sm text-muted-canvas" role="status">
            Settings saved.
          </p>
        ) : null}
      </section>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn-cta-dark">
          {pending ? "Saving..." : "Save settings"}
        </button>
      </div>
    </form>
  );
}
