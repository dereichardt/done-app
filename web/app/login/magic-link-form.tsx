"use client";

import { createClient } from "@/lib/supabase/client";
import { useState, useTransition } from "react";

export function MagicLinkForm() {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    const email = String(formData.get("email") ?? "").trim();
    if (!email) {
      setError("Enter your email address.");
      return;
    }

    setError(null);
    setOk(false);

    startTransition(async () => {
      try {
        const supabase = createClient();
        // Browser client stores the PKCE verifier in cookies this same browser
        // will send back to /auth/callback. Server-action OTP breaks that handoff.
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            shouldCreateUser: false,
          },
        });
        if (otpError) {
          setError(otpError.message);
          return;
        }
        setOk(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not send magic link.");
      }
    });
  }

  return (
    <>
      <p className="mt-2 text-sm text-muted-canvas">Sign in with a magic link</p>
      <form className="mt-6 flex flex-col gap-4" action={onSubmit}>
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
      {error ? (
        <p className="mt-4 text-sm" style={{ color: "var(--app-danger)" }} role="alert">
          {error}
        </p>
      ) : null}
      {ok ? (
        <p className="mt-4 text-sm text-muted-canvas" role="status">
          Check your email for the sign-in link. Open it in this same browser.
        </p>
      ) : null}
    </>
  );
}
