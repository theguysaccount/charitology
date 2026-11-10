import { VOLUNTEER_PROFILE_MASKS, storedVolunteerProfile, volunteerProfileChanged } from "./volunteer-profile-model.mjs";
import { fail } from "./security.mjs";

const identifier = value => {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_]{0,62}$/.test(value)) throw new TypeError("Use exact profile storage identifiers.");
  return '"' + value + '"';
};
function names(applicationSchema, storageSchema) {
  if (applicationSchema === storageSchema) throw new TypeError("Use a separate private profile schema.");
  const app = identifier(applicationSchema), storage = identifier(storageSchema);
  return {
    app, storage, table: storage + ".preferences", purge: storage + ".purge_request_profile",
    link: app + ".os_participant_links", intake: app + ".os_intake", publication: app + ".os_publications",
  };
}
const active = "i.status IN ('pending','reviewed','converted') AND i.erased_at IS NULL AND i.cancelled_at IS NULL";
const unavailable = () => fail(503, "volunteer_profile_storage", "Volunteer preferences are temporarily unavailable.");
const bootstrapAdminOnly = (edge, purgeOid, ownerOid) =>
  `${edge}.roleid=${purgeOid} AND ${edge}.member=${ownerOid} AND ${edge}.grantor=10::oid
    AND ${edge}.admin_option AND NOT ${edge}.set_option AND NOT ${edge}.inherit_option`;

function purgeSource(applicationSchema, table) {
  return `
DECLARE request_id text;
BEGIN
 IF TG_TABLE_SCHEMA='${applicationSchema}' AND TG_TABLE_NAME='os_intake' THEN
   IF NOT ((OLD.erased_at IS NULL AND NEW.erased_at IS NOT NULL)
     OR (OLD.cancelled_at IS NULL AND NEW.cancelled_at IS NOT NULL)
     OR (OLD.status IN ('pending','reviewed','converted') AND NEW.status NOT IN ('pending','reviewed','converted'))) THEN
     RETURN NEW;
   END IF;
   request_id:=NEW.id;
 ELSIF TG_TABLE_SCHEMA='${applicationSchema}' AND TG_TABLE_NAME='os_participant_links' THEN
   IF NOT (OLD.revoked_at IS NULL AND (NEW.revoked_at IS NOT NULL OR OLD.revision<>NEW.revision)) THEN
     RETURN NEW;
   END IF;
   request_id:=NEW.intake_id;
 ELSE
   RAISE EXCEPTION 'Unsupported volunteer profile purge source';
 END IF;
 IF NEW.org_id IS DISTINCT FROM current_setting('app.org_id',true) THEN
   RAISE EXCEPTION 'Volunteer profile purge requires the current workspace';
 END IF;
 DELETE FROM ${table} WHERE org_id=NEW.org_id AND intake_id=request_id;
 RETURN NEW;
END
`;
}

/** Additive private installation in one outer transaction. Managed mode
 * creates the purge role. Local mode uses a dedicated pre-created role. */
