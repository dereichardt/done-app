"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

/** Selectable row only (use for typed option arrays that must have a value). */
export type CanvasSelectSelectableOption = { value: string; label: string; muted?: boolean };

export type CanvasSelectOption =
  | CanvasSelectSelectableOption
  | { kind: "heading"; label: string }
  | { kind: "separator" };

function isCanvasSelectSelectableOption(o: CanvasSelectOption): o is CanvasSelectSelectableOption {
  return !("kind" in o);
}

export function CanvasSelect({
  id: idProp,
  name,
  options,
  placeholder = "Select…",
  defaultValue = "",
  value: valueProp,
  onValueChange,
  disabled = false,
  triggerClassName,
  chevronClassName,
}: {
  id?: string;
  name: string;
  options: CanvasSelectOption[];
  placeholder?: string;
  defaultValue?: string;
  /** When set, the select is controlled (parent owns state via `onValueChange`). */
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  /** Merged onto the trigger button (e.g. tighter padding for narrow time pickers). */
  triggerClassName?: string;
  /** Merged onto the chevron span (e.g. tuck icon toward the right edge). */
  chevronClassName?: string;
}) {
  const uid = useId();
  const id = idProp ?? uid;
  const listId = `${id}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const controlled = valueProp !== undefined;
  const value = controlled ? valueProp : internalValue;

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

  useLayoutEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (!list) return;
    const selectedEl = list.querySelector<HTMLElement>('[role="option"][aria-selected="true"]');
    selectedEl?.scrollIntoView({ block: "center", inline: "nearest" });
  }, [open, value]);

  let selectedLabel = placeholder;
  if (value !== "") {
    for (const o of options) {
      if (isCanvasSelectSelectableOption(o) && o.value === value) {
        selectedLabel = o.label;
        break;
      }
    }
  }

  return (
    <div
      ref={rootRef}
      className={`canvas-select relative${disabled ? " canvas-select-disabled" : ""}`}
      data-state={open ? "open" : "closed"}
    >
      <input type="hidden" name={name} value={value} disabled={disabled} />
      <button
        type="button"
        id={id}
        className={`canvas-select-trigger${triggerClassName ? ` ${triggerClassName}` : ""}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        <span
          className={`min-w-0 flex-1 truncate text-left ${value === "" ? "canvas-select-placeholder" : ""}`}
        >
          {selectedLabel}
        </span>
        <span className={`canvas-select-chevron${chevronClassName ? ` ${chevronClassName}` : ""}`} aria-hidden>
          <svg viewBox="0 0 16 16" width={16} height={16} role="img">
            <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {open ? (
        <ul ref={listRef} id={listId} role="listbox" className="canvas-select-list" aria-labelledby={id}>
          {options.map((o, idx) => {
            if ("kind" in o) {
              if (o.kind === "heading") {
                return (
                  <li
                    key={`h-${idx}-${o.label}`}
                    role="presentation"
                    className="canvas-select-heading px-3 pt-2 pb-1 text-xs font-medium"
                    style={{
                      color: "color-mix(in oklab, var(--app-text-muted) 72%, transparent)",
                    }}
                  >
                    {o.label}
                  </li>
                );
              }
              return (
                <li
                  key={`sep-${idx}`}
                  role="separator"
                  aria-orientation="horizontal"
                  className="canvas-select-separator mx-2 my-1 border-t"
                  style={{ borderColor: "var(--app-border)" }}
                />
              );
            }
            const selected = value === o.value;
            const isEmptyChoice = o.value === "";
            const muted = o.muted ?? isEmptyChoice;
            return (
              <li key={o.value === "" ? "__none__" : o.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`canvas-select-option${selected ? " canvas-select-option-selected" : ""}${muted ? " canvas-select-option-muted" : ""}${isEmptyChoice ? " canvas-select-option-placeholder" : ""}`}
                  onClick={() => {
                    if (!controlled) setInternalValue(o.value);
                    onValueChange?.(o.value);
                    setOpen(false);
                  }}
                >
                  {o.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
