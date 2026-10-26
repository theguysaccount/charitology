// Calendar files (iCalendar, RFC 5545) built in the browser. Pure functions
// with no DOM, so they can be tested outside a browser.

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** Escape a TEXT value: backslash, semicolon, comma and line breaks. */
export function icsEscape(text: string): string {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Fold a content line so no physical line is longer than 75 octets.
 * Continuation lines start with one space, which counts toward the 75.
 * Splits only between code points, never inside a UTF-8 sequence.
 */
export function icsFold(line: string): string {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  let current = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (bytes + size > limit) {
      lines.push(current);
      current = ch;
      bytes = size;
      limit = 74;
    } else {
      current += ch;
      bytes += size;
    }
  }
  lines.push(current);
  return lines.join('\r\n ');
}

/** UTC timestamp in the form 20261025T143000Z. */
export function icsStamp(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** Parse "YYYY-MM-DD" into its parts, or undefined if it isn't a real date. */
export function parseISODate(value: string): { y: number; m: number; d: number } | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? '').trim());
  if (!match) return undefined;
  const [y, m, d] = match.slice(1).map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return undefined;
  return { y, m, d };
}

/** Local calendar date `months` from `from`, clamped to the end of a short month (Aug 31 + 6 → Feb 28). */
export function addMonthsISO(from: Date, months: number): string {
  const y = from.getFullYear();
  const m = from.getMonth() + months;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const target = new Date(y, m, Math.min(from.getDate(), lastDay));
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`;
}

/** Today's local calendar date as YYYY-MM-DD. */
export function localISODate(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export interface AllDayEvent {
  /** Calendar date, YYYY-MM-DD. */
  date: string;
  summary: string;
  description?: string;
  url?: string;
  uid?: string;
  /** Hours after the start of the day for a reminder alert, e.g. 9 for 9 a.m. Omit for none. */
  alarmHour?: number;
  now?: Date;
  prodId?: string;
}

function makeUid(now: Date): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${random}@charitology.org`;
}

/** A one-day calendar event with CRLF line endings, escaped text and folded lines. */
export function buildAllDayIcs(event: AllDayEvent): string {
  const day = parseISODate(event.date);
  if (!day) throw new Error(`Not a calendar date: ${event.date}`);
  const now = event.now ?? new Date();
  const start = `${day.y}${pad(day.m)}${pad(day.d)}`;
  const next = new Date(Date.UTC(day.y, day.m - 1, day.d + 1));
  const end = `${next.getUTCFullYear()}${pad(next.getUTCMonth() + 1)}${pad(next.getUTCDate())}`;
  // URIs aren't TEXT, so they aren't escaped, but control characters and spaces never belong in one.
  const uri = event.url ? event.url.replace(/[\u0000- \u007f]/g, '') : '';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${event.prodId ?? '-//Charitology//Tools//EN'}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.uid ?? makeUid(now)}`,
    `DTSTAMP:${icsStamp(now)}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${icsEscape(event.summary)}`,
  ];
  if (event.description) lines.push(`DESCRIPTION:${icsEscape(event.description)}`);
  if (uri) lines.push(`URL:${uri}`);
  lines.push('TRANSP:TRANSPARENT');
  if (event.alarmHour != null && Number.isFinite(event.alarmHour)) {
    const hours = Math.max(0, Math.min(23, Math.round(event.alarmHour)));
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(event.summary)}`, `TRIGGER:PT${hours}H`, 'END:VALARM');
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(icsFold).join('\r\n') + '\r\n';
}
