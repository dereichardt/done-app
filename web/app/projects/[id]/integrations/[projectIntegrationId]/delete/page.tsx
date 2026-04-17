import { ensureDefaultLookups } from "@/lib/actions/ensure-lookups";
import { createClient } from "@/lib/supabase/server";
import { formatIntegrationDefinitionDisplayName } from "@/lib/integration-metadata";
import { notFound } from "next/navigation";
import { DeleteIntegrationConfirmForm } from "./delete-integration-confirm-form";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string; projectIntegrationId: string }> };

export default async function DeleteProjectIntegrationPage({ params }: PageProps) {
  const { id: projectId, projectIntegrationId } = await params;
  await ensureDefaultLookups();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: project } = await supabase
    .from("projects")
    .select("id, customer_name")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!project) notFound();

  const { data: row, error: rowError } = await supabase
    .from("project_integrations")
    .select("id, integration_id")
    .eq("id", projectIntegrationId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (rowError || !row) notFound();

  const { data: integObj, error: integError } = await supabase
    .from("integrations")
    .select("id, name, integration_code, integrating_with, direction")
    .eq("id", row.integration_id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (integError || !integObj) notFound();

  const integrationDisplayTitle =
    formatIntegrationDefinitionDisplayName({
      integration_code: integObj.integration_code,
      integrating_with: integObj.integrating_with,
      name: integObj.name,
      direction: integObj.direction,
    }) || integObj.name;

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] max-w-3xl flex-col">
      <h1 className="heading-page">Delete integration</h1>
      <div className="mt-8 flex flex-col gap-8">
        <div>
          <p className="block text-sm font-normal" style={{ color: "var(--app-text)" }}>
            Integration
          </p>
          <p
            className="mt-1 text-base font-semibold leading-snug"
            style={{ color: "var(--app-text)" }}
          >
            {integrationDisplayTitle}
          </p>
        </div>
        <div>
          <p className="block text-sm font-normal" style={{ color: "var(--app-text)" }}>
            Project
          </p>
          <p
            className="mt-1 text-base font-semibold leading-snug"
            style={{ color: "var(--app-text)" }}
          >
            {project.customer_name}
          </p>
        </div>
        <div className="flex max-w-2xl flex-col gap-2">
          <p className="text-base font-normal leading-relaxed text-muted-canvas">
            Deleting this integration removes all updates and tasks associated with it; the integration is
            also removed from the project.
          </p>
          <p className="text-base font-normal leading-relaxed text-muted-canvas">This action cannot be undone.</p>
        </div>
      </div>
      <DeleteIntegrationConfirmForm projectId={projectId} projectIntegrationId={projectIntegrationId} />
    </div>
  );
}
