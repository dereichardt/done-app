export type CompletedSortKey = "completed_at" | "name";

export const COMPLETED_SORT_OPTIONS: { value: CompletedSortKey; label: string }[] = [
  { value: "completed_at", label: "Last Completed" },
  { value: "name", label: "Name" },
];
