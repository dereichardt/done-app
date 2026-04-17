/** Escape text for safe insertion into HTML (plain legacy notes → editor). */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Heuristic: treat as HTML when it looks like markup from our editor or common tags. */
function looksLikeStoredHtml(s: string): boolean {
  const t = s.trimStart();
  return /^<\s*(p|ul|ol|div|strong|em|b|i|u|a)\b/i.test(t);
}

/**
 * Normalize DB value for TipTap `content` (HTML string).
 * Legacy plain-text notes become a single paragraph (newlines preserved).
 */
export function catalogImplementationNotesToEditorHtml(value: string | null): string {
  if (value == null) return "<p></p>";
  const v = value.trim();
  if (v === "") return "<p></p>";
  if (looksLikeStoredHtml(v)) return v;
  const body = escapeHtml(v).replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n\n+/g, "</p><p>").replace(/\n/g, "<br>");
  return `<p>${body}</p>`;
}
