"use client";

import { requestMagicLink } from "@/lib/actions/auth";
import { useActionState } from "react";

export function MagicLinkForm() {
  const [state, formAction, pending] = useActionState(requestMagicLink, {});

  return (
    <>
      <p className="mt-2 text-sm text-muted-canvas">Sign in with a magic link</p>
      <form className="mt-6 flex flex-col gap-4" action={formAction}>
        <label className="block text-sm font-medium" style={{ color: "var(--app-text)" }}>
          Email
          <input
            name="email"
            type="email"
            required
            className="input-canvas mt-1"
            placeholder="you@example.com"
            autoComplete="email"
          />
        </label>
        <button type="submit" disabled={pending} className="btn-cta">
          {pending ? "Sending…" : "Send link"}
        </button>
      </form>
      {state?.error ? (
        <p className="mt-4 text-sm" style={{ color: "var(--app-danger)" }} role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p className="mt-4 text-sm text-muted-canvas" role="status">
          Check your email for the sign-in link.
        </p>
      ) : null}
    </>
  );
}
