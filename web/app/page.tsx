import { getCurrentUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect("/projects");
  redirect("/login");
}
