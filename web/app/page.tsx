import { AuthEntry } from "@/app/auth-entry";
import { getCurrentUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect("/home");
  // No server redirect to /login: magic-link returns may land on Site URL (`/`)
  // with tokens in the hash, which only the browser can read.
  return <AuthEntry />;
}
