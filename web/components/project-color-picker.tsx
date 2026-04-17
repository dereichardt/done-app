"use client";

import {
  PROJECT_COLOR_OPTIONS,
  PROJECT_HUES,
  PROJECT_SHADES,
  type ProjectColorKey,
} from "@/lib/project-colors";
import { useId } from "react";

function Swatch({
  id,
  name,
  value,
  checked,
  label,
  background,
}: {
  id: string;
  name: string;
  value: string;
  checked: boolean;
  label: string;
  background: string;
}) {
  return (
    <label htmlFor={id} className="group inline-flex items-center justify-center">
      <input
        id={id}
        type="radio"
        name={name}
        value={value}
        defaultChecked={checked}
        className="sr-only"
      />
      <span className="relative h-7 w-7" aria-hidden="true">
        <span
          className="absolute inset-0 rounded-full border shadow-sm transition group-has-[:focus-visible]:ring-2 group-has-[:checked]:ring-2"
          title={label}
          style={{
            background,
            borderColor: "var(--app-border)",
            boxShadow: "0 1px 1px rgba(31, 41, 55, 0.06)",
            outlineColor: "var(--app-focus)",
            // ring color (Tailwind ring uses currentColor-ish); ensure visible
            color: "var(--app-focus)",
          }}
        />
        <span className="absolute inset-0 grid place-items-center opacity-0 transition group-has-[:checked]:opacity-100">
          <span
            className="grid h-5 w-5 place-items-center rounded-full"
            style={{
              background: "color-mix(in oklab, var(--app-surface) 65%, transparent)",
              border: "1px solid color-mix(in oklab, var(--app-border) 65%, transparent)",
              color: "var(--app-text)",
            }}
          >
            <svg
              viewBox="0 0 16 16"
              width="12"
              height="12"
              role="img"
              aria-label="Selected"
              style={{ display: "block" }}
            >
              <path
                d="M13.1 4.6 6.7 11 3 7.4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </span>
      </span>
    </label>
  );
}

export function ProjectColorPicker({
  name,
  defaultValue,
  legend = "Project color",
}: {
  name: string;
  defaultValue?: ProjectColorKey | null;
  legend?: string;
}) {
  const baseId = useId();
  const initial = defaultValue ?? "";

  const byHue = new Map<string, Map<string, (typeof PROJECT_COLOR_OPTIONS)[number]>>();
  for (const opt of PROJECT_COLOR_OPTIONS) {
    if (!byHue.has(opt.hue)) byHue.set(opt.hue, new Map());
    byHue.get(opt.hue)!.set(opt.shade, opt);
  }

  return (
    <fieldset className="flex flex-col">
      <legend className="text-sm font-medium mb-3" style={{ color: "var(--app-text)" }}>
        {legend}
      </legend>

      <div className="inline-grid grid-flow-col auto-cols-max gap-2">
        {PROJECT_HUES.map((hue) => {
          const shadeMap = byHue.get(hue);
          return (
            <div key={hue} className="grid grid-rows-3 place-items-center gap-2">
              {PROJECT_SHADES.map((shade) => {
                const opt = shadeMap?.get(shade);
                if (!opt) return <span key={`${hue}-${shade}`} className="h-7 w-7" aria-hidden />;
                const id = `${baseId}-${opt.key}`;
                return (
                  <Swatch
                    key={opt.key}
                    id={id}
                    name={name}
                    value={opt.key}
                    checked={initial === opt.key}
                    label={opt.label}
                    background={`var(${opt.cssVar})`}
                  />
                );
              })}
            </div>
          );
        })}

        <div className="grid grid-rows-3 place-items-center gap-2">
          <Swatch
            id={`${baseId}-white`}
            name={name}
            value=""
            checked={initial === ""}
            label="White"
            background="var(--app-surface)"
          />
          <span className="h-7 w-7" aria-hidden />
          <span className="h-7 w-7" aria-hidden />
        </div>
      </div>
    </fieldset>
  );
}

