"use client";

import { useId, useRef, type ReactNode } from "react";
import { DialogCloseButton } from "@/components/dialog-close-button";

function InfoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M9 8.25v4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="9" cy="5.5" r="1" fill="currentColor" />
    </svg>
  );
}

function GuideSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 sm:p-5">
      <h3 className="text-base font-medium text-[var(--app-text)]">{title}</h3>
      <div className="mt-2.5 space-y-3 text-sm leading-6 text-[var(--app-text-muted)]">
        {children}
      </div>
    </section>
  );
}

export function ForecastStudioInfoDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogId = useId();

  function closeDialog() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--app-text-muted)] transition-colors duration-150 hover:bg-[var(--app-surface-alt)] hover:text-[var(--app-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)]"
        aria-label="About Forecast Studio calculations"
        aria-haspopup="dialog"
        aria-controls={dialogId}
        title="About Forecast Studio calculations"
        onClick={() => dialogRef.current?.showModal()}
      >
        <InfoIcon />
      </button>

      <dialog
        ref={dialogRef}
        id={dialogId}
        className="app-catalog-dialog fixed left-1/2 top-1/2 z-[220] h-[min(92dvh,52rem)] w-[min(100vw-1.5rem,72rem)] max-w-[calc(100vw-1.5rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden border-0 p-0 shadow-xl"
        style={{
          borderRadius: "12px",
          background: "var(--app-surface)",
          color: "var(--app-text)",
        }}
        aria-labelledby={`${dialogId}-title`}
        aria-describedby={`${dialogId}-summary`}
        onClose={() => triggerRef.current?.focus()}
      >
        <div className="flex h-full min-h-0 flex-col">
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--app-border)] px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <h2
                id={`${dialogId}-title`}
                className="text-lg font-medium leading-tight text-[var(--app-text)]"
              >
                Understanding Forecast Studio
              </h2>
              <p
                id={`${dialogId}-summary`}
                className="mt-1 text-sm text-[var(--app-text-muted)]"
              >
                How estimates, actuals, weekly allocations, and locks work together.
              </p>
            </div>
            <DialogCloseButton onClick={closeDialog} />
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--app-surface-muted-solid)] px-4 py-5 sm:px-6 sm:py-6">
            <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-2">
              <GuideSection title="How a forecast is calculated">
                <p>
                  Forecast Studio begins with the project-level estimate: the sum of the
                  project&apos;s integration estimates.
                </p>
                <div className="rounded-lg bg-[var(--app-info-surface)] px-3 py-2.5 text-[var(--app-text)]">
                  <p className="font-medium">
                    Remaining effort = Estimated hours − completed-week actuals − committed
                    locked hours
                  </p>
                </div>
                <p>
                  The remaining effort is forecast directly at the project level. Stage dates
                  and effort percentages determine how much belongs in each stage, and the
                  selected spread controls how those hours are placed into project weeks.
                </p>
              </GuideSection>

              <GuideSection title="What counts as actuals">
                <p>
                  The <span className="font-medium text-[var(--app-text)]">Actuals</span> total
                  includes completed effort from Sunday–Saturday weeks that ended before the
                  current week.
                </p>
                <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-alt)] px-3 py-2.5">
                  <p className="font-medium text-[var(--app-text)]">
                    Actuals from the current week are not included.
                  </p>
                  <p className="mt-1">
                    This prevents an in-progress week from being treated as complete while work
                    is still being logged.
                  </p>
                </div>
                <p>
                  Completed actuals are aggregated for the whole project first, then rounded up
                  once to whole hours. Fractions from separate work entries are not rounded
                  independently.
                </p>
              </GuideSection>

              <GuideSection title="How hours are placed on the timeline">
                <p>
                  Only the selected start week and later weeks inside the project timeline are
                  generated. Starting next week leaves the current week unchanged and treats its
                  existing forecast as committed effort.
                </p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>
                    <span className="font-medium text-[var(--app-text)]">Even spread</span>{" "}
                    keeps the project&apos;s weekly forecast as level as possible across each
                    active stage.
                  </li>
                  <li>
                    <span className="font-medium text-[var(--app-text)]">Bell curve</span>{" "}
                    concentrates Architect &amp; Configure work toward the middle-to-late part of
                    the stage and Test work toward the beginning. Other stages remain even.
                  </li>
                  <li>
                    Stage percentages determine how much remaining effort belongs to each stage.
                    Whole-hour rounding is balanced so the allocated total is preserved.
                  </li>
                </ul>
                <p>
                  Effort assigned to stages that are already past can remain off the grid as
                  reserve, which appears as under estimate, or be included and spread across the
                  remaining weeks when generating the forecast.
                </p>
              </GuideSection>

              <GuideSection title="Locked weeks">
                <p>
                  A lock protects a project&apos;s forecast for that week. The locked value
                  cannot be edited and is preserved when the forecast is regenerated.
                </p>
                <p>
                  Locked hours count as committed effort. They are subtracted before the
                  remaining effort is spread, so regenerating changes only unlocked weeks and
                  does not add the locked hours a second time.
                </p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>Use the lock on a project week to protect or release that value.</li>
                  <li>
                    The lock in the All projects row applies the same action to every active
                    project; a mixed state means only some projects are locked.
                  </li>
                  <li>Past weeks are read-only automatically and cannot be unlocked.</li>
                </ul>
              </GuideSection>

              <GuideSection title="Reading the totals and bars">
                <dl className="space-y-3">
                  <div>
                    <dt className="font-medium text-[var(--app-text)]">Estimated</dt>
                    <dd>The project-level sum of its integration estimates.</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-[var(--app-text)]">Actuals</dt>
                    <dd>Completed-week effort only; the current week is excluded.</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-[var(--app-text)]">Forecast</dt>
                    <dd>The project&apos;s weekly forecast from the current week forward.</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-[var(--app-text)]">Estimate variance</dt>
                    <dd>
                      Estimated − Actuals − Forecast. A positive result is under estimate; a
                      negative result is over estimate.
                    </dd>
                  </div>
                </dl>
                <p>
                  Bar height represents weekly hours. Project bars use 32 hours as their full
                  weekly reference. The All projects row adds every active project for each week;
                  its target marker is 32 hours, turns green at or above target, and shows a
                  warning above 40 hours.
                </p>
              </GuideSection>

              <GuideSection title="Manual changes and saving">
                <p>
                  Click a future unlocked project week to type hours, drag its bar, or use the
                  arrow keys. Changes save automatically after a short pause.
                </p>
                <p>
                  A manual edit changes only that project week; it does not automatically
                  rebalance the other weeks.
                </p>
                <p>
                  Increases use available reserve first. While the project is still under its
                  estimate, decreases can return hours to reserve. If a change pushes the
                  project beyond its estimate, the variance is shown as over estimate.
                </p>
              </GuideSection>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}
