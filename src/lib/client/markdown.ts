// Small helpers for Markdown files the tools export. They escape only what
// would change the structure of the document, so the raw file stays readable.

/** Defuse what would break the surrounding document: headings, rules, setext underlines and code fences. */
function defuse(line: string): string {
  if (/^\s*([-=_*])(?:\s*\1)*\s*$/.test(line)) return `\\${line.trim()}`;
  return line.replace(/^(\s*)(#{1,6})(\s|$)/, '$1\\$2$3').replace(/^(\s*)(`{3,}|~{3,})/, '$1\\$2');
}

/** User text as a Markdown block. Keeps line breaks and the viewer's own lists. */
export function mdBlock(text: string): string {
  const lines = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .split('\n')
    .map((line) => (line.trim() ? defuse(line.trimEnd()) : ''));
  // Two trailing spaces keep a single line break; a blank line stays a paragraph break.
  return lines.map((line, i) => (line && lines[i + 1] ? `${line}  ` : line)).join('\n');
}

/** User text on one line, for list items and headings. */
export function mdInline(text: string): string {
  const line = String(text ?? '')
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .trim();
  return line ? defuse(line) : '';
}

/** A table cell: one line, pipes escaped. */
export function mdCell(text: string): string {
  return String(text ?? '')
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

export function mdTable(headers: string[], rows: string[][]): string {
  const line = (cells: string[]) => `| ${cells.map(mdCell).join(' | ')} |`;
  return [line(headers), `| ${headers.map(() => '---').join(' | ')} |`, ...rows.map(line)].join('\n');
}

/** The viewer's local calendar date as YYYY-MM-DD, for "made on" lines. */
export function localDay(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A file name from any title: "Due diligence: Acme & Co." → "due-diligence-acme-co". */
export function fileSlug(text: string, fallback = 'untitled'): string {
  const slug = String(text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug || fallback;
}
