"use client";

import { signInWithPassword } from "@/lib/actions/auth";
import { useActionState } from "react";

export function PasswordDevForm() {
  const [state, formAction, pending] = useActionState(signInWithPassword, {});

  return (
    <div
      className="mt-8 border-t pt-6"
      style={{ borderColor: "color-mix(in oklab, var(--app-border) 80%, transparent)" }}
    >
      <h2 className="text-sm font-medium" style={{ color: "var(--app-text)" }}>
        Test sign-in (email + password)
      </h2>
      <p className="mt-1 text-xs text-muted-canvas">
        For local development only. Create the user in Supabase (Auth → Users) with the same email
        and password.
      </p>
      <form className="mt-4 flex flex-col gap-3" action={formAction}>
        <label className="block text-sm font-medium" style={{ color: "var(--app-text)" }}>
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="input-canvas mt-1 text-sm"
            placeholder="you@example.com"
          />
        </label>
        <label className="block text-sm font-medium" style={{ color: "var(--app-text)" }}>
          Password
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="input-canvas mt-1 text-sm"
          />
        </label>
        <button type="submit" disabled={pending} className="btn-cta text-sm">
          {pending ? "Signing in…" : "Sign in with password"}
        </button>
      </form>
      {state?.error ? (
        <p className="mt-3 text-sm" style={{ color: "var(--app-danger)" }} role="alert">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
