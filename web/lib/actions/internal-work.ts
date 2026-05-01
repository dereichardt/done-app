"use server";

import { createClient } from "@/lib/supabase/server";

const INTERNAL_TRACK_KINDS = ["admin", "development"] as const;
export type InternalTrackKind = (typeof INTERNAL_TRACK_KINDS)[number];

/**
 * Ensures the signed-in user has fixed Admin and Development internal_tracks rows.
 * Idempotent; safe to call from /internal layout or pages.
 */
export async function ensureInternalTracks(): Promise<{
  trackIds?: { admin: string; development: string };
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const now = new Date().toISOString();
  for (const kind of INTERNAL_TRACK_KINDS) {
    const { error } = await supabase.from("internal_tracks").upsert(
      { owner_id: user.id, kind, updated_at: now },
      { onConflict: "owner_id,kind" },
    );
    if (error) return { error: error.message };
  }

  const { data: rows, error: selErr } = await supabase
    .from("internal_tracks")
    .select("id, kind")
    .eq("owner_id", user.id)
    .in("kind", [...INTERNAL_TRACK_KINDS]);
  if (selErr) return { error: selErr.message };

  const admin = rows?.find((r) => r.kind === "admin")?.id;
  const development = rows?.find((r) => r.kind === "development")?.id;
  if (!admin || !development) return { error: "Internal tracks not available" };

  return { trackIds: { admin, development } };
}
