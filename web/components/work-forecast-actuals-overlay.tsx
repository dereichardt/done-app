"use client";

import { VarianceCard } from "@/components/home-actuals-vs-forecast";
import { InitiativeIcpPill } from "@/components/initiative-icp-pill";
import {
  hasForecastHours,
  makeWeekTotals,
  type HomeActualsVsForecastDTO,
  type HomeWeekTotals,
  variancePercentLabel,
} from "@/lib/home-actuals-vs-forecast";
import { formatEffortHoursLabel } from "@/lib/integration-effort-buckets";
import type { TasksPageProject, TasksPageTrack } from "@/lib/tasks-page-shared";
import type { WorkForecastTrackActual } from "@/lib/work-forecast-track-actuals";
import { useEffect, useId, useMemo, useState } from "react";

const FAB_LABEL = "View Forecasts vs Actuals";

function formatBarHours(hours: number): string {
  if (!Number.isFinite(hours) || hours === 0) return "0h";
  const q = Math.round(hours * 4) / 4;
  const s = Number.isInteger(q) ? String(q) : String(parseFloat(q.toFixed(2)));
  return `${s}h`;
}

function tileStyleForProjectColor(colorVar: string | null | undefined): {
  borderColor: string;
  background: string;
  valueColor: string;
} {
  if (!colorVar) {
    return {
      borderColor: "var(--app-border)",
      background: "var(--app-surface-alt)",
      valueColor: "var(--app-action)",
    };
  }
  return {
    borderColor: `color-mix(in oklab, var(${colorVar}) 36%, var(--app-border))`,
    background: `color-mix(in oklab, var(${colorVar}) 16%, var(--app-surface-alt))`,
    valueColor: `color-mix(in oklab, var(${colorVar}) 64%, var(--app-action))`,
  };
}

function ProgressRing({ pct }: { pct: number }) {
  const size = 28;
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, pct));
  const offset = c - (clamped / 100) * c;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--app-border)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--app-cta-dark-fill)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

