import {
  formatPhaseDate,
  formatPhaseDaysRemainingLabel,
  type PhaseStatusResult,
} from "@/lib/project-phase-status";
import type { SerializedProjectIntegrationRow } from "@/lib/project-integration-row";
import { ProjectSummaryIntegrationCards } from "./project-summary-integration-cards";

const labelSm = "text-sm font-medium text-muted-canvas";
/** Phase / timing metrics: slightly smaller than legacy 3xl/4xl so they align visually with integration count cards */
const valueCenter = "text-2xl font-semibold leading-tight tracking-tight sm:text-3xl";

const cardShell =
  "card-canvas flex min-h-[10.5rem] flex-col px-4 py-5 sm:min-h-[11rem]";
const topLeft = "shrink-0 self-start text-left";
const valueRegion = "flex min-h-[2.5rem] flex-1 flex-col items-center justify-center px-1 text-center";

export function ProjectSummaryStrip({
  projectId,
  phaseStatus,
  integrationRows,
}: {
  projectId: string;
  phaseStatus: PhaseStatusResult;
  integrationRows: SerializedProjectIntegrationRow[];
}) {
  return (
    <section className="mt-10" aria-label="Project summary">
      <h2 className="section-heading">Summary</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-stretch xl:grid-cols-4">
        <div className={cardShell}>
          {phaseStatus.kind === "empty" ? (
            <>
              <div className={topLeft}>
                <p className={labelSm}>Current phase</p>
                <p className="mt-2 max-w-full text-sm text-muted-canvas">No phases yet.</p>
              </div>
              <div className={valueRegion}>
                <p className={valueCenter} style={{ color: "var(--app-text)" }}>
                  —
                </p>
              </div>
            </>
          ) : null}
          {phaseStatus.kind === "unset" ? (
            <>
              <div className={topLeft}>
                <p className={labelSm}>Current phase</p>
                <p className="mt-2 max-w-full text-sm text-muted-canvas">
                  Add dates in the timeline to see status.
                </p>
              </div>
              <div className={valueRegion}>
                <p className={valueCenter} style={{ color: "var(--app-text)" }}>
                  —
                </p>
              </div>
            </>
          ) : null}
          {phaseStatus.kind === "active" ? (
            <>
              <div className={topLeft}>
                <p className={labelSm}>Current phase</p>
              </div>
              <div className={valueRegion}>
                <p className={valueCenter} style={{ color: "var(--app-text)" }}>
                  {phaseStatus.name}
                </p>
              </div>
            </>
          ) : null}
          {phaseStatus.kind === "upcoming" ? (
            <>
              <div className={topLeft}>
                <p className={labelSm}>Next phase</p>
              </div>
              <div className={valueRegion}>
                <p className={valueCenter} style={{ color: "var(--app-text)" }}>
                  {phaseStatus.name}
                </p>
              </div>
            </>
          ) : null}
          {phaseStatus.kind === "complete" ? (
            <>
              <div className={topLeft}>
                <p className={labelSm}>Phase</p>
              </div>
              <div className={valueRegion}>
                <p className={valueCenter} style={{ color: "var(--app-text)" }}>
                  {phaseStatus.name}
                </p>
              </div>
            </>
          ) : null}
        </div>

        <div className={cardShell}>
          {phaseStatus.kind === "empty" ? (
            <>
              <div className={topLeft}>
                <p className={labelSm}>Phase dates</p>
                <p className="mt-2 max-w-full text-sm text-muted-canvas">No phases yet.</p>
              </div>
              <div className={valueRegion}>
                <p className={valueCenter} style={{ color: "var(--app-text)" }}>
                  —
                </p>
              </div>
            </>
          ) : null}
          {phaseStatus.kind === "unset" ? (
            <>
              <div className={topLeft}>
                <p className={labelSm}>Phase dates</p>
                <p className="mt-2 max-w-full text-sm text-muted-canvas">Add dates in the timeline to see timing.</p>
              </div>
              <div className={valueRegion}>
                <p className={valueCenter} style={{ color: "var(--app-text)" }}>
                  —
                </p>
              </div>
            </>
          ) : null}
          {phaseStatus.kind === "active" ? (
            <>
              <div className={topLeft}>
                <p className={labelSm}>{`Ends ${formatPhaseDate(phaseStatus.endDate)}`}</p>
              </div>
              <div className={valueRegion}>
                <p className={valueCenter} style={{ color: "var(--app-text)" }}>
                  {formatPhaseDaysRemainingLabel(phaseStatus.daysRemaining)}
                </p>
              </div>
            </>
          ) : null}
          {phaseStatus.kind === "upcoming" ? (
            <>
              <div className={topLeft}>
                <p className={labelSm}>{`Ends ${formatPhaseDate(phaseStatus.endDate)}`}</p>
              </div>
              <div className={valueRegion}>
                <p className={valueCenter} style={{ color: "var(--app-text)" }}>
                  {formatPhaseDaysRemainingLabel(phaseStatus.daysUntilEnd)}
                </p>
              </div>
            </>
          ) : null}
          {phaseStatus.kind === "complete" ? (
            <>
              <div className={topLeft}>
                <p className={labelSm}>{`Ended ${formatPhaseDate(phaseStatus.endedDate)}`}</p>
              </div>
              <div className={valueRegion}>
                <p className={valueCenter} style={{ color: "var(--app-text)" }}>
                  Complete
                </p>
              </div>
            </>
          ) : null}
        </div>

        <ProjectSummaryIntegrationCards projectId={projectId} integrationRows={integrationRows} />
      </div>
    </section>
  );
}
