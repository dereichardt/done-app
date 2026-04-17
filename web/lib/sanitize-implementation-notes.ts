import sanitizeHtml from "sanitize-html";

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
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

export function sanitizeImplementationNotesHtml(html: string): string {
  return sanitizeHtml(html, SANITIZE_OPTIONS).trim();
}

/** True when notes contain no visible text (empty editor, empty paragraphs, only breaks). */
export function isImplementationNotesHtmlEmpty(html: string): boolean {
  const text = html
    .replace(/<[^>]+>/g, "")
    .replace(/\u00a0/g, " ")
    .trim();
  return text.length === 0;
}
