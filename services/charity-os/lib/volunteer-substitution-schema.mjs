import { fail } from "./security.mjs";

const TABLE = "os_participation_substitution_choices";
const INDEX = "os_substitution_accepted_intent";
const EXPIRY = "os_substitution_choice_expiry";
const GUARD = "os_substitution_choice_guard";
const COLUMNS = [
  "org_id:text:true", "intent_id:text:true", "party:text:true", "shift_id:text:true",
  "shift_revision:integer:true", "participation_id:text:true", "participation_revision:integer:true",
  "user_id:text:true", "intake_id:text:true", "link_id:text:true", "link_revision:integer:true",
  "person_identity_sha256:text:true", "link_scope_sha256:text:true",
  "accepted_at:timestamp with time zone:true", "expires_at:timestamp with time zone:true",
  "withdrawn_at:timestamp with time zone:false", "own_authority_sha256:text:true",
];
const FUNCTION_SHA256 = "2705121f852513011d5062805355aae305853294e11fc30d0231635118f5b62c";
const CHECK_SHA256 = "8e52c418a772e2c6277f1740d38ee6f2aa1f6dbd7c227d0b55e6043f83ae44b5";
const PREDICATE = "((payload ->> 'format'::text) = 'charitology-volunteer-substitution-receipt'::text)";
const ORG = "(org_id = current_setting('app.org_id'::text, true))";
const OWN = "(" + ORG + " AND (user_id = current_setting('app.user_id'::text, true)))";
const POLICIES = [
  ["substitution_choice_expire", "d", "(" + ORG + " AND (expires_at <= statement_timestamp()))", null],
  ["substitution_choice_insert", "a", null, OWN],
  ["substitution_choice_read", "r", ORG, null],
  ["substitution_choice_withdraw", "w", OWN, OWN],
];
const EXPECTED_CONSTRAINTS = [
  ["os_participation_substitution_choices_org_id_fkey", "f", "org_id", "os_orgs", "id"],
  ["os_participation_substitution_choices_pkey", "p", "org_id,intent_id,party", null, null],
  ["os_substitution_choice_own_link", "f", "user_id,org_id,intake_id", "os_participant_links", "user_id,org_id,intake_id"],
  ["os_substitution_choice_participation", "f", "org_id,participation_id", "os_participations", "org_id,id"],
  ["os_substitution_choice_shape", "c", null, null, null],
  ["os_substitution_choice_shift", "f", "org_id,shift_id", "os_participation_targets", "org_id,target_id"],
];
const LAYOUT = `
  WITH refs AS (
    SELECT pg_catalog.to_regclass('os_reports') AS reports,
      pg_catalog.to_regclass('${TABLE}') AS choices,
      pg_catalog.to_regclass('${INDEX}') AS accepted,
      pg_catalog.to_regclass('${EXPIRY}') AS expiry,
      pg_catalog.to_regprocedure('${GUARD}()') AS guard
  )
  SELECT r.oid IS NOT NULL AND r.relkind='r' AND r.relrowsecurity AND r.relforcerowsecurity AS core,
    t.oid IS NOT NULL AS choices, i.oid IS NOT NULL AS accepted, e.oid IS NOT NULL AS expiry, g.oid IS NOT NULL AS guard,
    COALESCE(t.relnamespace=r.relnamespace AND t.relkind='r' AND t.relrowsecurity AND t.relforcerowsecurity
      AND i.relnamespace=r.relnamespace AND e.relnamespace=r.relnamespace
      AND i.relam=(SELECT oid FROM pg_catalog.pg_am WHERE amname='btree') AND e.relam=i.relam
      AND g.pronamespace=r.relnamespace AND NOT g.prosecdef
      AND g.proconfig=ARRAY['search_path=pg_catalog, pg_temp'] AND g.prorettype='pg_catalog.trigger'::regtype
      AND g.prolang=(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
      AND encode(sha256(convert_to(g.prosrc,'UTF8')),'hex')=$1
      AND EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid=t.oid AND tgfoid=g.oid
        AND tgname='${GUARD}' AND NOT tgisinternal AND tgenabled='O' AND tgtype=31)
      AND (SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgrelid=t.oid AND NOT tgisinternal)=1
      AND (SELECT count(*) FROM pg_catalog.pg_policy WHERE polrelid=r.oid)=1
      AND EXISTS(SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid=r.oid AND polname='tenant'
        AND polcmd='*' AND polpermissive AND polroles='{0}'::oid[]
        AND pg_catalog.pg_get_expr(polqual,polrelid)=$3 AND pg_catalog.pg_get_expr(polwithcheck,polrelid)=$3)
      AND EXISTS(SELECT 1 FROM pg_catalog.pg_trigger
        WHERE tgrelid=r.oid AND tgname='immutable_reports' AND tgenabled='O' AND tgtype=27
          AND tgfoid=pg_catalog.to_regprocedure('os_immutable()'))
      AND EXISTS(SELECT 1 FROM pg_catalog.pg_index x
        WHERE x.indexrelid=i.oid AND x.indrelid=r.oid AND x.indisunique AND x.indisvalid AND x.indisready
          AND x.indislive AND NOT x.indnullsnotdistinct AND x.indoption::text='0 0' AND x.indnatts=2 AND x.indnkeyatts=2
          AND pg_catalog.pg_get_expr(x.indpred,x.indrelid)=$2
          AND pg_catalog.pg_get_indexdef(i.oid,1,true)='org_id'
          AND pg_catalog.pg_get_indexdef(i.oid,2,true)='(payload #>> ''{scope,intentId}''::text[])')
      AND EXISTS(SELECT 1 FROM pg_catalog.pg_index x
        WHERE x.indexrelid=e.oid AND x.indrelid=t.oid AND x.indisvalid AND x.indisready AND x.indislive
          AND NOT x.indisunique AND x.indpred IS NULL AND x.indnatts=4 AND x.indnkeyatts=4
          AND x.indoption::text='0 0 0 0'
          AND pg_catalog.pg_get_indexdef(e.oid,1,true)='org_id'
          AND pg_catalog.pg_get_indexdef(e.oid,2,true)='expires_at'
          AND pg_catalog.pg_get_indexdef(e.oid,3,true)='intent_id'
          AND pg_catalog.pg_get_indexdef(e.oid,4,true)='party'),false) AS shaped
  FROM refs
  LEFT JOIN pg_catalog.pg_class r ON r.oid=refs.reports
  LEFT JOIN pg_catalog.pg_class t ON t.oid=refs.choices
  LEFT JOIN pg_catalog.pg_class i ON i.oid=refs.accepted
  LEFT JOIN pg_catalog.pg_class e ON e.oid=refs.expiry
  LEFT JOIN pg_catalog.pg_proc g ON g.oid=refs.guard`;
