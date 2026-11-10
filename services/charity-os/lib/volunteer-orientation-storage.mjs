import { fail, hash, id } from "./security.mjs";
import { orientationChanged, orientationData, orientationHash, orientationId, orientationRevision, orientationUnavailable } from "./volunteer-orientation-marker.mjs";

export const VOLUNTEER_ORIENTATION_SCHEMA = "charity_os_volunteer_orientation";
const storage = VOLUNTEER_ORIENTATION_SCHEMA;
const table = name => '"' + storage + '"."' + name + '"';
const P = table("policies"), O = table("observations"), A = table("acceptances");
const boundedId = "^[A-Za-z0-9_-]{1,100}$", sha = "^[a-f0-9]{64}$";
const exactTime = /^((?!0000)[0-9]{4})-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$/;
const safeIdentifier = value => {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_]{0,62}$/.test(value)) throw new TypeError("Choose an exact orientation installation identifier.");
  return '"' + value + '"';
};
const policyFields = ["org_id", "target_id", "program_id", "requirement_id", "revision", "state",
  "source_revision", "terms_hash", "authored_by", "reviewed_by", "reviewed_at"];
const observationFields = ["org_id", "slot", "participation_id", "requirement_id", "policy_revision", "subject_hash", "revision",
  "register_revision", "state", "completed_on", "valid_through", "recorded_by", "checked_at", "request_hash"];
const acceptanceFields = ["org_id", "slot", "participation_id", "target_id", "intent_hash", "request_hash", "subject_hash", "decision_id", "action",
  "result_revision", "policy_revision", "observation_revision", "register_revision", "accepted_at"];
const policyUpdates = policyFields.slice(4);
const observationUpdates = observationFields.slice(4);
const tableProfiles = [["policies", policyFields, policyUpdates], ["observations", observationFields, observationUpdates],
  ["acceptances", acceptanceFields, []]];
const T = (expression, alias) => `to_char(${expression} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS ${alias}`;

/** Run with the database owner in one reviewed migration transaction. Runtime
 * owns neither the schema nor these tables, and receives no delete authority. */
