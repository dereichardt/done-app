"use client";

import Link from "next/link";
import { useState } from "react";
import { deleteInternalInitiative } from "@/lib/actions/internal-tasks";

export function DeleteInitiativeConfirmForm({ initiativeId }: { initiativeId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setError(null);
    setPending(true);
    try {
      const result = await deleteInternalInitiative(initiativeId);
      if (result?.error) {
        setError(result.error);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-auto flex flex-col pt-8">
      {error ? (
        <p className="mb-4 text-sm" style={{ color: "var(--app-danger)" }} role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-start gap-3">
        <button
          type="button"
          disabled={pending}
          className="btn-cta-dark whitespace-nowrap"
          onClick={handleDelete}
        >
          {pending ? "Deleting…" : "Confirm"}
        </button>
        <Link href={`/internal/initiatives/${initiativeId}`} className="btn-cta whitespace-nowrap">
          Cancel
        </Link>
      </div>
    </div>
  );
}
