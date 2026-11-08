/** Deliberate local-draft review. All writes use bound same-origin callbacks.
 * No email matching, browser storage, background Retry or identity authority. */
const ID = /^[A-Za-z0-9_-]{1,100}$/, SHA = /^[a-f0-9]{64}$/;
const need = value => { if (!value) throw Object.assign(new Error('The contact response could not be verified. Any uncertain exact command is kept.'), { code: 'invalid_response' }); };
const id = value => typeof value === 'string' && ID.test(value);
const sha = value => typeof value === 'string' && SHA.test(value);
const exact = (value, keys) => need(value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)));
const same = (a, b) => {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a); return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && same(a[key], b[key]));
};
function owned(value) {
  let nodes = 0, bytes = 0; const active = new Set();
  const visit = (v, depth) => {
    need(++nodes <= 60000 && depth <= 32);
    if (v === null || ['string', 'boolean', 'number'].includes(typeof v)) {
      need(typeof v !== 'number' || Number.isFinite(v));
      bytes += new TextEncoder().encode(JSON.stringify(v)).length; need(bytes <= 2097152); return v;
    }
    need(v && typeof v === 'object' && !active.has(v));
    const array = Array.isArray(v); need(Object.getPrototypeOf(v) === (array ? Array.prototype : Object.prototype));
    const keys = Reflect.ownKeys(v); need(keys.every(key => typeof key === 'string')); let order = keys;
    if (array) {
      const d = Object.getOwnPropertyDescriptor(v, 'length'); need(d && Object.hasOwn(d, 'value') && Number.isSafeInteger(d.value) && d.value >= 0 && d.value <= 2000);
      need(keys.length === d.value + 1); order = Array.from({ length: d.value }, (_, i) => String(i));
      const allowed = new Set(order); need(keys.every(key => key === 'length' || allowed.has(key)));
    } else need(keys.length <= 100);
    active.add(v); bytes += 2; const out = array ? [] : {};
    for (const key of order) {
      const d = Object.getOwnPropertyDescriptor(v, key); need(d?.enumerable && Object.hasOwn(d, 'value'));
      bytes += new TextEncoder().encode(JSON.stringify(key)).length + 2; need(bytes <= 2097152);
      Object.defineProperty(out, key, { value: visit(d.value, depth + 1), enumerable: true, writable: true, configurable: true });
    }
    active.delete(v); return out;
  };
  return visit(value, 0);
}
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const instant = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(value) && value.slice(0,4) !== '0000' && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString().slice(0,19) === value.slice(0,19);
// These checks admit display/intent DTOs; the server verifies hashes and fresh authority.
const CONTACT_FIELDS = ['title','kind','displayLabel','email','organizationId','relationship','contactPreference','purpose','reviewDate','externalSystem','externalId','externalUrl'];
const ROW_KEYS = ['id','orgId','moduleId','revision','status','data','source','approval','snapshot','deletedAt'];
const revision = v => Number.isSafeInteger(v) && v >= 1 && v <= 2147483647;
const pin = v => { if (v !== null) { exact(v, ['sha256']); need(sha(v.sha256)); } };
function contactRow(v, org) {
  exact(v, ROW_KEYS); need(id(v.id) && v.orgId === org && v.moduleId === 'contacts' && revision(v.revision) && typeof v.status === 'string');
  need(v.deletedAt === null || instant(v.deletedAt)); exact(v.data, CONTACT_FIELDS);
  need(v.data.kind === 'person-reference' && typeof v.data.title === 'string' && v.data.title.length >= 1 && v.data.title.length <= 180);
  for (const key of CONTACT_FIELDS.filter(k => !['title','kind'].includes(k))) need(v.data[key] === null || typeof v.data[key] === 'string');
  pin(v.approval); pin(v.snapshot);
  if (v.source !== null) { exact(v.source,['integrationId','externalId','checksum']); need(id(v.source.integrationId) && typeof v.source.externalId === 'string' && sha(v.source.checksum)); }
}
function contextInput(v, org, withDecision = true) {
  exact(v, withDecision ? ['orgId','pair','organizations','references','decision'] : ['pair','organizations','references']);
  if (withDecision) need(v.orgId === org);
  need(Array.isArray(v.pair) && v.pair.length === 2 && v.pair[0].id !== v.pair[1].id); v.pair.forEach(r => contactRow(r,org));
  need(Array.isArray(v.organizations) && v.organizations.length <= 2 && Array.isArray(v.references) && v.references.length <= 128);
  need(new Set(v.organizations.map(r=>r.id)).size===v.organizations.length&&v.organizations.every(r=>!v.pair.some(p=>p.id===r.id)));
  need(new Set(v.references.map(r=>JSON.stringify([r.family,r.id,r.field,r.contactId]))).size===v.references.length);
  for (const r of v.organizations) { exact(r,['id','orgId','moduleId','revision','kind','deletedAt']); need(id(r.id) && r.orgId === org && r.moduleId === 'contacts' && revision(r.revision) && r.kind === 'organization' && r.deletedAt === null); }
  for (const r of v.references) { exact(r,['family','id','moduleId','field','contactId','revision','sha256','deleted']); need(['record','intake','participation','delivery','immutable-history'].includes(r.family) && id(r.id) && v.pair.some(x => x.id === r.contactId) && sha(r.sha256) && typeof r.deleted === 'boolean' && (r.revision === null || revision(r.revision))); need(r.family === 'record' ? revision(r.revision) && typeof r.moduleId === 'string' && typeof r.field === 'string' : r.moduleId === null && r.field === null); }
  if (withDecision) {
    const d=v.decision; exact(d,d.operation === 'merge' ? ['operation','survivorId','fields','basis','reason'] : ['operation','assertion','basis','reason']);
    need(['record-comparison','recorded-direct-confirmation','existing-document','unknown'].includes(d.basis) && typeof d.reason === 'string' && d.reason.trim() && d.reason.length <= 500);
    if(d.operation === 'merge') { need(v.pair.some(r=>r.id===d.survivorId)); exact(d.fields,['title','displayLabel','email']); need(['left','right'].includes(d.fields.title)); for(const k of ['displayLabel','email'])need(['left','right','unknown'].includes(d.fields[k])); }
    else need(d.operation === 'no-merge' && ['distinct-people','same-person-kept-separate','shared-household-distinct-people','separate-role-records','unresolved'].includes(d.assertion));
  }
}
function reviewedPlan(p, input, org) {
  contextInput(input,org);need(input.pair.every(r=>r.deletedAt===null)); exact(p,['format','version','method','orgId','pair','organizations','decision','comparison','references','proposal','refusals','authority','dependencyCompleteness','sha256']);
  need(p.format==='charitology-contact-reconciliation-plan' && p.version===1 && p.method==='contact-reconciliation-plan-v1' && p.orgId===org && sha(p.sha256) && p.authority==='none-data-only' && p.dependencyCompleteness==='caller-must-establish');
  need(Array.isArray(p.pair) && p.pair.length===2);p.pair.forEach((r,i)=>{exact(r,['id','revision','sha256']);need(r.id===input.pair[i].id&&r.revision===input.pair[i].revision&&sha(r.sha256));});
  need(same(p.decision,input.decision) && same(p.organizations,input.organizations.slice().sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)));
  need(Array.isArray(p.references)&&p.references.length===input.references.length&&new Set(p.references.map(r=>JSON.stringify([r.family,r.id,r.field,r.contactId]))).size===p.references.length&&p.references.every(r=>input.references.some(x=>same(x,r))));
  need(Array.isArray(p.comparison)&&p.comparison.length===CONTACT_FIELDS.length);p.comparison.forEach((c,i)=>{exact(c,['field','left','right','equal']);const field=CONTACT_FIELDS[i];need(c.field===field&&same(c.left,input.pair[0].data[field])&&same(c.right,input.pair[1].data[field])&&c.equal===same(c.left,c.right));});
  need(Array.isArray(p.refusals)&&p.refusals.length===0);
  if(input.decision.operation==='no-merge'){need(p.proposal===null);return;}
  const d=input.decision,q=p.proposal;exact(q,['survivorId','loserId','survivorData','survivorStatus','expectedRevisions','retire','fieldProvenance','unchangedFields']);
  const survivor=input.pair.find(r=>r.id===d.survivorId),loser=input.pair.find(r=>r!==survivor);need(q.survivorId===survivor.id&&q.loserId===loser.id&&q.survivorStatus==='draft');
  need(input.pair.every(r=>r.status==='draft'&&r.source===null&&r.approval===null&&r.snapshot===null&&['externalSystem','externalId','externalUrl'].every(k=>r.data[k]===null)));
  need(['organizationId','relationship','contactPreference','purpose','reviewDate'].every(k=>same(input.pair[0].data[k],input.pair[1].data[k]))&&input.references.every(r=>r.family==='record'&&r.contactId!==loser.id));
  need(same(q.expectedRevisions,input.pair.map(r=>({id:r.id,revision:r.revision})))&&same(q.retire,{id:loser.id,operation:'soft-delete'}));
  const data={...survivor.data},provenance=[];for(const field of ['title','displayLabel','email']){const choice=d.fields[field],from=choice==='unknown'?null:input.pair[choice==='left'?0:1];data[field]=from?.data[field]??null;provenance.push({field,choice,contactId:from?.id??null,contactRevision:from?.revision??null,value:data[field]});}
  need(same(q.survivorData,data)&&same(q.fieldProvenance,provenance)&&same(q.unchangedFields,CONTACT_FIELDS.filter(k=>!['title','displayLabel','email'].includes(k))));
}
function expectedMergeChanges(review, at) {
  if(review.input.decision.operation==='no-merge')return [];
  const q=review.plan.proposal,a=review.input.pair.find(r=>r.id===q.survivorId),b=review.input.pair.find(r=>r.id===q.loserId);
  need(a.revision<2147483647&&b.revision<2147483647);
  return [{before:a,after:{...a,revision:a.revision+1,data:q.survivorData}},{before:b,after:{...b,revision:b.revision+1,deletedAt:at}}];
}
const inverseChanges = original => original.changes.map(c=>{need(c.after.revision<2147483647);return {before:c.after,after:{...c.before,revision:c.after.revision+1}};});
function reportPayload(p, org, allowReverse=true) {
  exact(p,['format','version','method','originOrgId','reportId','recordedAtExact','operation','review','reverses','changes','sha256']);
  need(p.format==='charitology-contact-reconciliation'&&p.version===1&&p.method==='contact-reconciliation-report-v1'&&id(p.originOrgId)&&id(p.reportId)&&instant(p.recordedAtExact)&&sha(p.sha256)&&Array.isArray(p.changes));
  // Historical cross-origin reports are data only, never an undo grant.
  const origin=p.originOrgId;
  if(p.operation==='reverse'){need(allowReverse&&p.review===null);reportPayload(p.reverses,origin,false);need(p.reverses.operation==='merge'&&p.reverses.originOrgId===origin&&p.reverses.reportId!==p.reportId&&p.recordedAtExact>p.reverses.recordedAtExact);need(same(p.changes,inverseChanges(p.reverses)));}
  else {need(['merge','no-merge'].includes(p.operation)&&p.reverses===null);exact(p.review,['input','plan']);need(p.review.input.decision.operation===p.operation);reviewedPlan(p.review.plan,p.review.input,origin);need(same(p.changes,expectedMergeChanges(p.review,p.recordedAtExact)));}
}
function inversePlan(p, review, org) {
  exact(review,['original','receiptPin','current','plan']);reportPayload(review.original,org,false);const original=review.original;
  need(original.operation==='merge'&&original.originOrgId===org&&original.reportId!==p.reportId);contextInput(review.current,org,false);
  const refKey=r=>JSON.stringify([r.family,r.id,r.field,r.contactId]),sortRefs=rows=>rows.slice().sort((a,b)=>refKey(a)<refKey(b)?-1:refKey(a)>refKey(b)?1:0);
  need(review.current.pair.every(r=>original.changes.some(c=>same(c.after,r)))&&same(review.current.organizations.slice().sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),original.review.plan.organizations)&&same(sortRefs(review.current.references),original.review.plan.references));
  exact(review.receiptPin,['previewId','actorId','commandSha256','reportId','reportSha256','restoreEpochSha256']);const pin=review.receiptPin;
  need(id(pin.previewId)&&id(pin.actorId)&&sha(pin.commandSha256)&&pin.reportId===original.reportId&&pin.reportSha256===original.sha256&&pin.restoreEpochSha256===p.authority.restoreEpochSha256);
  need(same(review.plan,{operation:'reverse',originalReportId:original.reportId,originalChecksum:original.sha256,changes:inverseChanges(original)}));
}

