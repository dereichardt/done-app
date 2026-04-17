"use client";

import {
  CanvasSelect,
  type CanvasSelectOption,
  type CanvasSelectSelectableOption,
} from "@/components/canvas-select";
import { FunctionalAreaDomainSelect } from "@/components/functional-area-domain-select";
import type { IntegrationDomainCode } from "@/lib/functional-area-catalog";
import type {
  DomainLookupRow,
  FunctionalAreaGroup,
  FunctionalAreaLookupRow,
} from "@/lib/functional-area-grouping";
import {
  formatIntegrationDefinitionDisplayName,
  formatIntegrationDirectionLabel,
  INTEGRATION_DIRECTIONS,
} from "@/lib/integration-metadata";
import { useEffect, useId, useMemo, useState } from "react";

export type { DomainLookupRow, FunctionalAreaGroup, FunctionalAreaLookupRow };

export type IntegrationLookupOptions = {
  integrationTypes: CanvasSelectOption[];
  functionalAreas: FunctionalAreaLookupRow[];
  functionalAreasByDomain: Record<IntegrationDomainCode, FunctionalAreaLookupRow[]>;
  functionalAreaGroups: FunctionalAreaGroup[];
  areaDomainCodeById: Record<string, IntegrationDomainCode>;
  domains: DomainLookupRow[];
};

const directionOptions: CanvasSelectSelectableOption[] = INTEGRATION_DIRECTIONS.map((d) => ({
  value: d,
  label: formatIntegrationDirectionLabel(d),
}));

export function DerivedDomainReadout({
  functionalAreaId,
  derivedDomainLabel,
}: {
  functionalAreaId: string;
  derivedDomainLabel: string | null;
}) {
  const labelClass = "block text-sm font-medium";
  const labelStyle = { color: "var(--app-text)" } as const;

  let body: string;
  if (!functionalAreaId) {
    body = "Select a functional area to see the domain.";
  } else if (!derivedDomainLabel) {
    body = "This functional area has no domain mapped yet.";
  } else {
    body = derivedDomainLabel;
  }

  return (
    <div className="text-sm">
      <span className={labelClass} style={labelStyle}>
        Domain{" "}
        <span className="font-normal text-muted-canvas">(from functional area)</span>
      </span>
      <p className="mt-1" style={{ color: functionalAreaId && derivedDomainLabel ? "var(--app-text)" : "var(--app-text-muted)" }}>
        {body}
      </p>
    </div>
  );
}

