/** Class defined in `app/globals.css` (`.integration-update-bubble`). */
export const integrationUpdateBubbleBoxClass = "integration-update-bubble";

export function formatIntegrationUpdateWhen(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}
