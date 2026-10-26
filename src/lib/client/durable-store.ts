// Opt-in storage for older tools. Existing keys and stored values stay compatible.
// Each page remembers the exact bytes it read; stale/corrupt data is never replaced.
import { download } from './files';
export { decodeState, encodeState, readHash, writeHash } from './store';
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export const MAX_TOOL_BACKUP_BYTES = 8_000_000;
const prefix = 'charitology.';
export type Validator = (value: unknown) => boolean;
/** Compare normalized field values without depending on JSON object key order. */
export function sameToolValue(a: unknown, b: unknown): boolean {
  const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => [key, stable(v)])) : value;
  try { return JSON.stringify(stable(a)) === JSON.stringify(stable(b)); } catch { return false; }
}
export function toolBackup(key: string, value: unknown): string {
  const text = JSON.stringify({ format: 'charitology-local-draft', version: 1, key, exportedAt: new Date().toISOString(), value }, null, 2);
  if (new TextEncoder().encode(text).byteLength > MAX_TOOL_BACKUP_BYTES) throw Error('This copy exceeds the 8 MB restore limit. Keep an archive and reduce the record set before saving.');
  return text;
}
export function parseToolBackup(raw: string, key: string, valid: Validator): unknown {
  if (new TextEncoder().encode(raw).byteLength > MAX_TOOL_BACKUP_BYTES) throw Error('Choose a backup no larger than 8 MB.');
  const parsed = JSON.parse(raw);
  if (parsed?.format !== 'charitology-local-draft' || parsed.version !== 1 || parsed.key !== key || !Object.prototype.hasOwnProperty.call(parsed, 'value') || !valid(parsed.value)) throw Error('This is not a valid backup for this tool.');
  toolBackup(key, parsed.value);
  return parsed.value;
}
export function durableCell(storage: StorageLike, key: string, fallback: unknown, valid: Validator) {
  let observed: string | null | undefined, value = fallback, blocked = '', locked = false, unsaved = false, current = fallback;
  try {
    observed = storage.getItem(prefix + key);
    if (observed !== null) {
      const parsed = JSON.parse(observed);
      if (!valid(parsed)) throw Error('The saved copy has invalid fields.');
      value = parsed; current = parsed;
    }
  } catch { locked = true; blocked = 'The saved copy could not be read safely. It is protected until you explicitly recover it.'; }
  const snapshot = () => ({ value, current, raw: observed, blocked, unsaved });
  const write = (next: unknown) => {
    current = next; unsaved = true;
    try {
      if (locked) throw Error(blocked);
      if (observed === undefined) throw Error('This browser did not allow reading the saved copy.');
      if (storage.getItem(prefix + key) !== observed) { locked = true; throw Error('Another tab saved newer work. Your current work has not replaced it.'); }
      if (!valid(next)) throw Error('This draft has invalid fields and was not saved.');
      toolBackup(key, next);
      const raw = JSON.stringify(next);
      storage.setItem(prefix + key, raw);
      observed = raw; value = next; unsaved = false; blocked = '';
      return true;
    } catch (error) { blocked = error instanceof Error ? error.message : 'This draft could not be saved.'; return false; }
  };
  return {
    snapshot, write,
    noticeExternalChange() { locked = true; blocked = 'Another tab saved newer work. Download your current work before reloading.'; },
    // Explicit recovery accepts only the exact saved version previewed by the user.
    replace(next: unknown, expected: string | null) {
      if (storage.getItem(prefix + key) !== expected) throw Error('Another tab changed the saved copy after your preview. Preview again.');
      if (!valid(next)) throw Error('The restored fields are invalid.');
      toolBackup(key, next);
      const raw = JSON.stringify(next);
      storage.setItem(prefix + key, raw);
      observed = raw; value = next; current = next; unsaved = false; blocked = ''; locked = false;
    },
    remove() {
      current = fallback; unsaved = true;
      try {
        if (locked || observed === undefined) throw Error(blocked || 'The saved copy could not be read.');
        if (storage.getItem(prefix + key) !== observed) { locked = true; throw Error('Another tab changed this saved copy. Reload before discarding it.'); }
        storage.removeItem(prefix + key); observed = null; value = fallback; blocked = ''; unsaved = false; return true;
      } catch (error) { blocked = error instanceof Error ? error.message : 'This copy could not be removed.'; return false; }
    },
  };
}
type Cell = ReturnType<typeof durableCell>;
const cells = new Map<string, { cell: Cell; valid: Validator; update: () => void }>();
const validators = new Map<string, Validator>();
export function validateToolStorage(key: string, valid: Validator) { validators.set(key, valid); }
const shape = (fallback: unknown): Validator => value => Array.isArray(fallback) ? Array.isArray(value) : fallback === null ? value !== null && typeof value === 'object' && !Array.isArray(value) : typeof value === typeof fallback && (typeof value !== 'object' || value !== null && !Array.isArray(value));
const title = (key: string) => ({ gifts: 'Gift log', legacy: 'Legacy worksheet', 'gift-card': 'Gift card', 'ce-models': 'Cost-effectiveness models', portfolio: 'Portfolio', compass: 'Values Compass', wrapped: 'Wrapped preferences' }[key] ?? key.replaceAll('-', ' '));
function entry(key: string, fallback: unknown) {
  const cached = cells.get(key); if (cached) return cached;
  const valid = validators.get(key) ?? shape(fallback);
  const cell = durableCell({ getItem: name => localStorage.getItem(name), setItem: (name, value) => localStorage.setItem(name, value), removeItem: name => localStorage.removeItem(name) }, key, fallback, valid);
  const result = { cell, valid, update: () => {} };
  cells.set(key, result);
  if (typeof document !== 'undefined') result.update = recoveryControls(key, cell, valid);
  result.update();
  return result;
}
export function load<T>(key: string, fallback: T): T { return entry(key, fallback).cell.snapshot().value as T; }
export function save(key: string, value: unknown): boolean {
  const target = entry(key, Array.isArray(value) ? [] : null), ok = target.cell.write(value); target.update(); return ok;
}
export function remove(key: string): void { const target = entry(key, null); target.cell.remove(); target.update(); }