const notify = (callback, ...args) => { try { callback(...args); } catch {} };
function node(tag, attrs = {}, ...children) {
  const out = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (['checked', 'disabled', 'hidden'].includes(key)) out[key] = !!value;
    else if (value !== null && value !== undefined) out.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity)) if (child !== null && child !== undefined && child !== false) out.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return out;
}
const notice = text => node('p', { class: 'notice' }, text);
const json = (label, value) => node('details', {}, node('summary', {}, label), node('pre', { tabindex: '0' }, JSON.stringify(value, null, 2)));
const panel = (title, ...body) => node('section', { class: 'snapshot stack' }, node('h2', {}, title), ...body);
const CONTACT_LABELS = Object.freeze({ title:'Title', kind:'Contact kind', displayLabel:'Display label', email:'Email', organizationId:'Organization ID', relationship:'Role or relationship', contactPreference:'Contact preference', purpose:'Purpose', reviewDate:'Review date', externalSystem:'External system', externalId:'External ID', externalUrl:'External URL' });
const ASSERTION_LABELS = Object.freeze({ 'distinct-people':'Different people', 'same-person-kept-separate':'Same person, kept separate', 'shared-household-distinct-people':'Different people in one household', 'separate-role-records':'Keep separate role records', unresolved:'Unresolved' });
const BASIS_LABELS = Object.freeze({ 'record-comparison':'Comparison of these records', 'recorded-direct-confirmation':'Recorded direct confirmation', 'existing-document':'An existing document', unknown:'Unknown' });
const readableValue = value => node('pre', { tabindex:'0' }, value === null ? 'Unknown' : value);
function pairedFields(pair, labels=['Left','Right']) {
  return node('div', { class:'stack', 'data-contact-comparison':'fields' },
    ...CONTACT_FIELDS.map(key => node('section', { class:'snapshot stack', 'data-contact-field':key }, node('h3', {}, CONTACT_LABELS[key]),
      ...pair.map((row,i) => node('div', { 'data-contact-side':labels[i].toLowerCase() }, node('p', {}, node('strong', {}, labels[i]+' · '+row.id)), readableValue(row.data[key]))))));
}
function readablePreview(packet) {
  const p=packet.review;
  if(p.operation==='merge') {
    const q=p.review.plan.proposal;
    return panel('What this merge will change', notice('Keep record '+q.survivorId+'. Move record '+q.loserId+' to trash; its ID and history stay retained.'),
      ...q.fieldProvenance.map(f=>node('section',{class:'snapshot stack','data-contact-provenance':f.field},node('h3',{},CONTACT_LABELS[f.field]),
        node('p',{},f.choice==='unknown'?'Your explicit choice: Unknown / clear this field.':'Your explicit choice: '+(f.choice==='left'?'Left':'Right')+' · '+f.contactId+'.'),readableValue(f.value))),
      notice('The other field values, preferences, purpose and organization stay as reviewed. This does not transfer consent, accounts or external identity.'));
  }
  if(p.operation==='no-merge') {
    const d=p.review.input.decision;
    return panel('What keeping both records will record', notice('Keep both record IDs: '+p.review.input.pair.map(r=>r.id).join(' and ')+'. Their field values stay unchanged.'),
      node('p',{},node('strong',{},'Your assertion: '),ASSERTION_LABELS[d.assertion]),node('p',{},node('strong',{},'Your basis: '),BASIS_LABELS[d.basis]),node('h3',{},'Your retained reason'),readableValue(d.reason));
  }
  return panel('What this undo will change', notice('Undo merge report '+p.review.original.reportId+'. Restore its recorded field values with new revisions; retain both record IDs.'),
    ...p.review.plan.changes.map(change=>panel('Record '+change.after.id,
      node('p',{},'Before: revision '+change.before.revision+', '+(change.before.deletedAt===null?'current record':'in trash')+'. After: revision '+change.after.revision+', '+(change.after.deletedAt===null?'current record':'in trash')+'.'),
      ...CONTACT_FIELDS.filter(key=>!same(change.before.data[key],change.after.data[key])).map(key=>node('section',{class:'snapshot stack'},node('h3',{},CONTACT_LABELS[key]),node('p',{},'Before'),readableValue(change.before.data[key]),node('p',{},'After'),readableValue(change.after.data[key]))),
      node('details',{},node('summary',{},'All before and after field values for '+change.after.id),pairedFields([change.before,change.after],['Before','After'])))),
    notice('The server must still verify the unchanged records, dependencies and original live command receipt. Restored history does not grant permission to undo.'));
}

