import { fail, stable } from "./security.mjs";

const IDENTIFIER = /^[a-z][a-z0-9_]{0,62}$/;
const fields = {
  offers: ["org_id","intake_id","user_id","link_id","link_revision","link_created_at","intake_revision",
    "intake_created_at","publication_id","publication_created_at","evidence_sha256","key_sha256","command_sha256","actor_sha256","created_at"],
  bindings: ["org_id","intake_id","member_id","member_created_at","term_id","term_created_at","opens_on","closes_on","contact_sha256",
    "key_sha256","command_sha256","authority_sha256","created_at"],
  requests: ["org_id","intake_id","receipt"],
  decisions: ["org_id","intake_id","receipt"],
  directory_choices: ["org_id","intake_id","revision","receipt"],
};
const tables = Object.keys(fields).sort();
const recordKeys = {
  offers:[["p",["org_id","intake_id"],null,null],["u",["org_id","link_id"],null,null],
    ["f",["user_id","org_id","intake_id"],"public.os_participant_links",["user_id","org_id","intake_id"]]],
  bindings:[["p",["org_id","intake_id"],null,null],["u",["org_id","member_id"],null,null],["u",["org_id","term_id"],null,null],
    ["f",["org_id","intake_id"],"@.offers",["org_id","intake_id"]],
    ["f",["org_id","member_id"],"public.os_records",["org_id","id"]],
    ["f",["org_id","term_id"],"public.os_records",["org_id","id"]]],
  requests:[["p",["org_id","intake_id"],null,null],["f",["org_id","intake_id"],"@.bindings",["org_id","intake_id"]]],
  decisions:[["p",["org_id","intake_id"],null,null],["f",["org_id","intake_id"],"@.requests",["org_id","intake_id"]]],
  directory_choices:[["p",["org_id","intake_id"],null,null],["f",["org_id","intake_id"],"@.bindings",["org_id","intake_id"]]],
};
// Closed SQL check expressions independently deparsed on PostgreSQL 17/18.
const checks = {
  bindings:[14,"f7b2ef06210da1f8bbbd1506c5b37acfebb348e8bff6e2feb353ececb5df7863"],
  decisions:[3,"87494d5a0368c206601a040ffd8190664ea64cb11e017906a6bac28c3c8873ac"],
  directory_choices:[5,"b9650bf70b7b427a925c732c815552acd1a7b9fb70f51e70a026fb9d3cfc5b85"],
  offers:[15,"83bad5a57beea06472e2d0ba6edef5621490e90117dd987d762008303a0f65da"],
  requests:[3,"87494d5a0368c206601a040ffd8190664ea64cb11e017906a6bac28c3c8873ac"],
};
const columnType = name => name.endsWith("_at") ? "timestamp with time zone" : name.endsWith("_on") ? "date" :
  name.endsWith("revision") ? "integer" : name === "receipt" ? "jsonb" : "text";
const runtimeRoles = "'owner','admin'";
const tenant = "(org_id = current_setting('app.org_id'::text, true))";
const actor = "(user_id = current_setting('app.user_id'::text, true))";
const sha = name => `CHECK(${name} ~ '^[a-f0-9]{64}$')`;
const id = name => `CHECK(${name} ~ '^[A-Za-z0-9_-]{1,100}$')`;
const time = name => `CHECK(isfinite(${name}))`;
const offerRead = "((" + tenant + " AND " + actor + ") OR @staff(org_id))";
const ownCycle = "@own(org_id, intake_id)";
const staffCycle = "@staff(org_id)";
const cycleRead = "(" + ownCycle + " OR " + staffCycle + ")";
const staffWrite = "(" + staffCycle + " AND (NOT " + ownCycle + "))";
const policies = [
  ["offers","offer_read","r",offerRead,null],
  ["offers","offer_insert","a",null,`(${tenant} AND ${actor} AND @link(org_id, intake_id, user_id, link_id, link_revision))`],
  ["offers","offer_purge_keys","r",tenant,null,true],
  ["offers","offer_purge_delete","d",tenant,null,true],
  ["bindings","binding_read","r",cycleRead,null],
  ["bindings","binding_insert","a",null,staffWrite],
  ["requests","request_read","r",cycleRead,null],
  ["requests","request_insert","a",null,ownCycle],
  ["decisions","decision_read","r",cycleRead,null],
  ["decisions","decision_insert","a",null,staffWrite],
  ["directory_choices","directory_read","r",ownCycle,null],
  ["directory_choices","directory_insert","a",null,ownCycle],
  ["directory_choices","directory_update","w",ownCycle,ownCycle],
];
const sqlCommands = {r:"SELECT",a:"INSERT",d:"DELETE",w:"UPDATE"};
const qualify = (s, text) => text === null ? null :
  text.replaceAll("@staff",s+".staff_cycle").replaceAll("@own",s+".own_cycle").replaceAll("@link",s+".current_own_link");
