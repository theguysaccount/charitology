import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";
import { fail } from "./security.mjs";
import { requireVolunteerSubstitutionAccess, volunteerSubstitutionAccessReady } from "./volunteer-substitution-schema.mjs";

const SQL_ID = /^[a-z][a-z0-9_]{0,62}$/;
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const INTENT = /^[a-f0-9]{32}$/;
const FUNCTION = "os_current_volunteer_substitution_authority";
const POLICY = "substitution_authority_read";
const DEFAULT_VERIFIER = "charitology_substitution_verifier";
const CHOICES = "os_participation_substitution_choices";
const STAFF_ROLES = "'owner','admin','program_lead','contributor'";
const VERIFIER_READ = {
  os_members: ["org_id", "user_id", "role", "program_ids"],
  session: ["id", "userId", "expiresAt"],
  user: ["id", "email", "emailVerified", "createdAt", "updatedAt"],
  os_intake: ["org_id", "id", "publication_id", "status", "cancelled_at", "erased_at", "revision", "created_at", "answers"],
  [CHOICES]: ["org_id", "intent_id", "party", "user_id", "intake_id", "link_id", "link_revision",
    "withdrawn_at", "accepted_at", "expires_at", "own_authority_sha256"],
  os_participant_links: ["id", "org_id", "intake_id", "publication_id", "user_id", "revision", "revoked_at", "created_at", "updated_at"],
};
const expectedRead = JSON.stringify(Object.fromEntries(
  Object.entries(VERIFIER_READ).map(([table, columns]) => [table, [...columns].sort()]),
));
const matches = (pattern, value) => typeof value === "string" && pattern.test(value);
const sha256 = value => createHash("sha256").update(value, "utf8").digest("hex");
const unavailable = () => fail(503, "substitution_authority", "Volunteer substitution review is temporarily unavailable.");
const quoted = value => '"' + value + '"';

function identifier(value) {
  if (!matches(SQL_ID, value)) throw new Error("Invalid substitution verifier identifier.");
  return quoted(value);
}

const active = "a.withdrawn_at IS NULL AND a.accepted_at<=statement_timestamp() AND a.expires_at>statement_timestamp()";
const currentStaff = (schema, org, actor, session) => `EXISTS(
  SELECT 1 FROM ${schema}.os_members m JOIN ${schema}."session" s ON s."userId"=m.user_id
   JOIN ${schema}."user" staff ON staff.id=s."userId"
  WHERE m.org_id=${org} AND m.user_id=${actor}
   AND m.role IN (${STAFF_ROLES}) AND m.program_ids='[]'::jsonb
   AND s.id=${session} AND s."expiresAt">statement_timestamp() AND staff."emailVerified" IS TRUE
 )`;

function body(schema) {
  return `
 SELECT COALESCE(
  org=current_setting('app.org_id',true)
  AND org ~ '^[A-Za-z0-9_-]{1,100}$' AND intent ~ '^[a-f0-9]{32}$'
  AND staff_session ~ '^[A-Za-z0-9_-]{1,100}$'
  AND ${currentStaff(schema, "org", "current_setting('app.user_id',true)", "staff_session")}
  AND (SELECT count(*)=2 AND count(DISTINCT a.party)=2 AND count(DISTINCT a.user_id)=2
              AND count(DISTINCT a.link_id)=2 AND count(DISTINCT a.intake_id)=2
       FROM ${schema}.${CHOICES} a
       JOIN ${schema}.os_participant_links l ON l.org_id=a.org_id AND l.intake_id=a.intake_id
         AND l.user_id=a.user_id AND l.id=a.link_id AND l.revision=a.link_revision
       JOIN ${schema}.os_intake i ON i.org_id=a.org_id AND i.id=a.intake_id AND i.publication_id=l.publication_id
       JOIN ${schema}."user" u ON u.id=a.user_id
       WHERE a.org_id=org AND a.intent_id=intent AND a.party IN ('leaving','joining') AND ${active}
         AND l.revoked_at IS NULL AND i.status='converted' AND i.cancelled_at IS NULL AND i.erased_at IS NULL
         AND u."emailVerified" IS TRUE AND length(btrim(u.email)) BETWEEN 3 AND 254
         AND lower(btrim(u.email))=lower(btrim(i.answers->>'email'))
         AND a.own_authority_sha256=encode(sha256(convert_to(jsonb_build_array(
           'charitology-substitution-own-authority-v1',l.id,l.org_id,l.intake_id,l.publication_id,l.user_id,l.revision,
           extract(epoch FROM l.created_at),extract(epoch FROM l.updated_at),i.revision,extract(epoch FROM i.created_at),
           extract(epoch FROM u."createdAt"),extract(epoch FROM u."updatedAt")
         )::text,'UTF8')),'hex')),
  false)
`;
}