function IntegrationDefinitionFieldsCreateStyle({
  idBase,
  lookups,
  empty,
  defaultName,
  defaultIntegrationCode,
  defaultInternalTimeCode,
  defaultIntegratingWith,
  defaultDirection,
  defaultIntegrationTypeId,
  defaultFunctionalAreaId,
  defaultEstimatedEffortHours,
  internalTimeCodeMode,
  functionalAreaId,
  setFunctionalAreaId,
  derivedDomainLabel,
  onDefinitionPreviewChange,
}: {
  idBase: string;
  lookups: IntegrationLookupOptions;
  empty: { value: string; label: string }[];
  defaultName: string;
  defaultIntegrationCode: string;
  defaultInternalTimeCode: string;
  defaultIntegratingWith: string;
  defaultDirection: string;
  defaultIntegrationTypeId: string;
  defaultFunctionalAreaId: string;
  defaultEstimatedEffortHours: string;
  internalTimeCodeMode: "hidden" | "optional" | "required";
  functionalAreaId: string;
  setFunctionalAreaId: (id: string) => void;
  derivedDomainLabel: string | null;
  onDefinitionPreviewChange?: (displayName: string) => void;
}) {
  const labelClass = "block text-sm font-medium";
  const labelStyle = { color: "var(--app-text)" } as const;

  const [name, setName] = useState(defaultName);
  const [integrationCode, setIntegrationCode] = useState(defaultIntegrationCode);
  const [internalTimeCode, setInternalTimeCode] = useState(defaultInternalTimeCode);
  const [integratingWith, setIntegratingWith] = useState(defaultIntegratingWith);
  const [direction, setDirection] = useState(defaultDirection);
  const [estimatedEffort, setEstimatedEffort] = useState(defaultEstimatedEffortHours);

  useEffect(() => {
    setName(defaultName);
    setIntegrationCode(defaultIntegrationCode);
    setInternalTimeCode(defaultInternalTimeCode);
    setIntegratingWith(defaultIntegratingWith);
    setDirection(defaultDirection);
    setEstimatedEffort(defaultEstimatedEffortHours);
  }, [
    defaultName,
    defaultIntegrationCode,
    defaultInternalTimeCode,
    defaultIntegratingWith,
    defaultDirection,
    defaultEstimatedEffortHours,
  ]);

  useEffect(() => {
    onDefinitionPreviewChange?.(
      formatIntegrationDefinitionDisplayName({
        integration_code: integrationCode,
        integrating_with: integratingWith,
        name,
        direction,
      }),
    );
  }, [name, integrationCode, integratingWith, direction, onDefinitionPreviewChange]);

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <label className={labelClass} style={labelStyle} htmlFor={`${idBase}-name`}>
        Integration name
        <input
          id={`${idBase}-name`}
          name="name"
          required
          className="input-canvas mt-1"
          placeholder="e.g. Worker Demographic, Journal Entries"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className={labelClass} style={labelStyle} htmlFor={`${idBase}-code`}>
        Integration ID{" "}
        <span className="font-normal text-muted-canvas">(optional)</span>
        <input
          id={`${idBase}-code`}
          name="integration_code"
          className="input-canvas mt-1"
          placeholder="Customer-facing or internal code"
          value={integrationCode}
          onChange={(e) => setIntegrationCode(e.target.value)}
        />
      </label>
      {internalTimeCodeMode !== "hidden" ? (
        <label className={labelClass} style={labelStyle} htmlFor={`${idBase}-internal-time`}>
          Internal time code{" "}
          {internalTimeCodeMode === "required" ? (
            <span className="font-normal text-muted-canvas">(required for catalog)</span>
          ) : (
            <span className="font-normal text-muted-canvas">
              (optional · set before promoting to catalog)
            </span>
          )}
          <input
            id={`${idBase}-internal-time`}
            name="internal_time_code"
            className="input-canvas mt-1"
            placeholder="e.g. billing or time-tracking ID"
            value={internalTimeCode}
            onChange={(e) => setInternalTimeCode(e.target.value)}
            required={internalTimeCodeMode === "required"}
            autoComplete="off"
          />
        </label>
      ) : null}
      <label className={labelClass} style={labelStyle} htmlFor={`${idBase}-integrating-with`}>
        Integrating with{" "}
        <span className="font-normal text-muted-canvas">(optional)</span>
        <input
          id={`${idBase}-integrating-with`}
          name="integrating_with"
          type="text"
          className="input-canvas mt-1"
          placeholder="Vendor or System Name"
          value={integratingWith}
          onChange={(e) => setIntegratingWith(e.target.value)}
          autoComplete="off"
        />
      </label>
      <div className="canvas-select-field flex flex-col gap-1">
        <label className={labelClass} style={labelStyle} htmlFor={`${idBase}-direction`}>
          Direction{" "}
          <span className="font-normal text-muted-canvas">(optional)</span>
        </label>
        <CanvasSelect
          id={`${idBase}-direction`}
          name="direction"
          placeholder="Select…"
          options={[...empty, ...directionOptions]}
          value={direction}
          onValueChange={setDirection}
        />
      </div>
      <div className="canvas-select-field flex flex-col gap-1">
        <label className={labelClass} style={labelStyle} htmlFor={`${idBase}-type`}>
          Integration type{" "}
          <span className="font-normal text-muted-canvas">(optional)</span>
        </label>
        <CanvasSelect
          id={`${idBase}-type`}
          name="integration_type_id"
          placeholder="Select…"
          options={[...empty, ...lookups.integrationTypes]}
          defaultValue={defaultIntegrationTypeId}
        />
      </div>
      <div className="canvas-select-field flex flex-col gap-1">
        <label className={labelClass} style={labelStyle} htmlFor={`${idBase}-area`}>
          Functional area{" "}
          <span className="font-normal text-muted-canvas">(optional)</span>
        </label>
        <FunctionalAreaDomainSelect
          id={`${idBase}-area`}
          name="functional_area_id"
          placeholder="Select…"
          functionalAreasByDomain={lookups.functionalAreasByDomain}
          areaDomainCodeById={lookups.areaDomainCodeById}
          functionalAreaGroups={lookups.functionalAreaGroups}
          defaultValue={defaultFunctionalAreaId}
          onValueChange={setFunctionalAreaId}
        />
      </div>
      <DerivedDomainReadout functionalAreaId={functionalAreaId} derivedDomainLabel={derivedDomainLabel} />
      <label className={labelClass} style={labelStyle} htmlFor={`${idBase}-estimated-effort`}>
        Estimated effort{" "}
        <span className="font-normal text-muted-canvas">(hrs, optional · quarter hours)</span>
        <input
          id={`${idBase}-estimated-effort`}
          name="estimated_effort_hours"
          type="text"
          inputMode="decimal"
          className="input-canvas mt-1"
          placeholder="e.g. 80 or 40.5"
          autoComplete="off"
          value={estimatedEffort}
          onChange={(e) => setEstimatedEffort(e.target.value)}
        />
      </label>
    </div>
  );
}

