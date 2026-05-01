import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { DeleteInitiativeConfirmForm } from "./delete-initiative-confirm-form";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function DeleteInternalInitiativePage({ params }: PageProps) {
  const { id: initiativeId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: ini } = await supabase
    .from("internal_initiatives")
    .select("id, title")
    .eq("id", initiativeId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!ini) notFound();

  const title = (ini.title ?? "").trim() || "Initiative";

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] max-w-3xl flex-col">
      <h1 className="heading-page">Delete initiative</h1>
      <div className="mt-8 flex flex-col gap-8">
        <div>
          <p className="block text-sm font-normal" style={{ color: "var(--app-text)" }}>
            Initiative
          </p>
          <p
            className="mt-1 text-base font-semibold leading-snug"
            style={{ color: "var(--app-text)" }}
          >
            {title}
          </p>
        </div>
        <div className="flex max-w-2xl flex-col gap-2">
          <p className="text-base font-normal leading-relaxed text-muted-canvas">
            Deleting this initiative removes all of its tasks, work sessions, and manual effort entries.
          </p>
          <p className="text-base font-normal leading-relaxed text-muted-canvas">
            This action cannot be undone.
          </p>
        </div>
      </div>
      <DeleteInitiativeConfirmForm initiativeId={initiativeId} />
    </div>
  );
}
