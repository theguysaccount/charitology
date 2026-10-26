// CSV reading for imports (files.ts writes CSV). Handles quoted fields,
// escaped quotes, commas and line breaks inside quotes, CRLF line endings
// and a UTF-8 byte-order mark, which spreadsheet apps often add.

export function parseCsv(text: string): string[][] {
  const s = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/** Rows as objects keyed by the header row, lowercased with spaces turned into underscores. */
export function csvRecords(text: string): Record<string, string>[] {
  const [head, ...body] = parseCsv(text);
  if (!head) return [];
  const keys = head.map((k) => k.trim().toLowerCase().replace(/\s+/g, '_'));
  return body.map((cells) => Object.fromEntries(keys.map((k, i) => [k, (cells[i] ?? '').trim()])));
}
