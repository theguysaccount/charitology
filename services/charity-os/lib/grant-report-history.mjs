/** Historical grammar, integrity and typed references only. No current authority or IO.
 * Pure report projections below derive from the pinned grant-report-v1 producer.
 * The creator/reader is never imported or called for admission. */
import { isProxy } from 'node:util/types';
import { hash, stable } from './security.mjs';
import { validDate, validInstant, validZone, agreesWithZone } from './schedule.mjs';
import fields from './grant-history-fields-v1.json' with { type: 'json' };

export class GrantHistoryError extends Error {
  constructor() { super('The complete stored grant history is invalid or unsupported.'); this.name = 'GrantHistoryError'; this.code = 'grant_history'; this.status = 422; }
}
const bad = () => { throw new GrantHistoryError(); };
const need = value => { if (!value) bad(); };
const MIB = 1024 * 1024, BYTES = 2 * MIB, INVENTORY_BYTES = 32 * MIB;
const enc = new TextEncoder();
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const opaque = v => typeof v === 'string' && ID.test(v);
const digest = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const revision = v => need(Number.isSafeInteger(v) && v > 0 && v <= 2147483647);
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const exact = (v, keys) => need(plain(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k)));
const same = (a,b) => stable(a) === stable(b);
const copy = v => JSON.parse(stable(v));
function freeze(v) { if (v && typeof v === 'object' && !Object.isFrozen(v)) { for (const x of Object.values(v)) freeze(x); Object.freeze(v); } return v; }
function owned(input, limit = BYTES) {
  let nodes = 0, bytes = 0; const active = new Set();
  function walk(v, depth) {
    need(++nodes <= 200000 && depth <= 32);
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'number') { need(Number.isFinite(v)); return v; }
    if (typeof v === 'string') { need(v.isWellFormed() && !v.includes('\0')); bytes += enc.encode(JSON.stringify(v)).length; need(bytes <= limit); return v; }
    need(v && typeof v === 'object' && !isProxy(v));
    const array = Array.isArray(v); need(Object.getPrototypeOf(v) === (array ? Array.prototype : Object.prototype));
    need(!active.has(v)); active.add(v); const keys = Reflect.ownKeys(v); let out;
    if (array) {
      const l = Object.getOwnPropertyDescriptor(v,'length'); need(l && Object.hasOwn(l,'value') && Number.isSafeInteger(l.value) && l.value >= 0 && l.value <= 200000);
      need(keys.length === l.value + 1 && keys.every((k,i) => i < l.value ? k === String(i) : k === 'length')); out = [];
      for (let i=0;i<l.value;i++) { const d=Object.getOwnPropertyDescriptor(v,String(i)); need(d?.enumerable && Object.hasOwn(d,'value')); out.push(walk(d.value,depth+1)); }
    } else {
      need(keys.length <= 64); out = {};
      for (const k of keys) { need(typeof k === 'string' && k.isWellFormed() && !k.includes('\0')); bytes += enc.encode(JSON.stringify(k)).length; need(bytes <= limit);
        const d=Object.getOwnPropertyDescriptor(v,k); need(d?.enumerable && Object.hasOwn(d,'value'));
        Object.defineProperty(out,k,{value:walk(d.value,depth+1),enumerable:true,writable:true,configurable:true}); }
    }
    active.delete(v); return out;
  }
  const out = walk(input,0); need(enc.encode(stable(out)).length <= limit); return out;
}
function instant(value) {
  if (typeof value !== 'string') return false;
  const m=/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  return !!m && validDate(m[1]) && +m[2]<24 && +m[3]<60 && +m[4]<60 && (!m[6] || +m[6]<=14 && +m[7]<60 && (+m[6]<14 || +m[7]===0)) && Number.isFinite(Date.parse(value));
}
function sqlMicros(value, exactUTC = false) {
  need(typeof value === 'string');
  const m=/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  need(m && validDate(m[1]) && +m[2]<24 && +m[3]<60 && +m[4]<60 && (!m[7] || +m[8]<=14 && +m[9]<60 && (+m[8]<14 || +m[9]===0)));
  need(!exactUTC || m[5]?.length===6 && m[6]==='Z');
  const ms=Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}${m[6]}`); need(Number.isFinite(ms));
  return BigInt(ms)*1000n + BigInt((m[5]??'').padEnd(6,'0'));
}
const STATES = Object.freeze({ programs:['approved','active','paused','closed'], 'grant-seeking':['submitted','decided'], 'grant-delivery':['approved','active','reporting','closed'], finance:['approved','active','reconciled','closed'], fundraising:['approved','active','reconciled','acknowledged'], outcomes:['approved','included'], reporting:['approved','frozen','issued'] });
need(hash(fields)==='276bb9e8211971cac1aad0cf56892599b40adc024b8889843d9a3b3e5474b7b9'); freeze(fields);
export const GRANT_HISTORY_FIELD_PROFILE_SHA256 = '276bb9e8211971cac1aad0cf56892599b40adc024b8889843d9a3b3e5474b7b9';
const CURRENCIES = fields.currencies;
const GRANT_REPORT_METHOD = 'grant-report-v1';
const GRANT_REPORT_MODEL_LIMITS = { bytes: BYTES };
const issue = () => bad();
const fail = () => bad();
const sourceIdentity = r => ({moduleId:r.moduleId,id:r.id,revision:r.revision});
const dataEnvelope = r => ({orgId:r.orgId,moduleId:r.moduleId,id:r.id,revision:r.revision,status:r.status,data:r.data});
const dataHash = r => hash(dataEnvelope(r));
const sorted = values => [...values].sort((a,b) => `${a.moduleId}/${a.id}`.localeCompare(`${b.moduleId}/${b.id}`,'en'));
function approval(r) {
  exact(r.approval,['status','revision','actorId','at']); const a=r.approval;
  need(a.status==='approved' && a.revision===r.revision && opaque(a.actorId) && a.actorId!==r.lastEditedBy && instant(a.at));
  return {revision:a.revision,actorId:a.actorId,at:a.at};
}
function fieldData(moduleId, data) {
  need(typeof moduleId==='string' && Object.hasOwn(fields.modules,moduleId)); const schema=fields.modules[moduleId]; exact(data,schema.fields.map(f=>f.key));
  for (const f of schema.fields) {
    const v=data[f.key]; if (v===null) { need(!f.required && f.nullable!==false); continue; }
    if (['text','textarea','date','reference','datetime','timezone'].includes(f.type)) {
      need(typeof v==='string' && v===v.trim() && (!f.required || v.length>0) && v.length<=(f.maxLength||1200) && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(v));
      need(v!=='' || !!f.required); // Optional empty source text is normalized to null.
      if (f.type==='date') need(validDate(v)); if(f.type==='datetime')need(validInstant(v));if(f.type==='timezone')need(validZone(v)); if (f.type==='reference'||f.format==='opaque') need(opaque(v));
      if (f.format==='sha256') need(/^[a-fA-F0-9]{64}$/.test(v));
      if (f.format==='email') need(v.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
      if (f.format==='https') { let u; try { u=new URL(v); } catch { bad(); } need(u.protocol==='https:' && !u.username && !u.password && !/[\r\n]/.test(v)); }
    } else if (f.type==='select') need(f.options.includes(v));
    else if (f.type==='integer'||f.type==='number') need(typeof v==='number' && Number.isFinite(v) && (f.type!=='integer'||Number.isSafeInteger(v)) && v>=f.min && v<=f.max);
    else if (f.type==='boolean') need(typeof v==='boolean');
    else if (f.type==='money') { exact(v,['minor','currency','precision']); need(typeof v.currency==='string' && Object.hasOwn(CURRENCIES,v.currency) && v.precision===CURRENCIES[v.currency] && (v.minor===null||Number.isSafeInteger(v.minor) && (f.signed||v.minor>=0))); }
    else if (f.type==='references') need(Array.isArray(v) && v.length<=(f.maxItems||100) && v.every(opaque) && new Set(v).size===v.length);
    else bad();
  }
  for(const f of schema.fields.filter(f=>f.type==='datetime')) if(data[f.key]!==null) need(data.timeZone!==null&&agreesWithZone(data[f.key],data.timeZone));
  if(data.externalId) need(!!data.externalSystem);
  if(moduleId==='grant-seeking') need(data.eligibility==='eligible'&&data.applicationVersion!==null&&data.submissionReference!==null);
}
const TOP = ['format','kind','schemaVersion','methodVersion','title','manifest','agreement','program','period','currency','sections','trace','sourceRevisions','modules','supersedes','boardProjection','id','orgId','createdBy','createdAt','authorization','command','checksum'];
const PREFINAL = TOP.filter(k=>!['id','orgId','createdBy','createdAt','authorization','command','checksum'].includes(k));
function frozenRecord(r, org, application = false) {
  exact(r,['orgId','moduleId','id','revision','status','data','ownerId','lastEditedBy','approval','createdAt','updatedAt',...(application?['submittedArtifact']:[])]);
  need(r.orgId===org && opaque(r.id) && opaque(r.lastEditedBy) && (r.ownerId===null||opaque(r.ownerId)) && typeof r.moduleId==='string' && Object.hasOwn(STATES,r.moduleId) && STATES[r.moduleId].includes(r.status)); revision(r.revision);
  need((r.createdAt===null||instant(r.createdAt)) && (r.updatedAt===null||instant(r.updatedAt))); fieldData(r.moduleId,r.data); approval(r);
}
function submitted(a, current, org) {
  exact(a,['eventId','createdAt','revision','dataHash','submissionReference','record','approval']); need(opaque(a.eventId) && instant(a.createdAt) && digest(a.dataHash)); revision(a.revision);
  const r=a.record; exact(r,['orgId','moduleId','id','revision','status','data','createdAt','updatedAt']);
  need(r.orgId===org && r.moduleId==='grant-seeking' && r.id===current.id && r.status==='submitted' && r.revision===a.revision && r.revision<=current.revision);
  need((r.createdAt===null||instant(r.createdAt)) && (r.updatedAt===null||instant(r.updatedAt))); fieldData(r.moduleId,r.data);
  need(r.data.kind==='application' && r.data.programId===current.data.programId && r.data.applicationVersion===current.data.applicationVersion && r.data.submissionReference===current.data.submissionReference && a.submissionReference===r.data.submissionReference);
  exact(a.approval,['revision','actorId','at']); need(a.approval.revision===r.revision && opaque(a.approval.actorId) && instant(a.approval.at));
  // The historical last editor was not retained in this artifact. Never invent it.
  need(a.dataHash===dataHash(r));
}

// The following scalar/financial/board builders preserve grant-report-v1 projections.
function period(startDate, endDate, field) {
  if (!validDate(startDate) || !validDate(endDate) || endDate < startDate)
    issue(field, "Supply a real inclusive start/end date period.");
  return { startDate, endDate, convention: "inclusive-dates" };
}
function inside(child, parent, field) {
  if (child.startDate < parent.startDate || child.endDate > parent.endDate)
    issue(
      field,
      "The complete selected period must be inside the report period; no proration is inferred.",
    );
}
function dated(date, enclosing, field) {
  if (
    !validDate(date) ||
    date < enclosing.startDate ||
    date > enclosing.endDate
  )
    issue(field, "Supply an explicit date within the inclusive report period.");
  return date;
}
function money(value, currency, field, required = false) {
  if (value === null || value === undefined) {
    if (required)
      issue(
        field,
        "An explicit awarded-money currency and precision is required, even when its amount is unknown.",
      );
    return null;
  }
  if (
    !plain(value) ||
    Object.keys(value).some(
      (k) => !["minor", "currency", "precision"].includes(k),
    ) ||
    !Object.hasOwn(CURRENCIES, value.currency) ||
    value.precision !== CURRENCIES[value.currency] ||
    (value.minor !== null &&
      (!Number.isSafeInteger(value.minor) || value.minor < 0))
  )
    issue(
      field,
      "Use nonnegative safe integer minor units or null with an explicit supported currency/precision.",
    );
  if (
    currency &&
    (value.currency !== currency.code || value.precision !== currency.precision)
  )
    issue(
      field,
      "Every selected money object must use the agreement currency and precision; no conversion is inferred.",
    );
  return copy(value);
}
const missingMoney = (value) => value === null || value.minor === null;
function bounded(report) {
  if (
    Buffer.byteLength(stable(report), "utf8") > GRANT_REPORT_MODEL_LIMITS.bytes
  )
    issue(
      "selection",
      "The complete report exceeds 2 MiB. Reduce the selected sources.",
      "grant_report_size",
    );
}
function financialSummary(items) {
  let sum = 0n,
    knownCount = 0;
  for (const item of items)
    if (!missingMoney(item.amount)) {
      sum += BigInt(item.amount.minor);
      knownCount++;
    }
  if (sum > BigInt(Number.MAX_SAFE_INTEGER))
    issue(
      "amount",
      "The known subtotal exceeds safe integer precision. Split the report period or selection.",
    );
  const selectedCount = items.length,
    unknownCount = selectedCount - knownCount;
  return {
    totalMinor: !selectedCount || unknownCount ? null : Number(sum),
    knownSubtotalMinor: Number(sum),
    knownCount,
    unknownCount,
    selectedCount,
    coverage: !selectedCount ? "empty" : unknownCount ? "partial" : "complete",
    notice: !selectedCount
      ? "No references were selected; this is not evidence of zero activity."
      : unknownCount
        ? "Selected amounts are missing. The known subtotal is not a complete total."
        : "Total of selected external references only; completeness of the external ledger has not been established.",
    items,
  };
}
function identityKey(system, reference, field) {
  if (
    typeof system !== "string" ||
    !system.trim() ||
    typeof reference !== "string" ||
    !reference.trim()
  )
    issue(
      field,
      "An identified external system and explicit external reference is required.",
    );
  return stable([system.trim().toLowerCase(), reference.trim()]);
}
function distinct(items, keyFor, field) {
  const keys = new Set();
  for (const row of items) {
    const key = keyFor(row);
    if (key === null) continue;
    if (keys.has(key))
      issue(
        field,
        "Selected references repeat the same external source identity. Resolve the duplicate before review.",
      );
    keys.add(key);
  }
}
function immutableEnvelope(r) {
  return {
    ...copy(dataEnvelope(r)),
    ownerId: r.ownerId ?? null,
    lastEditedBy: r.lastEditedBy,
    approval: { status: "approved", ...approval(r) },
    createdAt: r.createdAt ?? null,
    updatedAt: r.updatedAt ?? null,
  };
}
function boardSource(source) {
  return {
    moduleId: source.moduleId,
    id: source.id,
    revision: source.revision,
    sourceStatus: source.status,
    dataHash: source.dataHash,
    ...(source.snapshotRef
      ? {
          snapshotRef: {
            eventId: source.snapshotRef.eventId,
            revision: source.snapshotRef.revision,
            dataHash: source.snapshotRef.dataHash,
          },
        }
      : {}),
  };
}
function hasPath(value, path) {
  let current = value;
  for (const key of path.split("/").slice(1)) {
    if (
      current === null ||
      typeof current !== "object" ||
      !Object.hasOwn(current, key)
    )
      return false;
    current = current[key];
  }
  return true;
}
function boardView(report) {
  const sections = copy(report.sections);
  delete sections.grantContext.application;
  for (const name of ["receipts", "spending"])
    sections.finances[name].items = sections.finances[name].items.map(
      ({ source, date, amount }) => ({ source, date, amount }),
    );
  sections.observations = sections.observations.map(
    ({ sourceUrl, ...safe }) => safe,
  );
  const board = {
    kind: "grant-period-board",
    schemaVersion: 1,
    methodVersion: GRANT_REPORT_METHOD,
    title: report.title,
    manifest: copy(report.manifest),
    agreement: copy(report.agreement),
    program: copy(report.program),
    period: copy(report.period),
    currency: copy(report.currency),
    sections,
    sourceRevisions: report.sourceRevisions.map(boardSource),
    supersedes: copy(report.supersedes),
  };
  board.trace = report.trace
    .filter((item) => hasPath(board, item.outputPath))
    .map((item) => ({
      ...copy(item),
      sources: item.sources.map(
        ({ moduleId, id, revision, dataHash, fields }) => ({
          moduleId,
          id,
          revision,
          dataHash,
          fields: [...fields],
        }),
      ),
    }));
  return board;
}


function projection(oldReport, sourceRecords) {
 const org=oldReport.orgId, normalized=new Map(sourceRecords.map(r=>[r.id,r]));
 const get=(id,moduleId)=>{const r=normalized.get(id);need(r&&r.moduleId===moduleId);return r;};
 const M=get(oldReport.manifest.id,'reporting'), A=get(M.data.agreementId,'grant-delivery'), P=get(M.data.programId,'programs'), APP=get(A.data.applicationId,'grant-seeking');
 const programId=P.id, mode='preview';
 need(M.data.assemblyMethod===GRANT_REPORT_METHOD && ['private','board','funder'].includes(M.data.visibility));
 need(P.data.kind==='program'&&A.data.kind==='agreement'&&APP.data.kind==='application');
 for(const r of sourceRecords)need(r.moduleId==='programs'?r.id===programId:r.data.programId===programId);
 const arrays=['receiptIds','financeIds','outcomeIds']; const selections=Object.fromEntries(arrays.map(k=>[k,[...(M.data[k]??[])].sort()]));
 need(Object.values(selections).reduce((n,a)=>n+a.length,0)<=100);
 const receipts=selections.receiptIds.map(id=>get(id,'fundraising')), finances=selections.financeIds.map(id=>get(id,'finance')), observations=selections.outcomeIds.map(id=>get(id,'outcomes'));
 const selectedFinance=new Set(finances.map(r=>r.id)),financeClosure=new Map();
 const visit=(r,path=new Set())=>{need(!path.has(r.id));if(financeClosure.has(r.id))return;const next=new Set([...path,r.id]);if(r.data.parentBudgetId){const p=get(r.data.parentBudgetId,'finance');need(p.data.kind==='budget');visit(p,next);}financeClosure.set(r.id,r);};
 for(const r of finances)visit(r);
 const expected=new Set([M.id,A.id,P.id,APP.id,...receipts.map(r=>r.id),...financeClosure.keys(),...observations.map(r=>r.id)]);
 for(const r of observations){need(['observation','harm'].includes(r.data.kind));const i=get(r.data.indicatorId,'outcomes');need(i.data.kind==='indicator');expected.add(i.id);}
 need(expected.size===normalized.size&&[...normalized.keys()].every(id=>expected.has(id)));
 const reportPeriod=period(M.data.startDate,M.data.endDate,'period'),agreementPeriod=period(A.data.startDate,A.data.endDate,'agreement');inside(reportPeriod,agreementPeriod,'period');
 if(oldReport.supersedes===null)need(M.data.supersedesReportId===null);
 else {exact(oldReport.supersedes,['id','checksum','reason']);need(opaque(oldReport.supersedes.id)&&digest(oldReport.supersedes.checksum)&&oldReport.supersedes.id===M.data.supersedesReportId&&typeof oldReport.supersedes.reason==='string'&&oldReport.supersedes.reason.trim().length>0&&oldReport.supersedes.reason===M.data.revisionReason);}
  const awarded = money(A.data.awarded, null, "awarded", true),
    currency = { code: awarded.currency, precision: awarded.precision };
  const committed = money(A.data.committed, currency, "committed"),
    recordedAgreementSpending = money(A.data.spent, currency, "spent");
  money(APP.data.requested, currency, "requested");
  const historical = APP.submittedArtifact;
  money(historical.record.data.requested, currency, "submitted.requested");
  const receiptItems = receipts.map((raw) => {
    const r = normalized.get(raw.id),
      d = r.data;
    if (d.kind !== "gift-reference" || d.agreementId !== A.id)
      issue(
        "receiptIds",
        "Every receipt must be an explicit gift-reference linked to this agreement.",
      );
    identityKey(d.externalSystem, d.receiptReference, "receiptReference");
    if (
      d.restricted === true &&
      (A.data.restriction !== "restricted" ||
        d.restrictionPurpose !== A.data.allowedPurpose)
    )
      issue(
        "restrictionPurpose",
        "Receipt restriction purpose disagrees with the explicit agreement.",
      );
    return {
      source: sourceIdentity(r),
      date: dated(d.receivedDate, reportPeriod, "receivedDate"),
      amount: money(d.amount, currency, "amount"),
      externalSystem: d.externalSystem,
      externalId: d.externalId,
      receiptReference: d.receiptReference,
    };
  });
  distinct(
    receiptItems,
    (r) =>
      identityKey(r.externalSystem, r.receiptReference, "receiptReference"),
    "receiptIds",
  );
  distinct(
    receiptItems,
    (r) =>
      r.externalId
        ? identityKey(r.externalSystem, r.externalId, "externalId")
        : null,
    "receiptIds",
  );
  const spendingItems = [],
    planning = [],
    notices = [];
  for (const raw of sorted([...financeClosure.values()])) {
    const r = normalized.get(raw.id),
      d = r.data,
      isDependency = !selectedFinance.has(r.id);
    if (d.agreementId !== A.id)
      issue(
        "financeIds",
        "Every selected financial source and parent budget must identify this agreement.",
      );
    const planned = money(d.planned, currency, "planned"),
      actual = money(d.actual, currency, "actual");
    if (
      A.data.restriction === "restricted" &&
      (d.restrictionCode !== A.data.restrictionCode ||
        d.purpose !== A.data.allowedPurpose)
    )
      issue(
        "restrictionCode",
        "Financial restriction code and permitted purpose must match the agreement.",
      );
    if (d.kind === "actual-reference" && d.actualClass === "cash-spent") {
      if (isDependency)
        issue(
          "parentBudgetId",
          "An actual reference cannot be a parent budget.",
        );
      identityKey(d.externalSystem, d.externalId, "externalId");
      spendingItems.push({
        source: sourceIdentity(r),
        date: dated(d.actualDate, reportPeriod, "actualDate"),
        amount: actual,
        externalSystem: d.externalSystem,
        externalId: d.externalId,
      });
      continue;
    }
    if (
      !["budget", "allocation", "scenario", "actual-reference"].includes(d.kind)
    )
      issue(
        "financeIds",
        "Select a supported planning or external actual-reference row.",
      );
    let sourcePeriod;
    if (d.kind === "actual-reference" && d.actualDate) {
      dated(d.actualDate, reportPeriod, "actualDate");
      sourcePeriod = period(d.actualDate, d.actualDate, "actualDate");
    } else {
      sourcePeriod = period(d.startDate, d.endDate, "financePeriod");
      inside(
        sourcePeriod,
        isDependency ? agreementPeriod : reportPeriod,
        "financePeriod",
      );
    }
    if (d.parentBudgetId) {
      const parent = normalized.get(d.parentBudgetId);
      inside(
        sourcePeriod,
        period(parent.data.startDate, parent.data.endDate, "parentBudgetId"),
        "parentBudgetId",
      );
    }
    const classificationNotice =
      d.kind === "actual-reference"
        ? "This reference is not explicitly classified as cash spent and contributes no cash subtotal."
        : isDependency
          ? "Parent budget context only; planning amounts are not period cash movements."
          : "Planning amounts are shown individually and are not added to receipts or spending.";
    planning.push({
      source: sourceIdentity(r),
      kind: d.kind,
      planned,
      actual,
      actualClass: d.actualClass,
      period: sourcePeriod,
      parentBudgetId: d.parentBudgetId,
      isDependency,
      classificationNotice,
    });
    if (d.kind === "actual-reference") notices.push(classificationNotice);
  }
  distinct(
    spendingItems,
    (r) => identityKey(r.externalSystem, r.externalId, "externalId"),
    "financeIds",
  );
  const observationRows = observations.map((raw) => {
    const r = normalized.get(raw.id),
      d = r.data,
      indicator = normalized.get(d.indicatorId);
    if (!indicator || d.unit !== indicator.data.unit || !d.unit)
      issue(
        "unit",
        "Every observation must use its approved indicator’s exact unit.",
      );
    const measuredPeriod = period(d.startDate, d.endDate, "outcomePeriod");
    inside(measuredPeriod, reportPeriod, "outcomePeriod");
    return {
      source: sourceIdentity(r),
      indicator: {
        id: indicator.id,
        revision: indicator.revision,
        title: indicator.data.title,
        unit: indicator.data.unit,
      },
      kind: d.kind,
      title: d.title,
      value: d.value,
      unit: d.unit,
      denominator: d.denominator,
      period: measuredPeriod,
      geography: d.geography,
      method: d.method,
      evidence: d.evidence,
      sourceUrl: d.sourceUrl,
      limitations: d.limitations,
    };
  });
  const sourceRevisions = sorted([...normalized.values()]).map((r) => ({
    ...sourceIdentity(r),
    status: r.status,
    dataHash: dataHash(r),
    approval: approval(r, r.id !== M.id || mode === "preview"),
    ...(r.id === APP.id
      ? {
          snapshotRef: {
            eventId: historical.eventId,
            createdAt: historical.createdAt,
            revision: historical.revision,
            dataHash: historical.dataHash,
            submissionReference: historical.submissionReference,
          },
        }
      : {}),
  }));
  const selection = { ...M.data };
  delete selection.sourceDigest;
  const factualRefs = sourceRevisions.filter((r) => r.id !== M.id);
  const sourceDigest = hash({
    methodVersion: GRANT_REPORT_METHOD,
    manifestId: M.id,
    selection,
    agreement: A.id,
    period: reportPeriod,
    sourceRefs: factualRefs,
  });
  if (mode === "preview" && M.data.sourceDigest !== sourceDigest)
    fail(
      409,
      "grant_report_digest",
      "Sources or manifest data changed. Prepare sources, save the returned digest and obtain fresh independent manifest approval.",
    );
  const summaryReceipts = financialSummary(receiptItems),
    summarySpending = financialSummary(spendingItems);
  const report = {
    format: "charitology-os-report",
    kind: "grant-period",
    schemaVersion: 1,
    methodVersion: GRANT_REPORT_METHOD,
    title: M.data.title,
    manifest: {
      id: M.id,
      revision: M.revision,
      hash: dataHash(M),
      sourceDigest,
      audience: M.data.visibility,
    },
    agreement: { id: A.id, revision: A.revision, programId },
    program: { id: P.id, revision: P.revision, title: P.data.title },
    period: reportPeriod,
    currency,
    sections: {
      summary: M.data.summary,
      grantContext: {
        awarded,
        committed,
        recordedAgreementSpending,
        restriction: {
          status: A.data.restriction,
          code: A.data.restrictionCode,
          purpose: A.data.allowedPurpose,
        },
        application: {
          current: {
            id: APP.id,
            revision: APP.revision,
            status: APP.status,
            submissionReference: APP.data.submissionReference,
          },
          submitted: {
            eventId: historical.eventId,
            createdAt: historical.createdAt,
            revision: historical.revision,
            dataHash: historical.dataHash,
            submissionReference: historical.submissionReference,
          },
        },
      },
      finances: {
        receipts: summaryReceipts,
        spending: summarySpending,
        planning,
      },
      observations: observationRows,
      gaps: {
        declared: M.data.missingness,
        selection: {
          receiptCount: receipts.length,
          financeCount: finances.length,
          outcomeCount: observations.length,
        },
        notices: [
          ...new Set([
            "Only explicitly selected references are covered; this is not a complete ledger or causal impact evaluation.",
            ...(!receipts.length ? [summaryReceipts.notice] : []),
            ...(!spendingItems.length ? [summarySpending.notice] : []),
            ...(!observations.length
              ? [
                  "No observations were selected; this is not evidence of zero outcomes.",
                ]
              : []),
            ...notices,
          ]),
        ],
      },
    },
    trace: [],
    sourceRevisions,
    modules: [],
    supersedes: copy(oldReport.supersedes),
  };
  const refsById = new Map(sourceRevisions.map((r) => [r.id, r]));
  const trace = (outputPath, operation, sources, missingness = "known") =>
    report.trace.push({
      outputPath,
      operation,
      sources: sources.map(([id, fields]) => {
        const r = refsById.get(id);
        return { ...sourceIdentity(r), dataHash: r.dataHash, fields };
      }),
      missingness,
    });
  trace("/title", "copy-v1", [[M.id, ["data.title"]]]);
  trace("/period", "copy-v1", [
    [M.id, ["data.startDate", "data.endDate"]],
    [A.id, ["data.startDate", "data.endDate"]],
  ]);
  trace("/currency", "copy-v1", [
    [A.id, ["data.awarded.currency", "data.awarded.precision"]],
  ]);
  trace("/program/title", "copy-v1", [[P.id, ["data.title"]]]);
  trace(
    "/sections/summary",
    "copy-v1",
    [[M.id, ["data.summary"]]],
    M.data.summary === null ? "unknown" : "known",
  );
  for (const [key, field] of [
    ["awarded", "awarded"],
    ["committed", "committed"],
    ["recordedAgreementSpending", "spent"],
  ])
    trace(
      `/sections/grantContext/${key}`,
      "copy-v1",
      [[A.id, [`data.${field}`]]],
      missingMoney(report.sections.grantContext[key]) ? "unknown" : "known",
    );
  trace(
    "/sections/grantContext/restriction",
    "copy-v1",
    [
      [
        A.id,
        ["data.restriction", "data.restrictionCode", "data.allowedPurpose"],
      ],
    ],
    A.data.restriction === null || A.data.restriction === "unknown"
      ? "unknown"
      : "known",
  );
  trace("/sections/grantContext/application/current", "copy-v1", [
    [APP.id, ["status", "revision", "data.submissionReference"]],
  ]);
  trace(
    "/sections/grantContext/application/submitted",
    "copy-historical-submission-v1",
    [
      [
        APP.id,
        [
          "submittedArtifact.eventId",
          "submittedArtifact.record.revision",
          "submittedArtifact.record.data.submissionReference",
        ],
      ],
    ],
  );
  for (const [key, field] of [
    ["receipts", "amount"],
    ["spending", "actual"],
  ]) {
    const summary = report.sections.finances[key];
    trace(
      `/sections/finances/${key}`,
      "sum-known-minor-v1",
      summary.items.map((item) => [
        item.source.id,
        [
          `data.${field}`,
          key === "receipts" ? "data.receivedDate" : "data.actualDate",
        ],
      ]),
      summary.coverage === "empty"
        ? "not-selected"
        : summary.coverage === "partial"
          ? "partial"
          : "known",
    );
    summary.items.forEach((item, i) =>
      trace(
        `/sections/finances/${key}/items/${i}`,
        "copy-v1",
        [
          [
            item.source.id,
            key === "receipts"
              ? [
                  "data.amount",
                  "data.receivedDate",
                  "data.externalSystem",
                  "data.receiptReference",
                  "data.externalId",
                ]
              : [
                  "data.actual",
                  "data.actualClass",
                  "data.actualDate",
                  "data.externalSystem",
                  "data.externalId",
                ],
          ],
        ],
        missingMoney(item.amount) ? "unknown" : "known",
      ),
    );
  }
  planning.forEach((item, i) =>
    trace(
      `/sections/finances/planning/${i}`,
      "planning-context-v1",
      [
        [
          item.source.id,
          [
            "data.kind",
            "data.planned",
            "data.actual",
            "data.actualClass",
            "data.actualDate",
            "data.startDate",
            "data.endDate",
            "data.parentBudgetId",
          ],
        ],
      ],
      missingMoney(item.planned) || missingMoney(item.actual)
        ? "partial"
        : "known",
    ),
  );
  observationRows.forEach((item, i) =>
    trace(
      `/sections/observations/${i}`,
      "observation-unpooled-v1",
      [
        [
          item.source.id,
          [
            "data.value",
            "data.unit",
            "data.denominator",
            "data.startDate",
            "data.endDate",
            "data.geography",
            "data.method",
            "data.evidence",
            "data.sourceUrl",
            "data.limitations",
          ],
        ],
        [item.indicator.id, ["data.title", "data.unit"]],
      ],
      item.value === null ? "unknown" : "known",
    ),
  );
  trace(
    "/sections/gaps/declared",
    "copy-v1",
    [[M.id, ["data.missingness"]]],
    M.data.missingness === null ? "unknown" : "known",
  );
  trace("/sections/gaps/selection", "selection-count-v1", [
    [M.id, arrays.map((field) => `data.${field}`)],
  ]);
  const grouped = new Map();
  for (const r of sorted([...normalized.values()])) {
    if (!grouped.has(r.moduleId))
      grouped.set(r.moduleId, {
        id: r.moduleId,
        title: fields.modules[r.moduleId].title,
        records: [],
      });
    const frozen =
      r.id === M.id && mode === "prepare" && !approval(r, false)
        ? {
            ...copy(dataEnvelope(r)),
            ownerId: r.ownerId ?? null,
            lastEditedBy: r.lastEditedBy,
            approval: null,
            createdAt: r.createdAt ?? null,
            updatedAt: r.updatedAt ?? null,
          }
        : immutableEnvelope(r);
    if (r.id === APP.id) frozen.submittedArtifact = copy(historical);
    grouped.get(r.moduleId).records.push(frozen);
  }
  report.modules = [...grouped.values()];
  report.boardProjection = boardView(report);
  bounded(report);
  exact(report,PREFINAL); return report;
}

function admit(input) {
  const r=owned(input); exact(r,TOP);
  need(r.format==='charitology-os-report' && r.kind==='grant-period' && r.schemaVersion===1 && r.methodVersion===GRANT_REPORT_METHOD);
  need(opaque(r.id)&&opaque(r.orgId)&&opaque(r.createdBy)&&instant(r.createdAt)&&digest(r.checksum));
  exact(r.manifest,['id','revision','hash','sourceDigest','audience']); need(opaque(r.manifest.id)&&digest(r.manifest.hash)&&digest(r.manifest.sourceDigest)); revision(r.manifest.revision);
  exact(r.agreement,['id','revision','programId']); need(opaque(r.agreement.id)&&opaque(r.agreement.programId)); revision(r.agreement.revision);
  exact(r.program,['id','revision','title']); need(opaque(r.program.id)); revision(r.program.revision);
  exact(r.authorization,['role','programIds','membershipRevision']); const a=r.authorization;
  need(['owner','admin','program_lead','grants_lead','finance_reviewer'].includes(a.role)); revision(a.membershipRevision);
  need(Array.isArray(a.programIds)&&a.programIds.length<=100&&a.programIds.every(opaque)&&same(a.programIds,[...a.programIds].sort())&&(!a.programIds.length||a.programIds.includes(r.program.id)));
  exact(r.command,['actorId','keyHash','previewId','reviewHash']); need(r.command.actorId===r.createdBy&&opaque(r.command.previewId)&&digest(r.command.keyHash)&&digest(r.command.reviewHash));
  need(Array.isArray(r.modules)&&r.modules.length>0&&r.modules.length<=7);
  const records=[],index=new Map(),moduleIds=new Set();
  for(const m of r.modules) {
    exact(m,['id','title','records']); need(typeof m.id==='string'&&Object.hasOwn(fields.modules,m.id)&&!moduleIds.has(m.id));moduleIds.add(m.id);
    need(m.title===fields.modules[m.id].title&&Array.isArray(m.records)&&m.records.length>0&&m.records.length<=250);
    for(const record of m.records) {
      frozenRecord(record,r.orgId,Object.hasOwn(record,'submittedArtifact'));
      need(record.moduleId===m.id&&!index.has(record.id));index.set(record.id,record);records.push(record);need(records.length<=250);
    }
  }
  const agreement=index.get(r.agreement.id),app=agreement&&index.get(agreement.data.applicationId);
  need(agreement?.moduleId==='grant-delivery'&&app?.moduleId==='grant-seeking'&&Object.hasOwn(app,'submittedArtifact'));
  const identityKinds=new Map(records.map(record=>[record.id,record.moduleId]));
  const referenceKinds=record=>{
    for(const f of fields.modules[record.moduleId].fields.filter(f=>['reference','references'].includes(f.type))) {
      for(const id of f.type==='references'?(record.data[f.key]??[]):record.data[f.key]===null?[]:[record.data[f.key]]) {
        need(id!==record.id&&(!identityKinds.has(id)||identityKinds.get(id)===f.target));identityKinds.set(id,f.target);
      }
    }
  };
  for(const record of records) {
    need(record===app||!Object.hasOwn(record,'submittedArtifact'));
    referenceKinds(record);
  }
  submitted(app.submittedArtifact,app,r.orgId);
  referenceKinds(app.submittedArtifact.record);
  const expected=projection(r,records);
  const board={...expected.boardProjection,id:r.id,orgId:r.orgId,createdAt:r.createdAt}; board.checksum=hash(board);
  const body={...expected,boardProjection:board,id:r.id,orgId:r.orgId,createdBy:r.createdBy,createdAt:r.createdAt,authorization:a,command:r.command};
  need(same(r,{...body,checksum:hash(body)}));
  return freeze(r);
}

/** Stored integrity only. No actor, role, consent or independent-approval authority is minted. */
export function validateStoredGrantReport(payload) { return admit(payload); }

function references(r) {
  const refs=[];
  const add=(record,pointer,source)=>{
    for(const f of fields.modules[record.moduleId].fields.filter(f=>['reference','references'].includes(f.type))) {
      const ids=f.type==='references'?(record.data[f.key]??[]):record.data[f.key]===null?[]:[record.data[f.key]];
      for(let i=0;i<ids.length;i++) refs.push({originOrgId:r.orgId,moduleId:record.moduleId,recordId:record.id,revision:record.revision,field:f.key,targetModuleId:f.target,targetRecordId:ids[i],pointer:`${pointer}/data/${f.key}${f.type==='references'?'/'+i:''}`,source});
    }
  };
  for(let i=0;i<r.modules.length;i++) for(let j=0;j<r.modules[i].records.length;j++) {
    const record=r.modules[i].records[j],path=`/modules/${i}/records/${j}`;add(record,path,'frozen');
    if(Object.hasOwn(record,'submittedArtifact'))add(record.submittedArtifact.record,path+'/submittedArtifact/record','submitted-frozen');
  }
  const unique=new Map(refs.map(x=>[stable(x),x]));const recordRefs=[...unique].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([,v])=>v);
  return freeze({report:{id:r.id,originOrgId:r.orgId,checksum:r.checksum},recordRefs,reportRefs:r.supersedes===null?[]:[{originOrgId:r.orgId,reportId:r.supersedes.id,checksum:r.supersedes.checksum,pointer:'/supersedes'}]});
}
/** Only declared typed fields establish references; narratives and account IDs remain literal. */
export function grantReportReferenceProjection(payload) { return references(admit(payload)); }

function inventoryRows(input) {
  need(input&&typeof input==='object'&&!isProxy(input)&&Object.getPrototypeOf(input)===Object.prototype);
  const keys=Reflect.ownKeys(input);need(keys.length===1&&keys[0]==='reportRows');
  const descriptor=Object.getOwnPropertyDescriptor(input,'reportRows');need(descriptor?.enumerable&&Object.hasOwn(descriptor,'value'));
  const rows=descriptor.value;need(rows&&typeof rows==='object'&&!isProxy(rows)&&Array.isArray(rows)&&Object.getPrototypeOf(rows)===Array.prototype);
  const l=Object.getOwnPropertyDescriptor(rows,'length');need(Number.isSafeInteger(l?.value)&&l.value>=0&&l.value<=20000);
  const names=Reflect.ownKeys(rows);need(names.length===l.value+1&&names.every((k,i)=>i<l.value?k===String(i):k==='length'));
  const out=[];let bytes=enc.encode('{"reportRows":[]}').length;
  for(let i=0;i<l.value;i++) {
    const d=Object.getOwnPropertyDescriptor(rows,String(i));need(d?.enumerable&&Object.hasOwn(d,'value'));
    const entry=owned(d.value,BYTES+8192);exact(entry,['row','createdAtExact']);exact(entry.row,['org_id','id','created_by','title','checksum','payload','created_at']);
    need(sqlMicros(entry.createdAtExact,true)===sqlMicros(entry.row.created_at));bytes+=enc.encode(stable(entry)).length+(i===0?0:1);need(bytes<=INVENTORY_BYTES);out.push(entry);
  }
  return {rows:out,bytes};
}
/** Complete live SQL grant inventory. Raw archive payloads do not become live reports. */
export function validateStoredGrantInventory(input) {
  const reports=[],byId=new Map();let org;
  for(const {row} of inventoryRows(input).rows) {
    const report=admit(row.payload);
    need(row.org_id===report.orgId&&row.id===report.id&&row.created_by===report.createdBy&&row.title===report.title&&row.checksum===report.checksum);
    if(org===undefined)org=row.org_id;need(row.org_id===org&&!byId.has(report.id));byId.set(report.id,report);reports.push(report);
  }
  for(const report of reports) {
    let current=report;const path=new Set();
    while(current.supersedes!==null) {
      need(!path.has(current.id));path.add(current.id);const previous=byId.get(current.supersedes.id);
      need(previous&&previous.checksum===current.supersedes.checksum&&previous.orgId===report.orgId&&previous.agreement.id===report.agreement.id&&previous.program.id===report.program.id);current=previous;
    }
  }
  reports.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  return freeze({reports,referenceProjections:reports.map(references)});
}
