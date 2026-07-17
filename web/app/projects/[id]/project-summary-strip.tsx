import { VarianceCard } from "@/components/home-actuals-vs-forecast";
import { weekPaceStatus, type HomeWeekTotals } from "@/lib/home-actuals-vs-forecast";
import type { HomeProjectForecastStats } from "@/lib/home-project-status";
import {
  formatPhaseDate,
  formatPhaseDaysRemainingLabel,
  type PhaseStatusResult,
} from "@/lib/project-phase-status";

const labelSm = "text-sm font-medium text-muted-canvas";
/** Phase / timing metrics: slightly smaller than legacy 3xl/4xl so they align visually with integration count cards */
const valueCenter = "text-2xl font-semibold leading-tight tracking-tight sm:text-3xl";
const valueCenterLarge =
  "text-3xl font-semibold leading-tight tracking-tight tabular-nums sm:text-4xl";

const cardShell =
  "card-canvas flex min-h-[10.5rem] flex-col px-4 py-5 sm:min-h-[11rem]";
const topLeft = "shrink-0 self-start text-left";
const valueRegion = "flex min-h-[2.5rem] flex-1 flex-col items-center justify-center px-1 text-center";

function formatSummaryHours(hours: number | null): string {
  if (hours == null) return "—";
  if (!Number.isFinite(hours) || hours <= 0) return "0h";
  return `${Math.round(hours)}h`;
}

function formatProjectCompletedOn(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function ProjectForecastStatsCard({ stats }: { stats: HomeProjectForecastStats }) {
  const varianceValue =
    stats.varianceKind === "unavailable" || stats.varianceHours == null
      ? "—"
      : stats.varianceKind === "on"
        ? "0h"
        : formatSummaryHours(stats.varianceHours);
  const varianceLabel =
    stats.varianceKind === "under"
      ? "Under estimate"
      : stats.varianceKind === "over"
        ? "Over estimate"
        : stats.varianceKind === "on"
          ? "On estimate"
          : "Estimate";

  const varianceColor =
    stats.varianceKind === "over" ? "var(--app-warning)" : "var(--app-text)";

  const cells = [
    { label: "Estimated", value: formatSummaryHours(stats.estimatedHours) },
    { label: "Actuals", value: formatSummaryHours(stats.actualHours) },
    { label: "Forecasted", value: formatSummaryHours(stats.forecastedHours) },
    { label: varianceLabel, value: varianceValue, color: varianceColor, title: stats.varianceLabel },
  ];

  return (
    <article
      className="card-canvas grid min-h-[10.5rem] grid-cols-2 overflow-hidden sm:min-h-[11rem]"
      aria-label={`Project forecast stats: estimate ${cells[0].value}, actuals ${cells[1].value}, forecasted ${cells[2].value}, ${varianceLabel} ${varianceValue}`}
    >
      {cells.map((cell, index) => (
        <div
          key={cell.label}
          className={[
            "flex min-w-0 flex-col justify-between gap-2 px-4 py-4",
            index % 2 === 1 ? "border-l" : "",
            index >= 2 ? "border-t" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={{ borderColor: "var(--app-border)" }}
          title={cell.title}
        >
          <span className="text-xs font-medium leading-tight text-muted-canvas">{cell.label}</span>
          <span
            className="text-2xl font-semibold leading-none tabular-nums text-[var(--app-text)]"
            style={{ color: cell.color }}
          >
            {cell.value}
          </span>
        </div>
      ))}
    </article>
  );
}

export function ProjectSummaryStrip({
  completedAt,
  phaseStatus,
  integrationCount,
  actualsVsForecast,
  projectForecastStats,
  todayYmd,
  embedded = false,
}: {
  completedAt: string | null;
  phaseStatus: PhaseStatusResult;
  integrationCount: number;
  actualsVsForecast: HomeWeekTotals;
  projectForecastStats?: HomeProjectForecastStats;
  /** User-local today; enables this-week pace pill on the variance card. */
  todayYmd?: string;
  /** When true, omit top margin and Summary heading (for nesting inside Progress). */
  embedded?: boolean;
}) {
  const projectCompleted = completedAt != null && completedAt.length > 0;

  return (
    <section className={embedded ? undefined : "mt-10"} aria-label="Project summary">
      {embedded ? null : <h2 className="section-heading">Summary</h2>}
      <div
        className={[
          "grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-stretch xl:grid-cols-4",
          embedded ? undefined : "mt-3",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className={cardShell}>
          {projectCompleted ? (
            <>
              <div className={topLeft}>
                <p className={labelSm}>Current phase</p>
              </div>
              <div className={valueRegion}>
                <p className={valueCenter} style={{ color: "var(--app-text)" }}>
                  Completed
                </p>
              </div>
            </>
          ) : null}
          {!projectCompleted && phaseStatus.kind === "empty" ? (
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
          {!projectCompleted && phaseStatus.kind === "unset" ? (
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
          {!projectCompleted && phaseStatus.kind === "active" ? (
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
          {!projectCompleted && phaseStatus.kind === "upcoming" ? (
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
          {!projectCompleted && phaseStatus.kind === "complete" ? (
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
          {projectCompleted ? (
            <>
              <div className={topLeft}>
                <p className={labelSm}>Completed on</p>
              </div>
              <div className={valueRegion}>
                <p className={valueCenter} style={{ color: "var(--app-text)" }}>
                  {formatProjectCompletedOn(completedAt ?? "")}
                </p>
              </div>
            </>
          ) : null}
          {!projectCompleted && phaseStatus.kind === "empty" ? (
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
          {!projectCompleted && phaseStatus.kind === "unset" ? (
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
          {!projectCompleted && phaseStatus.kind === "active" ? (
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
          {!projectCompleted && phaseStatus.kind === "upcoming" ? (
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
          {!projectCompleted && phaseStatus.kind === "complete" ? (
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

        <div className={cardShell}>
          <div className={topLeft}>
            <p className={labelSm}>Integrations</p>
          </div>
          <div className={valueRegion}>
            <p
              className={valueCenterLarge}
              style={{ color: "var(--app-text)" }}
              aria-label={`${integrationCount} ${integrationCount === 1 ? "integration" : "integrations"}`}
            >
              {integrationCount}
            </p>
          </div>
        </div>

        {embedded && projectForecastStats ? (
          <ProjectForecastStatsCard stats={projectForecastStats} />
        ) : (
          <VarianceCard
            title="Actuals vs Forecast"
            totals={actualsVsForecast}
            paceStatus={todayYmd ? weekPaceStatus(actualsVsForecast, todayYmd) : null}
          />
        )}
      </div>
    </section>
  );
}
