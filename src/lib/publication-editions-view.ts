/** Static archive presentation only. Raw HTML, images and embeds stay inert. */
import type { Family } from "./publication-editions-types";

export const PUBLICATION_FAMILIES: Readonly<Record<Family, string>> =
  Object.freeze({
    "state-of-charity": "State of Charity",
    "progress-report": "Open Problems Progress",
    principles: "Principles of Charitology",
    journal: "Journal of Charitology",
    letter: "The Charitology Letter",
  });
export const publicationHref = (id: string) => `/record/editions/${id}/`;
export const publicationSourceHref = (id: string) =>
  `/record/editions/sources/${id}/source.txt`;
export const publicationComparisonHref = (from: string, to: string) =>
  `/record/editions/compare/${from}/${to}/`;

export function escapePublicationText(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]!,
  );
}

export function publicationSafeHref(value: string): string | null {
  if (/[\u0000-\u0020\\]/.test(value)) return null;
  if (/^\/(?!\/)/.test(value)) return value;
  if (/^#[A-Za-z0-9_-]+$/.test(value)) return value;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password ? value : null;
  } catch {
    return null;
  }
}

/** Small, deliberately inert Markdown subset. It never evaluates source HTML. */
export function renderPublicationMarkdown(raw: string, basePath = ""): string {
  const inline = (text: string): string => {
    const token = /(`[^`\n]+`|!?\[[^\]\n]+\]\([^\s)]+\)|\*\*[^*\n]+\*\*)/g;
    let cursor = 0,
      html = "";
    for (const m of text.matchAll(token)) {
      html += escapePublicationText(text.slice(cursor, m.index));
      const s = m[0];
      if (s.startsWith("`"))
        html += `<code>${escapePublicationText(s.slice(1, -1))}</code>`;
      else if (s.startsWith("**"))
        html += `<strong>${escapePublicationText(s.slice(2, -2))}</strong>`;
      else if (s.startsWith("!")) html += escapePublicationText(s);
      else {
        const parts = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(s)!;
        const href = publicationSafeHref(parts[2]);
        const resolved = href?.startsWith("/") ? `${basePath}${href}` : href;
        html += resolved
          ? `<a href="${escapePublicationText(resolved)}">${escapePublicationText(parts[1])}</a>`
          : escapePublicationText(s);
      }
      cursor = m.index! + s.length;
    }
    return html + escapePublicationText(text.slice(cursor));
  };
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const output: string[] = [];
  let paragraph: string[] = [],
    list: string[] = [],
    listKind = "ul",
    code: string[] | null = null;
  const flushParagraph = () => {
    if (paragraph.length) output.push(`<p>${inline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list.length)
      output.push(
        `<${listKind}>${list.map((s) => `<li>${inline(s)}</li>`).join("")}</${listKind}>`,
      );
    list = [];
  };
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      flushParagraph();
      flushList();
      if (code) {
        output.push(
          `<pre><code>${escapePublicationText(code.join("\n"))}</code></pre>`,
        );
        code = null;
      } else code = [];
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    const item = /^\s*(?:([-*+])|\d+[.)])\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const depth = Math.min(6, heading[1].length + 2);
      output.push(`<h${depth}>${inline(heading[2])}</h${depth}>`);
    } else if (item) {
      flushParagraph();
      const nextKind = item[1] ? "ul" : "ol";
      if (nextKind !== listKind) flushList();
      listKind = nextKind;
      list.push(item[2]);
    } else if (!line.trim()) {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  if (code)
    output.push(
      `<pre><code>${escapePublicationText(code.join("\n"))}</code></pre>`,
    );
  return output.join("\n");
}