export function IntegrationDefinitionFields({
  lookups,
  defaultDirection = "",
  defaultIntegrationTypeId = "",
  defaultFunctionalAreaId = "",
  defaultName = "",
  defaultIntegrationCode = "",
  defaultInternalTimeCode = "",
  defaultIntegratingWith = "",
  defaultEstimatedEffortHours = "",
  internalTimeCodeMode = "hidden",
  fieldLayout = "default",
  onDefinitionPreviewChange,
}: {
  lookups: IntegrationLookupOptions;
  defaultDirection?: string;
  defaultIntegrationTypeId?: string;
  defaultFunctionalAreaId?: string;
  defaultName?: string;
  defaultIntegrationCode?: string;
  defaultInternalTimeCode?: string;
  defaultIntegratingWith?: string;
  defaultEstimatedEffortHours?: string;
  /** Shown on add-integration and project integration edit; required on catalog admin edit. */
  internalTimeCodeMode?: "hidden" | "optional" | "required";
  fieldLayout?: "default" | "createStyle";
  /** Live composed definition title while creating (createStyle only). */
  onDefinitionPreviewChange?: (displayName: string) => void;
}) {
  const empty = [{ value: "", label: "—" }];
  const idBase = useId();
  const [functionalAreaId, setFunctionalAreaId] = useState(defaultFunctionalAreaId);

  useEffect(() => {
    setFunctionalAreaId(defaultFunctionalAreaId);
  }, [defaultFunctionalAreaId]);

  const derivedDomainId = useMemo(() => {
    const row = lookups.functionalAreas.find((a) => a.id === functionalAreaId);
    return row?.domainId ?? null;
  }, [functionalAreaId, lookups.functionalAreas]);

  const derivedDomainLabel = useMemo(() => {
    const fromCode = lookups.areaDomainCodeById[functionalAreaId];
    if (fromCode) return fromCode;
    if (!derivedDomainId) return null;
    return lookups.domains.find((d) => d.id === derivedDomainId)?.name ?? null;
  }, [functionalAreaId, lookups.areaDomainCodeById, lookups.domains, derivedDomainId]);

  if (fieldLayout === "createStyle") {
    return (
      <IntegrationDefinitionFieldsCreateStyle
        idBase={idBase}
        lookups={lookups}
        empty={empty}
        defaultName={defaultName}
        defaultIntegrationCode={defaultIntegrationCode}
        defaultInternalTimeCode={defaultInternalTimeCode}
        defaultIntegratingWith={defaultIntegratingWith}
        defaultDirection={defaultDirection}
        defaultIntegrationTypeId={defaultIntegrationTypeId}
        defaultFunctionalAreaId={defaultFunctionalAreaId}
        defaultEstimatedEffortHours={defaultEstimatedEffortHours}
        internalTimeCodeMode={internalTimeCodeMode}
        functionalAreaId={functionalAreaId}
        setFunctionalAreaId={setFunctionalAreaId}
        derivedDomainLabel={derivedDomainLabel}
        onDefinitionPreviewChange={onDefinitionPreviewChange}
      />
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-3">
      <input
        name="name"
        required
        placeholder="e.g. Worker Demographic, Journal Entries"
        className="input-canvas"
        defaultValue={defaultName}
      />
      <input
        name="integration_code"
        placeholder="Integration ID (optional)"
        className="input-canvas"
        defaultValue={defaultIntegrationCode}
      />
      {internalTimeCodeMode !== "hidden" ? (
        <label className="block text-sm font-medium" style={{ color: "var(--app-text)" }}>
          Internal time code{" "}
          {internalTimeCodeMode === "required" ? (
            <span className="font-normal text-muted-canvas">(required)</span>
          ) : (
            <span className="font-normal text-muted-canvas">(optional)</span>
          )}
          <input
            name="internal_time_code"
            className="input-canvas mt-1"
            placeholder="Billing or time-tracking ID"
            defaultValue={defaultInternalTimeCode}
            required={internalTimeCodeMode === "required"}
            autoComplete="off"
          />
        </label>
      ) : null}
      <input
        name="integrating_with"
        type="text"
        placeholder="Vendor or System Name"
        className="input-canvas"
        defaultValue={defaultIntegratingWith}
        autoComplete="off"
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <label
          className="canvas-select-field flex flex-col gap-1 text-xs"
          style={{ color: "var(--app-text-muted)" }}
        >
          Direction (optional)
          <CanvasSelect
            name="direction"
            placeholder="Select…"
            options={[...empty, ...directionOptions]}
            defaultValue={defaultDirection}
          />
        </label>
        <label
          className="canvas-select-field flex flex-col gap-1 text-xs"
          style={{ color: "var(--app-text-muted)" }}
        >
          Integration type (optional)
          <CanvasSelect
            name="integration_type_id"
            placeholder="Select…"
            options={[...empty, ...lookups.integrationTypes]}
            defaultValue={defaultIntegrationTypeId}
          />
        </label>
        <label
          className="canvas-select-field flex flex-col gap-1 text-xs sm:col-span-2"
          style={{ color: "var(--app-text-muted)" }}
        >
          Functional area (optional)
          <FunctionalAreaDomainSelect
            name="functional_area_id"
            placeholder="Select…"
            functionalAreasByDomain={lookups.functionalAreasByDomain}
            areaDomainCodeById={lookups.areaDomainCodeById}
            functionalAreaGroups={lookups.functionalAreaGroups}
            defaultValue={defaultFunctionalAreaId}
            onValueChange={setFunctionalAreaId}
          />
        </label>
      </div>
      <DerivedDomainReadout functionalAreaId={functionalAreaId} derivedDomainLabel={derivedDomainLabel} />
    </div>
  );
}
