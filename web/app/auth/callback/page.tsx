"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";

const EMAIL_OTP_TYPES = new Set([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

/**
 * Completes magic-link / OAuth sign-in in the browser.
 *
 * Hosted Supabase magic links often redirect with either a PKCE `code` or
 * implicit-flow tokens in the URL hash. Hash fragments are invisible to Route
 * Handlers, so this must run client-side where `createBrowserClient` can persist
 * the session into cookies the Next.js proxy / server components can read.
 */
function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState("Signing you in…");

  useEffect(() => {
    let cancelled = false;

    async function complete() {
      const supabase = createClient();
      const nextRaw = searchParams.get("next") ?? "/home";
      const next = nextRaw.startsWith("/") ? nextRaw : "/home";

      const code = searchParams.get("code");
      const token_hash = searchParams.get("token_hash");
      const type = searchParams.get("type");

      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (token_hash && type && EMAIL_OTP_TYPES.has(type)) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash,
            type: type as EmailOtpType,
          });
          if (error) throw error;
        } else {
          // Implicit flow: tokens in the hash are consumed during client init
          // (`detectSessionInUrl`). Give that a moment, then read the session.
          await supabase.auth.getSession();
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          throw new Error("No session after auth callback");
        }

        if (!cancelled) {
          router.replace(next);
          router.refresh();
        }
      } catch {
        if (!cancelled) {
          setStatus("Sign-in failed. Redirecting…");
          router.replace("/login?error=auth");
        }
      }
    }

    void complete();
    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return (
    <div
      className="flex min-h-full items-center justify-center px-4"
      style={{ background: "var(--app-bg)" }}
    >
      <p className="text-sm text-muted-canvas" role="status">
        {status}
      </p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div
          className="flex min-h-full items-center justify-center px-4"
          style={{ background: "var(--app-bg)" }}
        >
          <p className="text-sm text-muted-canvas">Signing you in…</p>
        </div>
      }
    >
      <AuthCallbackInner />
    </Suspense>
  );
}
