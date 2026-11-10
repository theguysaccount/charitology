/** Staff-assisted case storage. A case never creates a participant identity. */
import { fail, hash, stable } from "./security.mjs";
import { ownGroupValue, validateGroupExactStamp } from "./participation-group-model.mjs";
import { validDate } from "./schedule.mjs";
import { createMembershipRenewalStore } from "./membership-renewal-storage.mjs";

export const MEMBERSHIP_ASSISTED_SCHEMA = "charitology_membership_assistance";
export const MEMBERSHIP_ASSISTED_LIMIT = 32;
const ONLINE_SCHEMA = "charitology_membership_renewals";
const IDENTIFIER = /^[a-z][a-z0-9_]{0,62}$/, ID = /^[A-Za-z0-9_-]{1,100}$/, SHA = /^[a-f0-9]{64}$/;
const MAX_REVISION = 2147483647;
const CASE_KEYS = ["orgId","caseId","memberId","termId","capture","captureReceipt"];
const CAPTURE_KEYS = ["version","contactId","memberRevision","memberCreatedAtExact","termRevision","termCreatedAtExact",
  "contactCreatedAtExact","restoreEpochSha256","sourceSha256","noticeRevision","witnessId","witnessMembershipRevision",
  "witnessMembershipCreatedAtExact","witnessedAtExact"];
const RECEIPT_KEYS = ["keySha256","commandSha256","authoritySha256"];
const TERMINAL_KEYS = ["version","action","actorId","actorMembershipRevision","actorMembershipCreatedAtExact",
  "actedAtExact","receipt","result"];
const RESULT_KEYS = ["memberRevision","startDate","endDate","renewalDate"];
const SLOT_LIMIT = MEMBERSHIP_ASSISTED_LIMIT;
const LOCK = "SELECT pg_advisory_xact_lock(hashtextextended($1,0))";
const unavailable = () => fail(503,"membership_assisted_storage","Assisted membership storage is unavailable.");
const changed = () => fail(409,"membership_assisted_changed","Review the current assisted case again.");
const invalid = () => fail(422,"membership_assisted_fields","Use the exact assisted case fields.");
const full = () => fail(409,"membership_assisted_limit","This workspace reached the assisted case limit.");
const id = value => typeof value==="string" && ID.test(value);
const sha = value => typeof value==="string" && SHA.test(value);
const revision = value => Number.isInteger(value) && value>=1 && value<=MAX_REVISION;
const exactTime = value => {
  try { validateGroupExactStamp(value); } catch { invalid(); }
};
function fields(input,keys) {
  let result;
  try {result=ownGroupValue(input,4096);} catch {invalid();}
  if(!result || Array.isArray(result) || Object.keys(result).length!==keys.length ||
      !keys.every(key=>Object.hasOwn(result,key))) invalid();
  return result;
}
function checkCapture(input) {
  const v=fields(input,CAPTURE_KEYS);
  if(v.version!==1 || v.noticeRevision!==1 || !id(v.contactId) || !id(v.witnessId) ||
      ![v.memberRevision,v.termRevision,v.witnessMembershipRevision].every(revision) ||
      ![v.restoreEpochSha256,v.sourceSha256].every(sha)) invalid();
  [v.memberCreatedAtExact,v.termCreatedAtExact,v.contactCreatedAtExact,
    v.witnessMembershipCreatedAtExact,v.witnessedAtExact].forEach(exactTime);
  return v;
}
function checkReceipt(input) {
  const v=fields(input,RECEIPT_KEYS);
  if(!RECEIPT_KEYS.every(key=>sha(v[key]))) invalid();
  return v;
}
function checkTerminal(input) {
  const v=fields(input,TERMINAL_KEYS);
  if(v.version!==1 || !["confirm","withdraw"].includes(v.action) || !id(v.actorId) || !revision(v.actorMembershipRevision)) invalid();
  [v.actorMembershipCreatedAtExact,v.actedAtExact].forEach(exactTime);
  checkReceipt(v.receipt);
  if(v.action==="withdraw") {
    if(v.result!==null) invalid();
  } else {
    const result=fields(v.result,RESULT_KEYS);
    if(!revision(result.memberRevision) || !validDate(result.startDate) || !validDate(result.endDate) ||
        result.endDate<result.startDate || (result.renewalDate!==null && (!validDate(result.renewalDate) ||
        result.renewalDate<result.startDate || result.renewalDate>result.endDate))) invalid();
  }
  return v;
}
function options({applicationSchema="public",storageSchema=MEMBERSHIP_ASSISTED_SCHEMA,onlineStorageSchema=ONLINE_SCHEMA,runtimeRole}={},install=false) {
  if(applicationSchema!=="public" || ![storageSchema,onlineStorageSchema].every(v=>typeof v==="string" && IDENTIFIER.test(v)) ||
      new Set([applicationSchema,storageSchema,onlineStorageSchema]).size!==3 ||
      (install && (typeof runtimeRole!=="string" || !IDENTIFIER.test(runtimeRole)))) throw TypeError("Use distinct private membership schema identifiers.");
  return {storageSchema,onlineStorageSchema,runtimeRole};
}
const q = value => '"'+value+'"';
const sqlArray = values => "ARRAY["+values.map(value=>"'"+value+"'").join(",")+"]::text[]";
const objectShape = (expression,keys) => `(jsonb_typeof(${expression})='object' AND
  ${expression} ?& ${sqlArray(keys)} AND ${expression} - ${sqlArray(keys)} = '{}'::jsonb)`;