export function volunteerProfileInstallationSql({ applicationSchema, storageSchema, runtimeRole, purgeRole, managedDatabaseOwner = false }) {
  const n = names(applicationSchema, storageSchema);
  const runtime = identifier(runtimeRole), janitor = identifier(purgeRole);
  if (runtimeRole === purgeRole || typeof managedDatabaseOwner !== "boolean")
    throw new TypeError("Use separate profile runtime and purge roles and an explicit install mode.");
  // PostgreSQL 16+ adds the non-superuser creator's ADMIN-only bootstrap
  // edge. Function ownership transfer needs one separate, temporary SET edge.
  const bootstrap = managedDatabaseOwner ? `
DO $profile_owner$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles r JOIN pg_catalog.pg_database d ON d.datdba=r.oid
   WHERE d.datname=pg_catalog.current_database() AND r.rolname=current_user AND r.rolcreaterole AND NOT r.rolsuper)
 THEN RAISE EXCEPTION 'Use the managed database owner to install volunteer profile storage'; END IF;
 PERFORM pg_catalog.set_config('createrole_self_grant','',true);
END
$profile_owner$;
CREATE ROLE ${janitor} NOLOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS NOINHERIT;
` : "";
  const roles = `
DO $profile_role$
DECLARE purge_oid oid; runtime_oid oid; owner_oid oid;
BEGIN
 SELECT oid INTO purge_oid FROM pg_catalog.pg_roles WHERE rolname='${purgeRole}'
   AND NOT (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication OR rolinherit);
 SELECT oid INTO runtime_oid FROM pg_catalog.pg_roles WHERE rolname='${runtimeRole}' AND NOT (rolsuper OR rolbypassrls);
 SELECT datdba INTO owner_oid FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database();
 IF purge_oid IS NULL OR runtime_oid IS NULL OR owner_oid IS NULL
    OR pg_catalog.pg_has_role(runtime_oid,purge_oid,'MEMBER') OR pg_catalog.pg_has_role(runtime_oid,owner_oid,'MEMBER')
    OR (SELECT count(*) FROM pg_catalog.pg_auth_members m WHERE purge_oid IN (m.roleid,m.member))<>${managedDatabaseOwner ? 1 : 0}
    ${managedDatabaseOwner ? "OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m WHERE " +
       bootstrapAdminOnly("m","purge_oid","owner_oid") + ")" : ""}
 THEN RAISE EXCEPTION 'Volunteer profile purge role is unavailable'; END IF;
END
$profile_role$;
`;
  const transfer = managedDatabaseOwner
    ? `GRANT ${janitor} TO CURRENT_USER WITH SET TRUE, INHERIT FALSE, ADMIN FALSE GRANTED BY CURRENT_USER;` : "";
  const finish = managedDatabaseOwner
    ? `REVOKE ${janitor} FROM CURRENT_USER GRANTED BY CURRENT_USER;${roles}` : "";
  const owner = "org_id=current_setting('app.org_id',true)";
  const mine = owner + " AND user_id=current_setting('app.user_id',true) AND EXISTS(SELECT 1 FROM " + n.link + " l " +
    "JOIN " + n.intake + " i ON i.org_id=l.org_id AND i.id=l.intake_id AND i.publication_id=l.publication_id " +
    "JOIN " + n.publication + " f ON f.org_id=i.org_id AND f.id=i.publication_id AND f.kind='volunteer-interest' " +
    "WHERE l.org_id=preferences.org_id AND l.intake_id=preferences.intake_id AND l.user_id=preferences.user_id " +
    "AND l.id=preferences.link_id AND l.revision=preferences.link_revision AND l.publication_id=preferences.publication_id " +
    "AND l.revoked_at IS NULL AND " + active + ")";
  return `${bootstrap}${roles}
CREATE SCHEMA ${n.storage};
REVOKE ALL ON SCHEMA ${n.storage} FROM PUBLIC;
GRANT USAGE ON SCHEMA ${n.storage} TO ${runtime},${janitor};
CREATE TABLE ${n.table} (
 org_id text NOT NULL CHECK(org_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 intake_id text NOT NULL CHECK(intake_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 user_id text NOT NULL CHECK(user_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 publication_id text NOT NULL CHECK(publication_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 link_id text NOT NULL CHECK(link_id ~ '^[a-f0-9]{32}$'),
 link_revision integer NOT NULL CHECK(link_revision>0),
 revision integer NOT NULL CHECK(revision>0),
 skills_bits integer NOT NULL CHECK(skills_bits BETWEEN 0 AND ${VOLUNTEER_PROFILE_MASKS.skills}),
 availability_bits integer NOT NULL CHECK(availability_bits BETWEEN 0 AND ${VOLUNTEER_PROFILE_MASKS.availability}),
 time_zone text CHECK(time_zone ~ '^[A-Za-z0-9_+/:.-]{1,100}$'),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp() CHECK(isfinite(updated_at)),
 PRIMARY KEY(org_id,intake_id),
 FOREIGN KEY(user_id,org_id,intake_id) REFERENCES ${n.link}(user_id,org_id,intake_id) ON DELETE CASCADE,
 FOREIGN KEY(org_id,publication_id) REFERENCES ${n.publication}(org_id,id),
 CHECK ((time_zone IS NULL)=(skills_bits=0 AND availability_bits=0)),
 CHECK ((revision<>1 OR time_zone IS NOT NULL) AND (revision<>2147483647 OR time_zone IS NULL))
);
ALTER TABLE ${n.table} ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${n.table} FORCE ROW LEVEL SECURITY;
CREATE POLICY profile_own_read ON ${n.table} FOR SELECT TO ${runtime} USING (${mine});
CREATE POLICY profile_own_insert ON ${n.table} FOR INSERT TO ${runtime} WITH CHECK (${mine});
CREATE POLICY profile_own_update ON ${n.table} FOR UPDATE TO ${runtime} USING (${mine}) WITH CHECK (${mine});
CREATE POLICY profile_purge_keys ON ${n.table} FOR SELECT TO ${janitor} USING (${owner});
CREATE POLICY profile_purge_delete ON ${n.table} FOR DELETE TO ${janitor} USING (${owner});
REVOKE ALL ON ${n.table} FROM PUBLIC,${runtime},${janitor};
GRANT SELECT,INSERT ON ${n.table} TO ${runtime};
GRANT UPDATE(revision,skills_bits,availability_bits,time_zone,updated_at) ON ${n.table} TO ${runtime};
GRANT SELECT(org_id,intake_id),DELETE ON ${n.table} TO ${janitor};
CREATE FUNCTION ${n.purge}() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,pg_temp AS $profile_purge$${purgeSource(applicationSchema,n.table)}$profile_purge$;
REVOKE ALL ON FUNCTION ${n.purge}() FROM PUBLIC,${runtime};
CREATE TRIGGER volunteer_profile_purge_intake AFTER UPDATE OF status,erased_at,cancelled_at ON ${n.intake}
 FOR EACH ROW EXECUTE FUNCTION ${n.purge}();
CREATE TRIGGER volunteer_profile_purge_link AFTER UPDATE OF revoked_at,revision ON ${n.link}
 FOR EACH ROW EXECUTE FUNCTION ${n.purge}();
${transfer}
GRANT CREATE ON SCHEMA ${n.storage} TO ${janitor};
ALTER FUNCTION ${n.purge}() OWNER TO ${janitor};
REVOKE CREATE ON SCHEMA ${n.storage} FROM ${janitor};
${finish}
`;
}

