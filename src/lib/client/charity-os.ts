import { load, save } from './store';

export const OS_KEY = 'charity-os';
export const OS_FORMAT = 'charitology.charity-os';
export const PROJECT_STATUSES = ['planned', 'active', 'paused', 'complete'] as const;
export const GRANT_STATUSES = ['prospect', 'drafting', 'submitted', 'awarded', 'declined', 'closed'] as const;
export const TASK_STATUSES = ['todo', 'in-progress', 'done'] as const;
export const EVIDENCE = ['unknown', 'self-reported', 'documented', 'independent'] as const;
export type Kind = 'projects' | 'grants' | 'tasks' | 'outcomes';
export type Project = { id: string; title: string; status: typeof PROJECT_STATUSES[number]; owner: string; due: string; depth: number | null; budget: number; spent: number; goal: string; notes: string };
export type Grant = { id: string; title: string; funder: string; projectId: string; status: typeof GRANT_STATUSES[number]; requested: number; awarded: number; deadline: string; owner: string; next: string; notes: string };
export type Task = { id: string; title: string; projectId: string; status: typeof TASK_STATUSES[number]; priority: 'high' | 'normal' | 'low'; due: string; owner: string; notes: string };
export type Outcome = { id: string; date: string; projectId: string; indicator: string; value: number | null; unit: string; evidence: typeof EVIDENCE[number]; source: string; notes: string };
export type Workspace = {
  organization: string; mission: string; community: string; currency: string;
  projects: Project[]; grants: Grant[]; tasks: Task[]; outcomes: Outcome[];
};

export const labels: Record<string, string> = {
  planned: 'Planned', active: 'Active', paused: 'Paused', complete: 'Complete',
  prospect: 'Prospect', drafting: 'Drafting', submitted: 'Submitted', awarded: 'Awarded', declined: 'Declined', closed: 'Closed',
  todo: 'To do', 'in-progress': 'In progress', done: 'Done', high: 'High', normal: 'Normal', low: 'Low',
  unknown: 'Unknown', 'self-reported': 'Self-reported', documented: 'Documented observation', independent: 'Independently checked',
};

export function blankWorkspace(): Workspace {
  return { organization: '', mission: '', community: '', currency: 'USD', projects: [], grants: [], tasks: [], outcomes: [] };
}