const bootstrap = (edge, purge, owner) => `${edge}.roleid=${purge} AND ${edge}.member=${owner} AND ${edge}.grantor=10::oid
    AND ${edge}.admin_option AND NOT ${edge}.set_option AND NOT ${edge}.inherit_option`;
export const membershipStorageUnavailable = () =>
  fail(503,"membership_renewal_storage","Membership renewal is temporarily unavailable.");
export function membershipRenewalConfiguration(env = process.env) {
  return env.OS_MEMBERSHIP_RENEWALS_ENABLED === "1" && validSchema(env.OS_MEMBERSHIP_RENEWALS_STORAGE_SCHEMA)
    ? {applicationSchema:"public",storageSchema:env.OS_MEMBERSHIP_RENEWALS_STORAGE_SCHEMA} : null;
}
const validSchema = value => typeof value === "string" && IDENTIFIER.test(value) && value !== "public";
function checkedOptions({applicationSchema = "public",storageSchema,runtimeRole,purgeRole = "charitology_membership_renewal_purge"}, install) {
  if (applicationSchema !== "public" || !validSchema(storageSchema) || typeof purgeRole !== "string" || !IDENTIFIER.test(purgeRole) ||
      (install && (typeof runtimeRole !== "string" || !IDENTIFIER.test(runtimeRole) || runtimeRole === purgeRole)))
    throw new TypeError("Use exact private membership storage identifiers.");
  return {s:storageSchema,runtime:runtimeRole,purge:purgeRole};
}
function routines(s) {
  return {
    staff_cycle: {
      args:"tenant text",returns:"boolean",language:"sql",volatility:"STABLE",definer:false,
      body:`SELECT tenant=current_setting('app.org_id',true) AND EXISTS(
        SELECT 1 FROM public.os_members m WHERE m.org_id=tenant AND m.user_id=current_setting('app.user_id',true)
          AND m.role IN (${runtimeRoles}) AND m.program_ids='[]'::jsonb)`,
    },
    own_cycle: {
      args:"tenant text, request text",returns:"boolean",language:"sql",volatility:"STABLE",definer:false,
      body:`SELECT tenant=current_setting('app.org_id',true) AND EXISTS(
        SELECT 1 FROM ${s}.offers o WHERE o.org_id=tenant AND o.intake_id=request AND o.user_id=current_setting('app.user_id',true))`,
    },
    current_own_link: {
      args:"tenant text, request text, person text, link text, requested_revision integer",returns:"boolean",language:"sql",volatility:"STABLE",definer:false,
      body:`SELECT tenant=current_setting('app.org_id',true) AND person=current_setting('app.user_id',true) AND EXISTS(
        SELECT 1 FROM public.os_participant_links l JOIN public.os_intake i
          ON i.org_id=l.org_id AND i.id=l.intake_id AND i.publication_id=l.publication_id
        JOIN public.os_publications p ON p.org_id=i.org_id AND p.id=i.publication_id
        WHERE l.org_id=tenant AND l.intake_id=request AND l.user_id=person AND l.id=link
          AND l.revision=requested_revision AND l.revoked_at IS NULL AND i.status='converted'
          AND i.cancelled_at IS NULL AND i.erased_at IS NULL AND p.kind='contact')`,
    },
    purge_offer: {
      args:"",returns:"trigger",language:"plpgsql",volatility:"VOLATILE",definer:true,
      body:`
DECLARE request_id text;
BEGIN
 IF TG_TABLE_SCHEMA='public' AND TG_TABLE_NAME='os_intake' THEN
  IF OLD.revision=NEW.revision AND OLD.status IS NOT DISTINCT FROM NEW.status
    AND OLD.erased_at IS NOT DISTINCT FROM NEW.erased_at AND OLD.cancelled_at IS NOT DISTINCT FROM NEW.cancelled_at
    AND OLD.converted_ids IS NOT DISTINCT FROM NEW.converted_ids THEN RETURN NEW; END IF;
  request_id:=NEW.id;
 ELSIF TG_TABLE_SCHEMA='public' AND TG_TABLE_NAME='os_participant_links' THEN
  IF OLD.revision=NEW.revision AND OLD.revoked_at IS NOT DISTINCT FROM NEW.revoked_at THEN RETURN NEW; END IF;
  request_id:=NEW.intake_id;
 ELSE
  RAISE EXCEPTION 'Unsupported membership purge source';
 END IF;
 IF NEW.org_id IS DISTINCT FROM current_setting('app.org_id',true) THEN
  RAISE EXCEPTION 'Membership purge requires the current workspace';
 END IF;
 DELETE FROM ${s}.offers WHERE org_id=NEW.org_id AND intake_id=request_id;
 RETURN NEW;
END
`,
    },
  };
}