/** One-time verifier installation, after auth and the protected choice table.
 * Execute in an owned migration transaction. HTTP never supplies identifiers. */
export function volunteerSubstitutionVerifierSql(runtimeRole, {
  schema: schemaName = "public", verifierRole = DEFAULT_VERIFIER, managedDatabaseOwner = false,
} = {}) {
  const schema = identifier(schemaName), runtime = identifier(runtimeRole), verifier = identifier(verifierRole);
  if (runtime === verifier) throw new Error("Use a dedicated substitution verifier role.");
  const signature = `${schema}.${FUNCTION}(text,text,text)`;
  const reads = Object.entries(VERIFIER_READ).map(([table, columns]) =>
    `GRANT SELECT(${columns.map(quoted).join(",")}) ON ${schema}.${quoted(table)} TO ${verifier};`).join("\n");
  // On PostgreSQL 16+, a non-superuser creator keeps the database bootstrap
  // role's ADMIN-only grant. Ownership transfer needs a separate temporary
  // SET grant, which the creator removes before this transaction commits.
  const installer = managedDatabaseOwner ? `DO $installer$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r JOIN pg_catalog.pg_database d ON d.datdba=r.oid
   WHERE d.datname=pg_catalog.current_database() AND r.rolname=current_user AND r.rolcreaterole AND NOT r.rolsuper)
 THEN RAISE EXCEPTION 'Use the managed database owner to install the substitution verifier'; END IF;
 PERFORM pg_catalog.set_config('createrole_self_grant','',true);
END $installer$;
` : "";
  const permitTransfer = managedDatabaseOwner ? `GRANT ${verifier} TO CURRENT_USER WITH SET TRUE, INHERIT FALSE, ADMIN FALSE GRANTED BY CURRENT_USER;
` : "";
  const endTransfer = managedDatabaseOwner ? `
REVOKE ${verifier} FROM CURRENT_USER GRANTED BY CURRENT_USER;
DO $installer$
BEGIN
 IF (SELECT count(*) FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles v ON v.oid IN (m.roleid,m.member)
   JOIN pg_catalog.pg_roles r ON r.rolname=current_user WHERE v.rolname='${verifierRole}'
   AND m.roleid=v.oid AND m.member=r.oid AND m.grantor=10::oid
   AND m.admin_option AND NOT m.set_option AND NOT m.inherit_option) <> 1
 OR (SELECT count(*) FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles v ON v.oid IN (m.roleid,m.member)
   WHERE v.rolname='${verifierRole}') <> 1
 THEN RAISE EXCEPTION 'Substitution verifier has unexpected role membership'; END IF;
END $installer$;` : "";
  return `${installer}CREATE ROLE ${verifier} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA ${schema} TO ${verifier};
${reads}
CREATE POLICY ${POLICY} ON ${schema}.os_participant_links FOR SELECT TO ${verifier}
 USING (org_id=current_setting('app.org_id',true) AND EXISTS(SELECT 1 FROM ${schema}.${CHOICES} a
   WHERE a.org_id=os_participant_links.org_id AND a.user_id=os_participant_links.user_id
    AND a.intake_id=os_participant_links.intake_id AND a.link_id=os_participant_links.id
    AND a.link_revision=os_participant_links.revision AND ${active}));
CREATE FUNCTION ${schema}.${FUNCTION}(org text,intent text,staff_session text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp
 AS $verify$${body(schema)}$verify$;
REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ${signature} TO ${runtime};
${permitTransfer}GRANT CREATE ON SCHEMA ${schema} TO ${verifier};
ALTER FUNCTION ${signature} OWNER TO ${verifier};
REVOKE CREATE ON SCHEMA ${schema} FROM ${verifier};${endTransfer}`;
}

