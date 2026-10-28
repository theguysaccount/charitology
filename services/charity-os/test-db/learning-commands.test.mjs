import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { getMigrations } from 'better-auth/db/migration';
import { magicLink } from 'better-auth/plugins/magic-link';
import { database } from '../lib/database.mjs';
import { applicationGrantsSql } from '../lib/migration-grants.mjs';
import { createHandler } from '../lib/handler.mjs';
import { csrf } from '../lib/security.mjs';
import { getModule } from '../lib/modules.mjs';
import { workingPin } from '../lib/learning-model.mjs';
import { learningNativeToC, learningMappedFixture } from '../test/learning-fixtures.mjs';
import { commitLearningCommand } from '../lib/learning-commands.mjs';
import { currentLearningMember } from '../lib/learning-access.mjs';

const configured = !!(process.env.DATABASE_URL && process.env.OS_DATABASE_URL);
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const direct = value => { const u = new URL(value); u.hostname = u.hostname.replace(/-pooler(?=\.)/, ''); return u.toString(); };
const settings = { origin: 'https://os.example.invalid', secret: 'fictional-learning-command-secret-more-than-thirty-two-characters', production: false, encryptionKey: 'fictional-unused-key' };
const org = 'fictional-learning-commands', destination = 'fictional-learning-restored';
const author = 'fictional-learning-author', reviewer = 'fictional-learning-reviewer';
const actors = [author, reviewer, ...['owner','program_lead','grants_lead','finance_reviewer','contributor','board_reader','external_reviewer'].map(role => 'fictional-learning-' + role)];
const sessions = new Map(actors.map(user => [user, { user: { id: user, email: user + '@example.invalid', emailVerified: true }, session: { id: 'fictional-session-' + user } }]));
const enc = value => new TextEncoder().encode(JSON.stringify(value));

