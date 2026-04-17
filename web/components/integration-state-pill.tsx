import { formatIntegrationStateLabel, isIntegrationState } from "@/lib/integration-metadata";

const VARIANT_CLASS: Record<"active" | "blocked" | "on_hold", string> = {
  active: "integration-state-pill--active",
  blocked: "integration-state-pill--blocked",
  on_hold: "integration-state-pill--on_hold",
};

export function IntegrationStatePill({ state }: { state: string }) {
  const key = isIntegrationState(state) ? state : "active";
  return (
    <span className={`integration-state-pill ${VARIANT_CLASS[key]}`}>
      {formatIntegrationStateLabel(state)}
    </span>
  );
}