/** Separate private schema. Run only in the authorized outer install transaction. */
export function membershipRenewalInstallationSql(options) {
  const {s,runtime,purge} = checkedOptions(options,true);
  const managed = options.managedDatabaseOwner === true;
  const owner = managed ? `DO $owner$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r JOIN pg_catalog.pg_database d ON d.datdba=r.oid
  WHERE d.datname=pg_catalog.current_database() AND r.rolname=current_user AND r.rolcreaterole AND NOT r.rolsuper)
 THEN RAISE EXCEPTION 'Use the managed database owner for membership storage'; END IF;
 PERFORM pg_catalog.set_config('createrole_self_grant','',true);
END $owner$;
` : "";
  const functions = Object.entries(routines(s)).map(([name,f]) =>
    `CREATE FUNCTION ${s}.${name}(${f.args}) RETURNS ${f.returns} LANGUAGE ${f.language} ${f.volatility}
      SECURITY ${f.definer ? "DEFINER" : "INVOKER"} SET search_path=pg_catalog,pg_temp AS $fn$${f.body}$fn$;`).join("\n");
  const policySql = policies.map(([table,name,op,using,check,purgeOnly]) =>
    `CREATE POLICY ${name} ON ${s}.${table} FOR ${sqlCommands[op]} TO "${purgeOnly ? purge : runtime}"` +
    (using ? ` USING (${qualify(s,using)})` : "") + (check ? ` WITH CHECK (${qualify(s,check)})` : "") + ";").join("\n");
  const common = `org_id text NOT NULL ${id("org_id")},intake_id text NOT NULL ${id("intake_id")},PRIMARY KEY(org_id,intake_id)`;
  const receipt = `receipt jsonb NOT NULL CHECK(jsonb_typeof(receipt)='object' AND octet_length(receipt::text)<=4096)`;
  const parent = name => `FOREIGN KEY(org_id,intake_id) REFERENCES ${s}.${name}(org_id,intake_id) ON DELETE CASCADE`;
  const transfer = managed ? `GRANT "${purge}" TO CURRENT_USER WITH SET TRUE, INHERIT FALSE, ADMIN FALSE GRANTED BY CURRENT_USER;` : "";
  const finish = managed ? `REVOKE "${purge}" FROM CURRENT_USER GRANTED BY CURRENT_USER;
DO $owner$
BEGIN
 IF (SELECT count(*) FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid OR r.oid=m.member
    WHERE r.rolname='${purge}')<>1 OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles j ON j.rolname='${purge}' JOIN pg_catalog.pg_roles r ON r.rolname=current_user
    WHERE ${bootstrap("m","j.oid","r.oid")})
 THEN RAISE EXCEPTION 'Membership purge has unexpected role membership'; END IF;
END $owner$;` : "";
  return `${owner}CREATE ROLE "${purge}" NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION NOINHERIT;
CREATE SCHEMA ${s};
REVOKE ALL ON SCHEMA ${s} FROM PUBLIC;
GRANT USAGE ON SCHEMA ${s} TO "${runtime}","${purge}";
CREATE TABLE ${s}.offers(
 ${common},user_id text NOT NULL ${id("user_id")},link_id text NOT NULL CHECK(link_id ~ '^[a-f0-9]{32}$'),
 link_revision int NOT NULL CHECK(link_revision>0),link_created_at timestamptz NOT NULL ${time("link_created_at")},
 intake_revision int NOT NULL CHECK(intake_revision>0),intake_created_at timestamptz NOT NULL ${time("intake_created_at")},
 publication_id text NOT NULL ${id("publication_id")},publication_created_at timestamptz NOT NULL ${time("publication_created_at")},
 evidence_sha256 text NOT NULL ${sha("evidence_sha256")},key_sha256 text NOT NULL ${sha("key_sha256")},
 command_sha256 text NOT NULL ${sha("command_sha256")},actor_sha256 text NOT NULL ${sha("actor_sha256")},
 created_at timestamptz NOT NULL ${time("created_at")},UNIQUE(org_id,link_id),
 FOREIGN KEY(user_id,org_id,intake_id) REFERENCES public.os_participant_links(user_id,org_id,intake_id) ON DELETE CASCADE
);
CREATE TABLE ${s}.bindings(
 ${common},member_id text NOT NULL ${id("member_id")},member_created_at timestamptz NOT NULL ${time("member_created_at")},
 term_id text NOT NULL ${id("term_id")},term_created_at timestamptz NOT NULL ${time("term_created_at")},
 opens_on date NOT NULL CHECK(isfinite(opens_on)),closes_on date NOT NULL CHECK(isfinite(closes_on) AND closes_on>=opens_on),
 contact_sha256 text NOT NULL ${sha("contact_sha256")},key_sha256 text NOT NULL ${sha("key_sha256")},
 command_sha256 text NOT NULL ${sha("command_sha256")},authority_sha256 text NOT NULL ${sha("authority_sha256")},
 created_at timestamptz NOT NULL ${time("created_at")},CHECK(member_id<>term_id),UNIQUE(org_id,member_id),UNIQUE(org_id,term_id),
 ${parent("offers")},
 FOREIGN KEY(org_id,member_id) REFERENCES public.os_records(org_id,id) ON DELETE CASCADE,
 FOREIGN KEY(org_id,term_id) REFERENCES public.os_records(org_id,id) ON DELETE CASCADE
);
CREATE TABLE ${s}.requests(${common},${receipt},${parent("bindings")});
CREATE TABLE ${s}.decisions(${common},${receipt},${parent("requests")});
CREATE TABLE ${s}.directory_choices(${common},revision int NOT NULL CHECK(revision>0),${receipt},
 CHECK((receipt->>'revision'=revision::text) IS TRUE),${parent("bindings")});
${tables.map(t => `ALTER TABLE ${s}.${t} ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${s}.${t} FORCE ROW LEVEL SECURITY;
REVOKE ALL ON ${s}.${t} FROM PUBLIC,"${runtime}","${purge}";
GRANT SELECT,INSERT ON ${s}.${t} TO "${runtime}";`).join("\n")}
GRANT UPDATE(revision,receipt) ON ${s}.directory_choices TO "${runtime}";
GRANT SELECT(org_id,intake_id),DELETE ON ${s}.offers TO "${purge}";
${functions}
${Object.entries(routines(s)).map(([name,f]) => `REVOKE ALL ON FUNCTION ${s}.${name}(${f.args}) FROM PUBLIC,"${runtime}";
${f.definer ? "" : `GRANT EXECUTE ON FUNCTION ${s}.${name}(${f.args}) TO "${runtime}";`}`).join("\n")}
${policySql}
CREATE TRIGGER membership_renewal_purge_intake AFTER UPDATE OF revision,status,erased_at,cancelled_at,converted_ids ON public.os_intake
 FOR EACH ROW EXECUTE FUNCTION ${s}.purge_offer();
CREATE TRIGGER membership_renewal_purge_link AFTER UPDATE OF revision,revoked_at ON public.os_participant_links
 FOR EACH ROW EXECUTE FUNCTION ${s}.purge_offer();
${transfer}
GRANT CREATE ON SCHEMA ${s} TO "${purge}";
ALTER FUNCTION ${s}.purge_offer() OWNER TO "${purge}";
REVOKE CREATE ON SCHEMA ${s} FROM "${purge}";
${finish}
`;
}