const profileFields = `revision,skills_bits AS skills,availability_bits AS availability,time_zone AS "timeZone",
  to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "updatedAtExact"`;
const purgePolicyExpression = "(org_id = current_setting('app.org_id'::text, true))";
// PostgreSQL 17 and 18 deparse the same expression. Resolve each relation's
// qualified spelling in the actual session, as pg_get_expr does.
const ownPolicyExpression = `((org_id = current_setting('app.org_id'::text, true)) AND (user_id = current_setting('app.user_id'::text, true)) AND (EXISTS ( SELECT 1
   FROM ((@link l
     JOIN @intake i ON (((i.org_id = l.org_id) AND (i.id = l.intake_id) AND (i.publication_id = l.publication_id))))
     JOIN @publication f ON (((f.org_id = i.org_id) AND (f.id = i.publication_id) AND (f.kind = 'volunteer-interest'::text))))
  WHERE ((l.org_id = preferences.org_id) AND (l.intake_id = preferences.intake_id) AND (l.user_id = preferences.user_id) AND (l.id = preferences.link_id) AND (l.revision = preferences.link_revision) AND (l.publication_id = preferences.publication_id) AND (l.revoked_at IS NULL) AND (i.status = ANY (ARRAY['pending'::text, 'reviewed'::text, 'converted'::text])) AND (i.erased_at IS NULL) AND (i.cancelled_at IS NULL)))))`;