const TABLE_METADATA = `
  WITH t AS (SELECT pg_catalog.to_regclass('${TABLE}') AS oid)
  SELECT
    (SELECT array_agg(a.attname||':'||pg_catalog.format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull::text ORDER BY a.attnum)
     FROM pg_catalog.pg_attribute a WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
    (SELECT jsonb_agg(jsonb_build_array(p.polname,p.polcmd,pg_catalog.pg_get_expr(p.polqual,p.polrelid),
       pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname COLLATE "C")
     FROM pg_catalog.pg_policy p WHERE p.polrelid=t.oid) AS policies,
    (SELECT count(*)::int FROM pg_catalog.pg_policy p WHERE p.polrelid=t.oid AND p.polpermissive AND p.polroles='{0}'::oid[]) AS permissive,
    (SELECT jsonb_agg(jsonb_build_array(k.conname,k.contype,
      CASE WHEN k.contype IN ('f','p') THEN
       (SELECT string_agg(a.attname,',' ORDER BY cols.ord)
        FROM unnest(k.conkey) WITH ORDINALITY cols(num,ord) JOIN pg_catalog.pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=cols.num)
       END,
      (SELECT r.relname FROM pg_catalog.pg_class r WHERE r.oid=k.confrelid AND r.relnamespace=k.connamespace),
      (SELECT string_agg(a.attname,',' ORDER BY cols.ord)
       FROM unnest(k.confkey) WITH ORDINALITY cols(num,ord) JOIN pg_catalog.pg_attribute a ON a.attrelid=k.confrelid AND a.attnum=cols.num)
      ) ORDER BY k.conname COLLATE "C") FROM pg_catalog.pg_constraint k WHERE k.conrelid=t.oid AND k.contype<>'n') AS constraints,
    (SELECT count(*)::int FROM pg_catalog.pg_constraint k WHERE k.conrelid=t.oid AND k.contype<>'n' AND k.convalidated AND NOT k.condeferrable
     AND COALESCE((to_jsonb(k)->>'conenforced')::boolean,true)
     AND (k.contype<>'f' OR (k.confupdtype='a' AND k.confdeltype='a' AND k.confmatchtype='s'))) AS validated,
    (SELECT encode(sha256(convert_to(pg_catalog.pg_get_constraintdef(k.oid,false),'UTF8')),'hex')
     FROM pg_catalog.pg_constraint k WHERE k.conrelid=t.oid AND k.conname='os_substitution_choice_shape') AS shape_sha256
  FROM t`;