function recoveryControls(key: string, cell: Cell, valid: Validator): () => void {
  const host = document.createElement('details'); host.className = 'callout';
  const heading = document.createElement('summary'); heading.textContent = `Keep a copy: ${title(key)}`; host.append(heading);
  const status = document.createElement('p'); status.setAttribute('role', 'status'); host.append(status);
  const help = document.createElement('p'); help.className = 'note'; help.textContent = 'Save the form first for a restorable copy. These files stay on your device. Restoring a copy replaces only this tool’s saved work and reloads the page.'; host.append(help);
  const buttons = document.createElement('div'); buttons.className = 'btn-row'; host.append(buttons);
  const button = (label: string, action: () => void) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-ghost btn-small'; b.textContent = label; b.addEventListener('click', action); buttons.append(b); return b; };
  const message = (error: unknown) => { status.textContent = error instanceof Error ? error.message : 'This copy could not be read.'; host.open = true; };
  button('Download current work', () => {
    try { download(`charitology-${key}-backup.json`, toolBackup(key, cell.snapshot().current), 'application/json'); }
    catch (error) {
      try {
        download(`charitology-${key}-archive.json`, JSON.stringify(cell.snapshot().current, null, 2), 'application/json');
        message(new Error('A complete archive was downloaded. It exceeds the supported backup shape or size; keep it safe and reduce or repair a copy before restoring. The saved version remains untouched.'));
      } catch { message(error); }
    }
  });
  const rawButton = button('Download protected saved copy', () => {
    try { const raw = localStorage.getItem(prefix + key); if (raw !== null) download(`charitology-${key}-saved-recovery.txt`, raw, 'text/plain'); }
    catch (error) { message(error); }
  });
  button('Reload saved version', () => { if (!cell.snapshot().unsaved || confirm('Current unsaved work will be discarded. Download it first if you need it. Reload the saved version?')) location.reload(); });
  const file = document.createElement('input'); file.type = 'file'; file.accept = '.json,application/json'; file.hidden = true; host.append(file);
  button('Preview backup restore', () => file.click());
  let preview: { value: unknown; expected: string | null } | undefined;
  const apply = button('Replace with previewed copy and reload', () => {
    if (!preview) return;
    if (!confirm('Replace this tool’s saved work with the previewed copy and reload? Export current work first if needed.')) return;
    try { cell.replace(preview.value, preview.expected); location.reload(); } catch (error) { message(error); }
  }); apply.hidden = true;
  file.addEventListener('change', async () => {
    const selected = file.files?.[0]; file.value = ''; preview = undefined; apply.hidden = true;
    if (!selected) return;
    try {
      if (selected.size > MAX_TOOL_BACKUP_BYTES) throw Error('Choose a backup no larger than 8 MB.');
      const value = parseToolBackup(await selected.text(), key, valid);
      preview = { value, expected: localStorage.getItem(prefix + key) };
      status.textContent = `A valid ${title(key)} backup is ready. Nothing has been replaced. Confirm only after keeping your current copy.`;
      apply.hidden = false; host.open = true;
    } catch (error) { message(error); }
  });
  const discard = button('Discard protected saved copy and reload', () => {
    if (!confirm('Discard the protected saved copy? Download it first if you may need it. This removes only this tool’s saved data.')) return;
    try {
      const expected = cell.snapshot().raw;
      if (expected === undefined || localStorage.getItem(prefix + key) !== expected) throw Error('The saved version changed or could not be read. Reload before choosing a version.');
      localStorage.removeItem(prefix + key); location.reload();
    } catch (error) { message(error); }
  });
  (document.querySelector('section.tool') ?? document.querySelector('main') ?? document.body).append(host);
  window.addEventListener('storage', event => { if (event.key === prefix + key || event.key === null) { cell.noticeExternalChange(); update(); } });
  const update = () => {
    const state = cell.snapshot();
    status.textContent = state.blocked || 'This tool’s saved work is kept in this browser. A downloaded copy can be restored here.';
    if (state.blocked) host.open = true;
    rawButton.hidden = !state.blocked;
    discard.hidden = !state.blocked;
  };
  return update;
}
if (typeof window !== 'undefined') window.addEventListener('beforeunload', event => {
  if ([...cells.values()].some(({ cell }) => cell.snapshot().unsaved)) { event.preventDefault(); event.returnValue = ''; }
});
