"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { DialogCloseButton } from "@/components/dialog-close-button";
import { ForecastEstimateVariancePanel } from "@/components/forecast-estimate-variance";
import { generateProjectForecast } from "@/lib/actions/project-forecast";
import type { ForecastProjectDTO } from "@/lib/forecast-data";
import {
  computeForecastPastPhaseSummary,
  DEFAULT_FORECAST_PM_PERCENT,
  DEFAULT_FORECAST_SPREAD_MODE,
  forecastStartSundayYmd,
  formatForecastSundayDate,
  type ForecastIntegrationInput,
  type ForecastPhaseInput,
  type ForecastSpreadMode,
  type ForecastStartMode,
} from "@/lib/project-forecast";
import type { DeploymentEffortByPhase } from "@/lib/user-preferences";

const PM_PERCENT_OPTIONS = Array.from({ length: 21 }, (_, i) => i * 5);

export function GenerateForecastDialog({
  projectId,
  projectLabel,
  phases,
  integrations,
  actualsByRowKey,
  deploymentEffortByPhase,
  defaultPmPercent = DEFAULT_FORECAST_PM_PERCENT,
  defaultSpreadMode = DEFAULT_FORECAST_SPREAD_MODE,
  defaultStartMode = "this_week",
  defaultIncludePastPhaseHours = false,
  hasExistingForecast = false,
  todayIso,
  onClose,
  onGenerated,
}: {
  projectId: string;
  projectLabel: string;
  phases: ForecastPhaseInput[];
  integrations: ForecastIntegrationInput[];
  actualsByRowKey: Record<string, number>;
  deploymentEffortByPhase: DeploymentEffortByPhase;
  defaultPmPercent?: number;
  defaultSpreadMode?: ForecastSpreadMode;
  defaultStartMode?: ForecastStartMode;
  /** When regenerating, prefer the project's last choice. */
  defaultIncludePastPhaseHours?: boolean;
  /** When true, require an explicit confirm before replacing future weeks. */
  hasExistingForecast?: boolean;
  todayIso: string;
  onClose: () => void;
  onGenerated?: (project?: ForecastProjectDTO) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [startMode, setStartMode] = useState<ForecastStartMode>(defaultStartMode);
  const [pmPercent, setPmPercent] = useState(defaultPmPercent);
  const [spreadMode, setSpreadMode] = useState<ForecastSpreadMode>(defaultSpreadMode);
  const [includePastPhaseHours, setIncludePastPhaseHours] = useState(
    defaultIncludePastPhaseHours,
  );
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const thisWeekSunday = useMemo(
    () => forecastStartSundayYmd(todayIso, "this_week"),
    [todayIso],
  );
  const nextWeekSunday = useMemo(
    () => forecastStartSundayYmd(todayIso, "next_week"),
    [todayIso],
  );
  const selectedSunday =
    startMode === "this_week" ? thisWeekSunday : nextWeekSunday;

  const pastPhaseSummary = useMemo(
    () =>
      computeForecastPastPhaseSummary({
        phases,
        integrations,
        deploymentEffortByPhase,
        pmPercent,
        startMode,
        todayIso,
        actualsByRowKey,
      }),
    [
      phases,
      integrations,
      deploymentEffortByPhase,
      pmPercent,
      startMode,
      todayIso,
      actualsByRowKey,
    ],
  );

  const hasPastPhaseHours = (pastPhaseSummary?.pastPhaseHours ?? 0) > 0;

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  function handleGenerate() {
    if (hasExistingForecast && !confirmReplace) {
      setConfirmReplace(true);
      setError(null);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await generateProjectForecast(projectId, {
        startMode,
        pmPercent,
        spreadMode,
        includePastPhaseHours: hasPastPhaseHours ? includePastPhaseHours : false,
        todayIso,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      onGenerated?.(res.project ?? undefined);
      dialogRef.current?.close();
    });
  }

  return (
    <dialog
      ref={dialogRef}
      className="app-catalog-dialog fixed left-1/2 top-1/2 z-[215] -translate-x-1/2 -translate-y-1/2 overflow-hidden border-0 p-0 shadow-xl w-[min(100vw-2rem,32rem)] max-w-[calc(100vw-2rem)]"
      style={{
        borderRadius: "12px",
        background: "var(--app-surface)",
        color: "var(--app-text)",
      }}
      onClose={onClose}
    >
      <div className="flex max-h-[min(92dvh,44rem)] flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--app-border)] px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-medium text-[var(--app-text)]">
              {hasExistingForecast ? "Regenerate Forecast" : "Generate Forecast"}
            </h2>
            <p className="mt-0.5 truncate text-sm text-[var(--app-text-muted)]">{projectLabel}</p>
          </div>
          <DialogCloseButton onClick={() => dialogRef.current?.close()} />
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
          {confirmReplace ? (
            <div
              className="rounded-lg border border-[var(--app-border)] bg-[var(--app-info-surface)] px-3 py-2.5 text-sm"
              role="status"
            >
              <p className="font-medium text-[var(--app-text)]">Replace weekly hours?</p>
              <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                Hours from {formatForecastSundayDate(selectedSunday)} forward will be replaced.
                Manual edits in that range will be lost. Weeks before the start stay unchanged.
              </p>
            </div>
          ) : null}

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-[var(--app-text)]">
              Start forecasting
            </legend>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--app-border)] px-3 py-2.5 has-[:checked]:border-[var(--app-action)] has-[:checked]:bg-[var(--app-info-surface)]">
              <input
                type="radio"
                name="forecast-start-mode"
                className="mt-1"
                checked={startMode === "this_week"}
                onChange={() => setStartMode("this_week")}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-[var(--app-text)]">This week</span>
                <span className="block text-xs text-[var(--app-text-muted)]">
                  Starting {formatForecastSundayDate(thisWeekSunday)}
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--app-border)] px-3 py-2.5 has-[:checked]:border-[var(--app-action)] has-[:checked]:bg-[var(--app-info-surface)]">
              <input
                type="radio"
                name="forecast-start-mode"
                className="mt-1"
                checked={startMode === "next_week"}
                onChange={() => setStartMode("next_week")}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-[var(--app-text)]">Next week</span>
                <span className="block text-xs text-[var(--app-text-muted)]">
                  Starting {formatForecastSundayDate(nextWeekSunday)}
                </span>
              </span>
            </label>
            <p className="text-xs text-[var(--app-text-muted)]">
              Forecast begins the Sunday of the week you select (
              {formatForecastSundayDate(selectedSunday)}). Prior weeks are left unchanged.
            </p>
          </fieldset>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-[var(--app-text)]">
              Project Management %
            </span>
            <select
              className="input-canvas"
              value={String(pmPercent)}
              onChange={(e) => setPmPercent(Number(e.target.value))}
            >
              {PM_PERCENT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}%
                </option>
              ))}
            </select>
            <span className="text-xs text-[var(--app-text-muted)]">
              Taken from each integration&apos;s estimated hours (default 5%). Remaining hours
              subtract logged actuals per integration and for Project Management.
            </span>
          </label>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-[var(--app-text)]">Hour spread</legend>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--app-border)] px-3 py-2.5 has-[:checked]:border-[var(--app-action)] has-[:checked]:bg-[var(--app-info-surface)]">
              <input
                type="radio"
                name="forecast-spread-mode"
                className="mt-1"
                checked={spreadMode === "even"}
                onChange={() => setSpreadMode("even")}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-[var(--app-text)]">Even spread</span>
                <span className="block text-xs text-[var(--app-text-muted)]">
                  Peanut-butter hours evenly across weeks in each stage (project totals
                  stay flat; thin leftovers may still show 1h / 0h on a track).
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--app-border)] px-3 py-2.5 has-[:checked]:border-[var(--app-action)] has-[:checked]:bg-[var(--app-info-surface)]">
              <input
                type="radio"
                name="forecast-spread-mode"
                className="mt-1"
                checked={spreadMode === "bell"}
                onChange={() => setSpreadMode("bell")}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-[var(--app-text)]">
                  Bell curve
                </span>
                <span className="block text-xs text-[var(--app-text-muted)]">
                  Heavier in middle–late Architect &amp; Configure and early Test; other
                  stages stay even.
                </span>
              </span>
            </label>
          </fieldset>

          {hasPastPhaseHours ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-[var(--app-text)]">
                Past stage hours
              </legend>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--app-border)] px-3 py-2.5 has-[:checked]:border-[var(--app-action)] has-[:checked]:bg-[var(--app-info-surface)]">
                <input
                  type="radio"
                  name="forecast-past-phase-mode"
                  className="mt-1"
                  checked={!includePastPhaseHours}
                  onChange={() => setIncludePastPhaseHours(false)}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-[var(--app-text)]">
                    Hold as under estimate
                  </span>
                  <span className="block text-xs text-[var(--app-text-muted)]">
                    Keep prior-stage hours off the grid. Raising weeks later draws from
                    this reserve first.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--app-border)] px-3 py-2.5 has-[:checked]:border-[var(--app-action)] has-[:checked]:bg-[var(--app-info-surface)]">
                <input
                  type="radio"
                  name="forecast-past-phase-mode"
                  className="mt-1"
                  checked={includePastPhaseHours}
                  onChange={() => setIncludePastPhaseHours(true)}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-[var(--app-text)]">
                    Include in forecast spread
                  </span>
                  <span className="block text-xs text-[var(--app-text-muted)]">
                    Spread prior-stage hours evenly across the remaining forecast weeks so
                    the forecast stays on estimate.
                  </span>
                </span>
              </label>
            </fieldset>
          ) : null}

          <ForecastEstimateVariancePanel
            summary={pastPhaseSummary}
            includePastPhaseHours={hasPastPhaseHours ? includePastPhaseHours : false}
          />

          {error ? (
            <p className="text-sm text-[var(--app-danger)]" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--app-border)] px-5 py-3">
          <button
            type="button"
            className="btn-cta-tertiary"
            onClick={() => {
              if (confirmReplace) {
                setConfirmReplace(false);
                return;
              }
              dialogRef.current?.close();
            }}
            disabled={pending}
          >
            {confirmReplace ? "Back" : "Cancel"}
          </button>
          <button
            type="button"
            className="btn-cta-dark"
            onClick={handleGenerate}
            disabled={pending}
          >
            {pending
              ? "Generating…"
              : confirmReplace
                ? "Replace forecast"
                : hasExistingForecast
                  ? "Continue"
                  : "Generate"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