export function volunteerOrientationInstallationSql({ applicationSchema, runtimeRole }) {
  const app = safeIdentifier(applicationSchema), role = safeIdentifier(runtimeRole), schema = safeIdentifier(storage);
  if (applicationSchema === storage) throw new TypeError("Use a separate private orientation schema.");
  const tenant = "org_id=current_setting('app.org_id',true)";
  const scope = tableProfiles.map(([name, , updates]) => {
    const target = table(name);
    return `ALTER TABLE ${target} ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${target} FORCE ROW LEVEL SECURITY;
CREATE POLICY orientation_tenant ON ${target} TO ${role} USING (${tenant}) WITH CHECK (${tenant});
REVOKE ALL ON ${target} FROM PUBLIC,${role};
GRANT SELECT,INSERT ON ${target} TO ${role};
${updates.length ? `GRANT UPDATE(${updates.join(",")}) ON ${target} TO ${role};` : ""}`;
  }).join("\n");
  return `
CREATE SCHEMA ${schema};
REVOKE ALL ON SCHEMA ${schema} FROM PUBLIC,${role};
GRANT USAGE ON SCHEMA ${schema} TO ${role};
CREATE TABLE ${P} (
  org_id text PRIMARY KEY CHECK(org_id ~ '${boundedId}'),
  target_id text NOT NULL CHECK(target_id ~ '${boundedId}'),
  program_id text NOT NULL CHECK(program_id ~ '${boundedId}'),
  requirement_id text NOT NULL CHECK(requirement_id ~ '${boundedId}'),
  revision integer NOT NULL CHECK(revision>0),
  state text NOT NULL CHECK(state IN ('pending','active')),
  source_revision integer NOT NULL CHECK(source_revision>0),
  terms_hash text NOT NULL CHECK(terms_hash ~ '${sha}'),
  authored_by text NOT NULL CHECK(authored_by ~ '${boundedId}'),
  reviewed_by text CHECK(reviewed_by ~ '${boundedId}'),
  reviewed_at timestamptz CHECK(isfinite(reviewed_at)),
  UNIQUE(org_id,requirement_id), UNIQUE(org_id,target_id),
  FOREIGN KEY(org_id,target_id) REFERENCES ${app}.os_participation_targets(org_id,target_id),
  FOREIGN KEY(org_id,program_id) REFERENCES ${app}.os_records(org_id,id),
  CHECK((state='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
     OR (state='active' AND reviewed_by IS NOT NULL AND reviewed_by<>authored_by AND reviewed_at IS NOT NULL))
);
CREATE TABLE ${O} (
  org_id text NOT NULL CHECK(org_id ~ '${boundedId}'),
  slot smallint NOT NULL CHECK(slot BETWEEN 1 AND 32),
  participation_id text NOT NULL CHECK(participation_id ~ '${boundedId}'),
  requirement_id text NOT NULL CHECK(requirement_id ~ '${boundedId}'),
  policy_revision integer NOT NULL CHECK(policy_revision>0),
  subject_hash text NOT NULL CHECK(subject_hash ~ '${sha}'),
  revision integer NOT NULL CHECK(revision>0),
  register_revision integer NOT NULL CHECK(register_revision>0),
  state text NOT NULL CHECK(state IN ('complete','unknown','withdrawn')),
  completed_on date CHECK(isfinite(completed_on)),
  valid_through date CHECK(isfinite(valid_through)),
  recorded_by text NOT NULL CHECK(recorded_by ~ '${boundedId}'),
  checked_at timestamptz NOT NULL CHECK(isfinite(checked_at)),
  request_hash text NOT NULL CHECK(request_hash ~ '${sha}'),
  PRIMARY KEY(org_id,participation_id),
  UNIQUE(org_id,slot),
  FOREIGN KEY(org_id,requirement_id) REFERENCES ${P}(org_id,requirement_id),
  FOREIGN KEY(org_id,participation_id) REFERENCES ${app}.os_participations(org_id,id) ON DELETE CASCADE,
  CHECK((state='complete' AND completed_on IS NOT NULL AND valid_through>=completed_on AND valid_through IS NOT NULL)
     OR (state IN ('unknown','withdrawn') AND completed_on IS NULL AND valid_through IS NULL))
);
CREATE TABLE ${A} (
  org_id text NOT NULL CHECK(org_id ~ '${boundedId}'),
  slot smallint NOT NULL CHECK(slot BETWEEN 1 AND 32),
  participation_id text NOT NULL CHECK(participation_id ~ '${boundedId}'),
  target_id text NOT NULL CHECK(target_id ~ '${boundedId}'),
  intent_hash text NOT NULL CHECK(intent_hash ~ '${sha}'),
  request_hash text NOT NULL CHECK(request_hash ~ '${sha}'),
  subject_hash text NOT NULL CHECK(subject_hash ~ '${sha}'),
  decision_id text NOT NULL CHECK(decision_id ~ '^[a-f0-9]{32}$'),
  action text NOT NULL CHECK(action IN ('confirm','promote')),
  result_revision integer NOT NULL CHECK(result_revision>1),
  policy_revision integer NOT NULL CHECK(policy_revision>0),
  observation_revision integer NOT NULL CHECK(observation_revision>0),
  register_revision integer NOT NULL CHECK(register_revision>0),
  accepted_at timestamptz NOT NULL CHECK(isfinite(accepted_at)),
  PRIMARY KEY(org_id,intent_hash), UNIQUE(org_id,slot), UNIQUE(org_id,participation_id), UNIQUE(org_id,decision_id),
  FOREIGN KEY(org_id,target_id) REFERENCES ${P}(org_id,target_id),
  FOREIGN KEY(org_id,participation_id) REFERENCES ${app}.os_participations(org_id,id) ON DELETE CASCADE
);
${scope}
`;
}

/** Known restricted role, exact tenant policies, and exact per-column UPDATE.
 * This deliberately checks afresh on the current client. */