// Real migrated Better Auth tables and constrained PostgreSQL are used. The
// handler's initial getSession is deliberately a fixed fictional identity so
// post-lock SQL session/membership rechecks can be tested against stale auth.
// Browser cookies/native Save and actual magic-link sign-in remain runtime/browser evidence.
test('actual learning commands: native mapping, ordinary approvals, repeated points, corrections, reports, Retry and inactive full restore', {
  skip: configured ? false : 'Set private owner and constrained URLs for an isolated schema.', timeout: 900000,
}, async t => {
  const nonprofitOnly = process.env.OS_LEARNING_COMMAND_SLICE === 'nonprofit';
  const journey = (name, fn) => t.test(name, { skip: nonprofitOnly ? 'Focused nonprofit adapter rerun; full journey is the default.' : false }, fn);
  const schema = 'os_learning_commands_' + randomBytes(8).toString('hex');
  const owner = database(direct(process.env.DATABASE_URL));
  let migration, db, writerStarted = null;
  const tx = (fn, organization = org, user = author, lock = true) => db.tx(user, organization, fn, { lock });
  const counts = async (organization = org) => tx(async c => (await c.query("SELECT (SELECT count(*) FROM os_records WHERE org_id=$1) AS records,(SELECT count(*) FROM os_events WHERE org_id=$1) AS audits,(SELECT count(*) FROM os_reports WHERE org_id=$1) AS reports,(SELECT count(*) FROM os_learning_history WHERE org_id=$1) AS history", [organization])).rows[0], organization);
  const handles = new Map();
  let requestCount = 0;
  async function call(tail, { method = 'GET', body, form, user = author, organization = org, expect = 200, omitCsrf = false, rawPath } = {}) {
    const session = sessions.get(user);
    if (!handles.has(user)) {
      const observed = { ...db, tx(actor, organization, fn, options) { if (options?.lock && writerStarted) { const ready = writerStarted; writerStarted = null; ready(); } return db.tx(actor, organization, fn, options); } };
      handles.set(user, createHandler({ settings, db: observed, auth: { api: { getSession: async () => session } }, send: async () => { throw new Error('No mail/provider transport is permitted in learning command tests.'); } }));
    }
    const path = rawPath || `/api/orgs/${organization}/${tail}`;
    const headers = { 'x-forwarded-for': '198.51.100.86' };
    if (method !== 'GET') { headers.origin = settings.origin; if (!omitCsrf) headers['x-csrf-token'] = csrf(session.session.id, settings.secret); if (!form) headers['content-type'] = 'application/json'; }
    const response = await handles.get(user)(new Request(settings.origin + path, { method, headers, ...(method === 'GET' ? {} : { body: form || JSON.stringify(body) }) }));
    const data = await response.json(); requestCount++;
    assert.equal(response.status, expect, `${method} ${tail}: ${response.status} ${data.code || ''} ${data.message || ''}`);
    return data;
  }
  const post = (tail, body, options = {}) => call(tail, { method: 'POST', body, ...options });
  const recordPath = (module, id) => `modules/${module}/records/${id}`;
  async function ordinaryRecord(module, data, options = {}) { return (await post(`modules/${module}/records`, { data }, options)).record; }
  async function approveFinal(moduleId, record, finalState, options = {}) {
    const workflow = getModule(moduleId).workflow;
    while (record.status !== finalState) {
      const transitions = workflow.transitions.filter(edge => edge.from === record.status);
      const edge = transitions[0]; assert.ok(edge, `Path from ${record.status} to ${finalState}`);
      if (edge.requiresApproval && record.approval?.revision !== record.revision) record = (await post(recordPath(moduleId, record.id) + '/approve', { revision: record.revision, reason: 'Fictional separate-account ordinary review' }, { user: reviewer, ...options })).record;
      record = (await post(recordPath(moduleId, record.id) + '/transition', { revision: record.revision, to: edge.to, reason: 'Fictional ordinary workflow progression' }, { user: reviewer, ...options })).record;
    }
    record = (await post(recordPath(moduleId, record.id) + '/approve', { revision: record.revision, reason: 'Fictional independent approval of exact final state' }, { user: reviewer, ...options })).record;
    const resolution = (await call(`learning/records/${record.id}/approval`, options)).resolution;
    assert.equal(resolution.eligibility.eligible, true, JSON.stringify(resolution.eligibility));
    assert.equal(resolution.evidence.approvalEvent.action, 'record.approved');
    assert.equal(typeof resolution.pin.approvalEventId, 'string');
    assert.equal(resolution.record.status, finalState);
    return { record, pin: resolution.pin, evidence: resolution.evidence };
  }
  const intent = preview => ({ previewId: preview.previewId, reviewSha256: preview.reviewSha256, commandKey: randomUUID() });
  const commit = (preview, options = {}) => { const input = intent(preview); return post('learning/commit', input, options).then(result => ({ ...result, input })); };
  const mapping = learningMappedFixture().mapping;
  let program, mapped, bindingId, context, definition, protocol, points = [], pointCommands = [], wrong, replacement, decision, frozen, savedReport;
  async function currentContext(organization = org, id = bindingId) {
    const first = await call(`learning/bindings/${id}/context`, { organization });
    const rows = [...first.records], cursors = new Set(); let cursor = first.nextCursor;
    while (cursor) { assert.ok(!cursors.has(cursor)); cursors.add(cursor); const page = await call(`learning/bindings/${id}/context?cursor=${encodeURIComponent(cursor)}`, { organization }); assert.deepEqual(page.binding.head, first.binding.head); rows.push(...page.records); cursor = page.nextCursor; }
    context = { ...first, records: rows }; return context;
  }
  const measurement = (head, value, start, end) => ({ head, mappingEventSha256: mapped.plan.event.sha256, program: program.pin, protocol: protocol.pin, definition: definition.pin, title: `Fictional explicit ${value === null ? 'missing' : value} observation`, value, denominator: null, period: { kind: 'closed-days', startDate: start, endDate: end }, method: 'administrative', evidence: 'self-reported', sourceUrl: null, locator: { kind: 'not-collected' }, missingReason: value === null ? 'Not collected in this fictional period' : null, limitations: 'Fictional software test; no actual observations or causal conclusion' });
  try {
    await owner.pool.query(`CREATE SCHEMA ${quote(schema)}`);
    migration = database(direct(process.env.DATABASE_URL), { schema });
    assert.equal((await migration.pool.query('SELECT current_schema() AS name')).rows[0].name, schema);
    const authMigrations = await getMigrations({ database: migration.pool, rateLimit: { enabled: true, storage: 'database' }, plugins: [magicLink({ storeToken: 'hashed', sendMagicLink: async () => {} })], logger: { disabled: true } });
    assert.doesNotMatch(await authMigrations.compileMigrations(), /(?:"public"\s*\.|\bpublic\s*\.)/i);
    await authMigrations.runMigrations(); await migration.migrate();
    const role = decodeURIComponent(new URL(process.env.OS_DATABASE_URL).username);
    assert.notEqual(role, decodeURIComponent(new URL(process.env.DATABASE_URL).username));
    await migration.pool.query(applicationGrantsSql(role, schema));
    db = database(direct(process.env.OS_DATABASE_URL), { schema });
    for (const [user, session] of sessions) {
      await migration.pool.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$1,$2,true,now(),now())', [user, session.user.email]);
      await migration.pool.query('INSERT INTO "session"(id,token,"userId","expiresAt","createdAt","updatedAt") VALUES($1,$2,$3,now()+interval \'1 day\',now(),now())', [session.session.id, 'fictional-token-' + user, user]);
    }
    for (const organization of [org, destination]) await tx(async c => {
      await c.query("INSERT INTO os_orgs(id,name,slug,currency,time_zone) VALUES($1,'Fictional learning test',$1,'USD','UTC')", [organization]);
      for (const user of actors) await c.query('INSERT INTO os_members(org_id,user_id,role) VALUES($1,$2,$3)', [organization, user, user === author || user === reviewer ? 'admin' : user.slice('fictional-learning-'.length)]);
    }, organization);

    await t.test('real migrated auth tables, constrained role, CSRF and all role boundaries', async () => {
      const permissions = (await db.pool.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0]; assert.deepEqual(permissions, { rolsuper: false, rolbypassrls: false });
      for (const user of actors) await call('learning/bindings', { user, expect: user.endsWith('board_reader') || user.endsWith('external_reviewer') ? 403 : 200 });
      await post('learning/commit', { previewId: 'missing', reviewSha256: 'a'.repeat(64), commandKey: randomUUID() }, { omitCsrf: true, expect: 403 });
      assert.equal((await db.pool.query('SELECT count(*) FROM os_learning_history')).rows[0].count, '0');
    });

    await t.test('actual full native upload maps explicit intent into ordinary unapproved drafts atomically', async () => {
      program = await approveFinal('programs', await ordinaryRecord('programs', { title: 'Fictional access program', kind: 'program', evidence: null }), 'active');
      assert.equal(program.record.data.evidence, null);
      const bytes = enc(learningNativeToC()), body = new FormData();
      body.append('metadata', JSON.stringify({ version: 1, adapter: 'theory-of-change-native-v1', selection: { kind: 'whole-draft' }, target: { kind: 'new', program: workingPin(program.record) } })); body.append('native', new Blob([bytes], { type: 'application/json' }), 'source.json');
      const inspected = await call('learning/source/inspect', { method: 'POST', form: body });
      assert.equal(inspected.source.selected.value.draft.indicators[0].baseline, '0'); assert.equal(inspected.source.selected.value.draft.reviewDate, '2026-02-30');
      assert.equal((await counts()).history, '0', 'Inspection retains only an expiring proposal.');
      mapped = await post('learning/mapping/preview', { mode: 'new', inspectionId: inspected.inspectionId, program: workingPin(program.record), mapping });
      assert.equal(mapped.plan.candidates.length, 2); assert.ok(mapped.plan.candidates.every(record => record.status === 'draft' && record.revision === 1));
      const committed = await commit(mapped); bindingId = committed.result.head.bindingId;
      assert.equal(committed.result.outcome, 'mapped'); assert.equal(committed.result.records.length, 2);
      await currentContext(); assert.deepEqual(context.binding.head, committed.result.head); assert.equal(context.source.originalBytes, bytes.length);
      assert.ok(context.records.every(resolution => resolution.pin === null && resolution.eligibility.eligible === false));
      definition = await approveFinal('outcomes', (await call(recordPath('outcomes', committed.result.records[0].recordId))).record, 'approved');
      protocol = await approveFinal('evaluation', (await call(recordPath('evaluation', committed.result.records[1].recordId))).record, 'registered');
    });

    await journey('three actual periods retain known zero, missing and nonzero without overwriting', async () => {
      for (const [value, start, end] of [[0, '2026-01-01', '2026-01-07'], [null, '2026-01-08', '2026-01-14'], [7, '2026-01-15', '2026-01-21']]) {
        const ctx = await currentContext(), input = measurement(ctx.binding.head, value, start, end);
        const preview = await post('learning/measurements/preview', { kind: 'measurement', input });
        const saved = await commit(preview); pointCommands.push(saved.input);
        const approved = await approveFinal('outcomes', (await call(recordPath('outcomes', saved.result.records[0].recordId))).record, 'included'); points.push(approved);
        assert.equal(approved.record.data.value, value); assert.equal(approved.record.data.startDate, start); assert.equal(approved.record.data.endDate, end);
      }
      assert.equal(new Set(points.map(point => point.record.id)).size, 3);
      await currentContext();
      const repeat = await post('learning/measurements/preview', { kind: 'measurement', input: measurement(context.binding.head, 1, '2026-01-01', '2026-01-07') });
      assert.ok(repeat.plan.samePeriodRecordIds.includes(points[0].record.id));
      await tx(c => c.query('DELETE FROM os_learning_previews WHERE org_id=$1 AND id=$2', [org, repeat.previewId]));
    });

    await journey('wrong correction abandonment, explicit trash and independently approved effective replacement', async () => {
      let ctx=await currentContext();
      const wrongPreview=await post('learning/measurements/preview',{kind:'correction',input:{measurement:measurement(ctx.binding.head,5,'2026-01-15','2026-01-21'),replaces:points[2].pin,reason:'Question a fictional point'}});
      wrong=await commit(wrongPreview); const wrongId=wrong.result.records[0].recordId;
      await call(recordPath('outcomes',wrongId),{method:'DELETE',body:{revision:1},expect:409});
      ctx=await currentContext();
      await post('learning/corrections/apply/preview',{head:ctx.binding.head,correctionEventSha256:wrongPreview.plan.event.sha256,replacement:{...points[2].pin,recordId:wrongId}},{expect:409});
      const abandon=await post('learning/corrections/abandon/preview',{head:ctx.binding.head,correctionEventSha256:wrongPreview.plan.event.sha256,reason:'Known wrong; deliberately abandon without approval'});
      await commit(abandon);
      await post(recordPath('outcomes',wrongId)+'/approve',{revision:1,reason:'Abandoned candidate must not be approved'},{user:reviewer,expect:409});
      await call(recordPath('outcomes',wrongId),{method:'DELETE',body:{revision:1}});
      assert.equal((await tx(c=>c.query("SELECT count(*) FROM os_events WHERE org_id=$1 AND record_id=$2 AND action='record.approved'",[org,wrongId]))).rows[0].count,'0');
      ctx=await currentContext();
      const correct=await post('learning/measurements/preview',{kind:'correction',input:{measurement:measurement(ctx.binding.head,9,'2026-01-15','2026-01-21'),replaces:points[2].pin,reason:'Fresh explicitly supported fictional replacement'}});
      const candidate=await commit(correct);
      replacement=await approveFinal('outcomes',(await call(recordPath('outcomes',candidate.result.records[0].recordId))).record,'included');
      ctx=await currentContext();
      const apply=await post('learning/corrections/apply/preview',{head:ctx.binding.head,correctionEventSha256:correct.plan.event.sha256,replacement:replacement.pin});
      const accepted=await commit(apply); assert.equal(accepted.result.outcome,'correction-applied'); assert.equal(accepted.result.records[0].recordId,replacement.record.id);
      assert.deepEqual((await post('learning/commit',accepted.input)).result,accepted.result);
    });

    await journey('decision preserves exact discussion pins, explicit rule departure and separately authored feedback',async()=>{
      const ctx=await currentContext();
      const input={head:ctx.binding.head,mappingEventSha256:mapped.plan.event.sha256,program:program.pin,protocol:protocol.pin,
        observations:[points[0].pin,points[1].pin,replacement.pin],discussedDefinitions:[definition.pin],title:'Fictional review decision',action:'modify',
        assessment:{result:'met',explanation:'Explicit fictional qualitative assessment, no threshold extracted',departureReason:'Deliberate staged action differs from continue plan'},
        feedback:{status:'not-collected',summary:'No feedback collected in this fictional test',sourceUrl:null},uncertainty:'Fictional data; no causal conclusion',harms:'Actual harms unknown',followUp:'2026-03-01',noEvidenceReason:null};
      await post('learning/decisions/preview',{...input,assessment:{...input.assessment,departureReason:null}},{expect:422});
      const preview=await post('learning/decisions/preview',input), accepted=await commit(preview);
      decision=await approveFinal('evaluation',(await call(recordPath('evaluation',accepted.result.records[0].recordId))).record,'decided');
      assert.equal(decision.record.data.decision,'modify'); assert.match(decision.record.data.uncertainty,/Deliberate staged action/);
    });

    await journey('read-only report prepare, explicit digest save, normal approval and exact service-owned freeze',async()=>{
      const ctx=await currentContext(), observed=[points[0].pin,points[1].pin,replacement.pin];
      const data={title:'Fictional private learning review',kind:'template',programId:program.record.id,agreementId:null,outcomeIds:observed.map(p=>p.recordId),financeIds:[],receiptIds:[],assemblyMethod:'learning-review-v1',sourceDigest:null,supersedesReportId:null,revisionReason:null,startDate:'2026-01-01',endDate:'2026-01-31',summary:'Fictional selected values; no measured causal effect',missingness:'One value missing; feedback not collected',visibility:'private',issueDate:null};
      let manifest=await ordinaryRecord('reporting',data);
      const selection={head:ctx.binding.head,mappingEventSha256:mapped.plan.event.sha256,program:program.pin,source:ctx.binding.source,protocol:protocol.pin,definitions:[definition.pin],observations:observed,decision:decision.pin,manifestRecordId:manifest.id};
      const before=await counts(), prepared=await post('learning/reports/prepare',{selection,manifestRevision:manifest.revision});
      assert.equal(prepared.requiresSave,true); assert.deepEqual(await counts(),before);
      manifest=(await call(recordPath('reporting',manifest.id),{method:'PATCH',body:{revision:manifest.revision,data:{...manifest.data,sourceDigest:prepared.sourceDigest}}})).record;
      const approved=await approveFinal('reporting',manifest,'approved');
      await post(recordPath('reporting',manifest.id)+'/transition',{revision:approved.record.revision,to:'frozen',reason:'Generic freeze must refuse'},{expect:409});
      const again=await post('learning/reports/prepare',{selection,manifestRevision:approved.record.revision});
      assert.equal(again.sourceDigest,prepared.sourceDigest); assert.equal(again.requiresSave,false); assert.equal(again.requiresApproval,false);
      const preview=await post('learning/reports/preview',{selection,manifest:approved.pin,sourceDigest:prepared.sourceDigest});
      assert.equal(preview.report.audience,'private-staff'); assert.equal(preview.report.selection.selection.observations.length,3);
      assert.ok(preview.report.exclusions.some(row=>row.recordId===points[2].record.id&&row.reason==='replaced'));
      frozen=await commit(preview); assert.equal(frozen.result.outcome,'frozen');
      assert.equal((await call(recordPath('reporting',manifest.id))).record.status,'frozen');
      savedReport=(await call(`learning/reports/${frozen.result.report.id}`)).report; assert.deepEqual(savedReport,preview.report);
      assert.equal(savedReport.feedback.status,'not-collected'); assert.equal(savedReport.assessment.departureReason,'Deliberate staged action differs from continue plan');
      assert.deepEqual((await post('learning/commit',frozen.input)).result,frozen.result);
      assert.ok(!(await call('reports')).reports.some(row=>row.id===savedReport.id));
      assert.deepEqual((await call(`reports/${savedReport.id}`)).report,savedReport);
      for(const role of ['board_reader','external_reviewer','contributor'])await call(`learning/reports/${savedReport.id}`,{user:'fictional-learning-'+role,expect:403});
      await call(recordPath('outcomes',definition.record.id),{user:'fictional-learning-board_reader'});
      await call(recordPath('reporting',manifest.id),{method:'PATCH',body:{revision:frozen.result.records[0].revision,data:{...data,assemblyMethod:null}},expect:409});
    });


    await journey('failure after history insertion rolls back candidates, evidence, receipt and audits before exact Retry',async()=>{
      const ctx=await currentContext();
      const preview=await post('learning/measurements/preview',{kind:'measurement',input:measurement(ctx.binding.head,4,'2026-02-20','2026-02-26')});
      const input=intent(preview), before=await counts(); let interrupted=false;
      await assert.rejects(tx(async c=>{
        const member=await currentLearningMember(c,org,sessions.get(author));
        return commitLearningCommand({query:async(sql,args)=>{
          if(/INSERT INTO os_records/.test(sql)){interrupted=true;throw new Error('Fictional interrupted record acceptance');}
          return c.query(sql,args);
        }},{org,user:author,member,session:sessions.get(author),input});
      }),/Fictional interrupted record acceptance/);
      assert.equal(interrupted,true);assert.deepEqual(await counts(),before);
      const committed=await post('learning/commit',input);assert.equal(committed.kind,'committed');
      const replay=await post('learning/commit',input);assert.equal(replay.kind,'already-committed');assert.deepEqual(replay.result,committed.result);
    });

    let spare;
    await journey('stale tabs, unknown expiry, exact accepted Retry, trash disposition and restore epoch',async()=>{
      const ctx=await currentContext(), input=measurement(ctx.binding.head,2,'2026-02-01','2026-02-07');
      const one=await post('learning/measurements/preview',{kind:'measurement',input});
      const two=await post('learning/measurements/preview',{kind:'measurement',input:{...input,value:3}});
      spare=await commit(one); const before=await counts();
      await post('learning/commit',intent(two),{expect:409}); assert.deepEqual(await counts(),before);
      await tx(c=>c.query('DELETE FROM os_learning_previews WHERE org_id=$1 AND id=$2',[org,two.previewId]));
      assert.deepEqual((await post('learning/commit',spare.input)).result,spare.result);
      await post('learning/commit',{...spare.input,reviewSha256:'0'.repeat(64)},{expect:409});
      const expired=await post('learning/measurements/preview',{kind:'measurement',input:measurement(spare.result.head,4,'2026-02-08','2026-02-14')});
      await tx(c=>c.query("UPDATE os_learning_previews SET expires_at=clock_timestamp()-interval '1 second' WHERE org_id=$1 AND id=$2",[org,expired.previewId]));
      await post('learning/commit',intent(expired),{expect:409}); assert.deepEqual(await counts(),before);
      const id=spare.result.records[0].recordId;
      await call(recordPath('outcomes',id),{method:'DELETE',body:{revision:1}});
      const replay=await post('learning/commit',spare.input); assert.equal(replay.kind,'already-committed'); assert.equal(replay.disposition,'trash');
      await post(recordPath('outcomes',id)+'/restore',{revision:2}); await post('learning/commit',spare.input,{expect:409});
      assert.equal((await tx(c=>c.query("SELECT count(*) FROM os_learning_history WHERE org_id=$1 AND row_kind='event' AND payload#>>'{payload,record,recordId}'=$2",[org,id]))).rows[0].count,'1');
    });

    await journey('session expires after precheck while waiting for writer lock; current scope and incarnation block replay',async()=>{
      const ctx=await currentContext(), held=await migration.pool.connect();
      const started=new Promise(resolve=>{writerStarted=resolve;});
      try{
        await held.query('BEGIN'); await held.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[org]);
        const pending=post('learning/measurements/preview',{kind:'measurement',input:measurement(ctx.binding.head,1,'2026-03-01','2026-03-07')},{expect:401});
        await started; await migration.pool.query('UPDATE "session" SET "expiresAt"=now()-interval \'1 second\' WHERE id=$1',[sessions.get(author).session.id]);
        await held.query('COMMIT'); await pending;
      }finally{writerStarted=null;await held.query('ROLLBACK').catch(()=>{});held.release();await migration.pool.query('UPDATE "session" SET "expiresAt"=now()+interval \'1 day\' WHERE id=$1',[sessions.get(author).session.id]);}
      await tx(c=>c.query("UPDATE os_members SET program_ids='[\"outside-current-scope\"]'::jsonb,revision=revision+1 WHERE org_id=$1 AND user_id=$2",[org,author]));
      await call(`learning/reports/${savedReport.id}`,{expect:404});await post('learning/commit',frozen.input,{expect:404});
      await tx(c=>c.query("UPDATE os_members SET program_ids='[]'::jsonb,revision=revision+1 WHERE org_id=$1 AND user_id=$2",[org,author]));
      await post('learning/commit',frozen.input,{expect:409});await call(`learning/bindings/${bindingId}/context`,{organization:destination,expect:404});
    });


    await t.test('full nonprofit native bytes pass the same server upload and explicit selected-row mapping flow',async()=>{
      const native={version:1,program:'nonprofit-advisory',updated:'2026-10-27T00:00:00.000Z',context:{name:'Fictional checkpoint',activity:'',decision:'',change:'Access',baseline:'0',capacity:'',voice:'',privacy:'Fictional only',period:''},records:{diagnostics:[],evidence:[],actions:[],learning:[
        {id:'checkpoint-selected',values:{title:'Selected fictional checkpoint',outcome:'Access',method:'Narrative description',rule:'Review access',feedback:'Ask about barriers',result:'Not collected',date:'',status:'Draft'}},
        {id:'checkpoint-unselected',values:{title:'Valid unretained native text \u0000',outcome:'Unknown',method:'Unknown',rule:'Unknown',feedback:'Unknown',result:'Unknown',date:'',status:'Draft'}}],readiness:[]}};
      const bytes=enc(native), form=new FormData();
      form.append('metadata',JSON.stringify({version:1,adapter:'nonprofit-learning-native-v1',selection:{kind:'learning-row',recordId:'checkpoint-selected'},target:{kind:'new',program:workingPin(program.record)}}));form.append('native',new Blob([bytes],{type:'application/json'}),'source.json');
      const inspected=await call('learning/source/inspect',{method:'POST',form});
      assert.equal(inspected.retainedScope,'context-and-one-learning-row');assert.equal(inspected.source.originalSha256,createHash('sha256').update(bytes).digest('hex'));
      assert.equal(Object.keys(inspected.source.selected.value.context).length,9);assert.equal(inspected.source.selected.value.learning.id,'checkpoint-selected');assert.ok(!JSON.stringify(inspected.source).includes('checkpoint-unselected'));
      const np=structuredClone(mapping);np.basis.intendedOutcome={disposition:'adopted',sourceFields:['np.learning.outcome'],text:'Access',reason:null};np.basis.rule.basis={disposition:'adopted',sourceFields:['np.learning.rule'],text:'Review access',reason:null};np.basis.feedback={disposition:'adopted',sourceFields:['np.learning.feedback'],text:'Ask about barriers',reason:null};np.indicators[0].origin={kind:'learning-checkpoint'};
      const preview=await post('learning/mapping/preview',{mode:'new',inspectionId:inspected.inspectionId,program:workingPin(program.record),mapping:np});
      assert.ok(preview.plan.candidates.every(row=>row.status==='draft'&&row.data.kind!=='observation'));await commit(preview);
      if(savedReport)assert.deepEqual((await call(`learning/reports/${savedReport.id}`)).report,savedReport);
    });

    await journey('full HTTP backup export/restore retains one report copy, inactive provenance and explicit fresh adoption',async()=>{
      const backup=await call('export');assert.equal(backup.learningBridge.reports.length,1);assert.deepEqual(backup.learningBridge.reports[0],savedReport);
      assert.ok(!backup.reports.some(row=>row.payload?.kind==='learning-review'));assert.ok(!JSON.stringify(backup.learningBridge).includes('commandKey'));
      const prepared=await post('import/preview',{backup},{organization:destination});assert.equal(prepared.issues.length,0,JSON.stringify(prepared.issues));
      await post('import/commit',{previewId:prepared.previewId,checksum:prepared.checksum},{organization:destination});
      const recovered=await call('learning/recovered',{organization:destination});assert.equal(recovered.bindings.length,2);
      const historicalBinding=recovered.bindings.find(binding=>binding.bindingId===bindingId);assert.ok(historicalBinding);assert.equal(historicalBinding.originMode,'recovered');assert.equal(historicalBinding.disposition,'historical-only');
      assert.equal((await tx(c=>c.query('SELECT count(*) FROM os_reports WHERE org_id=$1',[destination]),destination)).rows[0].count,'0');
      assert.equal((await tx(c=>c.query('SELECT count(*) FROM os_learning_history WHERE org_id=$1 AND receipt IS NOT NULL',[destination]),destination)).rows[0].count,'0');
      await call(`learning/reports/${savedReport.id}`,{organization:destination,expect:404});
      const historical=await call(`learning/recovered/${historicalBinding.head.eventSha256}`,{organization:destination});assert.deepEqual(historical.history.reports[0],savedReport);
      const restored=(await call(recordPath('programs',program.record.id),{organization:destination})).record;assert.equal(restored.approval,null);assert.equal(restored.status,'draft');
      const preview=await post('learning/mapping/preview',{mode:'adopt-recovered',recoveredHead:historicalBinding.head,source:historicalBinding.source,program:workingPin(restored),mapping},{organization:destination});
      const adopted=await commit(preview,{organization:destination});assert.equal(adopted.result.outcome,'adopted');assert.notEqual(adopted.result.head.bindingId,bindingId);
      assert.ok(adopted.result.records.every(pin=>![definition.record.id,protocol.record.id].includes(pin.recordId)));
      const fresh=await call(`learning/bindings/${adopted.result.head.bindingId}/context`,{organization:destination});assert.ok(fresh.records.every(row=>row.record.status==='draft'&&row.pin===null));
      assert.equal((await tx(c=>c.query("SELECT count(*) FROM os_learning_history WHERE org_id=$1 AND row_kind='source' AND origin_mode='live'",[destination]),destination)).rows[0].count,'0');
      assert.deepEqual((await call(`learning/reports/${savedReport.id}`)).report,savedReport);
    });
    t.diagnostic(`Completed ${requestCount} actual handler requests; fictional identities, no browser/mail/provider transport.`);
  } finally {
    if (db) await db.close(); if (migration) await migration.close();
    await owner.pool.query(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`); await owner.close();
  }
});
