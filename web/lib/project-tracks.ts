export const PROJECT_TRACK_KINDS = ["integration", "project_management"] as const;

export type ProjectTrackKind = (typeof PROJECT_TRACK_KINDS)[number];

export function isProjectTrackKind(value: string): value is ProjectTrackKind {
  return (PROJECT_TRACK_KINDS as readonly string[]).includes(value);
}

export function defaultProjectManagementTrackName(): string {
  return "Project Management";
}
