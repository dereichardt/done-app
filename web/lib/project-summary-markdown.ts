import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

/** Tags produced by Markdown we allow for AI summaries (no raw HTML from the model). */
const SUMMARY_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "a"],
  allowedAttributes: {
    a: ["href", "target", "rel"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        href: attribs.href ?? "",
        target: "_blank",
        rel: "noopener noreferrer",
      },
    }),
  },
};

/**
 * Turn model Markdown into safe HTML for `dangerouslySetInnerHTML`.
 * GFM-style lists and **bold** are supported; arbitrary HTML is stripped.
 */
export function summaryMarkdownToSafeHtml(markdown: string): string {
  const trimmed = markdown.trim();
  if (!trimmed) return "";

  const html = marked.parse(trimmed, {
    async: false,
    gfm: true,
    breaks: true,
  }) as string;

  return sanitizeHtml(html, SUMMARY_SANITIZE_OPTIONS).trim();
}
