"use client";

import { useRouter } from "next/navigation";
import type { CatalogUsageRowDTO } from "@/lib/load-catalog-integration-detail";
import { formatEffortHoursLabel } from "@/lib/integration-effort-buckets";

export function CatalogUsageTable({ usageRows }: { usageRows: CatalogUsageRowDTO[] }) {
  const router = useRouter();

  if (usageRows.length === 0) {
    return <p className="text-sm text-muted-canvas">No linked project integrations yet.</p>;
  }

  return (
    <div
      className="overflow-auto rounded-lg border"
      style={{ borderColor: "var(--app-border)" }}
    >
      <table className="w-full min-w-0 border-collapse text-sm">
        <thead
          className="border-b text-left text-xs text-muted-canvas"
          style={{
            borderColor: "var(--app-border)",
            background: "var(--app-surface-muted-solid)",
          }}
        >
          <tr>
            <th className="min-w-[22rem] px-3 py-2 font-medium" scope="col">
              Integration definition
            </th>
            <th className="px-3 py-2 font-medium" scope="col">
              Project
            </th>
            <th className="whitespace-nowrap px-3 py-2 font-medium" scope="col">
              Delivery progress
            </th>
            <th className="whitespace-nowrap px-3 py-2 font-medium" scope="col">
              Actual effort
            </th>
          </tr>
        </thead>
        <tbody>
          {usageRows.map((u) => {
            const href = `/projects/${u.project_id}/integrations/${u.project_integration_id}`;
            const navigate = () => router.push(href);
            return (
              <tr
                key={u.project_integration_id}
                role="link"
                tabIndex={0}
                onClick={navigate}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate();
                  }
                }}
                className="cursor-pointer border-b transition-colors last:border-b-0 hover:bg-[var(--app-surface-alt)] focus-visible:bg-[var(--app-surface-alt)] focus-visible:outline-none"
                style={{ borderColor: "var(--app-border)" }}
              >
                <td className="min-w-[22rem] whitespace-normal px-3 py-2.5" style={{ color: "var(--app-text)" }}>
                  {u.integration_display_name || "—"}
                </td>
                <td className="px-3 py-2.5" style={{ color: "var(--app-text)" }}>
                  {u.customer_name ?? "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-muted-canvas">
                  {u.delivery_progress_label || "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-muted-canvas">
                  {formatEffortHoursLabel(u.actual_effort_hours)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