const ACCESS = `
  WITH refs AS (SELECT pg_catalog.to_regclass('${TABLE}') AS t,pg_catalog.to_regclass('os_reports') AS r)
  SELECT pg_catalog.has_table_privilege(t,'SELECT') AND NOT pg_catalog.has_table_privilege(t,'INSERT')
    AND pg_catalog.has_table_privilege(t,'DELETE') AND NOT pg_catalog.has_table_privilege(t,'UPDATE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    AND (SELECT array_agg(attname::text ORDER BY attnum) FROM pg_catalog.pg_attribute
       WHERE attrelid=t AND attnum>0 AND NOT attisdropped AND pg_catalog.has_column_privilege(t,attnum,'INSERT'))
      =ARRAY['org_id','intent_id','party','shift_id','shift_revision','participation_id','participation_revision',
        'user_id','intake_id','link_id','link_revision','person_identity_sha256','link_scope_sha256','accepted_at','expires_at']
    AND (SELECT array_agg(attname::text ORDER BY attnum) FROM pg_catalog.pg_attribute
       WHERE attrelid=t AND attnum>0 AND NOT attisdropped AND pg_catalog.has_column_privilege(t,attnum,'UPDATE'))
      =ARRAY['withdrawn_at']
    AND pg_catalog.has_table_privilege(r,'SELECT') AND pg_catalog.has_table_privilege(r,'INSERT')
    AND NOT pg_catalog.has_table_privilege(r,'UPDATE,DELETE,TRUNCATE') AS ready
  FROM refs`;
const unavailable = () => fail(503, "substitution_storage", "Volunteer substitutions are temporarily unavailable.");
const one = result => {
  if (result?.rowCount !== 1 || result.rows?.length !== 1 || !result.rows[0]) unavailable();
  return result.rows[0];
};
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

/** The exact old catalog is available with the feature hidden. Partial or
 * incompatible substitution objects refuse before any domain SQL is parsed. */
export async function volunteerSubstitutionSchemaReady(c) {
  const row = one(await c.query(LAYOUT, [FUNCTION_SHA256, PREDICATE, ORG]));
  if (!row.core) unavailable();
  const present = [row.choices, row.accepted, row.expiry, row.guard];
  if (present.every(value => value === false)) return false;
  if (present.some(value => value !== true) || row.shaped !== true) unavailable();
  const metadata = one(await c.query(TABLE_METADATA));
  if (!same(metadata.columns, COLUMNS) || !same(metadata.policies, POLICIES) || metadata.permissive !== 4 ||
      !same(metadata.constraints, EXPECTED_CONSTRAINTS) || metadata.validated !== 6 || metadata.shape_sha256 !== CHECK_SHA256) unavailable();
  return true;
}

export async function volunteerSubstitutionAccessReady(c) {
  return await volunteerSubstitutionSchemaReady(c) && one(await c.query(ACCESS)).ready === true;
}
export async function requireVolunteerSubstitutionAccess(c) {
  if (!await volunteerSubstitutionAccessReady(c)) unavailable();
}
export const VOLUNTEER_SUBSTITUTION_CATALOG_SQL = Object.freeze({ layout: LAYOUT, metadata: TABLE_METADATA, access: ACCESS });
