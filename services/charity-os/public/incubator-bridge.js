import { incubatorHash, listIncubatorNativeSelections, inspectIncubatorNativeValue, validateIncubatorSelectedNative } from './incubator-native-admission.js';

const ADAPTER = 'incubator-project-milestone-native-v1';
const REGISTRY = '9f7b99ebf552b116e33d8dda78bb463bb4dfd09da9da5cec2fa888fc690ff4bc';
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const instant = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value));
const same = (a, b) => incubatorHash('request', a) === incubatorHash('request', b);
const sourcePin = source => ({ originOrgId: source.originOrgId, bindingId: source.bindingId, sourceVersion: source.sourceVersion, sha256: source.sha256 });
const headPin = value => value && id(value.originOrgId) && id(value.bindingId) && Number.isInteger(value.sequence) && value.sequence >= 1 && value.sequence <= 8 && hash(value.sha256);
const programPin = record => ({ recordId: record.id, revision: record.revision, dataSha256: incubatorHash('program-data', record.data) });
const refuse = message => { throw new Error(message); };
function node(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value === null || value === undefined) continue;
    if (key.startsWith('on')) element.addEventListener(key.slice(2), value);
    else if (['disabled','checked','selected','required','hidden','multiple'].includes(key)) element[key] = !!value;
    else if (key === 'class') element.className = value;
    else element.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity)) if (child !== null && child !== undefined && child !== false)
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return element;
}
let number = 0;
const json = (title, value) => node('details', {}, node('summary', {}, title), node('pre', { tabindex:'0', class:'incubator-json' }, JSON.stringify(value, null, 2)));
const panel = (title, ...children) => node('section', { class:'incubator-card' }, node('h2', {}, title), ...children);
function choices(control, rows, placeholder, keep = control.value) {
  control.replaceChildren(node('option', { value:'' }, placeholder), ...rows.map(([value, text]) => node('option', { value, selected:value === keep }, text)));
  control.value = rows.some(([value]) => value === keep) ? keep : '';
}
function checkedSource(source) {
  if (!source || source.format !== 'charitology-incubator-source' || source.version !== 1 || source.adapter !== ADAPTER || source.registrySha256 !== REGISTRY ||
      !id(source.originOrgId) || !id(source.bindingId) || !Number.isInteger(source.sourceVersion) || source.sourceVersion < 1 || source.sourceVersion > 8 ||
      !instant(source.preparedAt) || !Number.isInteger(source.originalBytes) || source.originalBytes < 1 || source.originalBytes > 8000000 || !hash(source.originalSha256) || !hash(source.sha256))
    refuse('The retained source identity is incomplete. Read its current history again.');
  validateIncubatorSelectedNative(source.selection, source.selected);
  if (Object.keys(source).sort().join(',') !== ['format','version','adapter','registrySha256','originOrgId','bindingId','sourceVersion','previousNativeSource','preparedAt','originalBytes','originalSha256','selection','selected','sha256'].sort().join(',')) refuse('The retained source has undocumented fields.');
  const { sha256, ...body } = source;
  if (incubatorHash('source', body) !== sha256) refuse('The retained selected source differs from its checksum.');
  return source;
}

/** A deliberate two-record copy pane. Constructors do not read storage or send requests.
 * Authority is server-enforced; wall-clock skew does not extend or expire a preview.
 * A lost commit response keeps one exact command in this page's memory only.
 */