let serial = 0;
export function canUseContactReconciliation(role, contactsModule) {
  return ['owner', 'admin'].includes(role) && contactsModule?.id === 'contacts' && contactsModule.roles?.read?.includes(role) === true && contactsModule.roles?.write?.includes(role) === true;
}

export function createContactReconciliationWorkspace({ org, actorId, role, contactsModule, api, isCurrent = () => true, onDirty = () => {}, onChanged = () => {}, makeCommandKey = () => crypto.randomUUID() } = {}) {
  need(id(org) && id(actorId) && canUseContactReconciliation(role, contactsModule));
  for (const name of ['contacts', 'inspect', 'preview', 'reversePreview', 'commit', 'history', 'historyDetail']) need(typeof api?.[name] === 'function');
  const prefix = 'contact-reconciliation-' + (++serial) + '-', requests = new Set(), controls = [];
  let disposed = false, paused = false, generation = 0, busy = false, fresh = false, choices = [], context = null, preview = null, pending = null, dirty = false, historyCursor = null;
  const root = node('section', { class: 'stack', 'aria-label': 'Contact reconciliation' });
  const status = node('p', { role: 'status', 'aria-live': 'polite', tabindex: '-1', 'data-contact': 'status' }), body = node('div', { class: 'stack' });
  root.append(node('h1', { tabindex: '-1' }, 'Contact reconciliation'), notice('Compare two deliberately chosen person-reference records. A shared name or email does not establish that they are the same person. This tool records your decision; it does not establish consent or account ownership.'), status, body);
  const live = () => !disposed && !paused && !document.hidden && isCurrent();
  const mark = () => notify(onDirty, dirty || !!pending);
  const say = (message, error = false) => { if (!live()) return; status.textContent = message; status.classList.toggle('error', error); if (error && root.isConnected) status.focus(); };
  const input = (tag, name, attrs = {}) => { const c = node(tag, { id: prefix + name, 'data-contact': name, ...attrs }); controls.push(c); return c; };
  const field = (label, c, help = '') => node('div', { class: 'field' }, node('label', { for: c.id }, label), c, help ? node('p', { class: 'field-help' }, help) : null);
  const select = (name, rows) => { const c = input('select', name); c.append(node('option', { value: '' }, 'Choose explicitly'), ...rows.map(([v, label]) => node('option', { value: v }, label))); return c; };
  const left = select('left', []), right = select('right', []);
  const operation = select('operation', [['no-merge', 'Keep both records'], ['merge', 'Merge eligible local drafts']]);
  const assertion = select('assertion', [['distinct-people', 'Different people'], ['same-person-kept-separate', 'Same person, kept separate'], ['shared-household-distinct-people', 'Different people in one household'], ['separate-role-records', 'Keep separate role records'], ['unresolved', 'Unresolved']]);
  const basis = select('basis', [['record-comparison', 'Comparison of these records'], ['recorded-direct-confirmation', 'Recorded direct confirmation'], ['existing-document', 'An existing document'], ['unknown', 'Unknown']]);
  const survivor = select('survivor', [['left', 'Keep the left record ID'], ['right', 'Keep the right record ID']]);
  const title = select('title', [['left', 'Left title'], ['right', 'Right title']]);
  const displayLabel = select('displayLabel', [['left', 'Left display label'], ['right', 'Right display label'], ['unknown', 'Unknown / clear this field']]);
  const email = select('email', [['left', 'Left email'], ['right', 'Right email'], ['unknown', 'Unknown / clear this field']]);
  const reason = input('textarea', 'reason', { maxlength: '500', rows: '4' }), ack = input('input', 'ack', { type: 'checkbox' });
  const comparisonHost = node('div', { class: 'stack' }), reviewHost = node('div', { class: 'stack' }), savedHost = node('div', { class: 'stack' }), historyHost = node('div', { class: 'stack' }), detailHost = node('div', { class: 'stack' });
  const noMergeFields = node('div', { class: 'stack' }, field('Your assertion', assertion));
  const mergeFields = node('div', { class: 'stack' }, field('Surviving record ID', survivor), field('Title source', title), field('Display-label source', displayLabel), field('Email source', email));
  function abort() { generation++; for (const c of requests) c.abort(); requests.clear(); if (pending && (pending.inFlight || pending.uncertain)) { pending.uncertain = true; pending.definitive = false; } busy = false; }
  function clearDerived() {
    abort(); fresh = false; context = null; preview = null; choices = []; ack.checked = false; historyCursor = null;
    for (const c of [left, right]) { c.replaceChildren(node('option', { value: '' }, 'Read current Contacts first')); c.value = ''; }
    for (const host of [comparisonHost, reviewHost, savedHost, historyHost, detailHost]) host.replaceChildren();
    mark(); sync();
  }
  function changed({ pair = false } = {}) {
    if (!live() || busy || pending) return;
    preview = null; ack.checked = false; reviewHost.replaceChildren();
    if (pair) { context = null; comparisonHost.replaceChildren(); }
    dirty = true; mark(); sync();
  }
  for (const c of [left, right]) c.addEventListener('change', () => changed({ pair: true }));
  for (const c of [operation, assertion, basis, survivor, title, displayLabel, email]) c.addEventListener('change', () => changed());
  reason.addEventListener('input', () => changed()); ack.addEventListener('change', () => sync());
  function button(label, name, run, { pendingAllowed = false, needsFresh = false } = {}) {
    const b = node('button', { type: 'button', class: 'button subtle', 'data-contact': name }, label);
    b.contactPendingAllowed = pendingAllowed; b.contactNeedsFresh = needsFresh;
    b.addEventListener('click', async () => {
      if (!live() || busy || pending && !pendingAllowed || needsFresh && !fresh) return;
      const token = generation; busy = true; sync();
      try { await run(token); }
      catch (e) {
        if (live() && token === generation) {
          if ([401, 403, 404].includes(e.status)) { clearDerived(); say('Current access changed. Private comparison data was cleared. Your authored reason and any uncertain exact command remain in this page.', true); }
          else say(pending ? pending.definitive ? 'The first command was refused. Review again explicitly; no new command is created automatically.' : 'Result unknown. Retry the exact retained command. A later refusal does not permit a new key.' : e.message || 'This comparison could not be read. Your writing is kept.', true);
        }
      } finally { if (live() && token === generation) { busy = false; sync(); } }
    }); return b;
  }
  async function call(name, args, token) {
    need(live() && token === generation); const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000); requests.add(controller);
    try { const result = await api[name](...args, { signal: controller.signal }); need(live() && token === generation); return owned(result); }
    finally { clearTimeout(timer); requests.delete(controller); }
  }
  async function readChoices(token) {
    const rows = [], cursors = new Set(); let cursor = null;
    for (let page = 0; page < 100; page++) {
      const v = await call('contacts', [cursor], token); need(v.ok === true && Array.isArray(v.records));
      for (const r of v.records) { need(id(r.id) && r.orgId === org && r.moduleId === 'contacts' && typeof r.data?.title === 'string' && !rows.some(x => x.id === r.id)); rows.push(r); need(rows.length <= 2000); }
      if (!v.cursor) return rows.filter(r => r.data.kind === 'person-reference');
      need(typeof v.cursor === 'string' && v.cursor.length <= 4096 && !cursors.has(v.cursor)); cursors.add(v.cursor); cursor = v.cursor;
    }
    need(false);
  }
  const load = button('Read current Contacts', 'load', async token => {
    fresh = false; context = null; preview = null; choices = []; ack.checked = false; historyCursor = null;
    for (const c of [left, right]) { c.replaceChildren(node('option', { value: '' }, 'Read current Contacts first')); c.value = ''; }
    for (const host of [comparisonHost, reviewHost, savedHost, historyHost, detailHost]) host.replaceChildren();
    choices = await readChoices(token); fresh = true;
    for (const c of [left, right]) { c.replaceChildren(node('option', { value: '' }, 'Choose a person-reference record'), ...choices.map(r => node('option', { value: r.id }, r.data.title + ' · ' + r.id))); c.value = ''; }
    say(pending ? 'Current Contacts read. Retry the same retained command deliberately.' : 'Current Contacts read. Choose both records explicitly.');
  }, { pendingAllowed: true });
  function pairRequest() { need(fresh && id(left.value) && id(right.value) && left.value !== right.value && [left.value, right.value].every(x => choices.some(r => r.id === x))); return { leftId: left.value, rightId: right.value }; }
  const inspect = button('Compare selected records', 'inspect', async token => {
    const request = pairRequest(); context = null; preview = null; ack.checked = false; comparisonHost.replaceChildren(); reviewHost.replaceChildren();
    const v = await call('inspect', [request], token); exact(v, ['ok', 'context']); need(v.ok === true && sha(v.context?.contextSha256));
    const pair = v.context.plannerContext?.pair; need(v.context.plannerContext?.orgId === org && Array.isArray(pair) && pair.length === 2 && pair[0].id === request.leftId && pair[1].id === request.rightId && pair.every(r => r.orgId === org && r.moduleId === 'contacts' && r.data?.kind === 'person-reference' && r.deletedAt === null));
    context = v.context;
    comparisonHost.replaceChildren(panel('Current record comparison', notice('Unknown values remain unknown. Protected preferences, purpose, organization and review date must agree for this merge. Existing private or frozen links can prevent it.'),
      pairedFields(pair), json('Advanced: exact left record', pair[0]), json('Advanced: exact right record', pair[1]), json('Advanced: reference and source context', { references: context.plannerContext.references, organizations: context.plannerContext.organizations, sourceOwnership: context.sourceOwnership, coverage: context.coverage })));
    say('Comparison read. Choose an operation, state your basis and explain the decision.');
  }, { needsFresh: true });
  function decision() {
    need(['merge', 'no-merge'].includes(operation.value) && ['record-comparison', 'recorded-direct-confirmation', 'existing-document', 'unknown'].includes(basis.value) && reason.value.trim() && reason.value.length <= 500);
    if (operation.value === 'no-merge') { need(['distinct-people', 'same-person-kept-separate', 'shared-household-distinct-people', 'separate-role-records', 'unresolved'].includes(assertion.value)); return { operation: 'no-merge', assertion: assertion.value, basis: basis.value, reason: reason.value }; }
    need(['left', 'right'].includes(survivor.value) && ['left', 'right'].includes(title.value) && ['left', 'right', 'unknown'].includes(displayLabel.value) && ['left', 'right', 'unknown'].includes(email.value));
    return { operation: 'merge', survivorId: survivor.value === 'left' ? left.value : right.value, fields: { title: title.value, displayLabel: displayLabel.value, email: email.value }, basis: basis.value, reason: reason.value };
  }
  function readPreview(v) {
    exact(v, ['ok', 'previewId', 'expiresAt', 'review', 'processingTime']); need(v.ok === true && id(v.previewId) && instant(v.expiresAt) && v.processingTime === 'assigned-on-commit');
    const p = v.review; exact(p, ['format', 'version', 'method', 'purpose', 'orgId', 'actorId', 'reportId', 'authority', 'reviewedContextSha256', 'rowStamps', 'operation', 'review', 'sha256']);
    need(p.format === 'charitology-contact-reconciliation-preview' && p.version === 1 && p.method === 'contact-reconciliation-preview-v1' && p.purpose === 'contact-reconciliation-v1' && p.orgId === org && p.actorId === actorId && id(p.reportId) && sha(p.sha256) && sha(p.reviewedContextSha256) && ['merge', 'no-merge', 'reverse'].includes(p.operation));
    exact(p.authority,['actorId','sessionSha256','membershipSha256','memberCreatedAtExact','restoreEpochSha256']);need(p.authority.actorId===actorId&&instant(p.authority.memberCreatedAtExact));for(const key of ['sessionSha256','membershipSha256','restoreEpochSha256'])need(sha(p.authority[key]));
    if(p.operation==='reverse')inversePlan(p,p.review,org);else{exact(p.review,['input','plan']);need(p.review.input.decision.operation===p.operation);reviewedPlan(p.review.plan,p.review.input,org);}
    const pair=p.operation==='reverse'?p.review.current.pair:p.review.input.pair;
    need(Array.isArray(p.rowStamps)&&p.rowStamps.length===2);p.rowStamps.forEach((r,i)=>{exact(r,['id','createdAtExact','updatedAtExact','deletedAtExact','rowSha256']);need(r.id===pair[i].id&&instant(r.createdAtExact)&&instant(r.updatedAtExact)&&r.deletedAtExact===pair[i].deletedAt&&(r.deletedAtExact===null||instant(r.deletedAtExact))&&sha(r.rowSha256));});
    return v;
  }
  function showPreview(v) {
    preview = freeze(v); ack.checked = false; dirty = true; mark();
    reviewHost.replaceChildren(panel('Review the complete decision', notice(v.review.operation === 'reverse' ? 'This undo restores the recorded field values and revives the retired draft with new revisions. It requires unchanged rows, dependencies and the original live command receipt.' : v.review.operation === 'merge' ? 'The surviving ID stays. The other draft is retained in trash. No account, consent, alias or external identity is transferred.' : 'Both records remain unchanged. The stated assertion and reason enter immutable history.'),
      readablePreview(v), notice('The change time is recorded when committed. Review expires at ' + v.expiresAt + '.'), json('Advanced: exact reviewed packet, field choices and changes', v.review), field('I reviewed this exact decision and its retained history', ack), commit));
    say('Preview ready. Review and acknowledge it explicitly before committing.');
  }
  const makePreview = button('Prepare decision preview', 'preview', async token => {
    const pair = pairRequest(); need(context && context.plannerContext.pair[0].id === pair.leftId && context.plannerContext.pair[1].id === pair.rightId);
    const d = decision(), request = { ...pair, contextSha256: context.contextSha256, decision: d };
    preview = null; ack.checked = false; reviewHost.replaceChildren();
    const v = readPreview(await call('preview', [request], token)); need(v.review.operation === d.operation && v.review.reviewedContextSha256 === context.contextSha256 && same(v.review.authority,context.authority) && same(v.review.rowStamps,context.rowStamps) && same(v.review.review.input, { ...context.plannerContext, decision: d })); showPreview(v);
  }, { needsFresh: true });
  async function send(token) {
    const intent = pending; need(intent && !intent.definitive && JSON.stringify(intent.body) === intent.wire); intent.inFlight = true; intent.attempts++;
    try {
      const v = await call('commit', [intent.body], token); exact(v, ['ok', 'operation', 'reportId', 'reportSha256', 'recordIds', 'replayed']);
      need(v.ok === true && v.operation === intent.operation && v.reportId === intent.reportId && sha(v.reportSha256) && same(v.recordIds, intent.recordIds) && typeof v.replayed === 'boolean');
      pending = null; preview = null; context = null; dirty = false; ack.checked = false; reviewHost.replaceChildren(); comparisonHost.replaceChildren(); mark();
      savedHost.replaceChildren(panel('Saved decision', notice(v.replayed ? 'The exact command was already saved. No second decision was created.' : 'The reviewed decision and immutable report were saved.'), json('Accepted result', v)));
      notify(onChanged); say('Saved. Read current Contacts before another comparison.'); fresh = false;
    } catch (e) {
      if (pending === intent) {
        const knownFirstRefusal = intent.attempts === 1 && !intent.uncertain && ['contact_command_stale', 'contact_preview_expired', 'contact_reconciliation_stale', 'contact_reconciliation_preview'].includes(e.code) && e.status === 409;
        if (knownFirstRefusal) intent.definitive = true; else { intent.uncertain = true; intent.definitive = false; }
      }
      throw e;
    } finally { intent.inFlight = false; }
  }
  const commit = button('Commit this reviewed decision', 'commit', async token => {
    need(preview && ack.checked); const commandKey = makeCommandKey(); need(typeof commandKey === 'string' && /^[A-Za-z0-9_-]{16,100}$/.test(commandKey));
    const p = preview.review, recordIds = p.operation === 'no-merge' ? [] : p.operation === 'merge' ? [p.review.plan.proposal.survivorId, p.review.plan.proposal.loserId] : p.review.plan.changes.map(c => c.after.id);
    const request = freeze({ previewId: preview.previewId, commandKey });
    pending = { body: request, wire: JSON.stringify(request), reportId: p.reportId, operation: p.operation, recordIds, attempts: 0, uncertain: false, definitive: false, inFlight: false }; mark(); sync(); await send(token);
  }, { needsFresh: true });
  const retry = button('Retry this exact command', 'retry', token => send(token), { pendingAllowed: true, needsFresh: true });
  const reset = button('Review again after the first refusal', 'reset', () => { need(pending?.definitive && !pending.uncertain); pending = null; preview = null; context = null; ack.checked = false; comparisonHost.replaceChildren(); reviewHost.replaceChildren(); dirty = true; mark(); say('Known refusal cleared deliberately. Compare current records and prepare a new preview.'); }, { pendingAllowed: true, needsFresh: true });
  async function historyPage(token, after = null) {
    const v = await call('history', [{ after, limit: 20 }], token); exact(v, ['ok', 'reports', 'nextAfter']); need(v.ok === true && Array.isArray(v.reports) && v.reports.length <= 20 && (v.nextAfter === null || id(v.nextAfter)));
    historyCursor = v.nextAfter;
    historyHost.replaceChildren(...v.reports.map(r => {
      exact(r, ['id', 'title', 'checksum', 'createdAt', 'operation', 'originOrgId', 'recordedAtExact']); need(id(r.id) && id(r.originOrgId) && sha(r.checksum) && instant(r.createdAt) && instant(r.recordedAtExact) && ['merge', 'no-merge', 'reverse'].includes(r.operation) && r.title==='Contact reconciliation: '+r.operation+' '+r.checksum.slice(0,12));
      return panel(r.title, notice('Historical data only. A restored report does not restore an accepted command or current authority.'), button('Read decision ' + r.id, 'history-' + r.id, async t => {
        const d = await call('historyDetail', [r.id], t); exact(d, ['ok', 'report']);need(d.ok===true);exact(d.report,['id','title','checksum','createdAt','operation','originOrgId','recordedAtExact','payload']);
        const {payload,...metadata}=d.report;need(same(metadata,r));reportPayload(payload,org);need(payload.sha256===r.checksum&&payload.reportId===r.id&&payload.operation===r.operation&&payload.originOrgId===r.originOrgId&&payload.recordedAtExact===r.recordedAtExact);
        const prepareUndo = button('Prepare undo preview', 'reverse-' + r.id, async next => {
          need(!pending && r.operation === 'merge' && d.report.payload.originOrgId === org);
          const p = readPreview(await call('reversePreview', [{ reportId: r.id }], next)); need(p.review.operation === 'reverse' && same(p.review.review.original, d.report.payload)); showPreview(p);
        }, { needsFresh: true });
        detailHost.replaceChildren(panel('Historical decision', json('Exact retained report and metadata', d.report), ...(r.operation === 'merge' && d.report.payload.originOrgId === org ? [prepareUndo] : [])));
      }, { pendingAllowed: true, needsFresh: true }));
    })); say('Authorized decision history read. No hidden or global counts are shown.');
  }
  const history = button('Read decision history', 'history', t => historyPage(t), { pendingAllowed: true, needsFresh: true });
  const more = button('Next history page', 'more-history', t => { need(historyCursor); return historyPage(t, historyCursor); }, { pendingAllowed: true, needsFresh: true });
  function sync() {
    const current = live();
    for (const c of controls) c.disabled = !current || busy || !!pending || !fresh;
    for (const b of root.querySelectorAll('button')) b.disabled = !current || busy || !!pending && !b.contactPendingAllowed || b.contactNeedsFresh && !fresh;
    noMergeFields.hidden = operation.value !== 'no-merge'; mergeFields.hidden = operation.value !== 'merge';
    ack.disabled = !current || busy || !!pending || !fresh || !preview;
    commit.disabled = !current || busy || !!pending || !fresh || !preview || !ack.checked;
    retry.disabled = !current || busy || !fresh || !pending || !!pending?.definitive;
    reset.disabled = !current || busy || !fresh || !pending?.definitive || pending.uncertain;
    more.disabled = !current || busy || !fresh || !historyCursor;
  }
  function mount() {
    body.replaceChildren(panel('Choose two current records', load, node('p', {}, 'Use ', node('a', { href: '#module/contacts' }, 'Contacts'), ' to create or edit ordinary records. Only current unscoped owners and administrators can use this review.'), field('Left person reference', left), field('Right person reference', right), inspect), comparisonHost,
      panel('State the decision', field('Operation', operation), noMergeFields, mergeFields, field('Basis for your assertion', basis), field('Reason', reason, 'Describe the record decision. Avoid sensitive personal details. This reason is retained in immutable history.'), makePreview), reviewHost,
      panel('Retained exact command', retry, reset, notice('An interrupted result may already be saved. Only deliberate Retry sends the same body and key. No request runs in the background. This page keeps its command in memory; signing out or closing it discards that local Retry.')), savedHost,
      panel('Decision history', history, more, historyHost, detailHost));
  }
  function pause() { if (disposed) return; clearDerived(); paused = true; body.replaceChildren(notice('Private comparison cleared. Return and explicitly read current Contacts. Any uncertain exact command remains only in this page.')); status.textContent = ''; }
  function resume() { if (!disposed && isCurrent()) { paused = false; mount(); sync(); } }
  const visibility = () => document.hidden ? pause() : resume();
  window.addEventListener('pagehide', pause); window.addEventListener('pageshow', resume); document.addEventListener?.('visibilitychange', visibility);
  root.invalidate = () => { if (disposed) return; clearDerived(); mount(); sync(); say('Current access and comparison data cleared. Your authored decision is kept; read current Contacts and compare again.'); };
  root.resume = resume; root.isDirty = () => dirty || !!pending; root.hasPendingCommand = () => !!pending;
  root.dispose = () => { if (disposed) return; clearDerived(); disposed = true; window.removeEventListener('pagehide', pause); window.removeEventListener('pageshow', resume); document.removeEventListener?.('visibilitychange', visibility); reason.value = ''; pending = null; root.replaceChildren(); };
  mount(); sync(); return root;
}
