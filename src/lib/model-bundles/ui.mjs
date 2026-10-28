import { createModelBundleController } from './session.mjs';
import { createModelFileLane, createModelFileLaneForTesting } from './file-lane.mjs';
import { calculatorCopyProvider } from './calculator-copy-provider.mjs';
import { ROWS, PARTS, validateSourceDescription, validateNumericalIssue } from './content.mjs';
import { TEXT_FORM_KEYS, JSON_FORM_KEYS, LOCAL_KEY } from './graph.mjs';
import { LIMITS, parseJsonBytes, equal } from './codec.mjs';

const ACK = 'Copy inputs to a new draft without a reproduction claim.';
const NAVIGATION = new Set(['new-draft', 'amend-draft', 'copy-local-draft', 'copy-selected-draft', 'copy-reproduced', 'restore', 'clear', 'undo']);
const PAYLOAD_ACTIONS = new Set(['save-draft', 'freeze', 'new-draft', 'amend', 'copy-local', 'copy-reproduced', 'copy-selected-draft', 'restore', 'clear', 'undo', 'recalculate', 'retry', 'reload', 'export-selected', 'export-backup', 'draws', 'proposal', 'pending-recovery']);
const WAITING = 'Earlier native hashing is still settling. A cancelled digest cannot be physically aborted. Calculation and saved changes are unavailable until it settles; keep writing, use raw recovery or reload the page if it remains blocked.';
const encoder = new TextEncoder();
const json = value => JSON.stringify(value, null, 2);
const now = () => new Date().toISOString();
const clone = value => structuredClone(value);
const point = () => ({ kind: 'user-assumption', sourceIds: [], rationale: 'Made-up assumption for this illustrative software example.' });

/** Deliberate illustrative writing only. No source artifact or real estimate is seeded. */
export function illustrativeEditorForm() {
  const text = Object.fromEntries(TEXT_FORM_KEYS.map(key => [key, 'Unknown; illustrative assumption only.']));
  Object.assign(text, { classification: 'illustrative', title: 'Illustrative hypothetical model', purpose: 'Show this software using made-up assumptions.',
    programDescription: 'A hypothetical activity; no real program is described.', populationDescription: 'Hypothetical people; no observations.',
    populationGeography: '', periodLabel: 'Illustrative period, unknown dates.', periodFrom: '', periodTo: '', outcomeName: 'fictional outcome',
    outcomeDefinition: 'One fictional outcome for this illustration.', outcomeMeasurement: 'Not measured.', moneyPriceYear: '', moneyBasis: 'unknown',
    moneyInclusions: 'Made-up total cost in USD.', moneyExclusions: 'Other costs unknown.', moneyAdjustment: '', other: '', amendmentReason: '' });
  return { raw: { parser: 'strict-decimal-v1', name: text.title, unit: text.outcomeName,
    values: { cost: ['100', '200', '500'], people: ['10', '20', '40'], works: ['20', '60', '90'], effect: ['0.1', '1', '2'], years: ['0.5', '1', '3'], anyway: ['0', '10', '50'] }, discount: '3', seed: '42' }, text,
    json: { sources: '[]', sourceModel: 'null', ...Object.fromEntries(ROWS.map(row => [row + 'Basis', json({ low: point(), likely: point(), high: point() })])), discountBasis: json(point()) } };
}

