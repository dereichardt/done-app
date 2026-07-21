"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * When Site URL redirects land on `/` with auth tokens in the hash (or a
 * leftover `code` query), finish the session here before bouncing to login.
 */
export function AuthEntry() {
  const router = useRouter();
  const [status, setStatus] = useState("Loading…");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const supabase = createClient();
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");

      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          await supabase.auth.getSession();
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (cancelled) return;

        if (session) {
          router.replace("/home");
          router.refresh();
          return;
        }

        router.replace("/login");
      } catch {
        if (!cancelled) {
          setStatus("Sign-in failed. Redirecting…");
          router.replace("/login?error=auth");
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [router]);

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
