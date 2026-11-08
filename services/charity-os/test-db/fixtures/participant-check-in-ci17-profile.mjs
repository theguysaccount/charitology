/** Closed disposable GitHub PG17 fixture. Importing this module performs no IO. */
import { createHash } from "node:crypto";
import { readFile, lstat, realpath } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isProxy } from "node:util/types";
import { isIP } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const admitted = new WeakSet();
const ROLE = Object.freeze({ bootstrap: "os_test_owner", owner: "os_checkin_ci_owner", runtime: "os_test_app" });
const URLS = Object.freeze({
  bootstrap: "postgresql://os_test_owner:ci-owner-only-password@127.0.0.1:5432/charitology_os_ci",
  owner: "postgresql://os_checkin_ci_owner:ci-checkin-owner-only-password@127.0.0.1:5432/charitology_os_ci",
  runtime: "postgresql://os_test_app:ci-app-only-password@127.0.0.1:5432/charitology_os_ci",
});
const INPUT_KEYS = ["marker", "githubActions", "githubSha", "runId", "runAttempt", "repository", "databaseUrl", "runtimeUrl"];
const ROLE_KEYS = ["database", "role", "address", "port", "version", "version_num", "rolsuper", "rolcreatedb", "rolcreaterole", "rolinherit", "rolreplication", "rolbypassrls", "rolcanlogin", "memberships"];
const BOOT_KEYS = [...ROLE_KEYS, "directory", "system", "started"];
const hash = value => createHash("sha256").update(value).digest("hex");
const refused = (code = "CHECKIN_CI17_REFUSED") => Object.assign(new Error(code), { code });
const must = (value, code) => { if (!value) throw refused(code); };
function exact(value, keys) {
  must(value && typeof value === "object" && !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  must(Reflect.ownKeys(descriptors).length === keys.length && keys.every(k => descriptors[k]?.enumerable && Object.hasOwn(descriptors[k], "value")));
}
export function checkedCheckInCi17Url(text, kind) {
  must(typeof kind === "string" && Object.hasOwn(URLS, kind) && typeof text === "string" && (text === URLS[kind] || text === URLS[kind] + "?sslmode=disable"));
  return URLS[kind] + "?sslmode=disable";
}
/** Pure input checking returns data only, never fixture authority. */
export function checkedCheckInCi17Inputs(value) {
  exact(value, INPUT_KEYS);
  must(value.marker === "github-pg17-v1" && value.githubActions === "true", "CHECKIN_CI17_CONTEXT");
  must(typeof value.githubSha === "string" && /^[a-f0-9]{40}$/.test(value.githubSha));
  for (const key of ["runId", "runAttempt"]) must(typeof value[key] === "string" && /^[1-9][0-9]{0,19}$/.test(value[key]));
  must(typeof value.repository === "string" && /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(value.repository));
  checkedCheckInCi17Url(value.databaseUrl, "bootstrap");
  checkedCheckInCi17Url(value.runtimeUrl, "runtime");
  return Object.freeze(Object.fromEntries(INPUT_KEYS.map(k => [k, value[k]])));
}
function commonRole(row) {
  must(row.database === "charitology_os_ci" && row.port === 5432 && typeof row.address === "string" && isIP(row.address) !== 0);
  must(Number.isInteger(row.version_num) && row.version_num >= 170000 && row.version_num < 180000);
  must(typeof row.version === "string" && row.version.startsWith("17.") && row.version.length <= 200 && row.rolcanlogin === true && row.memberships === 0);
  for (const key of ["rolsuper", "rolcreatedb", "rolcreaterole", "rolinherit", "rolreplication", "rolbypassrls"]) must(typeof row[key] === "boolean");
}
export function checkedCheckInCi17Bootstrap(row) {
  exact(row, BOOT_KEYS); commonRole(row);
  must(row.role === ROLE.bootstrap && row.rolsuper === true && row.rolbypassrls === true);
  must(typeof row.directory === "string" && row.directory.length <= 1000 && path.isAbsolute(row.directory));
  must(typeof row.system === "string" && /^[1-9][0-9]{9,29}$/.test(row.system));
  must(typeof row.started === "string" && /^[1-9][0-9]{0,19}$/.test(row.started));
  return Object.freeze(Object.fromEntries(BOOT_KEYS.map(k => [k, row[k]])));
}
export function checkedCheckInCi17Role(row, kind, identity) {
  exact(row, ROLE_KEYS); commonRole(row); checkedCheckInCi17Bootstrap(identity);
  must(["owner", "runtime"].includes(kind) && row.role === ROLE[kind] && row.address === identity.address && row.version === identity.version && row.version_num === identity.version_num);
  for (const key of ["rolsuper", "rolcreatedb", "rolcreaterole", "rolinherit", "rolreplication"]) must(row[key] === false);
  must(row.rolbypassrls === (kind === "owner"));
  return Object.freeze(Object.fromEntries(ROLE_KEYS.map(k => [k, row[k]])));
}
export function requireCheckInCi17Profile(value) {
  must(admitted.has(value), "CHECKIN_CI17_AUTHORITY"); return value;
}
const GIT_ENV = Object.freeze({ PATH: "/usr/bin:/bin", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_NO_REPLACE_OBJECTS: "1", GIT_NO_LAZY_FETCH: "1", GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" });
async function git(args) {
  const r = await promisify(execFile)("/usr/bin/git", ["-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false", ...args], { cwd: ROOT, env: GIT_ENV, timeout: 5000, maxBuffer: 1048576 });
  return r.stdout;
}
async function regular(file) {
  const s = await lstat(file); must(s.isFile() && !s.isSymbolicLink() && s.size > 0 && s.size <= 2097152 && await realpath(file) === file);
  const b = await readFile(file); must(b.length === s.size); return b;
}
async function sourceProof(input) {
  must(process.versions.node === "24.22.1" && (await regular(path.join(ROOT, ".nvmrc"))).toString("utf8").trim() === process.versions.node);
  const [commit, tree] = (await git(["rev-parse", "HEAD", "HEAD^{tree}"])).trim().split("\n");
  must(commit === input.githubSha && /^[a-f0-9]{40}$/.test(tree));
  must(await git(["status", "--porcelain=v1"]) === "");
  const paths = (await git(["ls-files", "-z", "--", ".nvmrc", ".github/workflows/charity-os-check.yml", "package-lock.json", "services/charity-os/package.json", "services/charity-os/package-lock.json", "services/charity-os/lib", "services/charity-os/test-db", "services/charity-os/test/participant-check-in-ci17-profile.test.mjs"])).split("\0").filter(Boolean);
  must(paths.length > 10 && paths.length <= 512 && new Set(paths).size === paths.length);
  const files = [];
  for (const name of paths) {
    must(!path.isAbsolute(name) && !name.split("/").includes(".."));
    const b = await regular(path.join(ROOT, name)); files.push({ path: name, bytes: b.length, sha256: hash(b) });
  }
  return Object.freeze({ commit, tree, files: Object.freeze(files), sha256: hash(JSON.stringify(files)) });
}
const ROLE_SQL = "SELECT current_database() AS database,current_user AS role,host(inet_server_addr()) AS address,inet_server_port() AS port,current_setting('server_version') AS version,current_setting('server_version_num')::int AS version_num,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls,rolcanlogin,(SELECT count(*)::int FROM pg_auth_members WHERE member=pg_roles.oid) AS memberships";
const BOOT_SQL = ROLE_SQL + ",current_setting('data_directory') AS directory,(SELECT system_identifier::text FROM pg_control_system()) AS system,floor(extract(epoch FROM pg_postmaster_start_time()))::bigint::text AS started FROM pg_roles WHERE rolname=current_user";
const SCHEMA = /^os_checkin_ci_[a-f0-9]{16}$/;
const quote = value => '"' + value.replaceAll('"', '""') + '"';

/** Authority is minted only after real source, bootstrap and both role proofs. */
export async function createCheckInCi17Profile() {
  must(arguments.length === 0, "CHECKIN_CI17_AUTHORITY");
  const input = checkedCheckInCi17Inputs({ marker: process.env.CHECKIN_TEST_PROFILE, githubActions: process.env.GITHUB_ACTIONS, githubSha: process.env.GITHUB_SHA, runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT, repository: process.env.GITHUB_REPOSITORY, databaseUrl: process.env.DATABASE_URL, runtimeUrl: process.env.OS_DATABASE_URL });
  const source = await sourceProof(input);
  const pg = (await import("pg")).default;
  const pgPackage = JSON.parse((await regular(fileURLToPath(new URL("../../node_modules/pg/package.json", import.meta.url)))).toString("utf8"));
  must(pgPackage.version === "8.23.1");
  let driverFailed = false, finished = false;
  const seen = new WeakSet(), records = [], baselines = new Map();
  const healthy = () => must(!driverFailed && !finished);
  const watch = pool => {
    const BaseClient = pool.Client; must(typeof BaseClient === "function");
    pool.Client = class extends BaseClient { constructor(...args) { super(...args); this.on("error", () => { driverFailed = true; }); } };
    const client = c => { if (!seen.has(c)) { seen.add(c); c.on("error", () => { driverFailed = true; }); } };
    pool.on("error", () => { driverFailed = true; }); pool.on("connect", client); pool.on("acquire", client);
  };
  const makePool = kind => { const p = new pg.Pool({ connectionString: checkedCheckInCi17Url(URLS[kind], kind), ssl: false, max: 1, connectionTimeoutMillis: 5000, query_timeout: 15000, idleTimeoutMillis: 1000 }); watch(p); return p; };
  const bootstrap = makePool("bootstrap"), initialOwner = makePool("owner"), initialRuntime = makePool("runtime");
  async function readOnly(pool, read) {
    healthy(); const c = await pool.connect();
    try { await c.query("BEGIN READ ONLY"); const value = await read(c); await c.query("ROLLBACK"); healthy(); return value; }
    catch { try { await c.query("ROLLBACK"); } catch {} throw refused(); }
    finally { c.release(driverFailed); }
  }
  const readBootstrap = () => readOnly(bootstrap, async c => checkedCheckInCi17Bootstrap((await c.query(BOOT_SQL)).rows[0]));
  let identity, primary = null;
  try {
    identity = await readBootstrap();
    for (const [pool, kind] of [[initialOwner, "owner"], [initialRuntime, "runtime"]]) await readOnly(pool, async c => checkedCheckInCi17Role((await c.query(ROLE_SQL + " FROM pg_roles WHERE rolname=current_user")).rows[0], kind, identity));
  } catch { primary = refused(); }
  finally { for (const pool of [initialRuntime, initialOwner]) try { await pool.end(); } catch { driverFailed = true; } }
  if (primary || driverFailed) { try { await bootstrap.end(); } catch {} throw primary || refused(); }
  const assertSource = async () => { const next = await sourceProof(input); must(next.commit === source.commit && next.tree === source.tree && next.sha256 === source.sha256); };
  const assertTarget = async () => { healthy(); await assertSource(); must(JSON.stringify(await readBootstrap()) === JSON.stringify(identity)); healthy(); };
  const roleClient = async (c, kind) => { healthy(); checkedCheckInCi17Role((await c.query(ROLE_SQL + " FROM pg_roles WHERE rolname=current_user")).rows[0], kind, identity); healthy(); };
  const assertRole = (pool, kind) => readOnly(pool, c => roleClient(c, kind));
  const namespaces = async c => { const rows = (await c.query("SELECT nspname,nspowner::text AS owner,COALESCE(nspacl::text,'') AS acl FROM pg_namespace ORDER BY nspname LIMIT 513")).rows; must(rows.length <= 512); return rows; };
  const beforeSchema = async (schema, owner) => {
    healthy(); must(SCHEMA.test(schema) && !baselines.has(schema));
    const rows = await readOnly(owner, namespaces); must(!rows.some(r => r.nspname === schema)); baselines.set(schema, JSON.stringify(rows));
    await assertRole(owner, "owner"); await assertTarget();
  };
  const cleanup = async ({ db, migration, owner, schema, created, primaryError }) => {
    const result = { schema, created, appSettled: !db, migrationSettled: !migration, identityVerified: false, dropped: false, namespacesUnchanged: false, ownerSettled: false, driverFailure: false };
    let failed = false;
    try { if (db) await db.close(); result.appSettled = true; } catch { failed = true; }
    try { if (migration) await migration.close(); result.migrationSettled = true; } catch { failed = true; }
    try {
      if (created && result.appSettled && result.migrationSettled) {
        must(SCHEMA.test(schema) && baselines.has(schema)); const c = await owner.pool.connect();
        try {
          await roleClient(c, "owner");
          const row = (await c.query("SELECT n.nspname,r.rolname AS owner FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner WHERE n.nspname=$1", [schema])).rows[0];
          must(row?.nspname === schema && row.owner === ROLE.owner);
          await assertTarget(); result.identityVerified = true; healthy();
          await c.query(`DROP SCHEMA ${quote(schema)} CASCADE`);
          result.dropped = !(await c.query("SELECT 1 FROM pg_namespace WHERE nspname=$1", [schema])).rows.length; must(result.dropped);
          result.namespacesUnchanged = JSON.stringify(await namespaces(c)) === baselines.get(schema); must(result.namespacesUnchanged);
        } finally { c.release(driverFailed); }
      }
    } catch { failed = true; }
    finally {
      try { await owner.close(); result.ownerSettled = true; } catch { failed = true; }
      result.driverFailure = driverFailed;
      must(records.length < 13 && SCHEMA.test(schema)); records.push(Object.freeze(result));
    }
    if (!primaryError && (failed || driverFailed)) throw refused("CHECKIN_CI17_CLEANUP");
  };
  const finish = async () => {
    let failure = null;
    try {
      await assertTarget();
      must(records.length === 13 && records.every(r => r.created && r.appSettled && r.migrationSettled && r.identityVerified && r.dropped && r.namespacesUnchanged && r.ownerSettled && !r.driverFailure));
    } catch { failure = refused("CHECKIN_CI17_FINAL"); }
    finally { try { await bootstrap.end(); } catch { driverFailed = true; } finished = true; }
    if (failure || driverFailed) throw failure || refused();
    return Object.freeze({ profile: "github-pg17-v1", sourceCommit: source.commit, sourceTree: source.tree, sourceFiles: source.files.length, sourceSha256: source.sha256, runId: input.runId, runAttempt: input.runAttempt, actualServerVersion: identity.version, actualServerVersionNum: identity.version_num, nodeVersion: process.versions.node, pgVersion: pgPackage.version, cleanupVerified: true, ownedSchemas: records.length, testAssertionsNotInferredFromCleanup: true });
  };
  const abandon = async () => { if (!finished) { try { await bootstrap.end(); } catch { driverFailed = true; } finished = true; } };
  const profile = Object.freeze({ ownerUrl: checkedCheckInCi17Url(URLS.owner, "owner"), runtimeUrl: checkedCheckInCi17Url(URLS.runtime, "runtime"), schemaPrefix: "os_checkin_ci_", checkUrl: text => must([URLS.owner + "?sslmode=disable", URLS.runtime + "?sslmode=disable"].includes(text)), watch, assertTarget, assertRole, beforeSchema, cleanup, cleanupCount: () => records.length, cleanupsAfter: n => records.slice(n), finish, abandon });
  admitted.add(profile); return profile;
}