function ProjectForecastRow({
  title,
  totals,
  isIcp,
  tracks,
  colorVar,
}: {
  title: string;
  totals: HomeWeekTotals;
  isIcp: boolean;
  tracks: Array<{ trackId: string; label: string; hours: number }>;
  colorVar: string | null;
}) {
  const hasForecast = hasForecastHours(totals.forecast);
  const pct = hasForecast ? variancePercentLabel(totals.forecast, totals.variance) : null;
  const fillPct =
    hasForecast && totals.actual > 0
      ? Math.min(100, (totals.actual / totals.forecast) * 100)
      : 0;
  const showActualInBar = totals.actual > 0 && fillPct > 0;

  return (
    <article
      className="card-canvas flex w-full flex-col px-4 py-3"
      aria-label={
        hasForecast
          ? `${title}: forecast ${formatEffortHoursLabel(totals.forecast)}, actuals ${formatEffortHoursLabel(totals.actual)}, remaining ${formatEffortHoursLabel(totals.variance)}${pct ? ` (${pct})` : ""}`
          : `${title}: forecast ${formatEffortHoursLabel(totals.forecast)}, actuals ${formatEffortHoursLabel(totals.actual)}`
      }
    >
      <div className="flex shrink-0 items-start gap-2">
        <h3
          className="min-w-0 text-sm font-medium leading-snug text-[var(--app-text)]"
          title={title}
        >
          <span className="line-clamp-2">{title}</span>
        </h3>
        {isIcp ? <InitiativeIcpPill className="mt-0.5" /> : null}
      </div>

      <div className="mt-2">
        <span className="mb-1.5 block self-end text-right text-xs font-medium tabular-nums leading-none text-[var(--app-text)]">
          {formatBarHours(totals.forecast)}
        </span>
        <div
          className="relative h-8 w-full overflow-hidden rounded-full"
          style={{ background: "var(--app-border)" }}
          aria-hidden
        >
          {showActualInBar ? (
            <div
              className="absolute inset-y-0 left-0 flex items-center overflow-hidden rounded-full px-2.5"
              style={{
                width: `${fillPct}%`,
                background: "var(--app-cta-dark-fill)",
              }}
            >
              <span className="text-[0.7rem] font-medium leading-none tabular-nums text-[var(--app-cta-dark-fg)]">
                {formatBarHours(totals.actual)}
              </span>
            </div>
          ) : null}
        </div>
        <p className="mt-2 text-xs font-medium tabular-nums text-[var(--app-text)]">
          {hasForecast ? (
            <>
              <span>{formatEffortHoursLabel(totals.variance)} remaining</span>
              {pct ? (
                <span className="font-normal text-muted-canvas">
                  {" · "}
                  {pct}
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-muted-canvas">
              {totals.actual > 0
                ? `${formatEffortHoursLabel(totals.actual)} actual`
                : "—"}
            </span>
          )}
        </p>
      </div>

      {tracks.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t pt-2.5" style={{ borderColor: "var(--app-border)" }}>
          {tracks.map((t) => {
            const tileStyle = tileStyleForProjectColor(colorVar);
            return (
              <div
                key={t.trackId}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1"
                style={{ borderColor: tileStyle.borderColor, background: tileStyle.background }}
              >
                <span
                  className="max-w-[12rem] truncate text-[11px] font-medium text-muted-canvas"
                  title={t.label}
                >
                  {t.label}
                </span>
                <span
                  className="text-[11px] font-semibold tabular-nums"
                  style={{ color: tileStyle.valueColor }}
                >
                  {formatEffortHoursLabel(t.hours)}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}

export function WorkForecastActualsOverlay({
  open,
  onClose,
  data,
  trackActuals,
  projects,
  tracks,
}: {
  open: boolean;
  onClose: () => void;
  data: HomeActualsVsForecastDTO;
  trackActuals: WorkForecastTrackActual[];
  projects: TasksPageProject[];
  tracks: TasksPageTrack[];
}) {
  const titleId = useId();
  const currentSunday = data.weeks[data.weeks.length - 1] ?? "";
  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p] as const)),
    [projects],
  );
  const trackById = useMemo(
    () => new Map(tracks.map((t) => [t.id, t] as const)),
    [tracks],
  );

  const tracksByProject = useMemo(() => {
    const map = new Map<string, Array<{ trackId: string; label: string; hours: number }>>();
    for (const row of trackActuals) {
      if (row.hours <= 0) continue;
      const label = trackById.get(row.trackId)?.label ?? "Track";
      const list = map.get(row.projectId) ?? [];
      list.push({ trackId: row.trackId, label, hours: row.hours });
      map.set(row.projectId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => b.hours - a.hours);
    }
    return map;
  }, [trackActuals, trackById]);

  const projectRows = useMemo(() => {
    return data.projects
      .map((p) => {
        const totals = p.byWeek[currentSunday] ?? makeWeekTotals(0, 0);
        return {
          id: p.id,
          name: p.name,
          isIcp: p.isIcp,
          kind: p.kind,
          totals,
          tracks: tracksByProject.get(p.id) ?? [],
          colorVar: projectById.get(p.id)?.colorVar ?? null,
        };
      })
      .filter((p) => hasForecastHours(p.totals.forecast) || p.totals.actual > 0)
      .sort((a, b) => {
        const aScore = a.totals.forecast || a.totals.actual;
        const bScore = b.totals.forecast || b.totals.actual;
        return bScore - aScore;
      });
  }, [currentSunday, data.projects, projectById, tracksByProject]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default border-0"
        style={{ background: "color-mix(in oklab, var(--app-text) 28%, transparent)" }}
        aria-label="Close forecast vs actuals"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-[1] flex max-h-[min(85dvh,52rem)] w-[min(96vw,56rem)] flex-col overflow-hidden rounded-[12px] border shadow-xl"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-surface)",
          color: "var(--app-text)",
          boxShadow: "var(--app-shadow-card)",
        }}
      >
        <div
          className="flex shrink-0 items-center border-b px-4 py-3"
          style={{ borderColor: "var(--app-border)" }}
        >
          <h2 id={titleId} className="text-base font-medium" style={{ color: "var(--app-text)" }}>
            Forecast vs Actuals
          </h2>
          <span className="ml-2 text-xs text-muted-canvas">This week</span>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
          <VarianceCard title="All projects" totals={data.thisWeek} compact />

          {projectRows.length === 0 ? (
            <p className="text-sm text-muted-canvas">No forecast or actuals for this week.</p>
          ) : (
            projectRows.map((row) => (
              <ProjectForecastRow
                key={row.id}
                title={row.name}
                totals={row.totals}
                isIcp={row.isIcp}
                tracks={row.tracks}
                colorVar={row.colorVar}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function WorkForecastActualsFab({
  data,
  trackActuals,
  projects,
  tracks,
}: {
  data: HomeActualsVsForecastDTO;
  trackActuals: WorkForecastTrackActual[];
  projects: TasksPageProject[];
  tracks: TasksPageTrack[];
}) {
  const [open, setOpen] = useState(false);
  const fillPct = hasForecastHours(data.thisWeek.forecast)
    ? Math.min(100, (data.thisWeek.actual / data.thisWeek.forecast) * 100)
    : 0;

  return (
    <>
      <button
        type="button"
        className="fixed bottom-6 right-6 z-[230] inline-flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border shadow-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--app-text)_35%,transparent)]"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-surface)",
          color: "var(--app-text)",
          boxShadow: "var(--app-shadow-card)",
        }}
        title={open ? "Close" : FAB_LABEL}
        aria-label={open ? "Close" : FAB_LABEL}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <svg viewBox="0 0 16 16" width={20} height={20} aria-hidden className="shrink-0">
            <path
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.6"
              d="M4 4l8 8M12 4l-8 8"
            />
          </svg>
        ) : (
          <ProgressRing pct={fillPct} />
        )}
      </button>

      <WorkForecastActualsOverlay
        open={open}
        onClose={() => setOpen(false)}
        data={data}
        trackActuals={trackActuals}
        projects={projects}
        tracks={tracks}
      />
    </>
  );
}