const LAYOUT = `
SELECT EXISTS (
 SELECT 1 FROM pg_catalog.pg_namespace n
 JOIN pg_catalog.pg_proc f ON f.pronamespace=n.oid AND f.oid=pg_catalog.to_regprocedure($1)
 JOIN pg_catalog.pg_roles v ON v.oid=f.proowner
 JOIN pg_catalog.pg_roles runtime ON runtime.rolname=current_user
 JOIN pg_catalog.pg_database d ON d.datname=pg_catalog.current_database()
 JOIN pg_catalog.pg_roles db_owner ON db_owner.oid=d.datdba
 JOIN pg_catalog.pg_class l ON l.relnamespace=n.oid AND l.relname='os_participant_links'
 WHERE n.nspname=$2 AND v.rolname=$3 AND f.proname='${FUNCTION}'
  AND f.prolang=(SELECT oid FROM pg_catalog.pg_language WHERE lanname='sql')
  AND f.prokind='f' AND f.prorettype='pg_catalog.bool'::regtype AND NOT f.proretset
  AND f.prosecdef AND f.provolatile='s' AND NOT f.proleakproof AND NOT f.proisstrict
  AND f.proargnames=ARRAY['org','intent','staff_session']
  AND f.proconfig=ARRAY['search_path=pg_catalog, pg_temp']
  AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(f.prosrc,'UTF8')),'hex')=$4
  AND NOT v.rolsuper AND NOT v.rolcanlogin AND NOT v.rolbypassrls AND NOT v.rolinherit
  AND NOT v.rolcreatedb AND NOT v.rolcreaterole AND NOT v.rolreplication
  AND NOT pg_catalog.pg_has_role(runtime.oid,v.oid,'MEMBER')
  AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members membership
    WHERE v.oid IN (membership.member,membership.roleid)
      AND NOT ($9::boolean AND membership.roleid=v.oid AND membership.member=db_owner.oid
        AND membership.grantor=10::oid AND membership.admin_option AND NOT membership.set_option
        AND NOT membership.inherit_option AND db_owner.rolcreaterole AND NOT db_owner.rolsuper
        AND NOT pg_catalog.pg_has_role(runtime.oid,db_owner.oid,'MEMBER')))
  AND (SELECT count(*) FROM pg_catalog.pg_proc owned WHERE owned.proowner=v.oid)=1
  AND NOT pg_catalog.has_schema_privilege(v.oid,n.oid,'CREATE')
  AND NOT pg_catalog.has_schema_privilege(runtime.oid,n.oid,'CREATE')
  AND pg_catalog.has_function_privilege(runtime.oid,f.oid,'EXECUTE')
  AND NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(COALESCE(f.proacl,pg_catalog.acldefault('f',f.proowner))) acl
    WHERE acl.privilege_type='EXECUTE' AND (acl.grantee NOT IN (runtime.oid,v.oid)
      OR (acl.grantee=runtime.oid AND acl.is_grantable)))
  AND NOT EXISTS(
    SELECT 1 FROM pg_catalog.jsonb_each($8::jsonb) expected(name,columns)
    LEFT JOIN pg_catalog.pg_class source ON source.relnamespace=n.oid AND source.relname=expected.name
    WHERE source.oid IS NULL OR source.relkind<>'r'
      OR pg_catalog.pg_has_role(runtime.oid,source.relowner,'MEMBER')
      OR pg_catalog.has_table_privilege(v.oid,source.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
      OR pg_catalog.has_any_column_privilege(v.oid,source.oid,'INSERT,UPDATE,REFERENCES')
      OR ARRAY(SELECT a.attname::text FROM pg_catalog.pg_attribute a
        WHERE a.attrelid=source.oid AND a.attnum>0 AND NOT a.attisdropped
          AND pg_catalog.has_column_privilege(v.oid,source.oid,a.attnum,'SELECT') ORDER BY a.attname COLLATE "C")
        <>ARRAY(SELECT pg_catalog.jsonb_array_elements_text(expected.columns)))
  AND (SELECT count(*) FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class auth ON auth.oid=a.attrelid AND auth.relnamespace=n.oid
    WHERE a.attnum>0 AND NOT a.attisdropped AND a.attnotnull AND a.atttypid='pg_catalog.timestamptz'::regtype
      AND ((auth.relname='user' AND a.attname IN ('createdAt','updatedAt'))
        OR (auth.relname='session' AND a.attname='expiresAt')))=3
  AND l.relkind='r' AND l.relrowsecurity AND l.relforcerowsecurity
  AND (SELECT count(*) FROM pg_catalog.pg_policy p WHERE p.polrelid=l.oid)=2
  AND EXISTS(SELECT 1 FROM pg_catalog.pg_policy p WHERE p.polrelid=l.oid AND p.polname='participant_own'
    AND p.polcmd='*' AND p.polpermissive AND p.polroles='{0}'::oid[]
    AND pg_catalog.pg_get_expr(p.polqual,l.oid)=$5 AND pg_catalog.pg_get_expr(p.polwithcheck,l.oid)=$6)
  AND EXISTS(SELECT 1 FROM pg_catalog.pg_policy p WHERE p.polrelid=l.oid AND p.polname='${POLICY}'
    AND p.polcmd='r' AND p.polpermissive AND p.polroles=ARRAY[v.oid] AND p.polwithcheck IS NULL
    AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_expr(p.polqual,l.oid),'UTF8')),'hex')=$7)
) AS ok`;
const linkOwn = "(user_id = current_setting('app.user_id'::text, true))";
const linkWrite = "(" + linkOwn + " AND (org_id = current_setting('app.org_id'::text, true)))";
const linkProof = "54adbebadcade3c8c5440190b3ff2c8db9a74c201b9344c4b49e2959f87bca39";
const exactBoolean = result => {
  if (result?.rowCount !== 1 || result.rows?.length !== 1 || !result.rows[0] ||
      Object.keys(result.rows[0]).length !== 1 || typeof result.rows[0].ok !== "boolean") unavailable();
  return result.rows[0].ok;
};

