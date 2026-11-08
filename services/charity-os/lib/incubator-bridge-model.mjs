/** Pure two-record planning and complete historical closure. No IO or authority. */
import { validateRecord } from './modules.mjs';
import { INCUBATOR_METHOD, INCUBATOR_NATIVE_REGISTRY_SHA256, validateIncubatorSourceCapture, validateIncubatorSourcePin, sourcePin } from './incubator-native.mjs';
import { INCUBATOR_LIMITS as L, incubatorOwned as own, incubatorObject as obj, incubatorText as text, incubatorEnum as en, incubatorNumber as num, incubatorId as id, incubatorHashValue as hash, incubatorInstant as instant, incubatorHash as H, incubatorSeal as seal, incubatorCheckedHash as checked, incubatorSame as same, incubatorFreeze as freeze, incubatorFail as fail, incubatorCanonical as canonical } from './incubator-bridge-json.mjs';
const invalid = (message = 'The complete Incubator source and planning history is inconsistent.') => fail('incubator_history', message);
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
const key = v => v.originOrgId + ':' + v.bindingId;
const control = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;
export function validateIncubatorProgramPin(value) { const v = own(value, { bytes: 1024 }); obj(v, ['recordId','revision','dataSha256']); id(v.recordId); num(v.revision, 1, 2147483647); hash(v.dataSha256); return v; }
export function validateIncubatorHeadPin(value) { const v = own(value, { bytes: 2048 }); obj(v, ['originOrgId','bindingId','sequence','sha256']); id(v.originOrgId); id(v.bindingId); num(v.sequence, 1, L.eventsPerBinding); hash(v.sha256); return v; }
export function validateIncubatorMapping(value) {
  const v = own(value, { bytes: L.requestBytes }); obj(v, ['project','milestone','relationship']);
  for (const name of ['project','milestone']) { obj(v[name], ['title','deliverable'], name); text(v[name].title, 180, name + '.title', { nonblank: true }); text(v[name].deliverable, 4000, name + '.deliverable', { nullable: true }); }
  obj(v.relationship, ['kind','confirmed','reason']); en(v.relationship.kind, ['milestone-of-selected-project']); en(v.relationship.confirmed, [true]); text(v.relationship.reason, 2000, 'relationship.reason', { nonblank: true }); return v;
}
function targetData(kind, programId, parentId, mapping) { return { title: mapping.title, kind, programId, projectId: parentId, dependencyIds: [], deliverable: mapping.deliverable, dueAt: null, timeZone: null, effortMinutes: null, priority: 'normal', recurrence: 'none' }; }
export function validateIncubatorCandidate(value) {
  const v = own(value, { bytes: L.eventBytes }); obj(v, ['id','moduleId','data','status','ownerId','revision','approval','snapshot','source','lastEditedBy']); id(v.id); id(v.ownerId); id(v.lastEditedBy); en(v.moduleId, ['projects']); en(v.status, ['planned']); en(v.revision, [1]);
  if (v.approval !== null || v.snapshot !== null || v.source !== null || v.lastEditedBy !== v.ownerId) invalid('Copied plans cannot carry approval, source integration or imported ownership.');
  const d = v.data; obj(d, ['title','kind','programId','projectId','dependencyIds','deliverable','dueAt','timeZone','effortMinutes','priority','recurrence']); en(d.kind, ['project','milestone']); id(d.programId); text(d.title, 180, 'data.title', { nonblank: true }); text(d.deliverable, 4000, 'data.deliverable', { nullable: true });
  if (d.title !== d.title.trim() || control.test(d.title) || (d.deliverable !== null && (d.deliverable !== d.deliverable.trim() || control.test(d.deliverable)))) invalid('Historical target fields must be the exact normalized ordinary fields.');
  if (d.kind === 'project') { if (d.projectId !== null) invalid(); } else { id(d.projectId); if (d.projectId === v.id) invalid(); }
  if (!Array.isArray(d.dependencyIds) || d.dependencyIds.length || d.dueAt !== null || d.timeZone !== null || d.effortMinutes !== null || d.priority !== 'normal' || d.recurrence !== 'none') invalid('This adapter creates only the two documented initial plans.'); return v;
}
export function compileIncubatorCandidates({ orgId, actorId, programId, projectId, milestoneId, mapping, records }) {
  for (const v of [orgId, actorId, programId, projectId, milestoneId]) id(v);
  if (projectId === milestoneId || projectId === programId || milestoneId === programId || !Array.isArray(records) || records.some(r => [projectId, milestoneId].includes(r.id))) invalid('Use two fresh distinct target IDs.');
  const program = records.find(r => r.id === programId);
  if (!program || program.moduleId !== 'programs' || program.data?.kind !== 'program' || program.deletedAt || (program.orgId && program.orgId !== orgId)) invalid('Choose a current same-organization program.');
  const m = validateIncubatorMapping(mapping), rows = [...records], candidates = [];
  for (const [kind, recordId, parent, fields] of [['project', projectId, null, m.project], ['milestone', milestoneId, projectId, m.milestone]]) {
    const data = validateRecord('projects', targetData(kind, programId, parent, fields), { orgId, recordId, status: 'planned', records: rows });
    const candidate = validateIncubatorCandidate({ id: recordId, moduleId: 'projects', data, status: 'planned', ownerId: actorId, revision: 1, approval: null, snapshot: null, source: null, lastEditedBy: actorId });
    candidates.push(candidate); rows.push({ ...candidate, orgId });
  }
  return freeze(candidates);
}
export function validateIncubatorEvent(value) {
  const v = own(value, { bytes: L.eventBytes }); obj(v, ['format','version','method','originOrgId','bindingId','sequence','previous','preparedAt','actorId','program','operation','source','recoveredHead','mapping','candidates','sha256']);
  en(v.format, ['charitology-incubator-event']); en(v.version, [1]); en(v.method, [INCUBATOR_METHOD]); id(v.originOrgId); id(v.bindingId); id(v.actorId); instant(v.preparedAt); num(v.sequence, 1, L.eventsPerBinding); validateIncubatorProgramPin(v.program); validateIncubatorSourcePin(v.source); en(v.operation, ['copy','refresh-copy','adopt']); validateIncubatorMapping(v.mapping);
  if (v.sequence === 1 ? v.previous !== null : !v.previous) invalid();
  if (v.previous !== null) { const p = validateIncubatorHeadPin(v.previous); if (p.originOrgId !== v.originOrgId || p.bindingId !== v.bindingId || p.sequence !== v.sequence - 1) invalid(); }
  if (v.operation === 'adopt') { validateIncubatorHeadPin(v.recoveredHead); if (v.sequence !== 1) invalid(); } else if (v.recoveredHead !== null || (v.operation === 'copy' ? v.sequence !== 1 : v.sequence < 2)) invalid();
  if (!Array.isArray(v.candidates) || v.candidates.length !== 2) invalid('A copied plan has exactly two candidates.');
  const [a, b] = v.candidates.map(validateIncubatorCandidate);
  if (a.data.kind !== 'project' || b.data.kind !== 'milestone' || b.data.projectId !== a.id || a.id === b.id || a.data.programId !== v.program.recordId || b.data.programId !== v.program.recordId || a.id === v.program.recordId || b.id === v.program.recordId || a.ownerId !== v.actorId || b.ownerId !== v.actorId) invalid();
  // Reproduce ordinary text normalization without inventing a historical program snapshot.
  for (const [c, m] of [[a, v.mapping.project], [b, v.mapping.milestone]]) {
    const deliverable = m.deliverable === null || m.deliverable === '' ? null : m.deliverable.trim();
    if (c.data.title !== m.title.trim() || c.data.deliverable !== deliverable) invalid('The event must retain its exact authored mapping and normalized candidate fields.');
  }
  checked('event', v); return v;
}
export function makeIncubatorEvent(input) {
  const v = own(input, { bytes: L.eventBytes }); obj(v, ['originOrgId','bindingId','sequence','previous','preparedAt','actorId','program','operation','source','recoveredHead','mapping','candidates']);
  return validateIncubatorEvent(seal('event', { format: 'charitology-incubator-event', version: 1, method: INCUBATOR_METHOD, ...v }));
}
export const headPin = event => { const e = validateIncubatorEvent(event); return freeze({ originOrgId: e.originOrgId, bindingId: e.bindingId, sequence: e.sequence, sha256: e.sha256 }); };
export const createdDescriptors = event => freeze(validateIncubatorEvent(event).candidates.map(c => ({ id: c.id, moduleId: 'projects', revision: 1, status: 'planned', dataSha256: H('candidate-data', c.data) })));
const receiptKeys = ['format','version','operation','commandHash','requestHash','actorBindingHash','actorId','sessionSha256','membershipSha256','memberCreatedAtExact','restoreEpochSha256','previewId','reviewSha256','result'];
export function validateIncubatorReceipt(value, event) {
  const v = own(value, { bytes: L.receiptBytes }), e = validateIncubatorEvent(event); obj(v, receiptKeys); en(v.format, ['charitology-incubator-receipt']); en(v.version, [1]); en(v.operation, [e.operation]); id(v.actorId); id(v.previewId); instant(v.memberCreatedAtExact, 'memberCreatedAtExact', true);
  for (const k of ['commandHash','requestHash','actorBindingHash','sessionSha256','membershipSha256','restoreEpochSha256','reviewSha256']) hash(v[k]);
  obj(v.result, ['created','head','acceptedAt']); instant(v.result.acceptedAt); validateIncubatorHeadPin(v.result.head);
  if (v.actorId !== e.actorId || !same(v.result.head, headPin(e)) || !same(v.result.created, createdDescriptors(e)) || Date.parse(v.result.acceptedAt) < Date.parse(e.preparedAt)) invalid('The receipt must identify its exact accepted event and original pair.'); return v;
}
export function makeIncubatorReceipt(input, event) {
  const v = own(input, { bytes: L.receiptBytes }); obj(v, ['operation','commandHash','requestHash','actorBindingHash','actorId','sessionSha256','membershipSha256','memberCreatedAtExact','restoreEpochSha256','previewId','reviewSha256','acceptedAt']);
  const { acceptedAt, ...binding } = v; return validateIncubatorReceipt({ format: 'charitology-incubator-receipt', version: 1, ...binding, result: { created: createdDescriptors(event), head: headPin(event), acceptedAt } }, event);
}

