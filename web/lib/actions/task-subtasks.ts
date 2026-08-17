"use server";

import {
  insertSubtasksForParent,
  mapSubtaskRow,
  type SubtaskCreateInput,
} from "@/lib/task-subtask-data";
import type { TaskSubtask } from "@/lib/tasks-page-shared";
import { createClient } from "@/lib/supabase/server";

type TaskScope = "project" | "internal";

type ParentTable = {
  table: "integration_task_subtasks";
  parentColumn: "integration_task_id";
  parentTable: "integration_tasks";
} | {
  table: "internal_task_subtasks";
  parentColumn: "internal_task_id";
  parentTable: "internal_tasks";
};

const PROJECT_TABLE: ParentTable = {
  table: "integration_task_subtasks",
  parentColumn: "integration_task_id",
  parentTable: "integration_tasks",
};

const INTERNAL_TABLE: ParentTable = {
  table: "internal_task_subtasks",
  parentColumn: "internal_task_id",
  parentTable: "internal_tasks",
};

async function resolveParentTable(
  taskId: string,
  scope?: TaskScope,
): Promise<{ kind: TaskScope; spec: ParentTable } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  if (scope !== "internal") {
    const { data } = await supabase.from("integration_tasks").select("id").eq("id", taskId).maybeSingle();
    if (data) return { kind: "project", spec: PROJECT_TABLE };
    if (scope === "project") return { error: "Not found" };
  }

  const { data: internal } = await supabase.from("internal_tasks").select("id").eq("id", taskId).maybeSingle();
  if (internal) return { kind: "internal", spec: INTERNAL_TABLE };
  return { error: "Not found" };
}

export async function addAnyTaskSubtask(
  taskId: string,
  title: string,
  scope?: TaskScope,
): Promise<{ subtask?: TaskSubtask; error?: string }> {
  const trimmed = title.trim();
  if (!trimmed) return { error: "Title is required" };

  const resolved = await resolveParentTable(taskId, scope);
  if ("error" in resolved) return { error: resolved.error };

  const supabase = await createClient();
  const { spec } = resolved;

  const { data: existing, error: existingErr } = await supabase
    .from(spec.table)
    .select("sort_order")
    .eq(spec.parentColumn, taskId);
  if (existingErr) return { error: existingErr.message };
  const nextSort =
    (existing ?? []).reduce((max, row) => Math.max(max, Number(row.sort_order ?? 0)), -1) + 1;

  const { data, error } = await supabase
    .from(spec.table)
    .insert({
      [spec.parentColumn]: taskId,
      title: trimmed,
      completed: false,
      sort_order: nextSort,
    })
    .select("id, title, completed, sort_order")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Could not create subtask" };
  return { subtask: mapSubtaskRow(data) };
}

export async function toggleAnyTaskSubtask(
  taskId: string,
  subtaskId: string,
  completed: boolean,
  scope?: TaskScope,
): Promise<{ error?: string }> {
  const resolved = await resolveParentTable(taskId, scope);
  if ("error" in resolved) return { error: resolved.error };

  const supabase = await createClient();
  const { spec } = resolved;
  const { error } = await supabase
    .from(spec.table)
    .update({ completed })
    .eq("id", subtaskId)
    .eq(spec.parentColumn, taskId);
  if (error) return { error: error.message };
  return {};
}

export async function updateAnyTaskSubtaskTitle(
  taskId: string,
  subtaskId: string,
  title: string,
  scope?: TaskScope,
): Promise<{ error?: string }> {
  const trimmed = title.trim();
  if (!trimmed) return { error: "Title is required" };

  const resolved = await resolveParentTable(taskId, scope);
  if ("error" in resolved) return { error: resolved.error };

  const supabase = await createClient();
  const { spec } = resolved;
  const { error } = await supabase
    .from(spec.table)
    .update({ title: trimmed })
    .eq("id", subtaskId)
    .eq(spec.parentColumn, taskId);
  if (error) return { error: error.message };
  return {};
}

export async function deleteAnyTaskSubtask(
  taskId: string,
  subtaskId: string,
  scope?: TaskScope,
): Promise<{ error?: string }> {
  const resolved = await resolveParentTable(taskId, scope);
  if ("error" in resolved) return { error: resolved.error };

  const supabase = await createClient();
  const { spec } = resolved;
  const { error } = await supabase
    .from(spec.table)
    .delete()
    .eq("id", subtaskId)
    .eq(spec.parentColumn, taskId);
  if (error) return { error: error.message };
  return {};
}

export async function reorderAnyTaskSubtasks(
  taskId: string,
  orderedIds: string[],
  scope?: TaskScope,
): Promise<{ error?: string }> {
  if (orderedIds.length === 0) return {};

  const resolved = await resolveParentTable(taskId, scope);
  if ("error" in resolved) return { error: resolved.error };

  const supabase = await createClient();
  const { spec } = resolved;
  const { data: existing, error: existingErr } = await supabase
    .from(spec.table)
    .select("id")
    .eq(spec.parentColumn, taskId);
  if (existingErr) return { error: existingErr.message };

  const existingIds = new Set((existing ?? []).map((row) => row.id as string));
  if (orderedIds.some((id) => !existingIds.has(id))) {
    return { error: "One or more subtasks are invalid" };
  }

  const updates = orderedIds.map((id, index) =>
    supabase.from(spec.table).update({ sort_order: index }).eq("id", id).eq(spec.parentColumn, taskId),
  );
  const results = await Promise.all(updates);
  for (const { error } of results) {
    if (error) return { error: error.message };
  }
  return {};
}

export async function insertSubtasksOnCreate(
  kind: TaskScope,
  parentId: string,
  items: SubtaskCreateInput[],
): Promise<{ error?: string }> {
  if (items.length === 0) return {};
  const supabase = await createClient();
  const spec = kind === "project" ? PROJECT_TABLE : INTERNAL_TABLE;
  return insertSubtasksForParent(supabase, spec.table, spec.parentColumn, parentId, items);
}