export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1900 && year <= 2200 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `os-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object.');
  return value as Record<string, unknown>;
}

function text(value: unknown, name: string, max: number, required = false): string {
  if (typeof value !== 'string') throw new Error(`${name} must be text.`);
  const result = value.trim();
  if (result.length > max || (required && !result)) throw new Error(`${name} must contain ${required ? '1 to ' : 'at most '}${max} characters.`);
  return result;
}

function number(value: unknown, name: string, negative = false, nullable = false): number | null {
  if (nullable && value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e12 || (!negative && value < 0)) throw new Error(`${name} must be a finite ${negative ? '' : 'nonnegative '}number no larger than one trillion.`);
  return value;
}

function date(value: unknown, name: string, required = false): string {
  const result = text(value, name, 10, required);
  if (result && !validDate(result)) throw new Error(`${name} must be a real date between 1900 and 2200.`);
  return result;
}

function choice<T extends string>(value: unknown, options: readonly T[], name: string): T {
  if (!options.includes(value as T)) throw new Error(`${name} is not a recognized option.`);
  return value as T;
}

function id(value: unknown, name: string): string {
  const result = text(value, name, 80, true);
  if (!/^[a-zA-Z0-9_-]+$/.test(result)) throw new Error(`${name} contains an invalid identifier.`);
  return result;
}

/** Strict all-or-nothing validation. Invalid imports never partially replace work. */
export function validateWorkspace(value: unknown): Workspace {
  const root = object(value);
  const result = blankWorkspace();
  result.organization = text(root.organization, 'Organization', 160);
  result.mission = text(root.mission, 'Mission', 2000);
  result.community = text(root.community, 'Community and context', 2000);
  result.currency = text(root.currency, 'Currency', 3, true).toUpperCase();
  if (!/^[A-Z]{3}$/.test(result.currency)) throw new Error('Currency must be a three-letter code, such as USD or GBP.');
  let total = 0;
  for (const kind of ['projects', 'grants', 'tasks', 'outcomes'] as Kind[]) {
    const rows = root[kind];
    if (!Array.isArray(rows)) throw new Error(`${kind} must be a list.`);
    total += rows.length;
    if (total > 2000) throw new Error('A workspace can hold at most 2,000 records. Split a larger archive into separate files.');
    const seen = new Set<string>();
    for (const value of rows) {
      const row = object(value);
      const itemId = id(row.id, `${kind} ID`);
      if (seen.has(itemId)) throw new Error(`Duplicate ${kind} ID: ${itemId}.`);
      seen.add(itemId);
      const notes = text(row.notes, 'Notes', 4000);
      if (kind === 'projects') {
        const depth = number(row.depth, 'Depth', false, true);
        if (depth !== null && (!Number.isInteger(depth) || depth > 4)) throw new Error('Depth must be unknown or a whole number from 0 to 4.');
        result.projects.push({ id: itemId, title: text(row.title, 'Project name', 160, true), status: choice(row.status, PROJECT_STATUSES, 'Project status'), owner: text(row.owner, 'Owner', 120), due: date(row.due, 'Project date'), depth, budget: number(row.budget, 'Budget')!, spent: number(row.spent, 'Spending')!, goal: text(row.goal, 'Goal', 2000), notes });
      } else {
        const projectId = text(row.projectId, 'Linked project', 80);
        if (projectId && !result.projects.some((p) => p.id === projectId)) throw new Error(`A ${kind} record refers to a project that is missing: ${projectId}.`);
        if (kind === 'grants') result.grants.push({ id: itemId, title: text(row.title, 'Grant name', 160, true), funder: text(row.funder, 'Funder', 160), projectId, status: choice(row.status, GRANT_STATUSES, 'Grant stage'), requested: number(row.requested, 'Requested amount')!, awarded: number(row.awarded, 'Awarded amount')!, deadline: date(row.deadline, 'Grant deadline'), owner: text(row.owner, 'Owner', 120), next: text(row.next, 'Next step', 1000), notes });
        if (kind === 'tasks') result.tasks.push({ id: itemId, title: text(row.title, 'Task', 160, true), projectId, status: choice(row.status, TASK_STATUSES, 'Task status'), priority: choice(row.priority, ['high', 'normal', 'low'] as const, 'Priority'), due: date(row.due, 'Task date'), owner: text(row.owner, 'Owner', 120), notes });
        if (kind === 'outcomes') {
          const source = text(row.source, 'Evidence link', 1200);
          if (source) { try { const url = new URL(source); if (url.protocol !== 'https:' || url.username || url.password) throw new Error(); } catch { throw new Error('Evidence links must be complete HTTPS URLs without embedded credentials.'); } }
          result.outcomes.push({ id: itemId, date: date(row.date, 'Observation date', true), projectId, indicator: text(row.indicator, 'Indicator', 160, true), value: number(row.value, 'Observed value', true, true), unit: text(row.unit, 'Unit', 80), evidence: choice(row.evidence, EVIDENCE, 'Evidence status'), source, notes });
        }
      }
    }
  }
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 4_500_000) throw new Error('This workspace is too large to save and restore safely. Export an archive, then remove older records.');
  return result;
}

export function workspaceJson(workspace: Workspace): string {
  return JSON.stringify({ format: OS_FORMAT, version: 1, exportedAt: new Date().toISOString(), workspace }, null, 2);
}

export function parseWorkspace(raw: string): { workspace?: Workspace; error?: string } {
  try {
    if (raw.length > 5_000_000) throw new Error('That file is larger than 5 MB.');
    const envelope = object(JSON.parse(raw));
    if (envelope.format !== OS_FORMAT || envelope.version !== 1) throw new Error('Choose a Charity OS version 1 JSON export.');
    return { workspace: validateWorkspace(envelope.workspace) };
  } catch (error) { return { error: error instanceof Error ? error.message : 'The workspace could not be read.' }; }
}

export function loadWorkspace(): { workspace: Workspace; error?: string; recoveryRaw?: string } {
  const saved = load<unknown>(OS_KEY, null);
  if (saved === null) {
    // The shared store intentionally catches malformed JSON. Preserve a damaged
    // saved value for download instead of silently overwriting it with a blank.
    try {
      const raw = localStorage.getItem(`charitology.${OS_KEY}`);
      if (raw) return { workspace: blankWorkspace(), error: 'The saved workspace is not readable JSON.', recoveryRaw: raw };
    } catch { /* Storage may be blocked; the page still works in memory. */ }
    return { workspace: blankWorkspace() };
  }
  const parsed = parseWorkspace(JSON.stringify(saved));
  return parsed.workspace ? { workspace: parsed.workspace } : { workspace: blankWorkspace(), error: parsed.error, recoveryRaw: JSON.stringify(saved) };
}

export function saveWorkspace(workspace: Workspace): boolean {
  return save(OS_KEY, JSON.parse(workspaceJson(workspace)));
}

export function deleteRecord(workspace: Workspace, kind: Kind, itemId: string): Workspace {
  const result = structuredClone(workspace);
  (result[kind] as { id: string }[]) = result[kind].filter((row) => row.id !== itemId);
  if (kind === 'projects') {
    for (const rows of [result.grants, result.tasks, result.outcomes]) for (const row of rows) if (row.projectId === itemId) row.projectId = '';
  }
  return result;
}

export function summarizeWorkspace(workspace: Workspace, today = localDate()) {
  const openTasks = workspace.tasks.filter((t) => t.status !== 'done');
  const pendingGrants = workspace.grants.filter((g) => ['prospect', 'drafting', 'submitted'].includes(g.status));
  return {
    activeProjects: workspace.projects.filter((p) => p.status === 'active').length,
    budget: workspace.projects.reduce((sum, p) => sum + p.budget, 0), spent: workspace.projects.reduce((sum, p) => sum + p.spent, 0),
    requested: pendingGrants.reduce((sum, g) => sum + g.requested, 0), awarded: workspace.grants.reduce((sum, g) => sum + g.awarded, 0),
    overdueTasks: openTasks.filter((t) => t.due && t.due < today).length, openTasks: openTasks.length,
    deadlines: pendingGrants.filter((g) => g.deadline).sort((a, b) => a.deadline.localeCompare(b.deadline)),
    observations: workspace.outcomes.length,
  };
}

/** Spreadsheet formulas are escaped even inside quoted CSV fields. */
function csvCell(value: unknown): string {
  let result = value === null || value === undefined ? '' : String(value);
  if (/^[\s]*[=+\-@]/.test(result) && typeof value !== 'number') result = `'${result}`;
  return `"${result.replace(/"/g, '""')}"`;
}

