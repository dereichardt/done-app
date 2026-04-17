"use client";

import { INTEGRATION_DOMAIN_CODES, type IntegrationDomainCode } from "@/lib/functional-area-catalog";
import type { FunctionalAreaGroup, FunctionalAreaLookupRow } from "@/lib/functional-area-grouping";
import { useEffect, useId, useMemo, useRef, useState } from "react";

export type { FunctionalAreaGroup, FunctionalAreaLookupRow };

type Panel =
  | { kind: "domains" }
  | { kind: "areas"; code: IntegrationDomainCode }
  | { kind: "areas_extra"; label: string };

const DOMAIN_CODE_SET = new Set<string>(INTEGRATION_DOMAIN_CODES);

export function FunctionalAreaDomainSelect({
  id: idProp,
  name,
  functionalAreasByDomain,
  areaDomainCodeById,
  functionalAreaGroups,
  placeholder = "Select…",
  defaultValue = "",
  onValueChange,
}: {
  id?: string;
  name: string;
  functionalAreasByDomain: Record<IntegrationDomainCode, FunctionalAreaLookupRow[]>;
  areaDomainCodeById: Record<string, IntegrationDomainCode>;
  functionalAreaGroups?: FunctionalAreaGroup[] | undefined;
  placeholder?: string;
  defaultValue?: string;
  onValueChange?: (functionalAreaId: string) => void;
}) {
  const uid = useId();
  const id = idProp ?? uid;
  const listId = `${id}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(defaultValue);
  const [panel, setPanel] = useState<Panel>({ kind: "domains" });

  const groups = functionalAreaGroups ?? [];

  const extraGroups = useMemo(
    () => groups.filter((g) => g.areas.length > 0 && !DOMAIN_CODE_SET.has(g.label)),
    [groups],
  );

  const areaById = useMemo(() => {
    const m = new Map<string, FunctionalAreaLookupRow>();
    for (const code of INTEGRATION_DOMAIN_CODES) {
      for (const a of functionalAreasByDomain[code] ?? []) {
        m.set(a.id, a);
      }
    }
    for (const g of extraGroups) {
      for (const a of g.areas) {
        m.set(a.id, a);
      }
    }
    return m;
  }, [functionalAreasByDomain, extraGroups]);

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent | TouchEvent) {
      const el = rootRef.current;
      const t = e.target;
      if (el && t instanceof Node && !el.contains(t)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [open]);

  function openToContext() {
    if (!value) {
      setPanel({ kind: "domains" });
      return;
    }
    const code = areaDomainCodeById[value];
    if (code && DOMAIN_CODE_SET.has(code)) {
      setPanel({ kind: "areas", code });
      return;
    }
    const extra = extraGroups.find((g) => g.areas.some((a) => a.id === value));
    if (extra) {
      setPanel({ kind: "areas_extra", label: extra.label });
      return;
    }
    setPanel({ kind: "domains" });
  }

  function toggleOpen() {
    setOpen((o) => {
      const next = !o;
      if (next) openToContext();
      return next;
    });
  }

  const selectedArea = value ? areaById.get(value) : undefined;
  const triggerLabel =
    value === "" ? placeholder : (selectedArea?.name ?? placeholder);

  const drillRows: FunctionalAreaLookupRow[] =
    panel.kind === "areas"
      ? (functionalAreasByDomain[panel.code] ?? [])
      : panel.kind === "areas_extra"
        ? (extraGroups.find((g) => g.label === panel.label)?.areas ?? [])
        : [];

  const drillTitle =
    panel.kind === "areas" ? panel.code : panel.kind === "areas_extra" ? panel.label : "";

  return (
    <div
      ref={rootRef}
      className="canvas-select relative"
      data-state={open ? "open" : "closed"}
    >
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        id={id}
        className="canvas-select-trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        onClick={toggleOpen}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        <span
          className={`min-w-0 flex-1 truncate text-left ${value === "" ? "canvas-select-placeholder" : ""}`}
        >
          {triggerLabel}
        </span>
        <span className="canvas-select-chevron" aria-hidden>
          <svg viewBox="0 0 16 16" width={16} height={16} role="img">
            <path
              d="M4 6l4 4 4-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
      {open ? (
        <ul id={listId} role="listbox" className="canvas-select-list" aria-labelledby={id}>
          {panel.kind === "domains" ? (
            <>
              <li role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={value === ""}
                  className={`canvas-select-option canvas-select-option-placeholder${value === "" ? " canvas-select-option-selected" : ""}`}
                  onClick={() => {
                    setValue("");
                    onValueChange?.("");
                    setOpen(false);
                  }}
                >
                  —
                </button>
              </li>
              {INTEGRATION_DOMAIN_CODES.map((code) => (
                <li key={code} role="presentation">
                  <button
                    type="button"
                    role="option"
                    className="canvas-select-option flex w-full cursor-pointer items-center gap-2"
                    onClick={() => setPanel({ kind: "areas", code })}
                  >
                    <span className="min-w-0 flex-1 truncate text-left">{code}</span>
                    <span className="shrink-0 text-muted-canvas" aria-hidden>
                      <svg viewBox="0 0 16 16" width={14} height={14}>
                        <path
                          d="M6 4l4 4-4 4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </button>
                </li>
              ))}
              {extraGroups.length > 0 ? (
                <li
                  role="separator"
                  aria-orientation="horizontal"
                  className="canvas-select-separator mx-2 my-1 border-t"
                  style={{ borderColor: "var(--app-border)" }}
                />
              ) : null}
              {extraGroups.map((g) => (
                <li key={`extra-${g.label}`} role="presentation">
                  <button
                    type="button"
                    role="option"
                    className="canvas-select-option flex w-full cursor-pointer items-center gap-2"
                    onClick={() => setPanel({ kind: "areas_extra", label: g.label })}
                  >
                    <span className="min-w-0 flex-1 truncate text-left">{g.label}</span>
                    <span className="shrink-0 text-muted-canvas" aria-hidden>
                      <svg viewBox="0 0 16 16" width={14} height={14}>
                        <path
                          d="M6 4l4 4-4 4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </button>
                </li>
              ))}
            </>
          ) : (
            <>
              <li role="presentation" className="border-b" style={{ borderColor: "var(--app-border)" }}>
                <button
                  type="button"
                  role="option"
                  className="canvas-select-option flex w-full cursor-pointer items-center gap-2 font-medium"
                  onClick={() => setPanel({ kind: "domains" })}
                >
                  <span className="shrink-0 text-muted-canvas" aria-hidden>
                    <svg viewBox="0 0 16 16" width={14} height={14}>
                      <path
                        d="M10 12L6 8l4-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span className="min-w-0 truncate">All domains</span>
                </button>
              </li>
              <li
                role="presentation"
                className="px-3 py-1.5 text-xs font-medium"
                style={{
                  color: "color-mix(in oklab, var(--app-text-muted) 72%, transparent)",
                }}
              >
                {drillTitle}
              </li>
              {drillRows.length === 0 ? (
                <li
                  role="presentation"
                  className="px-3 py-2 text-sm text-muted-canvas"
                >
                  No functional areas in this domain.
                </li>
              ) : (
                drillRows.map((row) => {
                  const selected = value === row.id;
                  return (
                    <li key={row.id} role="presentation">
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={`canvas-select-option w-full cursor-pointer${selected ? " canvas-select-option-selected" : ""}`}
                        onClick={() => {
                          setValue(row.id);
                          onValueChange?.(row.id);
                          setOpen(false);
                        }}
                      >
                        {row.name}
                      </button>
                    </li>
                  );
                })
              )}
            </>
          )}
        </ul>
      ) : null}
    </div>
  );
}
