"use client";

import { deleteProjectIntegration } from "@/lib/actions/projects";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

type FormState = { error?: string } | undefined;

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-cta-dark whitespace-nowrap">
      {pending ? "Deleting…" : "Confirm"}
    </button>
  );
}

export function DeleteIntegrationConfirmForm({
  projectId,
  projectIntegrationId,
}: {
  projectId: string;
  projectIntegrationId: string;
}) {
  const [state, formAction] = useActionState(deleteProjectIntegration, undefined as FormState);

  return (
    <form action={formAction} className="mt-auto flex flex-col pt-8">
      <input type="hidden" name="project_integration_id" value={projectIntegrationId} />
      {state?.error ? (
        <p className="mb-4 text-sm" style={{ color: "var(--app-danger)" }} role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-start gap-3">
        <ConfirmButton />
        <Link
          href={`/projects/${projectId}/integrations/${projectIntegrationId}`}
          className="btn-cta whitespace-nowrap"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