const shaField = (expression,key) => `(jsonb_typeof(${expression}->'${key}')='string'
    AND (${expression}->>'${key}') ~ '^[a-f0-9]{64}$')`;
const iso = expression => `to_char(${expression} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const currentStaff = `org_id=current_setting('app.org_id',true) AND EXISTS(
  SELECT 1 FROM public.os_members m WHERE m.org_id=cases.org_id AND m.user_id=current_setting('app.user_id',true)
    AND m.role IN ('owner','admin') AND m.program_ids='[]'::jsonb)`;

function guardSql(onlineStorageSchema) {
  const online=q(onlineStorageSchema)+".bindings";
  return `
DECLARE
 evidence jsonb;
 auth jsonb;
 decision jsonb;
 actor_id text;
 actor_rev integer;
 actor_created timestamptz;
 is_confirm boolean:=false;
 moment timestamptz;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.org_id,0));
 IF TG_OP='INSERT' THEN
  IF NEW.state<>'pending' OR NEW.revision<>1 OR NEW.terminal IS NOT NULL
    THEN RAISE EXCEPTION 'Assisted case must start pending' USING ERRCODE='23514'; END IF;
  evidence:=NEW.capture;
  auth:=evidence;
  actor_id:=auth->>'witnessId';
  actor_rev:=(auth->>'witnessMembershipRevision')::int;
  actor_created:=(auth->>'witnessMembershipCreatedAtExact')::timestamptz;
  moment:=(evidence->>'witnessedAtExact')::timestamptz;
 ELSE
  IF OLD.state<>'pending' OR NEW.revision<>2 OR NEW.state NOT IN ('confirmed','withdrawn') OR
      (to_jsonb(NEW)-ARRAY['state','revision','capture','contact_id','terminal'])
       IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','revision','capture','contact_id','terminal'])
     THEN RAISE EXCEPTION 'Only one terminal assisted decision is allowed' USING ERRCODE='23514'; END IF;
  decision:=NEW.terminal;
  evidence:=OLD.capture;
  actor_id:=decision->>'actorId';
  actor_rev:=(decision->>'actorMembershipRevision')::int;
  actor_created:=(decision->>'actorMembershipCreatedAtExact')::timestamptz;
  moment:=(decision->>'actedAtExact')::timestamptz;
  is_confirm:=NEW.state='confirmed';
  IF (is_confirm AND (decision->>'action'<>'confirm' OR NEW.capture IS DISTINCT FROM OLD.capture OR
      NEW.contact_id IS DISTINCT FROM OLD.contact_id OR actor_id=evidence->>'witnessId')) OR
     (NOT is_confirm AND (decision->>'action'<>'withdraw' OR NEW.capture IS NOT NULL OR NEW.contact_id IS NOT NULL))
     THEN RAISE EXCEPTION 'Assisted decision does not match the case' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.org_id IS DISTINCT FROM current_setting('app.org_id',true) OR
    actor_id IS DISTINCT FROM current_setting('app.user_id',true) OR
    NOT COALESCE(moment>=transaction_timestamp() AND moment<=clock_timestamp(),false) OR
    NOT EXISTS(SELECT 1 FROM public.os_members a WHERE a.org_id=NEW.org_id AND a.user_id=actor_id
      AND a.role IN ('owner','admin') AND a.program_ids='[]'::jsonb
      AND a.revision=actor_rev AND a.created_at=actor_created)
   THEN RAISE EXCEPTION 'Current assisted staff witness required' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND NOT is_confirm THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM ${online} b WHERE b.org_id=NEW.org_id AND (b.member_id=NEW.member_id OR b.term_id=NEW.term_id))
   THEN RAISE EXCEPTION 'An online renewal already reserves this cycle' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(
  SELECT 1 FROM public.os_records m
  JOIN public.os_records t ON t.org_id=m.org_id AND t.id=NEW.term_id
  JOIN public.os_records p ON p.org_id=m.org_id AND p.id=NEW.contact_id
  JOIN public.os_orgs o ON o.id=m.org_id
  JOIN public.os_members witness ON witness.org_id=m.org_id AND witness.user_id=evidence->>'witnessId'
  WHERE m.org_id=NEW.org_id AND m.id=NEW.member_id AND m.module_id='memberships' AND m.data->>'kind'='member'
   AND m.deleted_at IS NULL AND m.status IN ('active','renewal-due')
   AND t.module_id='memberships' AND t.data->>'kind'='renewal' AND t.deleted_at IS NULL AND t.status='approved'
   AND p.module_id='contacts' AND p.data->>'kind'='person-reference' AND p.deleted_at IS NULL AND p.status<>'archived'
   AND m.data->>'contactId'=p.id AND t.data->>'contactId'=p.id AND evidence->>'contactId'=p.id
   AND (m.data->>'chapterId') IS NOT DISTINCT FROM (t.data->>'chapterId')
   AND m.revision<2147483647
   AND to_jsonb(m.revision)=evidence->'memberRevision' AND to_jsonb(t.revision)=evidence->'termRevision'
   AND ${iso("m.created_at")}=evidence->>'memberCreatedAtExact' AND ${iso("t.created_at")}=evidence->>'termCreatedAtExact'
   AND ${iso("p.created_at")}=evidence->>'contactCreatedAtExact'
   AND t.approval->>'status'='approved' AND t.approval->'revision'=to_jsonb(t.revision)
   AND jsonb_typeof(t.approval->'actorId')='string'
   AND NULLIF(t.approval->>'actorId','')<>t.last_editor_id AND t.snapshot->'data'=t.data
   AND t.snapshot->>'orgId'=m.org_id AND t.snapshot->>'moduleId'='memberships' AND t.snapshot->>'id'=t.id
   AND (t.approval->>'at')::timestamptz BETWEEN t.created_at AND moment
   AND (m.data->>'chapterId' IS NULL OR EXISTS(
      SELECT 1 FROM public.os_records ch WHERE ch.org_id=m.org_id AND ch.id=m.data->>'chapterId'
       AND ch.module_id='memberships' AND ch.data->>'kind'='chapter' AND ch.deleted_at IS NULL))
   AND t.data->>'duesStatus'='not-required' AND COALESCE(t.data->>'duesReference','')=''
   AND (t.data->>'dues' IS NULL OR t.data#>'{dues,minor}'='0'::jsonb)
   AND (m.data->>'startDate')::date<=(m.data->>'renewalDate')::date
   AND (moment AT TIME ZONE o.time_zone)::date BETWEEN (m.data->>'renewalDate')::date AND (m.data->>'endDate')::date
   AND (t.data->>'startDate')::date=(m.data->>'endDate')::date+1
   AND (t.data->>'endDate')::date>=(t.data->>'startDate')::date
   AND ((t.data->>'renewalDate') IS NULL OR (t.data->>'renewalDate')::date BETWEEN
       (t.data->>'startDate')::date AND (t.data->>'endDate')::date)
   AND witness.role IN ('owner','admin') AND witness.program_ids='[]'::jsonb
   AND to_jsonb(witness.revision)=evidence->'witnessMembershipRevision'
   AND ${iso("witness.created_at")}=evidence->>'witnessMembershipCreatedAtExact'
   AND (NOT is_confirm OR (actor_id<>m.last_editor_id
      AND moment>=(evidence->>'witnessedAtExact')::timestamptz
      AND decision#>'{result,memberRevision}'=to_jsonb(m.revision::bigint+1)
      AND decision#>>'{result,startDate}'=m.data->>'startDate' AND decision#>>'{result,endDate}'=t.data->>'endDate'
      AND (decision#>>'{result,renewalDate}') IS NOT DISTINCT FROM (t.data->>'renewalDate')))
 ) THEN RAISE EXCEPTION 'Assisted source changed or is ineligible' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END
`;
}

export function membershipAssistedInstallationSql(input) {
  const {storageSchema,onlineStorageSchema,runtimeRole}=options(input,true);
  const s=q(storageSchema), runtime=q(runtimeRole), t=s+".cases", routine=s+".guard_case()";
  const receiptShape=expression=>objectShape(expression,RECEIPT_KEYS)+" AND "+
    RECEIPT_KEYS.map(key=>shaField(expression,key)).join(" AND ");
  return `
CREATE SCHEMA ${s};
REVOKE ALL ON SCHEMA ${s} FROM PUBLIC,${runtime};
GRANT USAGE ON SCHEMA ${s} TO ${runtime};
CREATE TABLE ${t}(
 org_id text NOT NULL CHECK(org_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 case_id text NOT NULL CHECK(case_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 member_id text NOT NULL CHECK(member_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 term_id text NOT NULL CHECK(term_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 contact_id text CHECK(contact_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 slot smallint NOT NULL CHECK(slot BETWEEN 1 AND ${SLOT_LIMIT}),
 state text NOT NULL CHECK(state IN ('pending','confirmed','withdrawn')),
 revision integer NOT NULL CHECK(revision IN (1,2)),
 capture jsonb,
 capture_receipt jsonb NOT NULL,
 terminal jsonb,
 PRIMARY KEY(org_id,case_id), UNIQUE(org_id,slot),
 FOREIGN KEY(org_id,member_id) REFERENCES public.os_records(org_id,id) ON DELETE CASCADE,
 FOREIGN KEY(org_id,term_id) REFERENCES public.os_records(org_id,id) ON DELETE CASCADE,
 FOREIGN KEY(org_id,contact_id) REFERENCES public.os_records(org_id,id) ON DELETE CASCADE,
 CHECK(member_id<>term_id),
 CHECK ((${receiptShape("capture_receipt")}) IS TRUE),
 CHECK (capture IS NULL OR ((${objectShape("capture",CAPTURE_KEYS)} AND
   capture->'version'='1'::jsonb AND capture->'noticeRevision'='1'::jsonb
   AND ${shaField("capture","restoreEpochSha256")} AND ${shaField("capture","sourceSha256")}
   AND octet_length(capture::text)<=2048) IS TRUE)),
 CHECK (terminal IS NULL OR ((${objectShape("terminal",TERMINAL_KEYS)} AND
   terminal->'version'='1'::jsonb AND (${receiptShape("(terminal->'receipt')")})
   AND octet_length(terminal::text)<=1536) IS TRUE)),
 CHECK (((
    state='pending' AND revision=1 AND contact_id IS NOT NULL AND capture IS NOT NULL AND terminal IS NULL
  ) OR (
    state='confirmed' AND revision=2 AND contact_id IS NOT NULL AND capture IS NOT NULL AND terminal->>'action'='confirm'
      AND ${objectShape("(terminal->'result')",RESULT_KEYS)}
  ) OR (
    state='withdrawn' AND revision=2 AND contact_id IS NULL AND capture IS NULL
      AND terminal->>'action'='withdraw' AND terminal->'result'='null'::jsonb
  )) IS TRUE)
);
CREATE UNIQUE INDEX membership_assisted_pending_member ON ${t}(org_id,member_id) WHERE state='pending';
CREATE UNIQUE INDEX membership_assisted_reserved_term ON ${t}(org_id,term_id) WHERE state IN ('pending','confirmed');
ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${t} FORCE ROW LEVEL SECURITY;
CREATE POLICY assisted_staff ON ${t} TO ${runtime} USING (${currentStaff}) WITH CHECK (${currentStaff});
REVOKE ALL ON ${t} FROM PUBLIC,${runtime};
GRANT SELECT,INSERT ON ${t} TO ${runtime};
GRANT UPDATE(contact_id,state,revision,capture,terminal) ON ${t} TO ${runtime};
CREATE FUNCTION ${routine} RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
 SET search_path=pg_catalog,pg_temp AS $case$${guardSql(onlineStorageSchema)}$case$;
REVOKE ALL ON FUNCTION ${routine} FROM PUBLIC,${runtime};
CREATE TRIGGER membership_assisted_case_guard BEFORE INSERT OR UPDATE ON ${t}
 FOR EACH ROW EXECUTE FUNCTION ${routine};
`;
}

const COLUMNS = [
  ["org_id","text",true],["case_id","text",true],["member_id","text",true],["term_id","text",true],
  ["contact_id","text",false],["slot","smallint",true],["state","text",true],["revision","integer",true],
  ["capture","jsonb",false],["capture_receipt","jsonb",true],["terminal","jsonb",false],
];
const UPDATE_COLUMNS = ["contact_id","state","revision","capture","terminal"];
const SHAPE_SHA256 = "df3b2b111d8a3ee443f842ff04974ac7083d6d590adfe922414ac915eed04b8d";

/** The fixture independently checks this complete closed catalog projection.
 * Direct ACLs and effective restricted-role privileges are checked together. */
export async function readMembershipAssistedCatalog(c,input) {
  const {storageSchema,onlineStorageSchema}=options(input);
  const sql=`
WITH t AS (
 SELECT n.oid AS schema_oid,n.nspowner,n.nspacl,r.oid AS runtime,o.oid AS owner,
   x.*,f.oid AS guard_oid,f.prosrc,f.proowner,f.proacl,f.prosecdef,f.proconfig,f.prorettype,f.prokind,
   f.pronargs,f.pronargdefaults,f.prolang
 FROM pg_namespace n JOIN pg_class x ON x.relnamespace=n.oid AND x.relname='cases'
 JOIN pg_proc f ON f.pronamespace=n.oid AND f.proname='guard_case' AND f.pronargs=0
 JOIN pg_roles r ON r.rolname=current_user
 JOIN pg_database d ON d.datname=current_database() JOIN pg_roles o ON o.oid=d.datdba
 WHERE n.nspname=$1 AND r.rolcanlogin AND NOT
   (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolinherit)
 AND r.oid<>o.oid AND NOT pg_has_role(r.oid,o.oid,'MEMBER')
)
SELECT
 (t.relkind='r' AND t.relpersistence='p' AND t.relowner=t.owner AND t.nspowner=t.owner
   AND t.relrowsecurity AND t.relforcerowsecurity AND NOT t.relispartition AND t.reloptions IS NULL
   AND NOT EXISTS(SELECT 1 FROM pg_inherits i WHERE t.oid IN(i.inhrelid,i.inhparent))
   AND (SELECT count(*) FROM pg_class x WHERE x.relnamespace=t.schema_oid)=5
   AND (SELECT count(*) FROM pg_proc f WHERE f.pronamespace=t.schema_oid)=1
   AND t.proowner=t.owner AND NOT t.prosecdef AND t.proconfig=ARRAY['search_path=pg_catalog, pg_temp']
   AND t.prorettype='trigger'::regtype AND t.prokind='f' AND t.pronargdefaults=0
   AND t.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql') AND t.prosrc=$2
   AND NOT has_function_privilege(t.guard_oid,'EXECUTE')
   AND NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(t.proacl,acldefault('f',t.proowner))) a WHERE a.grantee<>t.owner)
   AND has_schema_privilege(t.schema_oid,'USAGE') AND NOT has_schema_privilege(t.schema_oid,'CREATE')
   AND NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(t.nspacl,acldefault('n',t.nspowner))) a
     WHERE a.grantee<>t.owner AND (a.grantee<>t.runtime OR a.privilege_type<>'USAGE' OR a.is_grantable))
   AND has_table_privilege(t.oid,'SELECT') AND has_table_privilege(t.oid,'INSERT')
   AND NOT has_table_privilege(t.oid,'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
   AND NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(t.relacl,acldefault('r',t.relowner))) a
     WHERE a.grantee<>t.owner AND (a.grantee<>t.runtime OR a.privilege_type NOT IN ('SELECT','INSERT') OR a.is_grantable))
   AND NOT EXISTS(SELECT 1 FROM pg_attribute f CROSS JOIN LATERAL aclexplode(f.attacl) a
     WHERE f.attrelid=t.oid AND a.grantee<>t.owner
       AND (a.grantee<>t.runtime OR a.privilege_type<>'UPDATE' OR a.is_grantable OR NOT(f.attname=ANY($3::text[]))))
 ) AS permissions,
 (SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull) ORDER BY a.attnum)
  FROM pg_attribute a WHERE a.attrelid=t.oid AND a.attnum>0) AS columns,
 (SELECT array_agg(a.attname::text ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=t.oid AND a.attnum>0
  AND has_column_privilege(t.oid,a.attnum,'UPDATE')) AS updates,
 jsonb_build_object(
  'constraints',(SELECT jsonb_agg(jsonb_build_array(k.conname,k.contype,k.conkey,k.confkey,
    n.nspname||'.'||r.relname,k.confupdtype,k.confdeltype,k.confmatchtype,k.convalidated,
    COALESCE((to_jsonb(k)->>'conenforced')::boolean,true),k.condeferrable,k.condeferred,k.connoinherit,
    CASE WHEN k.contype='c' THEN pg_get_constraintdef(k.oid,false) END) ORDER BY k.conname COLLATE "C")
    FROM pg_constraint k LEFT JOIN pg_class r ON r.oid=k.confrelid LEFT JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE k.conrelid=t.oid AND k.contype IN ('p','u','f','c')),
  'indexes',(SELECT jsonb_agg(jsonb_build_array(r.relname,i.indkey::text,i.indnatts,i.indnkeyatts,i.indisunique,i.indisprimary,
    i.indimmediate,i.indisvalid,i.indisready,i.indislive,pg_get_expr(i.indexprs,t.oid),pg_get_expr(i.indpred,t.oid),a.amname)
    ORDER BY r.relname COLLATE "C") FROM pg_index i JOIN pg_class r ON r.oid=i.indexrelid
    JOIN pg_am a ON a.oid=r.relam WHERE i.indrelid=t.oid),
  'policies',(SELECT jsonb_agg(jsonb_build_array(p.polname,p.polcmd,p.polpermissive,p.polroles=ARRAY[t.runtime],
    pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname COLLATE "C")
    FROM pg_policy p WHERE p.polrelid=t.oid),
  'attributes',(SELECT jsonb_agg(jsonb_build_array(a.attname,a.attnotnull,a.attgenerated,a.attidentity,a.attisdropped,a.atthasdef,
    a.attcollation=y.typcollation) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_type y ON y.oid=a.atttypid
    WHERE a.attrelid=t.oid AND a.attnum>0),
  'triggers',(SELECT jsonb_agg(jsonb_build_array(n.nspname='public',r.relname,g.tgenabled,g.tgisinternal,g.tgtype,
    g.tgdeferrable,g.tginitdeferred,g.tgnargs,g.tgattr::text,g.tgqual IS NULL,CASE WHEN NOT g.tgisinternal THEN g.tgname END,
    k.conname,g.tgfoid=t.guard_oid,f.proname,fn.nspname='pg_catalog')
    ORDER BY n.nspname='public',r.relname COLLATE "C",k.conname COLLATE "C",g.tgtype,f.proname COLLATE "C")
    FROM pg_trigger g JOIN pg_class r ON r.oid=g.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace
    JOIN pg_proc f ON f.oid=g.tgfoid JOIN pg_namespace fn ON fn.oid=f.pronamespace
    LEFT JOIN pg_constraint k ON k.oid=g.tgconstraint
    WHERE g.tgrelid=t.oid OR g.tgfoid=t.guard_oid OR k.conrelid=t.oid)
 ) AS shape FROM t`;
  const response=await c.query(sql,[storageSchema,guardSql(onlineStorageSchema),UPDATE_COLUMNS]);
  if(response.rowCount!==1) return null;
  const row=response.rows[0];
  return Object.freeze({permissions:row.permissions===true,columns:row.columns,updates:row.updates,
    shapeSha256:hash(row.shape),shape:row.shape});
}

const selection = input => {
  const v=fields(input,["orgId","memberId","termId"]);
  if(![v.orgId,v.memberId,v.termId].every(id) || v.memberId===v.termId) invalid();
  return v;
};
const PROJECTION = `org_id AS "orgId",case_id AS "caseId",member_id AS "memberId",term_id AS "termId",
  state,revision,capture,capture_receipt AS "captureReceipt",terminal`;
function projected(result) {
  if(result.rowCount===0) return null;
  if(result.rowCount!==1) unavailable();
  const row=fields(result.rows[0],["orgId","caseId","memberId","termId","state","revision","capture","captureReceipt","terminal"]);
  if(![row.orgId,row.caseId,row.memberId,row.termId].every(id) || row.memberId===row.termId) unavailable();
  checkReceipt(row.captureReceipt);
  if(row.state==="pending" && row.revision===1 && row.terminal===null) checkCapture(row.capture);
  else if(row.state==="confirmed" && row.revision===2 && row.terminal?.action==="confirm") {
    checkCapture(row.capture); checkTerminal(row.terminal);
  } else if(row.state==="withdrawn" && row.revision===2 && row.capture===null && row.terminal?.action==="withdraw") checkTerminal(row.terminal);
  else unavailable();
  return row;
}

/** All mutating callers use the existing organization transaction lock before
 * their source review and keep the case and ordinary writes on this client. */
export function createMembershipAssistedStore(input={}) {
  const config=options(input), t=q(config.storageSchema)+".cases", online=q(config.onlineStorageSchema)+".bindings";
  const onlineGate=createMembershipRenewalStore({applicationSchema:"public",storageSchema:config.onlineStorageSchema});
  const installed=async c=> {
    const catalog=await readMembershipAssistedCatalog(c,config);
    return catalog?.permissions===true && stable(catalog.columns)===stable(COLUMNS) &&
      stable(catalog.updates)===stable(UPDATE_COLUMNS) && catalog.shapeSha256===SHAPE_SHA256;
  };
  const ready=async c=>await installed(c) && await onlineGate.ready(c);
  const present=async c=>(await c.query("SELECT to_regnamespace($1) IS NOT NULL AS present",[config.storageSchema])).rows[0]?.present===true;
  async function read(c,orgId,caseId) {
    if(!id(orgId) || !id(caseId)) invalid();
    return projected(await c.query(`SELECT ${PROJECTION} FROM ${t} WHERE org_id=$1 AND case_id=$2`,[orgId,caseId]));
  }
  async function list(c,input) {
    const {orgId,memberId}=fields(input,["orgId","memberId"]);
    if(!id(orgId) || !id(memberId)) invalid();
    const result=await c.query(`SELECT case_id AS "caseId",member_id AS "memberId",term_id AS "termId",
      state,revision FROM ${t} WHERE org_id=$1 AND member_id=$2 ORDER BY slot LIMIT ${SLOT_LIMIT+1}`,[orgId,memberId]);
    if(result.rowCount>SLOT_LIMIT || result.rowCount!==result.rows.length) unavailable();
    return Object.freeze(result.rows.map(row=>{
      const v=fields(row,["caseId","memberId","termId","state","revision"]);
      if(v.memberId!==memberId || !id(v.caseId) || !id(v.termId) ||
        !((v.state==="pending" && v.revision===1) || (["confirmed","withdrawn"].includes(v.state) && v.revision===2))) unavailable();
      return v;
    }));
  }
  async function readConflict(c,input) {
    const {orgId,memberId,termId}=selection(input);
    if(!await present(c)) return false;
    if(!await installed(c)) unavailable();
    const result=await c.query(`SELECT EXISTS(SELECT 1 FROM ${t} WHERE org_id=$1 AND
      ((state='pending' AND member_id=$2) OR (state IN ('pending','confirmed') AND term_id=$3))) AS conflict`,
      [orgId,memberId,termId]);
    if(result.rowCount!==1 || typeof result.rows[0].conflict!=="boolean") unavailable();
    return result.rows[0].conflict;
  }
  async function readOnlineConflict(c,input) {
    const {orgId,memberId,termId}=selection(input);
    const result=await c.query(`SELECT EXISTS(SELECT 1 FROM ${online} WHERE org_id=$1 AND (member_id=$2 OR term_id=$3)) AS conflict`,
      [orgId,memberId,termId]);
    if(result.rowCount!==1 || typeof result.rows[0].conflict!=="boolean") unavailable();
    return result.rows[0].conflict;
  }
  async function insert(c,input) {
    const v=fields(input,CASE_KEYS);
    if(![v.orgId,v.caseId,v.memberId,v.termId].every(id) || v.memberId===v.termId) invalid();
    checkCapture(v.capture); checkReceipt(v.captureReceipt);
    await c.query(LOCK,[v.orgId]);
    const result=await c.query(`INSERT INTO ${t}(org_id,case_id,member_id,term_id,contact_id,slot,state,revision,capture,capture_receipt)
      SELECT $1,$2,$3,$4,$5,g.slot,'pending',1,$6::jsonb,$7::jsonb FROM generate_series(1,${SLOT_LIMIT}) g(slot)
      WHERE NOT EXISTS(SELECT 1 FROM ${t} occupied WHERE occupied.org_id=$1 AND occupied.slot=g.slot)
      ORDER BY g.slot LIMIT 1 ON CONFLICT DO NOTHING RETURNING ${PROJECTION}`,
      [v.orgId,v.caseId,v.memberId,v.termId,v.capture.contactId,JSON.stringify(v.capture),JSON.stringify(v.captureReceipt)]);
    if(!result.rowCount) {
      const count=(await c.query(`SELECT count(*)::int AS n FROM ${t} WHERE org_id=$1`,[v.orgId])).rows[0]?.n;
      if(count===SLOT_LIMIT) full();
      changed();
    }
    return projected(result);
  }
  async function transition(c,input) {
    const v=fields(input,["orgId","caseId","expectedRevision","state","terminal"]);
    if(!id(v.orgId) || !id(v.caseId) || v.expectedRevision!==1 || !["confirmed","withdrawn"].includes(v.state)) invalid();
    checkTerminal(v.terminal);
    if((v.state==="confirmed")!==(v.terminal.action==="confirm")) invalid();
    await c.query(LOCK,[v.orgId]);
    const result=await c.query(`UPDATE ${t} SET state=$4,revision=2,terminal=$5::jsonb,
       capture=CASE WHEN $4='withdrawn' THEN NULL ELSE capture END,
       contact_id=CASE WHEN $4='withdrawn' THEN NULL ELSE contact_id END
       WHERE org_id=$1 AND case_id=$2 AND revision=$3 AND state='pending' RETURNING ${PROJECTION}`,
      [v.orgId,v.caseId,v.expectedRevision,v.state,JSON.stringify(v.terminal)]);
    if(!result.rowCount) changed();
    return projected(result);
  }
  return Object.freeze({schema:config.storageSchema,ready,caseReady:installed,present,read,list,readConflict,readOnlineConflict,insert,transition});
}