export function readEditorForm(root) {
  const fields = new Map(Array.from(root.querySelectorAll('[data-mb-field]'), el => [el.dataset.mbField, el]));
  const value = path => {
    const el = fields.get(path);
    if (!el) throw new Error('Missing private editor control.');
    return el.value;
  };
  return { raw: { parser: value('raw.parser'), name: value('raw.name'), unit: value('raw.unit'),
    values: Object.fromEntries(ROWS.map(row => [row, PARTS.map((_, i) => value(`raw.values.${row}.${i}`))])), discount: value('raw.discount'), seed: value('raw.seed') },
    text: Object.fromEntries(TEXT_FORM_KEYS.map(key => [key, value('text.' + key)])), json: Object.fromEntries(JSON_FORM_KEYS.map(key => [key, value('json.' + key)])) };
}
function putEditorForm(root, form) {
  for (const el of root.querySelectorAll('[data-mb-field]')) {
    let value = form;
    for (const key of el.dataset.mbField.split('.')) value = value[key];
    el.value = value;
  }
}
function fixedError(error) {
  if (error?.issue) {
    try { return `Calculation refused: ${json(validateNumericalIssue(error.issue))}. Current writing remains here.`; } catch { /* Not a closed numerical issue. */ }
  }
  const code = typeof error?.code === 'string' && /^[a-z0-9-]{1,80}$/.test(error.code) ? error.code : 'unavailable';
  const field = [...ROWS, 'discount', 'seed', 'name', 'unit', 'parser'].includes(error?.field) ? ` Input: ${error.field}.` : '';
  const path = error?.name === 'ModelBundleError' && typeof error.path === 'string' && /^\$\.(?:raw|form|source|outcome|money|assumptions|basis|population|period|title|purpose|programDescription)[.a-zA-Z0-9_\[\]-]{0,128}$/.test(error.path) ? ` Field: ${error.path}.` : '';
  return `This operation was refused (${code}).${field}${path} Current writing and the original file remain available. No replacement was confirmed.`;
}
function mount(root, supplied = null) {
  const $ = selector => root.querySelector(selector);
  if (!$('#mb-editor') || root.dataset.mbMounted === 'yes') throw new Error('A single model bundle desk is required.');
  root.dataset.mbMounted = 'yes';
  const listeners = [];
  function on(el, type, fn) { el.addEventListener(type, fn); listeners.push(() => el.removeEventListener(type, fn)); }
  // This interception is synchronous and precedes construction, opening or enabling.
  on($('#mb-editor'), 'submit', event => event.preventDefault());
  const controller = supplied?.controller ?? createModelBundleController();
  const { session, hooks, bridge } = controller;
  const lane = supplied?.filePlatform ? createModelFileLaneForTesting(bridge, supplied.filePlatform) : createModelFileLane(bridge);
  const checksumHandles = new Map();
  const downloadURLs = new Map();
  let disposed = false, suspended = false, initialized = false, opened = false, literalGeneration = 0, serial = 0, dirty = false;
  let draftBase = session.snapshot().memory.draft, selected = null, backup = null, comparison = null, observation = null, review = null, pendingCandidate = null, busy = false;

  function releaseDownload(url) {
    if (!downloadURLs.has(url)) return;
    const timer = downloadURLs.get(url);
    if (timer !== null) clearTimeout(timer);
    downloadURLs.delete(url); URL.revokeObjectURL(url);
  }
  function releaseDownloads() { for (const url of downloadURLs.keys()) releaseDownload(url); }
  function download(bytes, name, mime) {
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    downloadURLs.set(url, null);
    link.href = url; link.download = name;
    try {
      document.body.append(link); link.click();
      // Native Save may consume the URL after click returns. Retain it briefly,
      // with bounded cleanup when this desk leaves the active page.
      if (downloadURLs.has(url)) {
        const timer = setTimeout(() => releaseDownload(url), 10000);
        timer?.unref?.(); downloadURLs.set(url, timer);
      }
    } catch (error) { releaseDownload(url); throw error; }
    finally { link.remove(); }
  }

  function status(message) { if (!disposed) $('#mb-status').textContent = message; }
  function error(value) { if (disposed) return; $('#mb-error').textContent = value ?? ''; $('#mb-error').hidden = !value; }
  function snapshot() { return session.snapshot(); }
  function hideReview() { review = null; $('#mb-review').hidden = true; $('#mb-review-ack').checked = false; $('#mb-review-body').textContent = ''; }
  function revokeFiles(message = 'File and comparison authority expired. Choose the original file again.') {
    lane.revoke(); selected = backup = comparison = observation = null;
    $('#mb-copy-ack').checked = false;
    $('#mb-inspection-status').textContent = message;
    $('#mb-comparison').textContent = '';
  }
  function invalidate({ files = true } = {}) {
    serial++; hooks.noteFormChanged(); hideReview();
    if (files) revokeFiles();
    busy = false;
  }
  function current(token) { return !disposed && !suspended && token === serial; }
  function version() { return snapshot().memory.versions.find(item => item.id === $('#mb-version').value) ?? null; }
  function showVersion() {
    const v = version();
    $('#mb-version-detail').textContent = v ? 'Declared historical version; not recalculated here. Copy-time observations are historical, not current verification.\n' + json(v) : 'No frozen local versions.';
    refresh();
  }
  function refresh() {
    if (disposed) return;
    const state = snapshot(), available = initialized && !suspended;
    const staleHead = draftBase.mode === 'amend' && !state.memory.models.some(model => model.id === draftBase.modelId && model.currentVersionId === draftBase.expectedHead?.id);
    for (const el of root.querySelectorAll('input,select,textarea,button')) el.disabled = !available;
    if (!available) return;
    const mutationBlocked = state.pending === 'retry' || busy || state.persistence === 'conflict' || state.persistence === 'unavailable';
    const actions = Object.fromEntries(Array.from(root.querySelectorAll('[data-mb-action]'), el => [el.dataset.mbAction, el]));
    const disable = (name, condition) => { if (actions[name]) actions[name].disabled = !!condition; };
    for (const name of ['save-draft', 'freeze', 'new-draft', 'amend', 'copy-local', 'copy-reproduced', 'copy-selected-draft', 'restore', 'clear', 'undo']) disable(name, mutationBlocked);
    for (const name of ['save-draft', 'freeze', 'new-draft', 'amend', 'copy-local', 'copy-reproduced', 'copy-selected-draft']) disable(name, mutationBlocked || !state.capabilities.canPersist);
    disable('freeze', mutationBlocked || !state.capabilities.canPersist || !state.capabilities.canCalculate || staleHead);
    disable('retry', state.pending !== 'retry' || busy);
    disable('pending-recovery', state.pending !== 'retry' || !pendingCandidate || busy);
    disable('undo', mutationBlocked || !session.undo());
    disable('amend', mutationBlocked || !state.capabilities.canPersist || !version() || !state.memory.models.some(m => m.currentVersionId === version()?.id));
    disable('copy-local', mutationBlocked || !state.capabilities.canPersist || !version());
    disable('export-selected', !version() || busy);
    disable('export-backup', busy);
    disable('restore', mutationBlocked || !backup);
    disable('recalculate', busy || !selected || !state.capabilities.canCalculate);
    disable('copy-reproduced', mutationBlocked || !state.capabilities.canPersist || observation?.kind !== 'matched');
    disable('draws', busy || observation?.kind !== 'matched');
    disable('copy-selected-draft', mutationBlocked || !state.capabilities.canPersist || !comparison || !$('#mb-copy-ack').checked);
    disable('proposal', busy || !selected);
    $('#mb-confirm').disabled = !review || !$('#mb-review-ack').checked || busy;
    $('#mb-dismiss').disabled = !review || busy;
    $('#mb-draft-status').textContent = `${draftBase.mode} draft${dirty ? ' · unsaved literal edits' : ''}. ${draftBase.expectedHead ? 'Expected head: ' + draftBase.expectedHead.id + ' / ' + draftBase.expectedHead.hash + '.' : 'No frozen target yet.'} ${staleHead ? 'This draft names a historical head. Freeze is blocked. Review Amend current head to deliberately replace this draft, or recover the writing first.' : ''} ${draftBase.origin ? 'Copy provenance is retained; it is not a contemporary verification badge.' : ''}`;
  }
  function renderState(state = snapshot()) {
    status(state.message + (state.pending === 'retry' ? ' Retry covers only the original retained candidate; later writing stays in the editor.' : ''));
    const control = $('#mb-version'), previous = control.value;
    control.replaceChildren();
    for (const v of state.memory.versions) {
      const option = document.createElement('option'); option.value = v.id;
      option.textContent = `${v.content.title} · version ${v.sequence} · ${v.id}`; control.append(option);
    }
    if (state.memory.versions.some(v => v.id === previous)) control.value = previous;
    showVersion();
  }
  function hydrate(state) {
    for (const id of checksumHandles.keys()) bridge.revokeSourceChecksum(id);
    checksumHandles.clear();
    $('#mb-checksum-status').textContent = '';
    draftBase = clone(state.memory.draft); putEditorForm(root, draftBase.form); dirty = draftBase.dirty;
  }
  function showReview(value, body, notice) {
    review = value; $('#mb-review-ack').checked = false;
    $('#mb-review-notice').textContent = notice;
    $('#mb-review-body').textContent = typeof body === 'string' ? body : json(body);
    $('#mb-review').hidden = false; $('#mb-review-title').focus?.(); refresh();
  }
  function currentDraft() { return { ...clone(draftBase), form: readEditorForm(root), dirty: dirty || draftBase.dirty }; }
  function checkSourceHandles() {
    let sources = null;
    try { sources = parseJsonBytes(encoder.encode(readEditorForm(root).json.sources), { maxBytes: LIMITS.form }); } catch { /* Unfinished JSON remains literal. */ }
    for (const [id, claim] of checksumHandles) {
      const matches = Array.isArray(sources) ? sources.filter(source => source?.id === id) : [];
      if (matches.length !== 1 || !matches[0].checksum || !equal(matches[0].checksum, claim.checksum)) {
        bridge.revokeSourceChecksum(id); checksumHandles.delete(id);
        $('#mb-checksum-status').textContent = 'A source claim changed or became ambiguous. Its earlier local proof expired; the literal writing stays intact. Choose that source file again for a new proof.';
      }
    }
  }
  function edited() {
    literalGeneration++; dirty = true; invalidate(); checkSourceHandles(); error(null);
    status('Literal edits are held in this form. Nothing was saved automatically.'); refresh();
  }
  for (const el of root.querySelectorAll('[data-mb-field]')) on(el, 'input', edited);
  on($('#mb-version'), 'change', () => { invalidate(); showVersion(); });
  on($('#mb-review-ack'), 'change', refresh);
  on($('#mb-copy-ack'), 'change', refresh);

  async function prepared(command) {
    hideReview(); error(null); const token = ++serial, formAt = literalGeneration;
    busy = true; status('Preparing the complete candidate for review. Nothing is saved yet.'); refresh();
    try {
      const prepared = await session.preview(command);
      if (!current(token)) return;
      showReview({ kind: 'command', prepared, operation: command.kind, token, formAt },
        { review: prepared.review, currentLiteralFormBeforeReplacement: NAVIGATION.has(command.kind) ? readEditorForm(root) : null },
        prepared.review.notice + (NAVIGATION.has(command.kind) ? ' This operation replaces the editor draft. Review the complete current writing and complete candidate below.' : ' All candidate fields, history, source descriptions and outgoing byte counts are shown below.'));
    } catch (e) { if (current(token)) error(fixedError(e)); }
    finally { if (current(token)) { busy = false; refresh(); } }
  }
  function localFormReview(form, notice, provider = null) {
    hideReview(); error(null);
    showReview({ kind: 'form', form: clone(form), token: serial, provider }, { currentLiteralFormBeforeReplacement: readEditorForm(root), replacementForm: form }, notice + ' Confirming changes only the visible draft; a later save or freeze needs its own review.');
  }
  async function exportReview(produce, filename, mime, notice) {
    hideReview(); error(null); const token = serial; busy = true; refresh();
    try {
      const bytes = await produce(); if (!current(token)) return;
      if (!(bytes instanceof Uint8Array)) throw new Error('Invalid output.');
      showReview({ kind: 'download', bytes, filename, mime, token }, new TextDecoder('utf-8', { fatal: true }).decode(bytes), `${notice} Complete output: ${bytes.byteLength} bytes. Review every outgoing field. Citation text may itself be private.`);
    } catch (e) { if (current(token)) error(fixedError(e)); }
    finally { if (current(token)) { busy = false; refresh(); } }
  }
  async function choose(input, operation) {
    invalidate(); error(null);
    if (operation.kind === 'checksum') {
      checksumHandles.delete(operation.sourceId);
      $('#mb-checksum-status').textContent = 'A new choice revokes any earlier proof for this source ID.';
    }
    const token = serial, job = hooks.ownedJob();
    // choose snapshots the one File synchronously before the chooser is cleared.
    const promise = lane.choose(input.files, operation, job); input.value = '';
    status('Reading one bounded local file. No data is saved.'); refresh();
    const result = await promise;
    if (!current(token)) return;
    if (result.kind === 'selected') {
      selected = result.handle;
      $('#mb-inspection').textContent = json(result.inspection);
      $('#mb-inspection-status').textContent = 'Structurally admitted; not recalculated here. Previous and local-origin pins without bodies are inert boundaries. Source descriptions and claimed mappings are user declarations.';
    } else if (result.kind === 'backup') {
      backup = result.handle; $('#mb-inspection').textContent = '';
      $('#mb-inspection-status').textContent = 'Complete backup graph admitted; historical results have not been recalculated here. Review Restore to inspect the entire candidate before replacing local state.';
    } else if (result.kind === 'checksum') {
      try {
        const field = $('#mb-json-sources');
        const sources = clone(parseJsonBytes(encoder.encode(field.value), { maxBytes: LIMITS.form }));
        if (!Array.isArray(sources) || sources.filter(source => source?.id === result.sourceId).length !== 1) throw new Error('Source missing.');
        sources.forEach(validateSourceDescription);
        const source = sources.find(source => source.id === result.sourceId);
        source.checksum = result.checksum;
        checksumHandles.set(result.sourceId, { handle: result.handle, checksum: result.checksum });
        field.value = json(sources); literalGeneration++; dirty = true; hooks.noteFormChanged(); serial++;
        $('#mb-checksum-status').textContent = json({ sourceId: result.sourceId, checksum: result.checksum });
        status('This source checksum is held for this exact local source claim. Review a save or freeze to persist it.');
      } catch { bridge.revokeSourceChecksum(result.sourceId); checksumHandles.delete(result.sourceId); error('The sources JSON must contain exactly one valid description for this source ID. The file was not attached or saved.'); }
    } else if (result.kind === 'refused') { error(result.message); $('#mb-inspection-status').textContent = 'No admitted file authority. Keep the original file for raw-file recovery. Unsupported engines remain inert.'; }
    else status('File work was cancelled. Current writing remains here.');
    refresh();
  }
  async function guardedChoice(input, operation) {
    const expected = serial + 1;
    try { await choose(input, operation); }
    catch (e) { if (current(expected)) { error(fixedError(e)); busy = false; refresh(); } }
  }
  on($('#mb-import-file'), 'change', () => guardedChoice($('#mb-import-file'), { kind: $('#mb-file-kind').value }));
  on($('#mb-checksum-file'), 'change', () => guardedChoice($('#mb-checksum-file'), { kind: 'checksum', sourceId: $('#mb-source-id').value, hashedAt: now() }));
  for (const el of [$('#mb-import-file'), $('#mb-checksum-file')]) on(el, 'cancel', () => {
    invalidate();
    if (el.id === 'mb-checksum-file') {
      const id = $('#mb-source-id').value; bridge.revokeSourceChecksum(id); checksumHandles.delete(id);
      $('#mb-checksum-status').textContent = 'Cancelled choice; no earlier proof for this source ID remains current.';
    }
    status('File choice cancelled. Current writing remains here.'); refresh();
  });
  on($('#mb-file-kind'), 'change', () => { invalidate(); refresh(); });
  on($('#mb-source-id'), 'input', () => { invalidate(); refresh(); });

  async function action(name) {
    if (disposed || suspended || !initialized) return;
    error(null);
    if (PAYLOAD_ACTIONS.has(name) && bridge.payload.snapshot().busy) { error(WAITING); return; }
    if (name === 'save-draft' || name === 'freeze') return prepared({ kind: name, draft: currentDraft() });
    if (name === 'new-draft') return prepared({ kind: name, discardCurrentDraft: true });
    if (name === 'clear') { invalidate(); return prepared({ kind: 'clear', discardLocal: true }); }
    if (name === 'restore') { if (backup) return prepared({ kind: 'restore', backup, discardLocal: true }); return; }
    if (name === 'undo') { const undo = session.undo(); if (undo) return prepared({ kind: 'undo', undo }); return; }
    if (name === 'amend' || name === 'copy-local') {
      const v = version(); if (v) return prepared({ kind: name === 'amend' ? 'amend-draft' : 'copy-local-draft', sourceModelId: v.modelId, source: { id: v.id, hash: v.hash }, ...(name === 'amend' ? { discardCurrentDraft: true } : {}) }); return;
    }
    if (name === 'copy-reproduced') { if (selected && comparison) return prepared({ kind: 'copy-reproduced', selected, comparison }); return; }
    if (name === 'copy-selected-draft') { if (selected && comparison && $('#mb-copy-ack').checked) return prepared({ kind: 'copy-selected-draft', selected, comparison, purpose: $('#mb-copy-purpose').value, acknowledge: ACK }); return; }
    if (name === 'recalculate') {
      if (!selected) return; hideReview(); const token = serial, job = hooks.ownedJob(); busy = true; refresh();
      try {
        const outcome = await bridge.api.recalculate(selected, job); if (!current(token)) return;
        comparison = outcome; observation = bridge.api.inspectComparison(outcome);
        $('#mb-comparison').textContent = json(observation);
        $('#mb-inspection-status').textContent = observation.kind === 'matched' ? 'Exact numerical comparison matched here for this current file and form generation. This is not observation, source verification or independent review.'
          : observation.kind === 'mismatched' ? 'Declared results differ. Differing fields and both fingerprints are shown. Only an explicitly acknowledged draft copy is available.' : 'Arithmetic refused. The exact numerical issue is shown. Only an explicitly acknowledged draft copy is available.';
      } catch (e) { if (current(token)) error(fixedError(e)); }
      finally { if (current(token)) busy = false; refresh(); } return;
    }
    if (name === 'cancel-file') { invalidate(); status('File and calculation work cancelled. Current writing remains here.'); refresh(); return; }
    if (name === 'retry') {
      hideReview(); const token = serial; busy = true; refresh();
      try { const result = await session.retry(); if (!disposed) { if (snapshot().pending === 'none') pendingCandidate = null; if (['saved', 'removed', 'noop'].includes(result.kind)) draftBase = clone(snapshot().memory.draft); } if (!current(token)) return; revokeFiles('Retry completed; earlier file comparisons are no longer current. Choose the original file again to recalculate.'); renderState(result.snapshot); if (result.kind === 'refused') error(result.message); }
      catch (e) { if (current(token)) error(fixedError(e)); } finally { if (current(token)) busy = false; refresh(); } return;
    }
    if (name === 'pending-recovery' && pendingCandidate) {
      if (pendingCandidate.review.candidate === null) {
        showReview({ kind: 'notice', token: serial }, pendingCandidate.review,
          'The retained candidate is Clear: its target is an absent key, so there is no candidate workspace backup to download. Retry still covers that exact absence. Current memory, saved-string recovery and literal form recovery remain separate.');
        return;
      }
      const retained = pendingCandidate;
      return exportReview(() => bridge.api.makeBackup(retained.review.candidate, retained.exportedAt), 'retained-model-candidate-backup.json', 'application/json',
        'This is the exact retained candidate state, including its original IDs, run and recording times. Later unsaved form edits are excluded. Downloading it does not resolve or repeat the pending command.');
    }
    if (name === 'reload') {
      invalidate(); showReview({ kind: 'reload', token: serial }, { currentLiteralFormBeforeReplacement: readEditorForm(root), currentMemory: snapshot().memory, savedStringSha256: snapshot().savedSha256, persistence: snapshot().persistence },
        'Reload deliberately discards the current literal draft and retained Retry candidate after a fresh saved-string read. Download recovery first if needed. No fresh saved bytes have been read for this review.'); return;
    }
    if (name === 'copy-current') {
      const oldRoot = document.querySelector('#ce-form')?.closest('section.tool'), provider = oldRoot && calculatorCopyProvider(oldRoot);
      if (!provider) { error('The original calculator has not finished initialization. Try this explicit copy again after it opens.'); return; }
      const capture = provider.capture(); if (!provider.isCurrent(capture.formGeneration)) return;
      const form = readEditorForm(root); form.raw = { parser: 'legacy-amount-strip-v1', ...clone(capture.raw) };
      localFormReview(form, 'Only the current calculator raw inputs will replace the raw fields. Context, source writing and classification stay as shown; they must be reviewed for consistency.', { provider, generation: capture.formGeneration }); return;
    }
    if (name === 'example') return localFormReview(illustrativeEditorForm(), 'These numbers and all accompanying assumptions are made up. They describe no real program or source artifact. This replaces the complete visible form.');
    if (name === 'export-selected') { const v = version(); if (v) return exportReview(() => bridge.api.makeSelected(snapshot().memory, v.id, now()), 'model-selected.json', 'application/json', 'Selected model only. Other versions, unrelated models and unfinished writing are excluded.'); return; }
    if (name === 'export-backup') return exportReview(() => bridge.api.makeBackup(snapshot().memory, now()), 'model-workspace-backup.json', 'application/json', 'This full private backup includes every stored version and the last saved draft. Unsaved visible edits are excluded; use unfinished form recovery for those.');
    if (name === 'draws' && comparison) return exportReview(() => bridge.api.makeDraws(comparison), 'model-draws.json', 'application/json', 'These reproduced arrays are separately sorted. Paired simulation indices are absent.');
    if (name === 'proposal' && selected) return exportReview(() => bridge.api.makeProposal(selected), 'model-proposal.md', 'text/markdown', 'User-submitted model proposal, not published or independently reviewed. It includes the selected authored context, source descriptions and exact pins. Nothing is uploaded.');
    if (name === 'raw-form') {
      invalidate();
      return exportReview(async () => {
        const bytes = encoder.encode('Unfinished model bundle form recovery; not a valid bundle or workspace backup\n\n' + json({ exportedAt: now(), form: readEditorForm(root) }) + '\n');
        if (bytes.byteLength > LIMITS.checksumFile) throw Object.assign(new Error(), { code: 'byte-limit' }); return bytes;
      }, 'unfinished-model-form-recovery.txt', 'text/plain', 'Exact escaped unfinished writing. This is not accepted by any bundle import. If it exceeds 8 MiB, copy fields manually; no output is truncated.');
    }
    if (name === 'raw-saved') {
      invalidate(); return exportReview(async () => { const bytes = await session.rawSavedRecovery(); if (!bytes) throw Object.assign(new Error(), { code: 'no-readable-saved-string' }); return bytes; },
        'model-saved-string-recovery.txt', 'text/plain', 'Protected saved string escaped exactly as JSON. This recovery is not a valid workspace backup.');
    }
  }
  for (const button of root.querySelectorAll('[data-mb-action]')) on(button, 'click', async () => {
    try { await action(button.dataset.mbAction); } catch (e) { error(fixedError(e)); busy = false; refresh(); }
  });
  on($('#mb-dismiss'), 'click', () => { hideReview(); refresh(); status('Review dismissed. Current writing remains here.'); });
  on($('#mb-confirm'), 'click', async () => {
    const chosen = review;
    if (!chosen || !$('#mb-review-ack').checked || !current(chosen.token)) return;
    hideReview(); error(null); busy = true; refresh();
    try {
      if (chosen.kind === 'download') { download(chosen.bytes, chosen.filename, chosen.mime); status('A download of the exact reviewed output was requested. Your browser may still require a save or cancellation choice.'); }
      else if (chosen.kind === 'form') {
        if (chosen.provider && !chosen.provider.provider.isCurrent(chosen.provider.generation)) { error('The original calculator changed after review. Capture and review its current raw fields again.'); return; }
        putEditorForm(root, chosen.form); edited();
      } else if (chosen.kind === 'reload') {
        const state = await session.reload({ discardLocal: true }); if (!current(chosen.token)) return;
        if (state.pending === 'none') pendingCandidate = null;
        if (state.persistence === 'saved' || state.persistence === 'absent') { hydrate(state); literalGeneration++; }
        renderState(state);
      } else if (chosen.kind === 'notice') {
        status('The retained Clear target remains absence. No file was created and no saved change was made.');
      } else {
        const result = await session.commit(chosen.prepared.handle);
        if (!disposed) pendingCandidate = snapshot().pending === 'retry' ? { review: clone(chosen.prepared.review), exportedAt: now() } : null;
        if (!disposed && ['saved', 'removed', 'noop'].includes(result.kind)) draftBase = clone(snapshot().memory.draft);
        if (!current(chosen.token)) return;
        if (['saved', 'removed', 'noop'].includes(result.kind)) {
          if (NAVIGATION.has(chosen.operation) && literalGeneration === chosen.formAt) hydrate(result.snapshot);
          else if (literalGeneration === chosen.formAt) dirty = result.snapshot.memory.draft.dirty;
        }
        revokeFiles('The reviewed command finished. Earlier file comparison authority expired; choose the original file again for a new comparison.');
        renderState(result.snapshot); if (result.kind === 'refused') error(result.message);
      }
    } catch (e) { if (!disposed) error(fixedError(e)); }
    finally { if (current(chosen.token)) busy = false; refresh(); }
  });

  on(window, 'storage', async event => {
    if (event.key !== LOCAL_KEY && event.key !== null) return;
    invalidate(); checksumHandles.clear(); const token = serial;
    $('#mb-checksum-status').textContent = 'Saved-state notice: local checksum authority expired. Existing source writing is retained.';
    status(bridge.payload.snapshot().busy ? WAITING : 'Checking the saved-state notice. Current writing stays here.'); refresh();
    try { const state = await hooks.noticeForeignStorage(); if (current(token)) renderState(state); } catch (e) { if (current(token)) error(fixedError(e)); }
  });
  function dispose() {
    if (disposed) return; disposed = true; serial++; lane.dispose(); hooks.dispose(); checksumHandles.clear();
    releaseDownloads();
    for (const remove of listeners) remove();
    for (const el of root.querySelectorAll('input,select,textarea,button')) el.disabled = true;
  }
  on(window, 'pagehide', event => {
    if (!event.persisted) return dispose();
    suspended = true; serial++; hideReview(); revokeFiles(); checksumHandles.clear(); releaseDownloads(); hooks.suspend(); busy = false; refresh();
    $('#mb-checksum-status').textContent = 'Local checksum authority expired on suspension. Existing source writing is retained.';
  });
  on(window, 'pageshow', async event => {
    if (!event.persisted || disposed) return;
    suspended = false; const token = ++serial;
    if (bridge.payload.snapshot().busy) { status(WAITING); refresh(); }
    try { const state = await hooks.resume(); if (!current(token)) return; if (!initialized && opened) initialize(state); else renderState(state); }
    catch (e) { if (current(token)) error(fixedError(e)); }
  });
  function initialize(state) {
    if (disposed || suspended || initialized) return;
    if (literalGeneration === 0) hydrate(state); else draftBase = clone(state.memory.draft);
    initialized = true; renderState(state);
  }
  const ready = controller.openingPromise.then(state => { opened = true; initialize(state); return state; });
  return Object.freeze({ ready, dispose });
}

export function mountModelBundles(root) { const mounted = mount(root); return mounted.ready.then(() => mounted); }
/** Only native I/O/storage/worker scheduling may vary in mounted acceptance tests. */
export function mountModelBundlesForTesting(root, options) { return mount(root, options); }
