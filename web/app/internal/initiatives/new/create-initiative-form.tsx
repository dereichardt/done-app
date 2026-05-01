"use client";

import { createInternalInitiative } from "@/lib/actions/internal-tasks";
import { useRouter } from "next/navigation";
import { useActionState } from "react";

export function CreateInitiativeForm({ defaultStartsOn }: { defaultStartsOn: string }) {
  const router = useRouter();

  const [state, action, pending] = useActionState(
    async (_prev: { error?: string } | void, formData: FormData) => {
      const title = String(formData.get("title") ?? "").trim();
      const starts_on = String(formData.get("starts_on") ?? "").trim();
      const ends_on = String(formData.get("ends_on") ?? "").trim();
      const estimated_effort_hours = String(formData.get("estimated_effort_hours") ?? "");
      const res = await createInternalInitiative({ title, starts_on, ends_on, estimated_effort_hours });
      if (res.error) return { error: res.error };
      if (res.id) router.push(`/internal/initiatives/${res.id}`);
      return {};
    },
    {},
  );

  return (
    <form action={action} className="mt-8 flex max-w-lg flex-col gap-4">
      <label className="flex flex-col gap-1 text-xs text-muted-canvas">
        Title
        <input
          name="title"
          type="text"
          required
          className="input-canvas h-10 text-sm"
          placeholder="Initiative name"
        />
      </label>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted-canvas">
          Start date
          <input
            name="starts_on"
            type="date"
            required
            defaultValue={defaultStartsOn}
            className="input-canvas h-10 text-sm"
          />
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted-canvas">
          End date
          <input name="ends_on" type="date" required className="input-canvas h-10 text-sm" />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs text-muted-canvas">
        Estimated effort{" "}
        <span className="font-normal text-muted-canvas">(hours, optional · quarter hours)</span>
        <input
          name="estimated_effort_hours"
          type="text"
          inputMode="decimal"
          className="input-canvas h-10 text-sm"
          placeholder="e.g. 80 or 40.5"
          autoComplete="off"
        />
      </label>
      {state && "error" in state && state.error ? (
        <p className="text-sm" style={{ color: "var(--app-danger)" }} role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-cta text-sm" disabled={pending}>
          {pending ? "Creating…" : "Create initiative"}
        </button>
        <button type="button" className="btn-ghost text-sm" disabled={pending} onClick={() => router.push("/internal")}>
          Cancel
        </button>
      </div>
    </form>
  );
}