const ready = `WITH refs AS (SELECT to_regclass($1) AS storage,to_regclass($2) AS link,
    to_regclass($3) AS intake,to_regprocedure($4) AS purge,to_regclass($8) AS publication),
  expected AS (SELECT replace(replace(replace($7::text,'@link',link::text),'@intake',intake::text),
    '@publication',publication::text) AS own FROM refs)
  SELECT COALESCE(t.relkind='r' AND t.relrowsecurity AND t.relforcerowsecurity
    AND p.pronamespace=t.relnamespace AND p.prosecdef AND p.prosrc=$5 AND p.proconfig=ARRAY['search_path=pg_catalog, pg_temp']
    AND NOT (o.rolcanlogin OR o.rolsuper OR o.rolbypassrls OR o.rolcreaterole
      OR o.rolcreatedb OR o.rolreplication OR o.rolinherit)
    AND NOT (r.rolsuper OR r.rolbypassrls)
    AND o.oid<>t.relowner AND o.oid<>n.nspowner
    AND NOT pg_has_role(r.oid,o.oid,'MEMBER') AND NOT pg_has_role(r.oid,d.datdba,'MEMBER')
    AND NOT pg_has_role(r.oid,t.relowner,'MEMBER') AND NOT pg_has_role(r.oid,n.nspowner,'MEMBER')
    AND NOT EXISTS(SELECT 1 FROM pg_auth_members m WHERE o.oid IN (m.roleid,m.member)
      AND NOT (${bootstrapAdminOnly("m","o.oid","d.datdba")} AND db_owner.rolcreaterole AND NOT db_owner.rolsuper))
    AND NOT has_function_privilege(p.oid,'EXECUTE')
    AND NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl WHERE acl.grantee<>o.oid)
    AND has_schema_privilege(r.oid,n.oid,'USAGE') AND has_schema_privilege(o.oid,n.oid,'USAGE')
    AND NOT has_schema_privilege(r.oid,n.oid,'CREATE') AND NOT has_schema_privilege(o.oid,n.oid,'CREATE')
    AND NOT EXISTS(SELECT 1 FROM aclexplode(n.nspacl) acl WHERE acl.grantee<>n.nspowner
      AND (acl.grantee NOT IN (r.oid,o.oid) OR acl.privilege_type<>'USAGE' OR acl.is_grantable))
    AND NOT has_schema_privilege(o.oid,i.relnamespace,'CREATE')
    AND NOT EXISTS(SELECT 1 FROM pg_namespace app CROSS JOIN LATERAL aclexplode(app.nspacl) acl
      WHERE app.oid=i.relnamespace AND acl.grantee=o.oid)
    AND NOT EXISTS(SELECT 1 FROM pg_class app
      WHERE app.relnamespace=i.relnamespace AND app.relkind IN ('r','p','v','m','f')
        AND (has_table_privilege(o.oid,app.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
          OR has_any_column_privilege(o.oid,app.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
    AND has_table_privilege(t.oid,'SELECT') AND has_table_privilege(t.oid,'INSERT')
    AND NOT has_table_privilege(t.oid,'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    AND has_table_privilege(o.oid,t.oid,'DELETE')
    AND NOT has_table_privilege(o.oid,t.oid,'SELECT,INSERT,UPDATE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    AND NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(t.relacl,acldefault('r',t.relowner))) acl
      WHERE acl.grantee<>t.relowner AND (acl.is_grantable OR NOT
        ((acl.grantee=r.oid AND acl.privilege_type IN ('SELECT','INSERT')) OR
         (acl.grantee=o.oid AND acl.privilege_type='DELETE'))))
    AND NOT EXISTS(SELECT 1 FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) acl
      WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped AND acl.grantee<>t.relowner
        AND (acl.is_grantable OR NOT
          ((acl.grantee=r.oid AND acl.privilege_type='UPDATE' AND a.attname IN ('revision','skills_bits','availability_bits','time_zone','updated_at')) OR
           (acl.grantee=o.oid AND acl.privilege_type='SELECT' AND a.attname IN ('org_id','intake_id')))))
    AND (SELECT array_agg(a.attname::text ORDER BY a.attnum) FROM pg_attribute a
         WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped AND has_column_privilege(o.oid,t.oid,a.attnum,'SELECT'))
      =ARRAY['org_id','intake_id']
    AND (SELECT array_agg(a.attname::text ORDER BY a.attnum) FROM pg_attribute a
         WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped AND has_column_privilege(t.oid,a.attnum,'UPDATE'))
      =ARRAY['revision','skills_bits','availability_bits','time_zone','updated_at']
    AND (SELECT count(*) FROM pg_policy WHERE polrelid=t.oid)=5
    AND (SELECT count(*) FROM pg_policy k WHERE k.polrelid=t.oid AND k.polpermissive AND (
      (k.polroles=ARRAY[r.oid] AND (
        (k.polname='profile_own_read' AND k.polcmd='r' AND k.polwithcheck IS NULL AND pg_get_expr(k.polqual,t.oid)=expected.own) OR
        (k.polname='profile_own_insert' AND k.polcmd='a' AND k.polqual IS NULL AND pg_get_expr(k.polwithcheck,t.oid)=expected.own) OR
        (k.polname='profile_own_update' AND k.polcmd='w' AND pg_get_expr(k.polqual,t.oid)=expected.own
          AND pg_get_expr(k.polwithcheck,t.oid)=expected.own))) OR
      (k.polroles=ARRAY[p.proowner] AND k.polwithcheck IS NULL AND pg_get_expr(k.polqual,t.oid)=$6
        AND ((k.polname='profile_purge_keys' AND k.polcmd='r') OR (k.polname='profile_purge_delete' AND k.polcmd='d')))))=5
    AND (SELECT count(*) FROM pg_trigger g CROSS JOIN LATERAL (
        SELECT array_agg(a.attname::text ORDER BY a.attname) AS columns FROM pg_attribute a
        WHERE a.attrelid=g.tgrelid AND a.attnum=ANY(g.tgattr) AND NOT a.attisdropped
      ) keys WHERE g.tgfoid=p.oid AND g.tgenabled='O' AND NOT g.tgisinternal AND
      g.tgtype=17 AND g.tgqual IS NULL AND g.tgnargs=0 AND
      ((g.tgrelid=refs.link AND g.tgname='volunteer_profile_purge_link' AND keys.columns=ARRAY['revision','revoked_at']) OR
       (g.tgrelid=refs.intake AND g.tgname='volunteer_profile_purge_intake' AND keys.columns=ARRAY['cancelled_at','erased_at','status'])))=2,false) AS ready
  FROM refs CROSS JOIN expected LEFT JOIN pg_class t ON t.oid=refs.storage LEFT JOIN pg_proc p ON p.oid=refs.purge
  LEFT JOIN pg_roles o ON o.oid=p.proowner LEFT JOIN pg_namespace n ON n.oid=t.relnamespace
  LEFT JOIN pg_class i ON i.oid=refs.intake JOIN pg_roles r ON r.rolname=current_user
  JOIN pg_database d ON d.datname=current_database() JOIN pg_roles db_owner ON db_owner.oid=d.datdba`;
