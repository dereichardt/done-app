import type { User } from "@supabase/supabase-js";
import { ProjectsShell } from "@/components/projects-shell";
import { createClient } from "@/lib/supabase/server";

function userInitialFromUser(user: User): string {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const fullName = typeof meta?.full_name === "string" ? meta.full_name.trim() : "";
  if (fullName.length > 0) return fullName.charAt(0).toUpperCase();
  const email = user.email?.trim() ?? "";
  if (email.length > 0) return email.charAt(0).toUpperCase();
  return "?";
}

export default async function HomeLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userInitial = user ? userInitialFromUser(user) : "?";

  return <ProjectsShell userInitial={userInitial}>{children}</ProjectsShell>;
}