export async function volunteerOrientationStorageReady(c) {
  const rows = (await c.query(`/* orientation:storage */
SELECT t.relname AS name, ARRAY(SELECT a.attname::text FROM pg_catalog.pg_attribute a
 WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum) AS columns,
 ARRAY(SELECT a.attname::text FROM pg_catalog.pg_attribute a WHERE a.attrelid=t.oid
 AND a.attnum>0 AND NOT a.attisdropped AND pg_catalog.has_column_privilege(t.oid,a.attnum,'UPDATE') ORDER BY a.attnum) AS updates,
 (n.nspowner<>r.oid AND t.relowner<>r.oid AND NOT r.rolsuper AND NOT r.rolbypassrls
  AND NOT r.rolcreaterole AND NOT r.rolcreatedb AND NOT r.rolreplication
  AND NOT pg_catalog.pg_has_role(r.oid,t.relowner,'MEMBER') AND NOT pg_catalog.pg_has_role(r.oid,n.nspowner,'MEMBER')
  AND pg_catalog.has_schema_privilege(n.oid,'USAGE') AND NOT pg_catalog.has_schema_privilege(n.oid,'CREATE')
  AND t.relrowsecurity AND t.relforcerowsecurity
  AND pg_catalog.has_table_privilege(t.oid,'SELECT') AND pg_catalog.has_table_privilege(t.oid,'INSERT')
  AND NOT pg_catalog.has_table_privilege(t.oid,'UPDATE') AND NOT pg_catalog.has_table_privilege(t.oid,'DELETE')
  AND NOT pg_catalog.has_table_privilege(t.oid,'TRUNCATE') AND NOT pg_catalog.has_table_privilege(t.oid,'REFERENCES')
  AND NOT pg_catalog.has_table_privilege(t.oid,'TRIGGER')
  AND (SELECT count(*) FROM pg_catalog.pg_policy x WHERE x.polrelid=t.oid)=1
  AND EXISTS(SELECT 1 FROM pg_catalog.pg_policy p WHERE p.polrelid=t.oid AND p.polname='orientation_tenant'
    AND p.polcmd='*' AND p.polpermissive AND p.polroles=ARRAY[r.oid]
    AND pg_catalog.pg_get_expr(p.polqual,p.polrelid)=$2 AND pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid)=$2)
  AND NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(COALESCE(t.relacl,'{}'::aclitem[])) x WHERE x.grantee=0)
  AND NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(COALESCE(n.nspacl,'{}'::aclitem[])) x WHERE x.grantee=0)) AS ready
 FROM pg_catalog.pg_class t JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
 JOIN pg_catalog.pg_roles r ON r.rolname=current_user WHERE n.nspname=$1 AND t.relkind='r' ORDER BY t.relname COLLATE "C"`,
  [storage, "(org_id = current_setting('app.org_id'::text, true))"])).rows;
  return rows.length === tableProfiles.length && tableProfiles.every(([name, columns, updates]) => {
    const row = rows.find(item => item.name === name);
    return row?.ready === true && JSON.stringify(row.columns) === JSON.stringify(columns) &&
      JSON.stringify(row.updates) === JSON.stringify(updates);
  });
}

export async function requireVolunteerOrientationStorage(c) {
  if (!await volunteerOrientationStorageReady(c)) orientationUnavailable();
}
const policyProjection = policyFields.slice(0, -1).join(",") + "," + T("reviewed_at", "reviewed_at");
const evidenceProjection = observationFields.map(key =>
  key === "checked_at" ? T(key, key) : ["completed_on", "valid_through"].includes(key) ? key + "::text AS " + key : key).join(",");
const receiptProjection = acceptanceFields.slice(0, -1).join(",") + "," + T("accepted_at", "accepted_at");
async function single(c, sql, values, required = false) {
  const {rows} = await c.query(sql, values);
  if (rows.length > 1 || (required && rows.length !== 1)) orientationUnavailable();
  return rows[0] ?? null;
}
export const readVolunteerOrientationPolicy = (c, org) =>
  single(c, `SELECT ${policyProjection} FROM ${P} WHERE org_id=$1`, [org]);
export const readVolunteerOrientationObservation = (c, org, place) =>
  single(c, `SELECT ${evidenceProjection} FROM ${O} WHERE org_id=$1 AND participation_id=$2`, [org, place]);

export async function saveVolunteerOrientationPolicy(c, values, previous) {
  const {orgId, targetId, programId, requirementId, sourceRevision, termsHash, actor} = values;
  const row = previous === null ? await single(c, `INSERT INTO ${P}
    (org_id,target_id,program_id,requirement_id,revision,state,source_revision,terms_hash,authored_by)
    VALUES($1,$2,$3,$4,1,'pending',$5,$6,$7) ON CONFLICT DO NOTHING RETURNING ${policyProjection}`,
    [orgId, targetId, programId, requirementId, sourceRevision, termsHash, actor]) :
    await single(c, `UPDATE ${P} SET revision=revision+1,state='pending',source_revision=$4,terms_hash=$5,
    authored_by=$6,reviewed_by=NULL,reviewed_at=NULL WHERE org_id=$1 AND requirement_id=$2 AND revision=$3 RETURNING ${policyProjection}`,
    [orgId, requirementId, previous, sourceRevision, termsHash, actor]);
  if (!row) orientationChanged();
  return row;
}

export async function approveVolunteerOrientationPolicy(c, org, policy, user, atExact) {
  const row = await single(c, `UPDATE ${P} SET revision=revision+1,state='active',reviewed_by=$4,reviewed_at=$5
    WHERE org_id=$1 AND requirement_id=$2 AND revision=$3 AND state='pending' AND authored_by<>$4 RETURNING ${policyProjection}`,
  [org, policy.requirement_id, policy.revision, user, atExact]);
  if (!row) orientationChanged();
  return row;
}