function verifierLayout({schema: schemaName = "public", verifierRole = DEFAULT_VERIFIER, managedDatabaseOwner = false} = {}) {
  const schema = identifier(schemaName);
  identifier(verifierRole);
  return [`${schema}.${FUNCTION}(text,text,text)`,schemaName,verifierRole,
    sha256(body(schema)),linkOwn,linkWrite,linkProof,expectedRead,managedDatabaseOwner === true];
}

/** Capability discovery checks catalog/privileges only, without reading a
 * participant or trying a placeholder intent. */
export async function volunteerSubstitutionAuthorityReady(c, options) {
  return await volunteerSubstitutionAccessReady(c) && exactBoolean(await c.query(LAYOUT,verifierLayout(options)));
}

/** Caller owns the same writable transaction, exact issued intent and tenant
 * lock. No user, link or intake row leaves this port. */
export function createVolunteerSubstitutionAuthorityReader({
  schema: schemaName = "public", verifierRole = DEFAULT_VERIFIER, managedDatabaseOwner = false,
} = {}) {
  const schema = identifier(schemaName);
  const layout = verifierLayout({schema:schemaName,verifierRole,managedDatabaseOwner});
  const lockAccounts = `SELECT count(*)=2 AND count(DISTINCT id)=2 AS ok FROM (
    SELECT u.id FROM ${schema}.${CHOICES} a JOIN ${schema}."user" u ON u.id=a.user_id
    WHERE a.org_id=$1 AND a.intent_id=$2 AND a.party IN ('leaving','joining') AND ${active}
     AND $1=current_setting('app.org_id',true) AND $3=current_setting('app.user_id',true)
     AND ${currentStaff(schema, "$1", "$3", "$4")}
    ORDER BY u.id COLLATE "C" FOR SHARE OF u
  ) locked`;
  const prove = `SELECT ${schema}.${FUNCTION}($1::text,$2::text,$3::text) AS ok`;
  return async function readPairedOwnAuthority(c, raw) {
    const keys = ["orgId", "intentId", "staffUserId", "staffSessionId"];
    if (!raw || typeof raw !== "object" || isProxy(raw) || Object.getPrototypeOf(raw) !== Object.prototype) return false;
    const fields = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(fields).length !== keys.length || !keys.every(key =>
      fields[key]?.enumerable && Object.hasOwn(fields[key], "value") &&
      matches(key === "intentId" ? INTENT : ID, fields[key].value))) return false;
    const values = keys.map(key => fields[key].value);
    await requireVolunteerSubstitutionAccess(c);
    if (!exactBoolean(await c.query(LAYOUT, layout))) unavailable();
    if (!exactBoolean(await c.query(lockAccounts, values))) return false;
    return exactBoolean(await c.query(prove, [values[0], values[1], values[3]]));
  };
}

export const readPairedOwnVolunteerSubstitutionAuthority = createVolunteerSubstitutionAuthorityReader();
