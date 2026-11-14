/**
 * Dependency-free rich-text helpers for the composer.
 *
 * The composer is a `contentEditable` surface. For iMessage we send the plain
 * text (the element's innerText) because BlueBubbles can't carry formatting
 * today. We ALSO derive a portable Markdown string and persist it, so the moment
 * a channel that can carry formatting is added (email, Slack, …) the composer is
 * already producing rich content — nothing in the UI has to change.
 *
 * We force `execCommand` to emit tags (styleWithCSS = false), so the HTML we
 * parse here is a small, predictable set: <b>/<strong>, <i>/<em>, <u>,
 * <s>/<strike>/<del>, <br>, <div>, <p>. Anything else is stripped.
 */

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'",
};

function decodeEntities(s: string): string {
  return s.replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;|&apos;/g, (m) => ENTITIES[m] ?? m);
}

/** Convert block structure (<br>, <div>, <p>) into newlines. */
function blocksToNewlines(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:div|p)>/gi, "")
    .replace(/<(?:div|p)(?:\s[^>]*)?>/gi, "\n");
}

/** Replace a balanced <tag>…</tag> (incl. aliases) with open/close markers,
 *  innermost pair first, until none remain. */
function wrap(html: string, tags: string[], open: string, close: string): string {
  const alt = tags.join("|");
  const re = new RegExp(`<(?:${alt})(?:\\s[^>]*)?>([\\s\\S]*?)</(?:${alt})>`, "i");
  let prev: string;
  do {
    prev = html;
    html = html.replace(re, (_m, inner) => open + inner + close);
  } while (html !== prev);
  return html;
}

function tidy(s: string): string {
  return s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Composer HTML → Markdown. Underline has no Markdown form, so it's kept as
 *  <u></u> (the common convention) for channels that understand HTML. */
export function htmlToMarkdown(html: string): string {
  let s = blocksToNewlines(html);
  s = wrap(s, ["b", "strong"], "**", "**");
  s = wrap(s, ["i", "em"], "*", "*");
  s = wrap(s, ["s", "strike", "del"], "~~", "~~");
  // Underline markers use private-use sentinels so the tag-stripper below
  // doesn't mistake them for HTML; restored to <u></u> afterward.
  s = wrap(s, ["u"], "", "");
  s = s.replace(/<[^>]+>/g, ""); // drop anything else
  s = s.replace(//g, "<u>").replace(//g, "</u>");
  return tidy(decodeEntities(s));
}

/** Composer HTML → plain text (formatting discarded). */
export function htmlToPlain(html: string): string {
  const s = blocksToNewlines(html).replace(/<[^>]+>/g, "");
  return tidy(decodeEntities(s));
}

/** True when the composer holds no visible text (ignoring markup/whitespace). */
export function isBlank(html: string): boolean {
  return htmlToPlain(html).replace(/\s+/g, "") === "";
}