const layout = `WITH scope AS (
 SELECT n.oid AS schema_oid,n.nspowner AS owner,r.oid AS runtime,j.oid AS purge,d.datdba AS database_owner
 FROM pg_catalog.pg_namespace n JOIN pg_catalog.pg_roles r ON r.rolname=current_user
 JOIN pg_catalog.pg_roles j ON j.rolname=$2 JOIN pg_catalog.pg_database d ON d.datname=pg_catalog.current_database()
 WHERE n.nspname=$1 AND r.rolcanlogin
 AND NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolinherit
   OR j.rolsuper OR j.rolbypassrls OR j.rolcanlogin
   OR j.rolcreaterole OR j.rolcreatedb OR j.rolreplication OR j.rolinherit)
 AND r.oid<>n.nspowner AND j.oid<>n.nspowner
 AND NOT pg_has_role(r.oid,j.oid,'MEMBER') AND NOT pg_has_role(r.oid,n.nspowner,'MEMBER')
 AND NOT pg_has_role(r.oid,d.datdba,'MEMBER')
 AND NOT pg_has_role(d.datdba,j.oid,'SET')
 AND NOT EXISTS(SELECT 1 FROM pg_auth_members m WHERE j.oid IN (m.roleid,m.member)
   AND NOT (${bootstrap("m","j.oid","d.datdba")}))
 AND has_schema_privilege(r.oid,n.oid,'USAGE') AND has_schema_privilege(j.oid,n.oid,'USAGE')
 AND NOT has_schema_privilege(r.oid,n.oid,'CREATE') AND NOT has_schema_privilege(j.oid,n.oid,'CREATE')
 AND NOT EXISTS(SELECT 1 FROM aclexplode(n.nspacl) a WHERE a.grantee<>n.nspowner
   AND (a.grantee NOT IN (r.oid,j.oid) OR a.privilege_type<>'USAGE' OR a.is_grantable))
 AND NOT has_schema_privilege(j.oid,'public','CREATE')
 AND NOT EXISTS(SELECT 1 FROM pg_class a WHERE a.relnamespace='public'::regnamespace AND a.relkind IN ('r','p','m','v','f')
    AND (has_table_privilege(j.oid,a.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
       OR has_any_column_privilege(j.oid,a.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
), relations AS (
 SELECT t.*,s.runtime,s.purge,s.owner FROM scope s JOIN pg_class t ON t.relnamespace=s.schema_oid AND t.relkind IN ('r','p','m','v','f')
)
SELECT
 (SELECT jsonb_agg(jsonb_build_array(t.relname,
    t.relkind='r' AND t.relowner=t.owner AND t.relrowsecurity AND t.relforcerowsecurity,
    (SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),
      a.attnotnull AND a.attgenerated='' AND a.attidentity='' AND NOT a.atthasdef AND NOT a.attisdropped) ORDER BY a.attnum)
      FROM pg_attribute a WHERE a.attrelid=t.oid AND a.attnum>0),
    has_table_privilege(t.oid,'SELECT') AND has_table_privilege(t.oid,'INSERT')
      AND NOT has_table_privilege(t.oid,'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
      AND has_table_privilege(t.purge,t.oid,'DELETE')=(t.relname='offers')
      AND NOT has_table_privilege(t.purge,t.oid,'SELECT,INSERT,UPDATE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
      AND NOT has_any_column_privilege(t.purge,t.oid,'INSERT,UPDATE,REFERENCES')
      AND NOT EXISTS(SELECT 1 FROM aclexplode(t.relacl) g WHERE g.grantee<>t.owner AND
        (g.is_grantable OR NOT ((g.grantee=t.runtime AND g.privilege_type IN ('SELECT','INSERT')) OR
         (g.grantee=t.purge AND t.relname='offers' AND g.privilege_type='DELETE'))))
      AND NOT EXISTS(SELECT 1 FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) g
        WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped AND g.grantee<>t.owner
          AND (g.is_grantable OR NOT ((g.grantee=t.runtime AND t.relname='directory_choices'
            AND a.attname IN ('receipt','revision') AND g.privilege_type='UPDATE') OR
          (g.grantee=t.purge AND t.relname='offers' AND a.attname IN ('intake_id','org_id') AND g.privilege_type='SELECT')))),
    (SELECT COALESCE(jsonb_agg(a.attname ORDER BY a.attname COLLATE "C"),'[]'::jsonb) FROM pg_attribute a
      WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped AND has_column_privilege(t.oid,a.attnum,'UPDATE')),
    (SELECT COALESCE(jsonb_agg(a.attname ORDER BY a.attname COLLATE "C"),'[]'::jsonb) FROM pg_attribute a
      WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped AND has_column_privilege(t.purge,t.oid,a.attnum,'SELECT'))
  ) ORDER BY t.relname COLLATE "C") FROM relations t) AS tables,
 (SELECT jsonb_agg(jsonb_build_array(t.relname,k.contype,
   ARRAY(SELECT a.attname::text FROM unnest(k.conkey) WITH ORDINALITY AS z(attnum,pos)
     JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=z.attnum ORDER BY z.pos),
   n.nspname||'.'||parent.relname,
   CASE WHEN k.contype='f' THEN ARRAY(SELECT a.attname::text FROM unnest(k.confkey) WITH ORDINALITY AS z(attnum,pos)
     JOIN pg_attribute a ON a.attrelid=k.confrelid AND a.attnum=z.attnum ORDER BY z.pos) END,
   k.convalidated AND COALESCE((to_jsonb(k)->>'conenforced')::boolean,true) AND NOT k.condeferrable AND NOT k.condeferred
     AND (k.contype<>'f' OR (k.confupdtype='a' AND k.confdeltype='c' AND k.confmatchtype='s'))))
  FROM relations t JOIN pg_constraint k ON k.conrelid=t.oid AND k.contype IN ('p','u','f')
  LEFT JOIN pg_class parent ON parent.oid=k.confrelid LEFT JOIN pg_namespace n ON n.oid=parent.relnamespace) AS keys,
 (SELECT jsonb_agg(jsonb_build_array(t.relname,k.total,k.digest) ORDER BY t.relname COLLATE "C")
   FROM relations t CROSS JOIN LATERAL (
     SELECT count(*)::int AS total,encode(sha256(convert_to(string_agg(pg_get_expr(k.conbin,t.oid),E'\\n'
       ORDER BY pg_get_expr(k.conbin,t.oid) COLLATE "C"),'UTF8')),'hex') AS digest
     FROM pg_constraint k WHERE k.conrelid=t.oid AND k.contype='c' AND k.convalidated
       AND COALESCE((to_jsonb(k)->>'conenforced')::boolean,true)) k) AS checks,
 (SELECT jsonb_agg(jsonb_build_array(t.relname,p.polname,p.polcmd,p.polpermissive,
    CASE WHEN p.polroles=ARRAY[t.runtime] THEN 'runtime' WHEN p.polroles=ARRAY[t.purge] THEN 'purge' END,
    pg_get_expr(p.polqual,t.oid),pg_get_expr(p.polwithcheck,t.oid)) ORDER BY p.polname COLLATE "C")
  FROM relations t JOIN pg_policy p ON p.polrelid=t.oid) AS policies,
 (SELECT jsonb_agg(jsonb_build_array(f.proname,pg_get_function_identity_arguments(f.oid),
    format_type(f.prorettype,NULL),l.lanname,f.provolatile,f.prosecdef,f.prosrc,
    f.prokind='f' AND NOT f.proretset AND NOT f.proleakproof AND NOT f.proisstrict AND f.pronargdefaults=0
      AND f.proconfig=ARRAY['search_path=pg_catalog, pg_temp']
      AND f.proowner=CASE WHEN f.prosecdef THEN s.purge ELSE s.owner END
      AND has_function_privilege(f.oid,'EXECUTE')=(NOT f.prosecdef)
      AND NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(f.proacl,acldefault('f',f.proowner))) a
        WHERE a.grantee<>f.proowner AND (f.prosecdef OR a.grantee<>s.runtime OR a.is_grantable))
  ) ORDER BY f.proname COLLATE "C") FROM scope s JOIN pg_proc f ON f.pronamespace=s.schema_oid
  JOIN pg_language l ON l.oid=f.prolang) AS routines,
 (SELECT jsonb_agg(jsonb_build_array(r.relname,t.tgname,t.tgenabled,t.tgtype,t.tgnargs,t.tgqual IS NULL,
    r.relnamespace='public'::regnamespace,
    (SELECT jsonb_agg(a.attname ORDER BY a.attname COLLATE "C") FROM pg_attribute a WHERE a.attrelid=t.tgrelid
      AND a.attnum=ANY(t.tgattr) AND NOT a.attisdropped)) ORDER BY t.tgname COLLATE "C")
  FROM scope s JOIN pg_proc f ON f.pronamespace=s.schema_oid AND f.proname='purge_offer'
  JOIN pg_trigger t ON t.tgfoid=f.oid JOIN pg_class r ON r.oid=t.tgrelid
  WHERE NOT t.tgisinternal) AS triggers
FROM scope`;
const expectedTriggers = [
  ["os_intake","membership_renewal_purge_intake","O",17,0,true,true,["cancelled_at","converted_ids","erased_at","revision","status"]],
  ["os_participant_links","membership_renewal_purge_link","O",17,0,true,true,["revision","revoked_at"]],
];

