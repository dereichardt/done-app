/** Builtin timeline phases seeded on project create. Keep in sync with createProject. */
export const DEFAULT_PHASES = [
  { name: "Plan", sort_order: 1, phase_key: "plan" },
  { name: "Architect & Configure", sort_order: 2, phase_key: "architect_configure" },
  { name: "Test", sort_order: 3, phase_key: "test" },
  { name: "Deploy", sort_order: 4, phase_key: "deploy" },
  { name: "Hypercare", sort_order: 5, phase_key: "hypercare" },
] as const;

export type DefaultPhaseKey = (typeof DEFAULT_PHASES)[number]["phase_key"];

export const DEFAULT_PHASE_KEYS = DEFAULT_PHASES.map((p) => p.phase_key);

export function isDefaultPhaseKey(value: string): value is DefaultPhaseKey {
  return (DEFAULT_PHASE_KEYS as readonly string[]).includes(value);
}
