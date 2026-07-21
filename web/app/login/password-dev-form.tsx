"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function PasswordDevForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    if (!email || !password) {
      setError("Enter email and password.");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const supabase = createClient();
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) {
          setError(signInError.message);
          return;
        }
        router.replace("/home");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sign-in failed.");
      }
    });
  }

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
      <form className="mt-4 flex flex-col gap-3" action={onSubmit}>
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
      {error ? (
        <p className="mt-3 text-sm" style={{ color: "var(--app-danger)" }} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
