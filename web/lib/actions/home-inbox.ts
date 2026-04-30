"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export async function markHomeInboxItemDone(itemId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { error } = await supabase
    .from("home_inbox_items")
    .update({ status: "done", resolved_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("owner_id", user.id)
    .eq("status", "open");

  if (error) return { error: error.message };
  revalidatePath("/home");
  return {};
}
