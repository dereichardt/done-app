import { IntegrationStatePill } from "@/components/integration-state-pill";
import type { SerializedProjectIntegrationRow } from "@/lib/project-integration-row";
import Link from "next/link";

const rowBorder = { borderColor: "color-mix(in oklab, var(--app-border) 75%, transparent)" } as const;

export function ProjectIntegrationListItem({
  projectId,
  row,
}: {
  projectId: string;
  row: SerializedProjectIntegrationRow;
}) {
  const href = `/projects/${projectId}/integrations/${row.id}`;
  return (
    <li className="border-t first:border-t-0" style={rowBorder}>
      <Link
        href={href}
        className="flex w-full items-center gap-2 px-4 py-4 transition-colors hover:bg-[var(--app-surface-alt)] sm:gap-3"
      >
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-snug" style={{ color: "var(--app-text)" }}>
            {row.title}
          </p>
          <p className="mt-1 text-xs text-muted-canvas">{row.deliveryProgressLabel}</p>
        </div>
        <div className="flex shrink-0 flex-row items-center gap-2">
          <IntegrationStatePill state={row.integration_state} />
        </div>
      </Link>
    </li>
  );
}
