import type { TaskSubtask } from "@/lib/tasks-page-shared";

export type SubtaskCreateInput = {
  title: string;
  completed?: boolean;
};

type SubtaskRow = {
  id: string;
  title: string;
  completed: boolean | null;
  sort_order: number | null;
};

type ParentSubtaskRow = SubtaskRow & { parent_id: string };

/** Minimal query surface used by snapshot/create helpers (avoids importing the server client type). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SubtaskDb = { from: (table: string) => any };

export function mapSubtaskRow(row: SubtaskRow): TaskSubtask {
  return {
    id: row.id,
    title: row.title,
    completed: Boolean(row.completed),
    sort_order: Number(row.sort_order ?? 0),
  };
}

export function normalizeSubtaskCreates(input: unknown): SubtaskCreateInput[] {
  if (!Array.isArray(input)) return [];
  const out: SubtaskCreateInput[] = [];
  for (const item of input) {
    if (typeof item === "string") {
      const title = item.trim();
      if (title) out.push({ title, completed: false });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const rec = item as { title?: unknown; completed?: unknown };
    const title = String(rec.title ?? "").trim();
    if (!title) continue;
    out.push({ title, completed: rec.completed === true });
  }
  return out;
}

export function parseSubtaskCreatesFromFormData(formData: FormData): SubtaskCreateInput[] {
  const raw = String(formData.get("subtasks_json") ?? "").trim();
  if (raw) {
    try {
      return normalizeSubtaskCreates(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  return formData
    .getAll("subtask")
    .map((v) => String(v).trim())
    .filter(Boolean)
    .map((title) => ({ title, completed: false }));
}

export function groupSubtasksByParent(rows: ParentSubtaskRow[]): Map<string, TaskSubtask[]> {
  const grouped = new Map<string, TaskSubtask[]>();
  for (const row of rows) {
    const list = grouped.get(row.parent_id) ?? [];
    list.push(mapSubtaskRow(row));
    grouped.set(row.parent_id, list);
  }
  return grouped;
}

export async function loadSubtasksGrouped(
  supabase: SubtaskDb,
  table: "integration_task_subtasks" | "internal_task_subtasks",
  parentColumn: "integration_task_id" | "internal_task_id",
  parentIds: string[],
): Promise<{ grouped: Map<string, TaskSubtask[]>; error?: string }> {
  if (parentIds.length === 0) return { grouped: new Map() };

  const { data, error } = await supabase
    .from(table)
    .select(`id, title, completed, sort_order, ${parentColumn}`)
    .in(parentColumn, parentIds)
    .order("sort_order", { ascending: true });

  if (error) return { grouped: new Map(), error: error.message };

  const rows: ParentSubtaskRow[] = ((data ?? []) as unknown[]).map((raw) => {
    const row = raw as SubtaskRow & Record<string, unknown>;
    return {
      id: row.id,
      title: row.title,
      completed: row.completed,
      sort_order: row.sort_order,
      parent_id: String(row[parentColumn] ?? ""),
    };
  });

  return { grouped: groupSubtasksByParent(rows) };
}

export async function insertSubtasksForParent(
  supabase: SubtaskDb,
  table: "integration_task_subtasks" | "internal_task_subtasks",
  parentColumn: "integration_task_id" | "internal_task_id",
  parentId: string,
  items: SubtaskCreateInput[],
): Promise<{ error?: string }> {
  const rows = items
    .map((item) => ({ title: item.title.trim(), completed: item.completed === true }))
    .filter((item) => item.title.length > 0)
    .map((item, index) => ({
      [parentColumn]: parentId,
      title: item.title,
      completed: item.completed,
      sort_order: index,
    }));
  if (rows.length === 0) return {};
  const { error } = await supabase.from(table).insert(rows);
  if (error) return { error: error.message };
  return {};
}