export function createMembershipRenewalStore(options) {
  const {s,purge} = checkedOptions(options,false);
  const expected = {
    tables:tables.map(t => [t,true,fields[t].map(name => [name,columnType(name),true]),true,
      t === "directory_choices" ? ["receipt","revision"] : [],
      t === "offers" ? ["intake_id","org_id"] : []]),
    keys:tables.flatMap(t => recordKeys[t].map(([type,cols,parent,parentCols]) =>
      [t,type,cols,parent?.replace("@",s) ?? null,parentCols,true])).sort(compare),
    checks:tables.map(t => [t,...checks[t]]),
    policies:policies.map(([table,name,op,using,check,purgeOnly]) =>
      [table,name,op,true,purgeOnly ? "purge" : "runtime",qualify(s,using),qualify(s,check)])
      .sort((a,b) => a[1] < b[1] ? -1 : 1),
    routines:Object.entries(routines(s)).sort().map(([name,f]) =>
      [name,f.args,f.returns,f.language,f.volatility === "STABLE" ? "s" : "v",f.definer,f.body,true]),
    triggers:expectedTriggers,
  };
  return Object.freeze({
    schema:s,
    async ready(c) {
      const found = await c.query(layout,[s,purge]);
      if (found.rowCount !== 1 || !Array.isArray(found.rows[0]?.keys)) return false;
      const actual = {...found.rows[0],keys:[...found.rows[0].keys].sort(compare)};
      return stable(actual) === stable(expected);
    },
  });
}
function compare(a,b) {
  const left = stable(a), right = stable(b);
  return left < right ? -1 : left > right ? 1 : 0;
}