export function workspaceCsv(workspace: Workspace): string {
  const columns = ['kind', 'id', 'name', 'project', 'status', 'owner', 'date', 'currency', 'budget', 'spent', 'requested', 'awarded', 'depth', 'value', 'unit', 'evidence', 'source', 'context', 'notes'];
  const projectName = (projectId: string) => workspace.projects.find((p) => p.id === projectId)?.title ?? '';
  const rows: Record<string, unknown>[] = [{ kind: 'organization', name: workspace.organization, currency: workspace.currency, context: workspace.mission, notes: workspace.community }];
  for (const p of workspace.projects) rows.push({ kind: 'project', id: p.id, name: p.title, status: p.status, owner: p.owner, date: p.due, currency: workspace.currency, budget: p.budget, spent: p.spent, depth: p.depth, context: p.goal, notes: p.notes });
  for (const g of workspace.grants) rows.push({ kind: 'grant', id: g.id, name: g.title, project: projectName(g.projectId), status: g.status, owner: g.owner, date: g.deadline, currency: workspace.currency, requested: g.requested, awarded: g.awarded, context: `${g.funder}\nNext: ${g.next}`, notes: g.notes });
  for (const t of workspace.tasks) rows.push({ kind: 'task', id: t.id, name: t.title, project: projectName(t.projectId), status: t.status, owner: t.owner, date: t.due, context: t.priority, notes: t.notes });
  for (const o of workspace.outcomes) rows.push({ kind: 'outcome', id: o.id, name: o.indicator, project: projectName(o.projectId), date: o.date, value: o.value, unit: o.unit, evidence: o.evidence, source: o.source, notes: o.notes });
  return '\uFEFF' + [columns.map(csvCell).join(','), ...rows.map((row) => columns.map((key) => csvCell(row[key])).join(','))].join('\r\n');
}

export function exampleWorkspace(today = new Date()): Workspace {
  const future = new Date(today); future.setDate(future.getDate() + 21);
  const before = new Date(today); before.setDate(before.getDate() - 2);
  return {
    organization: 'Example: Open Table Collective', mission: 'Make it easier for neighbors to find food today and shape the services they use.', community: 'Fictional example. Program-level records only; no real people, funders or results.', currency: 'USD',
    projects: [
      { id: 'example-food', title: 'Example: neighborhood food table', status: 'active', owner: 'Program lead', due: '', depth: 0, budget: 12000, spent: 3800, goal: 'Offer a reliable weekly food table, with neighbors choosing the opening hours.', notes: 'Ask attendees what would make the service easier to use. Fictional example.' },
      { id: 'example-listening', title: 'Example: community listening circle', status: 'planned', owner: 'Listening lead', due: localDate(future), depth: 3, budget: 1800, spent: 0, goal: 'Give neighbors a say in how the next season is planned.', notes: 'Depth is a working description, not a grade.' },
    ],
    grants: [{ id: 'example-grant', title: 'Example: next-season grant', funder: 'Fictional community fund', projectId: 'example-food', status: 'drafting', requested: 6000, awarded: 0, deadline: localDate(future), owner: 'Funding lead', next: 'Ask two neighbors to read the program plan before submission.', notes: 'This is an example opportunity, not a real funder.' }],
    tasks: [
      { id: 'example-task', title: 'Example: check opening-hour preferences', projectId: 'example-food', status: 'todo', priority: 'high', due: localDate(before), owner: 'Listening lead', notes: 'Ask about barriers, not only satisfaction.' },
      { id: 'example-task2', title: 'Example: draft a simple outcome question', projectId: 'example-listening', status: 'in-progress', priority: 'normal', due: localDate(future), owner: 'Program lead', notes: '' },
    ],
    outcomes: [{ id: 'example-outcome', date: localDate(today), projectId: 'example-food', indicator: 'Example: weekly food-table visits', value: 42, unit: 'visits', evidence: 'self-reported', source: '', notes: 'Fictional count. Visits are an output; this does not show whether food insecurity changed.' }],
  };
}
