// The model behind the Due Diligence Checklist: organizations, answers,
// counts by status and the Markdown report. No DOM, so it can be tested.
// Nothing here scores an organization. Unknowns become questions to ask.

import { localDay, mdBlock, mdInline } from './markdown';

export type Status = 'yes' | 'no' | 'unknown' | 'na';

export const STATUSES: { id: Status; label: string }[] = [
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
  { id: 'unknown', label: 'Unknown' },
  { id: 'na', label: 'Not applicable' },
];

export interface Item {
  id: string;
  question: string;
  why: string;
  how?: string;
}

export interface Group {
  id: string;
  name: string;
  intro: string;
  flag?: boolean;
  items: Item[];
}

export interface Org {
  id: string;
  name: string;
  answers: Record<string, Status>;
  notes: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface DiligenceState {
  v: 1;
  current: string;
  orgs: Org[];
}

const MAX_NAME = 160;
const MAX_NOTE = 2000;
export const MAX_ORGS = 100;

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function newOrg(name = '', now = new Date()): Org {
  const stamp = now.toISOString();
  return { id: newId(), name: name.slice(0, MAX_NAME), answers: {}, notes: {}, createdAt: stamp, updatedAt: stamp };
}

const isStatus = (v: unknown): v is Status => v === 'yes' || v === 'no' || v === 'unknown' || v === 'na';

/** Make stored data safe to use: drop unknown items, bad statuses and oversized text. */
export function cleanState(raw: unknown, itemIds: string[]): DiligenceState {
  const known = new Set(itemIds);
  const orgs: Org[] = [];
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(r.orgs) ? r.orgs.slice(0, MAX_ORGS) : [];
  for (const o of list) {
    if (!o || typeof o !== 'object') continue;
    const org = o as Record<string, unknown>;
    const clean = newOrg(typeof org.name === 'string' ? org.name : '');
    if (typeof org.id === 'string' && org.id) clean.id = org.id.slice(0, 80);
    if (org.answers && typeof org.answers === 'object') {
      for (const [k, v] of Object.entries(org.answers as Record<string, unknown>)) if (known.has(k) && isStatus(v)) clean.answers[k] = v;
    }
    if (org.notes && typeof org.notes === 'object') {
      for (const [k, v] of Object.entries(org.notes as Record<string, unknown>)) {
        if (known.has(k) && typeof v === 'string' && v.trim()) clean.notes[k] = v.slice(0, MAX_NOTE);
      }
    }
    for (const key of ['createdAt', 'updatedAt'] as const) {
      const v = org[key];
      if (typeof v === 'string' && !Number.isNaN(Date.parse(v))) clean[key] = v;
    }
    if (!orgs.some((x) => x.id === clean.id)) orgs.push(clean);
  }
  const current = typeof r.current === 'string' && orgs.some((o) => o.id === r.current) ? r.current : (orgs[0]?.id ?? '');
  return { v: 1, current, orgs };
}

export const displayName = (org: Org) => org.name.trim() || 'Unnamed organization';

export interface Counts {
  yes: number;
  no: number;
  unknown: number;
  na: number;
  open: number;
  total: number;
}

const zero = (): Counts => ({ yes: 0, no: 0, unknown: 0, na: 0, open: 0, total: 0 });

/** Counts by status, kept apart for the checks and for the red flags. */
export function countStatuses(org: Org, groups: Group[]): { checks: Counts; flags: Counts; byGroup: Record<string, Counts> } {
  const checks = zero();
  const flags = zero();
  const byGroup: Record<string, Counts> = {};
  for (const g of groups) {
    const c = zero();
    for (const item of g.items) {
      const s = org.answers[item.id];
      const bucket = g.flag ? flags : checks;
      for (const target of [c, bucket]) {
        target.total += 1;
        if (s) target[s] += 1;
        else target.open += 1;
      }
    }
    byGroup[g.id] = c;
  }
  return { checks, flags, byGroup };
}

export interface Listed {
  group: Group;
  item: Item;
  note?: string;
}

export function withStatus(org: Org, groups: Group[], status: Status, flag?: boolean): Listed[] {
  const out: Listed[] = [];
  for (const group of groups) {
    if (flag !== undefined && Boolean(group.flag) !== flag) continue;
    for (const item of group.items) if (org.answers[item.id] === status) out.push({ group, item, note: org.notes[item.id] });
  }
  return out;
}

/** Everything marked unknown, red flags included: the questions still to ask or check. */
export const questionsToAsk = (org: Org, groups: Group[]) => withStatus(org, groups, 'unknown');

export const redFlagsSeen = (org: Org, groups: Group[]) => withStatus(org, groups, 'yes', true);

const LABEL: Record<Status, string> = { yes: 'Yes', no: 'No', unknown: 'Unknown', na: 'Not applicable' };

export interface ReportContext {
  toolUrl?: string;
  date?: Date;
}

export function toMarkdown(org: Org, groups: Group[], ctx: ReportContext = {}): string {
  const when = localDay(ctx.date ?? new Date());
  const { checks, flags } = countStatuses(org, groups);
  const asks = questionsToAsk(org, groups);
  const seen = redFlagsSeen(org, groups);
  const out: string[] = [];
  out.push(`# Due diligence: ${mdInline(displayName(org))}`);
  out.push(`Checked with the Charitology Due Diligence Checklist${ctx.toolUrl ? ` (${ctx.toolUrl})` : ''} on ${when}.`);
  out.push(
    [
      '## Summary',
      '',
      `Checks (${checks.total}):`,
      '',
      `- Yes: ${checks.yes}`,
      `- No: ${checks.no}`,
      `- Unknown: ${checks.unknown}`,
      `- Not applicable: ${checks.na}`,
      `- Not answered yet: ${checks.open}`,
      '',
      `Red flags (${flags.total}): ${flags.yes} seen, ${flags.no} not seen, ${flags.unknown} unsure, ${flags.na} not applicable, ${flags.open} not answered yet.`,
    ].join('\n'),
  );
  out.push(
    '## Questions to ask\n\n' +
      (asks.length
        ? asks.map((a, i) => `${i + 1}. ${mdInline(a.item.question)}${a.item.how ? ` ${mdInline(a.item.how)}` : ''}`).join('\n')
        : '_None. Anything you mark unknown is listed here._'),
  );
  out.push(
    '## Red flags seen\n\n' +
      (seen.length
        ? seen.map((s) => `- ${mdInline(s.item.question)}`).join('\n') +
          '\n\nA red flag doesn’t prove a scam. It is a reason to stop and check before giving.'
        : '_None marked._'),
  );
  for (const group of groups) {
    const lines = group.items.map((item) => {
      const s = org.answers[item.id];
      const note = org.notes[item.id];
      const head = `- **${s ? LABEL[s] : 'Not answered'}.** ${mdInline(item.question)}`;
      return note ? `${head}\n\n  Note: ${mdBlock(note).replace(/\n/g, '\n  ')}\n` : head;
    });
    out.push(`## ${group.name}\n\n${group.flag ? 'Yes means you saw this sign.\n\n' : ''}${lines.join('\n')}`);
  }
  out.push(
    '---\n\nA “no” is information, not a verdict, and this checklist is not a rating. Unknowns are questions to ask, not failures.',
  );
  return out.join('\n\n').replace(/\n{3,}/g, '\n\n') + '\n';
}
