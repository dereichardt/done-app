"use server";

import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

function getServerOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}

/**
 * Magic link uses PKCE: a verifier must be stored in cookies. The cookie-aware
 * Supabase server client persists it; a plain `createClient(url, key)` does not,
 * which breaks `exchangeCodeForSession` on the email link.
 */
export async function requestMagicLink(
  _prev: { error?: string; ok?: boolean } | void,
  formData: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email address." };

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()) {
    return {
      error:
        "Server missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Check .env.local and restart npm run dev.",
    };
  }

  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const origin = host ? `${proto}://${host}` : getServerOrigin();

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/projects`,
    },
  });

  if (error) return { error: error.message };
  return { ok: true };
}

/**
 * Local / test sign-in with email + password. Disabled unless
 * AUTH_PASSWORD_LOGIN=true in .env.local (never enable in production unless you intend to).
 */
export async function signInWithPassword(
  _prev: { error?: string } | void,
  formData: FormData,
): Promise<{ error?: string }> {
  if (process.env.AUTH_PASSWORD_LOGIN !== "true") {
    return {
      error:
        "Password sign-in is disabled. Add AUTH_PASSWORD_LOGIN=true to .env.local for local testing only.",
    };
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: "Enter email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  redirect("/projects");
}
