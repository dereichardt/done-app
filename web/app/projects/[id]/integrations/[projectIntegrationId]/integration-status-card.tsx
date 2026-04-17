"use client";

import { patchProjectIntegrationStatus } from "@/lib/actions/projects";
import { CanvasSelect, type CanvasSelectOption } from "@/components/canvas-select";
import {
  formatDeliveryProgressLabel,
  formatIntegrationStateLabel,
  projectDeliveryProgressSelectOptions,
  projectIntegrationStateSelectOptions,
} from "@/lib/integration-metadata";
import { useCallback, useEffect, useRef, useState } from "react";

const deliveryOptions: CanvasSelectOption[] = projectDeliveryProgressSelectOptions();
const stateOptions: CanvasSelectOption[] = projectIntegrationStateSelectOptions();

export function IntegrationStatusCard({
  projectIntegrationId,
  initial,
  className = "",
}: {
  projectIntegrationId: string;
  initial: {
    delivery_progress: string;
    integration_state: string;
    integration_state_reason: string | null;
  };
  className?: string;
}) {
  const [delivery, setDelivery] = useState(initial.delivery_progress);
  const [intState, setIntState] = useState(initial.integration_state);
  const [reason, setReason] = useState(initial.integration_state_reason ?? "");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const reasonTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveGen = useRef(0);

  useEffect(() => {
    setDelivery(initial.delivery_progress);
    setIntState(initial.integration_state);
    setReason(initial.integration_state_reason ?? "");
  }, [initial.delivery_progress, initial.integration_state, initial.integration_state_reason]);

  const runPatch = useCallback(
    (payload: {
      delivery_progress: string;
      integration_state: string;
      integration_state_reason: string | null;
    }) => {
      const gen = ++saveGen.current;
      setSaveError(null);
      void (async () => {
        const res = await patchProjectIntegrationStatus(projectIntegrationId, payload);
        if (gen !== saveGen.current) return;
        if (res.error) {
          setSaveError(res.error);
          return;
        }
        setSaveError(null);
      })();
    },
    [projectIntegrationId],
  );

  const reasonOrNull = (r: string) => {
    const t = r.trim();
    return t === "" ? null : t;
  };

  const handleDeliveryChange = (next: string) => {
    setDelivery(next);
    runPatch({
      delivery_progress: next,
      integration_state: intState,
      integration_state_reason: intState === "active" ? null : reasonOrNull(reason),
    });
  };

  const handleStateChange = (next: string) => {
    if (next === "active") {
      setIntState("active");
      setReason("");
      runPatch({
        delivery_progress: delivery,
        integration_state: "active",
        integration_state_reason: null,
      });
      return;
    }
    setIntState(next);
    runPatch({
      delivery_progress: delivery,
      integration_state: next,
      integration_state_reason: reasonOrNull(reason),
    });
  };

  const flushReasonSave = useCallback(
    (reasonText: string) => {
      if (intState !== "blocked" && intState !== "on_hold") return;
      runPatch({
        delivery_progress: delivery,
        integration_state: intState,
        integration_state_reason: reasonOrNull(reasonText),
      });
    },
    [delivery, intState, runPatch],
  );

  const scheduleReasonSave = (reasonText: string) => {
    if (reasonTimer.current) clearTimeout(reasonTimer.current);
    reasonTimer.current = setTimeout(() => {
      reasonTimer.current = null;
      flushReasonSave(reasonText);
    }, 450);
  };

  useEffect(() => {
    return () => {
      if (reasonTimer.current) clearTimeout(reasonTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!editing) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setEditing(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editing]);

  const showReason = intState === "blocked" || intState === "on_hold";

  /** Same light surface as Estimated / Actual tiles in `IntegrationEffortSection` (background via class so hover works). */
  const readonlyCardBase =
    "cursor-pointer rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-alt)] p-3 text-left " +
    "transition-[background-color,box-shadow] " +
    "hover:bg-[color-mix(in_oklab,var(--app-text)_6%,var(--app-surface-alt))] " +
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-focus)] " +
    "focus-visible:bg-[color-mix(in_oklab,var(--app-text)_4%,var(--app-surface-alt))]";
  const openEdit = () => setEditing(true);

  return (
    <div className={`card-canvas flex h-full min-h-0 flex-col overflow-hidden p-2 sm:p-3 ${className}`.trim()}>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {saveError ? (
          <p className="shrink-0 text-xs" style={{ color: "var(--app-danger)" }} role="alert">
            {saveError}
          </p>
        ) : null}
        {!editing ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2 sm:items-start">
              <button
                type="button"
                className={`${readonlyCardBase} flex flex-col items-stretch`}
                aria-label="Edit integration state"
                onClick={openEdit}
              >
                <p className="self-start text-left text-xs font-medium text-muted-canvas">Integration state</p>
                <div className="mt-2 flex min-h-[3.25rem] items-center justify-center px-0.5">
                  <p
                    className="text-center text-lg font-semibold leading-snug break-words"
                    style={{ color: "var(--app-text)" }}
                  >
                    {formatIntegrationStateLabel(intState)}
                  </p>
                </div>
              </button>
              <button
                type="button"
                className={`${readonlyCardBase} flex flex-col items-stretch`}
                aria-label="Edit delivery progress"
                onClick={openEdit}
              >
                <p className="self-start text-left text-xs font-medium text-muted-canvas">Delivery progress</p>
                <div className="mt-2 flex min-h-[3.25rem] items-center justify-center px-0.5">
                  <p
                    className="text-center text-lg font-semibold leading-snug break-words"
                    style={{ color: "var(--app-text)" }}
                  >
                    {formatDeliveryProgressLabel(delivery)}
                  </p>
                </div>
              </button>
            </div>
            {showReason ? (
              <button
                type="button"
                className={`${readonlyCardBase} flex min-h-[5rem] flex-1 flex-col items-stretch overflow-hidden`}
                aria-label="Edit blocked or on hold reason"
                onClick={openEdit}
              >
                <p className="self-start text-left text-xs font-medium text-muted-canvas">Blocked / on hold reason</p>
                <p
                  className="mt-1 min-h-0 flex-1 overflow-y-auto text-left text-sm font-medium leading-relaxed break-words"
                  style={{ color: "var(--app-text)" }}
                >
                  {reason.trim() ? reason.trim() : "—"}
                </p>
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <label
              className="canvas-select-field flex flex-col gap-1 text-xs"
              style={{ color: "var(--app-text-muted)" }}
            >
              Integration state
              <CanvasSelect
                name="integration_state"
                options={stateOptions}
                value={intState}
                onValueChange={handleStateChange}
              />
            </label>
            <label
              className="canvas-select-field flex flex-col gap-1 text-xs"
              style={{ color: "var(--app-text-muted)" }}
            >
              Delivery progress
              <CanvasSelect
                name="delivery_progress"
                options={deliveryOptions}
                value={delivery}
                onValueChange={handleDeliveryChange}
              />
            </label>
            {showReason ? (
              <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--app-text-muted)" }}>
                Blocked / on hold reason
                <textarea
                  className="input-canvas min-h-[4.5rem] resize-y"
                  rows={3}
                  value={reason}
                  placeholder="Optional"
                  onChange={(e) => {
                    const v = e.target.value;
                    setReason(v);
                    scheduleReasonSave(v);
                  }}
                  onBlur={() => {
                    if (reasonTimer.current) {
                      clearTimeout(reasonTimer.current);
                      reasonTimer.current = null;
                    }
                    flushReasonSave(reason);
                  }}
                />
              </label>
            ) : null}
            <div className="flex justify-end pt-0.5">
              <button type="button" className="btn-ghost cursor-pointer text-sm" onClick={() => setEditing(false)}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