const row = (result, max) => {
  if (!Array.isArray(result?.rows) || result.rowCount !== result.rows.length || result.rows.length > max) unavailable();
  return result.rows[0] ?? null;
};

/** The route supplies only server-verified scope and model-planned rows. */
export function createVolunteerProfileStore({ applicationSchema, storageSchema }) {
  const n = names(applicationSchema, storageSchema);
  const where = "org_id=$1 AND intake_id=$2 AND user_id=$3 AND publication_id=$4 AND link_id=$5 AND link_revision=$6";
  const select = "SELECT " + profileFields + " FROM " + n.table + " WHERE " + where + " LIMIT 2";
  const insert = "INSERT INTO " + n.table + " (org_id,intake_id,user_id,publication_id,link_id,link_revision,revision," +
    "skills_bits,availability_bits,time_zone) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING RETURNING " + profileFields;
  const update = "UPDATE " + n.table + " SET revision=$7,skills_bits=$8,availability_bits=$9,time_zone=$10,updated_at=clock_timestamp()" +
    " WHERE " + where + " AND revision=$11 RETURNING " + profileFields;
  const params = s => [s.orgId,s.intakeId,s.userId,s.publicationId,s.linkId,s.linkRevision];
  return Object.freeze({
    async requireReady(c) {
      const parameters = [n.table,n.link,n.intake,n.purge+"()",purgeSource(applicationSchema,n.table),
        purgePolicyExpression,ownPolicyExpression,n.publication];
      if (row(await c.query(ready,parameters),1)?.ready !== true) unavailable();
    },
    async read(c, scope) {
      return storedVolunteerProfile(row(await c.query(select,params(scope)),1));
    },
    async write(c, scope, expected, candidate) {
      const values = [...params(scope),candidate.revision,candidate.skills,candidate.availability,candidate.timeZone];
      const found = storedVolunteerProfile(row(await c.query(expected ? update : insert, expected ? [...values,expected] : values),1));
      if (!found || !["revision","skills","availability","timeZone"].every(key=>found[key]===candidate[key]))
        volunteerProfileChanged();
      return found;
    },
  });
}