export function createIncubatorBridgeWorkspace({ org, actorId, api, administrator = false, isCurrent = () => true, onDirty = () => {}, onChanged = () => {},
  confirmDiscard = () => Promise.resolve(false), makeCommandKey = () => crypto.randomUUID() } = {}) {
  const prefix = `incubator-${++number}-`, requests = new Set();
  let disposed = false, hidden = false, generation = 0, busy = false, dirty = false, fileSerial = 0;
  let bytes = null, programs = [], summaries = [], recoveredSummaries = [], binding = null, recovered = null;
  let inspection = null, preview = null, intent = null, liveCursor = null, recoveredCursor = null;
  const root = node('section', { class:'incubator-workspace' });
  const status = node('p', { role:'status', 'aria-live':'polite', tabindex:'-1', 'data-incubator':'status' });
  const body = node('div', { class:'incubator-body' });
  root.append(node('h1', { tabindex:'-1' }, 'Incubator plans'), node('p', {}, 'Copy one deliberately selected native project and milestone into two editable planned records. This does not launch a charity, approve work or establish impact.'), status, body);
  const previewHost = node('div', { 'data-incubator':'preview' }), savedHost = node('div', { 'data-incubator':'saved' }), sourceHost = node('div', { 'data-incubator':'source' }), historyHost = node('div', { 'data-incubator':'history' });
  function current() { return !disposed && !hidden && isCurrent(); }
  function assertCurrent(token) { if (!current() || token !== generation) throw Object.assign(new Error('This source view is no longer current.'), { name:'AbortError' }); }
  function say(text, error = false) {
    if (!current()) return;
    status.textContent = text; status.classList.toggle('error', error);
    if (error && root.isConnected && status.isConnected && status.parentElement === root) status.focus();
  }
  function invalidate({ source = true } = {}) {
    generation++; for (const controller of requests) controller.abort(); requests.clear(); busy = false;
    if (intent) { intent.uncertain = true; say('Result unknown after this view changed. Retry the exact retained command or reconcile authorized saved history before starting another copy.'); }
    if (source) { inspection = null; sourceHost.replaceChildren(); }
    if (!intent) { preview = null; previewHost.replaceChildren(); }
    sync();
  }
  function change(source = false) {
    dirty = true; onDirty(true); invalidate({ source });
  }
  async function call(name, args, token) {
    assertCurrent(token);
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000), stopTimer = () => clearTimeout(timer); requests.add(controller);
    controller.signal.addEventListener('abort',stopTimer,{once:true});
    try { const result = await api[name](...args, { signal:controller.signal }); assertCurrent(token); return result; }
    finally { clearTimeout(timer); controller.signal.removeEventListener('abort',stopTimer); requests.delete(controller); }
  }
  function button(text, run, name, allowPending = false) {
    const control = node('button', { type:'button', class:'button subtle', 'data-incubator':name });
    control.textContent = text;
    control.addEventListener('click', async () => {
      if (!current() || busy || (intent && !allowPending)) return;
      const token = generation; busy = true; sync();
      try { await run(token); }
      catch (error) { if (current() && token === generation) say(intent?.uncertain ? 'Result unknown. Retry this exact command or read saved history for reconciliation. A later refusal does not permit a new command. Your writing is kept.' : error.message || 'The operation could not be verified. Your writing is kept.', true); }
      finally { if (current() && token === generation) { busy = false; sync(); } }
    });
    control._pendingAllowed = allowPending;
    return control;
  }
  const controls = [];
  function control(tag, name, attrs = {}) { const value = node(tag, { 'data-incubator':name, id:prefix+name, ...attrs }); controls.push(value); return value; }
  const field = (text, input, help = '') => node('div', { class:'field' }, node('label', { for:input.id }, text), input, help ? node('p', { class:'field-help' }, help) : null);
  const mode = control('select','mode'); choices(mode, [['new','New copied pair'],['refresh','Refresh-copy: two more planned records'],...(administrator ? [['adopt','Adopt an inactive historical selection']] : [])], 'Choose a deliberate action', 'new');
  const program = control('select','program'); choices(program, [], 'Load accessible programs first');
  const bindingChoice = control('select','binding'); choices(bindingChoice, [], 'Load live histories first');
  const recoveredChoice = control('select','recovered'); choices(recoveredChoice, [], 'Load inactive histories first');
  const file = control('input','file',{ type:'file', accept:'.json,application/json' });
  const project = control('select','project'), milestone = control('select','milestone');
  choices(project, [], 'Choose a complete native file first'); choices(milestone, [], 'Choose a complete native file first');
  const privacy = control('input','privacy',{ type:'checkbox' }), duplicate = control('input','duplicate',{ type:'checkbox' });
  const title = control('input','project-title',{ type:'text', maxlength:'180' }), deliverable = control('textarea','project-deliverable',{ maxlength:'4000', rows:'3' });
  const milestoneTitle = control('input','milestone-title',{ type:'text', maxlength:'180' }), milestoneDeliverable = control('textarea','milestone-deliverable',{ maxlength:'4000', rows:'3' });
  const relationship = control('input','relationship',{ type:'checkbox' }), reason = control('textarea','reason',{ maxlength:'2000', rows:'3' });
  const review = control('input','review',{ type:'checkbox' });
  function sync() {
    for (const value of controls) value.disabled = busy || !!intent || !current();
    // This control belongs to the current exact outgoing review, not the form.
    review.disabled = busy || !!intent || !preview || !current();
    for (const value of body.querySelectorAll('button')) value.disabled = busy || !current() || (!!intent && !value._pendingAllowed);
    retry.disabled = busy || !current() || !intent;
    commit.disabled = busy || !current() || !!intent || !preview || !review.checked;
    inspect.disabled = busy || !current() || !!intent || mode.value === 'adopt';
  }
  function mapping() { return { project:{ title:title.value, deliverable:deliverable.value === '' ? null : deliverable.value }, milestone:{ title:milestoneTitle.value, deliverable:milestoneDeliverable.value === '' ? null : milestoneDeliverable.value }, relationship:{ kind:'milestone-of-selected-project', confirmed:relationship.checked, reason:reason.value } }; }
  function selectedProgram() {
    const record = programs.find(value => value.id === program.value);
    if (!record) refuse('Load and choose a current accessible program.');
    return programPin(record);
  }
  function checkedProgram(value,pin) {
    if (!value || value.id!==pin.recordId || value.orgId!==org || value.moduleId!=='programs' || value.data?.kind!=='program' || value.deletedAt || !same(programPin(value),pin)) refuse('The server program snapshot differs from the selected current pin.');
  }
  function showLocalSelection() {
    if (!bytes || !project.value || !milestone.value) { sourceHost.replaceChildren(); return null; }
    const result = inspectIncubatorNativeValue(bytes, { adapter:ADAPTER, selection:{ projectId:project.value, milestoneId:milestone.value } });
    sourceHost.replaceChildren(node('p', { class:'notice neutral' }, 'Local file admission only. No server inspection or account authority yet. The milestone’s free-text project reference does not choose its parent.'), json('Exact selected rows and all five context fields', result), node('p', {}, 'The two saved IDs and an explicit relationship reason are required even when visible titles match.'));
    return result;
  }
  const clearAuthority = (source = false) => { if (!current() || intent) return; review.checked = false; change(source); };
  for (const value of [title,deliverable,milestoneTitle,milestoneDeliverable,relationship,reason]) value.addEventListener('input', () => clearAuthority());
  for (const value of [project,milestone]) value.addEventListener('change', () => {
    if (!current() || intent) return;
    privacy.checked = false; clearAuthority(true);
    try { showLocalSelection(); } catch (error) { sourceHost.replaceChildren(); say(error.message, true); }
  });
  for (const value of [program,privacy,duplicate]) value.addEventListener('change', () => { if (current() && !intent) clearAuthority(true); });
  mode.addEventListener('change', () => { if (!current() || intent) return; clearAuthority(true); sourceHost.replaceChildren(); say('Action changed. Read the exact history or inspect the original file before previewing.'); });
  bindingChoice.addEventListener('change', () => { if (!current() || intent) return; binding = null; historyHost.replaceChildren(); clearAuthority(true); });
  recoveredChoice.addEventListener('change', () => { if (!current() || intent) return; recovered = null; historyHost.replaceChildren(); clearAuthority(true); });
  review.addEventListener('change', sync);
  // Clear before opening: a same-path native selection must produce a new change.
  file.addEventListener('click', () => { if (!current() || intent) return; fileSerial++; privacy.checked = false; review.checked = false; invalidate(); file.value = ''; });
  file.addEventListener('cancel', () => { if (!current() || intent) return; fileSerial++; invalidate(); say('File choice cancelled. Existing writing and the previously admitted file are kept; inspect explicitly again.'); });
  file.addEventListener('change', async () => {
    if (!current() || intent) return;
    invalidate(); privacy.checked = false; review.checked = false;
    const token = generation, serial = ++fileSerial, chosen = file.files?.[0];
    if (!chosen) { say('No file replaced. Existing writing is kept; inspect explicitly again.'); return; }
    busy = true; sync();
    try {
      if (!Number.isInteger(chosen.size) || chosen.size < 1 || chosen.size > 8000000) refuse('Choose a native JSON file from 1 to 8,000,000 bytes.');
      const incoming = new Uint8Array(await chosen.arrayBuffer()); assertCurrent(token);
      if (serial !== fileSerial || file.files?.[0] !== chosen || incoming.length !== chosen.size) return;
      const listed = listIncubatorNativeSelections(incoming, { adapter:ADAPTER });
      let discardWriting = false;
      if (bytes && dirty && !sameBytes(bytes,incoming)) {
        const okay = await confirmDiscard(); assertCurrent(token);
        if (serial !== fileSerial || file.files?.[0] !== chosen) return;
        if (!okay) { say('New source was not selected. Your previous file and literal writing are kept.'); return; }
        discardWriting = true;
      }
      bytes = incoming;
      choices(project, listed.projects.map(row => [row.id, `${row.id} — ${row.title || 'Untitled / unknown'}`]), 'Choose one saved project');
      choices(milestone, listed.milestones.map(row => [row.id, `${row.id} — ${row.title || 'Untitled / unknown'}`]), 'Choose one saved milestone');
      privacy.checked = false; sourceHost.replaceChildren();
      if (discardWriting) { for (const input of [title,deliverable,milestoneTitle,milestoneDeliverable,reason]) input.value = ''; relationship.checked = false; }
      dirty = true; onDirty(true);
      say(discardWriting?'Complete new native file admitted locally. Prior writing was discarded after your confirmation; author this new mapping explicitly.':'Complete native file admitted locally. Choose both exact saved IDs. Existing authored writing has not been replaced.');
    } catch (error) { if (current() && token === generation && serial === fileSerial) say(error.message || 'The original file could not be read. Existing writing is kept.', true); }
    finally { if (current() && token === generation && serial === fileSerial) { busy = false; sync(); } }
  });
  function sameBytes(a,b) { if (a.length!==b.length) return false; for (let i=0;i<a.length;i++) if (a[i]!==b[i]) return false; return true; }
  async function loadList(kind, more, token) {
    const recoveredMode = kind === 'recovered', cursor = more ? (recoveredMode ? recoveredCursor : liveCursor) : null;
    if (more && !cursor) refuse('There is no next history page.');
    const result = await call(recoveredMode ? 'incubatorRecovered' : 'incubatorBindings',[org,cursor],token);
    if (!Array.isArray(result.bindings) || result.bindings.length > 20 || !(result.nextCursor === null || typeof result.nextCursor === 'string')) refuse('The history page is incomplete.');
    for (const value of result.bindings) if (!headPin(value.head) || !id(value.programId) || value.originMode !== (recoveredMode ? 'recovered' : 'live') || (!recoveredMode && value.originOrgId !== org)) refuse('The history page identity is incomplete.');
    if (recoveredMode) { recoveredSummaries = [...(more ? recoveredSummaries : []),...result.bindings]; recoveredCursor = result.nextCursor; choices(recoveredChoice,recoveredSummaries.map(row=>[row.head.sha256,`${row.originOrgId} / ${row.bindingId} / event ${row.head.sequence}`]),'Choose an inactive historical head'); }
    else { summaries = [...(more ? summaries : []),...result.bindings]; liveCursor = result.nextCursor; choices(bindingChoice,summaries.map(row=>[row.bindingId,`${row.bindingId} / ${row.programId} / event ${row.head.sequence}`]),'Choose a live history'); }
  }
  const load = button('Load current programs and histories', async token => {
    inspection = null; preview = null; previewHost.replaceChildren(); review.checked = false;
    binding = null; recovered = null; sourceHost.replaceChildren(); historyHost.replaceChildren();
    const rows = []; let cursor = null; const seen = new Set();
    for (let page=0;page<100;page++) {
      const result = await call('records',[org,'programs',cursor],token);
      if (!Array.isArray(result.records)) refuse('The program list is incomplete.');
      rows.push(...result.records); const next = result.cursor ?? null;
      if (!next) break;
      if (seen.has(next) || page === 99) refuse('The program list could not be completed.'); seen.add(next); cursor = next;
    }
    programs = rows.filter(row => row.orgId === org && row.moduleId === 'programs' && row.data?.kind === 'program' && !row.deletedAt && id(row.id) && Number.isInteger(row.revision) && row.revision > 0);
    choices(program,programs.map(row=>[row.id,`${row.data.title} — ${row.id}, revision ${row.revision}`]),'Choose a current program');
    await loadList('live',false,token);
    if (administrator) await loadList('recovered',false,token);
    say('Current accessible planning programs and history summaries loaded. Draft programs may be used; no approval is imported.');
  }, 'load');
  async function readHistory(historical, token, requested = null) {
    inspection = null; preview = null; previewHost.replaceChildren(); review.checked = false;
    sourceHost.replaceChildren(); historyHost.replaceChildren();
    if (historical) recovered = null; else binding = null;
    const key = requested ?? (historical ? recoveredChoice.value : bindingChoice.value);
    if (!key) refuse('Choose an exact history first.');
    const result = await call(historical ? 'incubatorRecoveredHead' : 'incubatorBinding',[org,key],token);
    if (!headPin(result.binding?.head) || result.binding.originMode !== (historical?'recovered':'live') ||
        (historical ? result.binding.head.sha256 !== key : result.binding.bindingId !== key || result.binding.originOrgId !== org) ||
        !Array.isArray(result.events) || result.events.length > 8 || !Array.isArray(result.nativeSources) || result.nativeSources.length > 8 || result.nextCursor !== null)
      refuse('The complete history identity is incomplete.');
    checkedSource(result.source);
    if (!same(sourcePin(result.source),result.binding.source)) refuse('The history source pin differs.');
    if (historical) recovered = result;
    else {
      binding = result;
      if (!summaries.some(row=>row.bindingId===key)) summaries.push(result.binding);
      choices(bindingChoice,summaries.map(row=>[row.bindingId,`${row.bindingId} / ${row.programId} / event ${row.head.sequence}`]),'Choose a live history',key);
    }
    historyHost.replaceChildren(node('p',{class:'notice neutral'},historical?'Inactive historical material. Original accounts, commands and approvals are not current authority.':'Original created fields are historical. Ordinary records may now be edited, in trash or unavailable.'),json('Exact selected source',result.source),json('Native captures and complete event history',result),
      ...result.events.flatMap(entry => (entry.event?.candidates ?? []).filter(row=>id(row.id)).map(row => node('p',{},node('a',{href:`#module/projects/${row.id}`},`Open ordinary ${row.data?.kind || 'planning'} record ${row.id}`)))));
    say(historical?'Historical source read. Select adoption, a current program and fresh authored mapping. The original full native file is not present.':'Current history read. Refresh-copy requires the same two saved IDs and makes two additional planned records.');
  }
  const read = button('Read selected live history',token=>readHistory(false,token),'read-history');
  const readRecovered = button('Read selected inactive history',token=>readHistory(true,token),'read-recovered');
  const inspect = button('Inspect complete file on server', async token => {
    if (!bytes || !privacy.checked) refuse('Choose a complete original file and acknowledge its transmission and selected retention.');
    const local = showLocalSelection(); if (!local) refuse('Choose both exact saved IDs.');
    const pin = selectedProgram();
    let target;
    if (mode.value === 'new') target = { kind:'new', program:pin, duplicatePolicy:duplicate.checked?'create-separate-copy':'refuse' };
    else if (mode.value === 'refresh') {
      if (!binding || binding.binding.bindingId !== bindingChoice.value || binding.binding.programId !== pin.recordId || !same(binding.binding.selection,local.selection)) refuse('Read the current live history and choose its program and the same two saved IDs.');
      target = { kind:'refresh', program:pin, head:binding.binding.head };
    } else refuse('Historical adoption does not inspect a missing full file.');
    const metadata = { version:1, adapter:ADAPTER, selection:local.selection, target };
    const result = await call('inspectIncubatorSource',[org,metadata,bytes],token);
    checkedSource(result.source);
    if (!id(result.inspectionId) || !instant(result.expiresAt) || !['changed','unchanged'].includes(result.state) || typeof result.canPreview !== 'boolean' || !Array.isArray(result.duplicates) || !result.duplicates.every(headPin) ||
        !same(result.target,target) || !same(result.program?.pin,pin) || result.source.originalBytes !== local.originalBytes || result.source.originalSha256 !== local.originalSha256 || !same(result.source.selected,local.selected)) refuse('The inspection response did not match the chosen source and target. Inspect explicitly again.');
    checkedProgram(result.program.record,pin);
    inspection = result;
    sourceHost.replaceChildren(json('Server-retained selected source, current program and duplicate warning',result),node('p',{class:'notice neutral'},result.state==='unchanged'?'This complete file is already a local native capture. No further copied pair can be previewed.':result.duplicates.length?'An existing copy matches this original file and program. Creating a separate copy requires the explicit checkbox and a new inspection.':'This is a selected-only source capture, not a complete notebook backup.'));
    if (mode.value==='refresh' && binding && result.state==='changed' && same(result.source.selected,binding.source.selected)) sourceHost.append(node('p',{class:'notice'},'The complete file was revalidated, but the selected rows and context are unchanged. Refresh-copy still deliberately creates two additional planned records.'));
    for (const duplicateHead of result.duplicates) sourceHost.append(button(`Read matching live history ${duplicateHead.bindingId}`,next=>readHistory(false,next,duplicateHead.bindingId),'read-duplicate'));
    say(result.canPreview?'Source inspected. Author both target titles, optional completion conditions and the explicit relationship, then preview.':'Inspection created no ordinary records. Review the unchanged or duplicate notice.');
  },'inspect');
  const previewButton = button('Preview exactly two planned records',async token=>{
    const authored = mapping();
    if (!authored.project.title.trim() || !authored.milestone.title.trim() || !authored.relationship.confirmed || !authored.relationship.reason.trim()) refuse('Author both titles and explicitly confirm the selected relationship with a reason.');
    let expectedSource, pin = selectedProgram(), operation, result;
    if (mode.value === 'adopt') {
      if (!administrator || !recovered || recovered.binding.head.sha256 !== recoveredChoice.value) refuse('Read the exact inactive historical head first.');
      expectedSource = recovered.source; operation = 'adopt';
      result = await call('previewIncubatorAdoption',[org,{recoveredHead:recovered.binding.head,source:sourcePin(expectedSource),program:pin,mapping:authored}],token);
    } else {
      if (!inspection || !inspection.canPreview || !same(inspection.program.pin,pin)) refuse('Inspect this exact complete file, selection and program before previewing.');
      expectedSource = inspection.source; operation = mode.value === 'refresh'?'refresh-copy':'copy';
      result = await call('previewIncubatorCopy',[org,{mode:operation,inspectionId:inspection.inspectionId,mapping:authored}],token);
    }
    const plan = result.plan;
    if (!id(result.previewId) || !hash(result.reviewSha256) || !instant(result.expiresAt) || !plan || plan.operation !== operation || !same(plan.source,expectedSource) || !same(plan.program?.pin,pin) || !same(plan.mapping,authored) || !Array.isArray(plan.candidates) || plan.candidates.length !== 2 || typeof plan.warning !== 'string') refuse('The outgoing preview did not match this exact authored operation.');
    const [a,b] = plan.candidates;
    checkedProgram(plan.program.record,pin);
    if (!id(a.id) || !id(b.id) || a.id===b.id || a.data?.kind!=='project' || b.data?.kind!=='milestone' || b.data.projectId!==a.id || a.data.projectId!==null ||
        plan.candidates.some(row=>row.moduleId!=='projects' || row.status!=='planned' || row.revision!==1 || row.data.programId!==pin.recordId || row.approval!==null || row.snapshot!==null || row.source!==null || !id(row.ownerId) || row.ownerId!==actorId || row.lastEditedBy!==row.ownerId || !Array.isArray(row.data.dependencyIds) || row.data.dependencyIds.length || row.data.dueAt!==null || row.data.timeZone!==null || row.data.effortMinutes!==null || row.data.priority!=='normal' || row.data.recurrence!=='none') || a.ownerId!==b.ownerId) refuse('The outgoing pair is not the two distinct ordinary planned records.');
    if (operation==='refresh-copy' && !same(plan.head,binding.binding.head) || operation!=='refresh-copy' && plan.head!==null || operation==='adopt' && (!plan.historicalSource || !same(plan.recoveredHead,recovered.binding.head))) refuse('The outgoing lineage differs from the selected current or recovered history.');
    preview = structuredClone(result); review.checked = false;
    previewHost.replaceChildren(panel('Review the exact outgoing copy',node('p',{class:'notice'},plan.warning),node('p',{},'Both records begin planned and belong to the acting account. No source status, dates, owner prose, consent or approval is imported. Later ordinary approval can make authored target fields visible through ordinary readers.'),node('p',{},`Server expiry: ${result.expiresAt}. The server rechecks expiry and current access at commit.`),json('Every source, program, mapping and normalized candidate field',result),field('I reviewed this exact two-record outgoing plan',review),commit));
    say('Exact server preview ready. Compare original source strings with normalized target fields. Acknowledge this outgoing plan to enable Commit.');
  },'preview-copy');
  function validateCommit(result, owned) {
    if (!['created','already-committed'].includes(result?.kind) || !instant(result.result?.acceptedAt) || !headPin(result.result.head) || !Array.isArray(result.result.created) || result.result.created.length!==2 || !Array.isArray(result.currentDisposition) || result.currentDisposition.length!==2) refuse('The commit response was incomplete. Result unknown; Retry this exact command.');
    const expected = owned.preview.plan.candidates.map(row=>({id:row.id,moduleId:'projects',revision:1,status:'planned',dataSha256:incubatorHash('candidate-data',row.data)}));
    if (!same(expected,result.result.created) || result.result.head.originOrgId!==org || result.result.head.sequence!==(owned.preview.plan.head?.sequence??0)+1 ||
        owned.preview.plan.operation!=='adopt' && result.result.head.bindingId!==owned.preview.plan.source.bindingId ||
        result.currentDisposition.some((row,index)=>row.id!==expected[index].id || row.moduleId!=='projects' || !['original','modified','trash','unavailable'].includes(row.disposition))) refuse('The commit receipt did not identify the exact reviewed pair. Result unknown; Retry this exact command.');
  }
  async function sendCommit(token) {
    const owned = intent;
    try {
      const result = await call('commitIncubatorCopy',[org,owned.request],token);
      try { validateCommit(result,owned); } catch (error) { owned.uncertain = true; throw error; }
      if (intent!==owned) return;
      intent = null; preview = null; inspection = null; previewHost.replaceChildren(); review.checked = false;
      savedHost.replaceChildren(panel('Accepted original pair',node('p',{},result.kind==='already-committed'?'This exact command was already accepted. Retry created no new pair.':'Two planned records were accepted. Original source and created fields remain in history.'),json('Original durable result and separate current disposition',result),result.result.created.map((row,index)=>node('p',{},node('a',{href:`#module/projects/${row.id}`},`Open ordinary ${index===0?'project':'milestone'} ${row.id}`)))));
      dirty = false; onDirty(false);
      try { onChanged(); say('Accepted receipt verified. Ordinary editors and current history remain separate from the original result.'); }
      catch { say('Accepted receipt verified. The ordinary navigation refresh failed; the saved original result is kept. Refresh the ordinary list explicitly.',true); }
    } catch (error) {
      if (intent===owned) {
        if (error.name==='AbortError' || !error.status || error.status>=500 || error.code==='invalid_response') owned.uncertain = true;
        if (!owned.uncertain) intent = null;
        if (owned.uncertain && current() && token===generation) say('Result unknown. The exact command is kept in this page. Retry it deliberately; later rejection does not permit a fresh command. Read authorized history for reconciliation.',true);
      }
      throw error;
    }
  }
  const commit = button('Commit reviewed pair',async token=>{
    if (!preview || !review.checked) refuse('Review and acknowledge the exact current outgoing pair first.');
    const key = makeCommandKey(); if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(key)) refuse('A valid command identity could not be created.');
    intent = { request:{previewId:preview.previewId,reviewSha256:preview.reviewSha256,commandKey:key},preview:structuredClone(preview),uncertain:false }; sync(); await sendCommit(token);
  },'commit');
  const retry = button('Retry this exact command',token=>{ if (!intent) refuse('There is no pending command in this page.'); return sendCommit(token); },'retry',true);
  const sourceForm = node('form',{'data-incubator':'source-form',onsubmit:event=>event.preventDefault()},field('Deliberate copy action',mode),field('Current destination program',program),field('Live source history for refresh-copy',bindingChoice),read,
    ...(administrator?[field('Inactive recovered head for adoption',recoveredChoice),readRecovered]:[]),field('Original complete Incubator v1 JSON file',file),field('Exact saved project ID',project),field('Exact saved milestone ID',milestone),
    node('p',{class:'notice'},'This sends the complete file to the workspace server for transient validation. After successful inspection, the selected project, selected milestone and all five context fields are retained for authorized staff in this program. Unselected rows are not kept in history or backups.'),
    field('I understand complete-file transmission and selected-only retention',privacy,'No filename is sent. Temporary upload chunks are removed after successful inspection or expire; a failed request does not promise immediate deletion.'),
    field('Create a separate copy if the same source and program already exist',duplicate,'This deliberately permits a new binding and two extra planned records. It does not merge histories or change an old pair.'),inspect);
  const mappingForm = node('form',{'data-incubator':'mapping-form',onsubmit:event=>event.preventDefault()},field('Authored project title (180 characters maximum)',title),field('Project completion condition (optional, 4,000 characters maximum)',deliverable),field('Authored milestone title (180 characters maximum)',milestoneTitle),field('Milestone completion condition (optional, 4,000 characters maximum)',milestoneDeliverable),field('I deliberately make this selected milestone a child of this selected project',relationship),field('Why these two selected rows belong together (2,000 characters maximum)',reason),previewButton);
  body.append(panel('Current planning context',load,button('More live histories',token=>loadList('live',true,token),'more-history'),...(administrator?[button('More inactive histories',token=>loadList('recovered',true,token),'more-recovered')]:[]),node('p',{},node('a',{href:'https://charitology.org/programs/charity-incubator/',target:'_blank',rel:'noopener noreferrer'},'Open the native Incubator desk'))),panel('Original source and deliberate destination',sourceForm,sourceHost),panel('Author the two target plans',mappingForm),previewHost,panel('Pending command reconciliation',retry,node('p',{},'An uncertain command blocks a new copy. Retry retains its exact request even after a later refusal. Reload clears page memory; use authorized saved history to reconcile before starting another copy.'),node('a',{href:'#incubator',target:'_blank',rel:'noopener noreferrer'},'Read authorized Incubator history in a separate tab')),savedHost,panel('Source history and ordinary records',historyHost,node('a',{href:'#module/projects'},'Open Projects and milestones'),node('p',{},node('a',{href:'#data'},'Open full workspace backup and inactive restore'))));
  function clearPrivate() {
    invalidate(); fileSerial++; bytes = null; programs = []; summaries = []; recoveredSummaries = []; binding = null; recovered = null; intent = null; preview = null;
    for (const value of controls) { if (value.tagName==='INPUT' && value.getAttribute('type')==='checkbox') value.checked = false; else value.value = ''; }
    body.replaceChildren(node('p',{class:'notice'},'Private source and command authority were cleared on leaving this page. Reopen Incubator plans from navigation to load current authority.'),node('a',{href:'#home'},'Return to the workspace'));
    status.textContent = ''; dirty = false; onDirty(false);
  }
  const onPageHide = () => { clearPrivate(); hidden = true; };
  globalThis.window?.addEventListener('pagehide',onPageHide);
  root.invalidate = invalidate;
  root.dispose = () => { if (disposed) return; clearPrivate(); disposed = true; globalThis.window?.removeEventListener('pagehide',onPageHide); };
  root.isDirty = () => dirty || !!intent;
  sync(); return root;
}