export function foldIncubatorHistory(input) {
  const value = own(input, { bytes: 64 * 1024 * 1024 }); obj(value, ['sources','events']);
  if (!Array.isArray(value.sources) || !Array.isArray(value.events) || value.sources.length + value.events.length > L.history) invalid('The source/history count exceeds its bound.');
  const sources = value.sources.map(validateIncubatorSourceCapture), entries = [], sourceMap = new Map(), groups = new Map(), ids = new Set(), commands = new Set(), targets = new Set(); let budget = 0;
  for (const s of sources) { if (sourceMap.has(s.sha256)) invalid(); sourceMap.set(s.sha256, s); budget += bytes(s) + 4096; }
  for (const raw of value.events) {
    obj(raw, ['event','originMode','acceptedReceipt']); en(raw.originMode, ['live','recovered']); const event = validateIncubatorEvent(raw.event);
    if (ids.has(event.sha256)) invalid(); ids.add(event.sha256);
    const receipt = raw.acceptedReceipt === null ? null : validateIncubatorReceipt(raw.acceptedReceipt, event);
    if (raw.originMode === 'live' && receipt === null) invalid('Live events require their accepted receipt.');
    if (receipt) { const ck = event.originOrgId + ':' + receipt.commandHash; if (commands.has(ck)) invalid('Command identity is repeated in retained history.'); commands.add(ck); }
    for (const c of event.candidates) { if (targets.has(c.id)) invalid('Fresh copied target IDs cannot be reused by another event.'); targets.add(c.id); }
    const entry = freeze({ event, originMode: raw.originMode, acceptedReceipt: receipt }); entries.push(entry); budget += bytes(event) + (receipt ? bytes(receipt) : 0) + 4096;
    const k = key(event); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(entry);
  }
  if (budget > L.historyBytes) invalid('Retained source/history exceeds its conservative byte floor.');
  const used = new Set(), bindings = [], eventMap = new Map(entries.map(x => [x.event.sha256, x]));
  const validateBinding = (group, visiting = new Set()) => {
    const ordered = [...group].sort((a, b) => a.event.sequence - b.event.sequence), first = ordered[0], groupKey = key(first.event);
    const already = bindings.find(b => key(b) === groupKey); if (already) return already;
    if (visiting.has(groupKey)) invalid('Adoption history cannot form a cycle.'); visiting.add(groupKey);
    if (ordered.length > L.eventsPerBinding || ordered.some(x => x.originMode !== first.originMode)) invalid();
    let previous = null, selected = null, currentSource = null; const nativeSources = [];
    for (const entry of ordered) {
      const e = entry.event, s = sourceMap.get(e.source.sha256);
      if (!s || !same(sourcePin(s), e.source) || e.sequence !== (previous?.sequence ?? 0) + 1 || !same(e.previous, previous ? headPin(previous) : null) || e.program.recordId !== first.event.program.recordId || (previous && Date.parse(e.preparedAt) < Date.parse(previous.preparedAt))) invalid();
      if (e.operation === 'adopt') {
        const recovered = eventMap.get(e.recoveredHead.sha256);
        if (!recovered || recovered.originMode !== 'recovered' || !same(headPin(recovered.event), e.recoveredHead) || !same(recovered.event.source, e.source) || e.originOrgId === e.recoveredHead.originOrgId && e.bindingId === e.recoveredHead.bindingId) invalid('Adoption requires the exact recovered head and retained source.');
        const parent = validateBinding(groups.get(key(recovered.event)), new Set(visiting));
        if (!same(parent.head, e.recoveredHead) || Date.parse(e.preparedAt) < Date.parse(recovered.event.preparedAt)) invalid('Adopt the current recovered branch head.');
      } else {
        if (s.originOrgId !== e.originOrgId || s.bindingId !== e.bindingId || s.sourceVersion !== nativeSources.length + 1 || !same(s.previousNativeSource, nativeSources.length ? sourcePin(nativeSources.at(-1)) : null) || Date.parse(s.preparedAt) > Date.parse(e.preparedAt)) invalid('Copy events require their exact local native capture.');
        if (e.operation === 'copy' && previous !== null || e.operation === 'refresh-copy' && previous === null) invalid();
        if (nativeSources.some(prior => s.originalSha256 === prior.originalSha256)) invalid('An identical local native file is unchanged; no refresh-copy is offered.');
        nativeSources.push(s);
      }
      if (selected !== null && !same(selected, s.selection)) invalid('A binding retains the same two explicitly selected native identities.');
      selected = s.selection; currentSource = e.source; used.add(s.sha256); previous = e;
    }
    const binding = freeze({ originOrgId: first.event.originOrgId, bindingId: first.event.bindingId, originMode: first.originMode, programId: first.event.program.recordId, selection: selected, head: headPin(previous), source: currentSource, currentEvent: previous, nativeSources, events: ordered }); bindings.push(binding); visiting.delete(groupKey); return binding;
  };
  for (const group of groups.values()) validateBinding(group);
  if (used.size !== sourceMap.size || bindings.length > L.bindings || bindings.filter(b => b.originMode === 'live').length > L.liveBindings) invalid('Orphan sources or binding count exceed the complete history contract.');
  return freeze({ sources, events: entries, bindings: bindings.sort((a, b) => key(a).localeCompare(key(b))) });
}
export function validateIncubatorBackup(value, { records = [], trash = [] } = {}) {
  const v = own(value, { bytes: 64 * 1024 * 1024 }); obj(v, ['format','version','method','registrySha256','sources','events']); en(v.format, ['charitology-incubator-bridge-backup']); en(v.version, [1]); en(v.method, [INCUBATOR_METHOD]);
  if (v.registrySha256 !== INCUBATOR_NATIVE_REGISTRY_SHA256) invalid('Unsupported Incubator native registry.');
  const folded = foldIncubatorHistory({ sources: v.sources, events: v.events }), current = new Map();
  for (const r of [...records, ...trash]) { if (current.has(r.id)) invalid('Duplicate ordinary record identity.'); current.set(r.id, r); }
  for (const entry of folded.events) for (const c of entry.event.candidates) { const row = current.get(c.id); if (row && row.moduleId !== 'projects') invalid('A historical target identity belongs to another current module.'); }
  // Current data/revision/status/approval may legitimately have changed. Never replace it.
  return v;
}
export function makeIncubatorBackup(input, options) { obj(input, ['sources','events']); return validateIncubatorBackup({ format: 'charitology-incubator-bridge-backup', version: 1, method: INCUBATOR_METHOD, registrySha256: INCUBATOR_NATIVE_REGISTRY_SHA256, sources: input.sources, events: input.events }, options); }
