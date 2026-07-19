import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { persistHomeInboxItems } from "@/lib/home-inbox-rules";

describe("persistHomeInboxItems", () => {
  it("batches deterministic rows into a conflict-safe write", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ upsert }));
    const supabase = { from } as unknown as SupabaseClient;

    await persistHomeInboxItems(supabase, "owner-1", [
      {
        rule_key: "forecast_review_reminder",
        dedupe_key: "forecast_review_reminder:2026-07-13",
        title: "Review forecast",
        body: null,
        link_path: "/forecast",
      },
      {
        rule_key: "capacity_gaps",
        dedupe_key: "capacity_gaps:2026-07-13",
        title: "Upcoming capacity gaps",
        body: "Capacity is available.",
        link_path: "/forecast",
        metadata: { freeHoursPerWeek: 8 },
      },
    ]);

    expect(from).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledWith("home_inbox_items");
    expect(upsert).toHaveBeenCalledOnce();
    expect(upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          owner_id: "owner-1",
          dedupe_key: "forecast_review_reminder:2026-07-13",
          status: "open",
        }),
        expect.objectContaining({
          owner_id: "owner-1",
          dedupe_key: "capacity_gaps:2026-07-13",
          metadata: { freeHoursPerWeek: 8 },
        }),
      ],
      {
        onConflict: "owner_id,dedupe_key",
        ignoreDuplicates: true,
      },
    );
  });
});
