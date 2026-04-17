import Link from "next/link";

const rowBorder = { borderColor: "color-mix(in oklab, var(--app-border) 75%, transparent)" } as const;

export function ProjectIntegrationListItem({
  projectId,
  rowId,
  title,
  meta,
}: {
  projectId: string;
  rowId: string;
  title: string;
  meta: string;
}) {
  const href = `/projects/${projectId}/integrations/${rowId}`;
  return (
    <li className="w-full border-t first:border-t-0" style={rowBorder}>
      <Link
        href={href}
        className="flex w-full flex-col gap-1 px-4 py-4 transition-colors hover:bg-[var(--app-surface-alt)] sm:flex-row sm:items-center sm:justify-between"
      >
        <span className="font-medium leading-snug" style={{ color: "var(--app-text)" }}>
          {title}
        </span>
        {meta ? (
          <span className="text-xs text-muted-canvas sm:max-w-[60%] sm:text-right">{meta}</span>
        ) : null}
      </Link>
    </li>
  );
}