export function orientationSubjectHash(org, target, p) {
  if (![org, target, p.id, p.contact_id].every(orientationId)) orientationUnavailable();
  return hash(["charitology-volunteer-orientation-subject-v1", org, target, p.id, p.contact_id]);
}
async function requireSlot(c, relation, org) {
  const row = await single(c, `SELECT min(s.slot)::int AS slot FROM generate_series(1,32) s(slot)
    WHERE NOT EXISTS(SELECT 1 FROM ${relation} existing WHERE existing.org_id=$1 AND existing.slot=s.slot)`, [org], true);
  if (row.slot === null) fail(409, "volunteer_orientation_capacity", "This orientation has reached its 32 retained places.");
  if (!Number.isInteger(row.slot) || row.slot < 1 || row.slot > 32) orientationUnavailable();
  return row.slot;
}

export async function saveVolunteerOrientationObservation(c, input, current) {
  const {orgId, participationId, requirementId, policyRevision, subjectHash, registerRevision, state,
    completedOn, validThrough, actor, atExact, requestHash} = input;
  const row = current ? await single(c, `UPDATE ${O} SET policy_revision=$3,subject_hash=$4,revision=revision+1,
      register_revision=$5,state=$6,completed_on=$7,valid_through=$8,recorded_by=$9,checked_at=$10,request_hash=$11
      WHERE org_id=$1 AND participation_id=$2 AND requirement_id=$12 AND revision=$13 RETURNING ${evidenceProjection}`,
    [orgId, participationId, policyRevision, subjectHash, registerRevision, state, completedOn, validThrough, actor,
      atExact, requestHash, requirementId, current.revision]) :
    await single(c, `INSERT INTO ${O}(${observationFields.join(",")})
      VALUES($1,$2,$3,$4,$5,$6,1,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT DO NOTHING RETURNING ${evidenceProjection}`,
    [orgId, await requireSlot(c, O, orgId), participationId, requirementId, policyRevision, subjectHash, registerRevision, state, completedOn, validThrough,
      actor, atExact, requestHash]);
  if (!row) orientationChanged();
  return row;
}

const summaryKeys = ["version", "id", "action", "state", "resultRevision", "policyRevision", "acceptedAtExact"];
export function orientationAcceptanceSummary(raw) {
  const value = orientationData(raw, summaryKeys);
  if (!value || value.version !== 1 || typeof value.id !== "string" || !/^[a-f0-9]{32}$/.test(value.id) ||
      !["confirm", "promote"].includes(value.action) || value.state !== "confirmed" || !orientationRevision(value.resultRevision) ||
      !orientationRevision(value.policyRevision) || typeof value.acceptedAtExact !== "string" || !exactTime.test(value.acceptedAtExact))
    orientationUnavailable();
  return Object.freeze(value);
}

export function makeOrientationAcceptance(action, p, atExact, policy) {
  return orientationAcceptanceSummary({version: 1, id: id(), action, state: "confirmed", resultRevision: p.revision + 1,
    policyRevision: policy.revision, acceptedAtExact: atExact});
}

export async function readVolunteerOrientationAcceptance(c, org, target, p, intent) {
  const row = await single(c, `SELECT ${receiptProjection} FROM ${A} WHERE org_id=$1 AND intent_hash=$2`,
    [org, intent.intentHash]);
  if (!row) return null;
  if (row.request_hash !== intent.payloadHash || row.action !== intent.action || row.target_id !== target ||
      row.participation_id !== p.id || row.subject_hash !== orientationSubjectHash(org, target, p))
    fail(409, "participation_intent", "This intent was already used with different fields. Reload the current state.");
  return orientationAcceptanceSummary({version: 1, id: row.decision_id, action: row.action, state: "confirmed",
    resultRevision: row.result_revision, policyRevision: row.policy_revision, acceptedAtExact: row.accepted_at});
}

export async function retainVolunteerOrientationAcceptance(c, org, target, p, intent, summary, observation) {
  const slot = await requireSlot(c, A, org);
  const accepted = orientationAcceptanceSummary(summary);
  const row = await single(c, `INSERT INTO ${A}(${acceptanceFields.join(",")})
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT DO NOTHING RETURNING decision_id`,
  [org, slot, p.id, target, intent.intentHash, intent.payloadHash, orientationSubjectHash(org, target, p),
    accepted.id, accepted.action, accepted.resultRevision, accepted.policyRevision, observation.revision,
    observation.register_revision, accepted.acceptedAtExact]);
  if (row?.decision_id !== accepted.id) orientationChanged();
}
