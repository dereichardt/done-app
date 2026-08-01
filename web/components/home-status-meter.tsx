"use client";

import type { CSSProperties } from "react";

export type HomeStatusMeterMarker = {
  /** 0..1 along the track */
  position: number;
};

type HomeStatusMeterProps = {
  label: string;
  captionRight: string;
  fillRatio: number;
  markers: HomeStatusMeterMarker[];
  /** CSS color for the fill track; defaults to `--app-text`. */
  fillColor?: string;
  "aria-label": string;
};

export function HomeStatusMeter({
  label,
  captionRight,
  fillRatio,
  markers,
  fillColor,
  "aria-label": ariaLabel,
}: HomeStatusMeterProps) {
  const r = Math.min(1, Math.max(0, fillRatio));

  const fillStyle: CSSProperties = {
    width: `${r * 100}%`,
    background: fillColor ?? "var(--app-text)",
  };

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <span className="truncate text-xs font-medium text-muted-canvas">{label}</span>
        <span className="shrink-0 tabular-nums text-xs text-muted-canvas">{captionRight}</span>
      </div>
      <div
        className="relative mt-1 h-2.5 w-full overflow-hidden rounded-full"
        style={{
          background: "var(--app-surface-alt)",
          boxShadow: "inset 0 0 0 1px var(--app-border)",
        }}
        role="meter"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(r * 100)}
      >
        <div
          className="motion-safe:[transition:width_300ms_cubic-bezier(0.2,0,0.2,1)] absolute left-0 top-0 h-full rounded-full"
          style={fillStyle}
        />
        {markers.map((m, i) => {
          const pos = Math.min(1, Math.max(0, m.position));
          return (
            <span
              key={i}
              className="pointer-events-none absolute top-0 z-[1] h-full w-px -translate-x-1/2"
              style={{
                left: `${pos * 100}%`,
                background: "var(--app-border)",
              }}
              aria-hidden
            />
          );
        })}
      </div>
    </div>
  );
}
