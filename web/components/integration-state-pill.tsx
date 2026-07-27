import {
  formatIntegrationStateLabel,
  isIntegrationState,
  type ProjectIntegrationState,
} from "@/lib/integration-metadata";

const VARIANT_CLASS: Record<ProjectIntegrationState, string> = {
  active: "integration-state-pill--active",
  blocked: "integration-state-pill--blocked",
  on_hold: "integration-state-pill--on_hold",
  completed: "integration-state-pill--completed",
  removed_from_scope: "integration-state-pill--removed_from_scope",
};

export function IntegrationStatePill({ state }: { state: string }) {
  const key = isIntegrationState(state) ? state : "active";
  return (
    <span className={`integration-state-pill ${VARIANT_CLASS[key]}`}>
      {formatIntegrationStateLabel(state)}
    </span>
  );
}
