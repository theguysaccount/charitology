/** Closed reminder-only disposable local PG18 fixture. Import performs no IO. */
import { createHash } from "node:crypto";
import { readFile, lstat, realpath } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isProxy } from "node:util/types";
import { isIP } from "node:net";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { readReminderRuntimeSource } from "./participation-reminder-binding.mjs";

const ROOT = "/Users/jack/Documents/Codex/2026-10-25/i-m-continuing-my-project-charitology/work/os-private/output-cost-spreadsheet";
const admitted = new WeakSet();
const ROLE = Object.freeze({ bootstrap: "os_test_owner", owner: "os_reminder_local_owner", runtime: "os_test_app" });
const DESCRIPTOR = "/Users/jack/Documents/Codex/2026-10-25/i-m-continuing-my-project-charitology/work/os-private/learning-continuation-2026-11-05/os-comms-pg-source-v6/candidate/local18-target.private.json";
const DIRECTORY = "/Users/jack/Documents/Codex/2026-10-25/i-m-continuing-my-project-charitology/work/os-private/learning-continuation-2026-11-05/os-comms-pg-source-v6/candidate/owned-pg18/data";
const INPUT_KEYS = ["marker", "commit", "runId", "bootstrapUrl", "ownerUrl", "runtimeUrl", "port", "directory", "system", "started"];
let TARGET = null;
const TIMEOUTS = Object.freeze({ statement_timeout_ms: 30000, lock_timeout_ms: 3000, idle_timeout_ms: 30000, transaction_timeout_ms: 120000 });
const STARTUP = "-c statement_timeout=30000 -c lock_timeout=3000 -c idle_in_transaction_session_timeout=30000 -c transaction_timeout=120000";
const ROLE_KEYS = ["database", "role", "address", "port", "version", "version_num", "rolsuper", "rolcreatedb", "rolcreaterole", "rolinherit", "rolreplication", "rolbypassrls", "rolcanlogin", "memberships", ...Object.keys(TIMEOUTS)];
const BOOT_KEYS = [...ROLE_KEYS, "directory", "system", "started"];
const hash = value => createHash("sha256").update(value).digest("hex");
const refused = (code = "REMINDER_LOCAL18_REFUSED") => Object.assign(new Error(code), { code });
const must = (value, code) => { if (!value) throw refused(code); };
function exact(value, keys) {
  must(value && typeof value === "object" && !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  must(Reflect.ownKeys(descriptors).length === keys.length && keys.every(k => descriptors[k]?.enumerable && Object.hasOwn(descriptors[k], "value")));
}
export function checkedReminderLocal18Url(text, kind) {
  must(TARGET !== null && ["bootstrap", "owner", "runtime"].includes(kind) && typeof text === "string");
  must(text === TARGET[kind + "Url"] || text === TARGET[kind + "Url"] + "?sslmode=disable");
  return TARGET[kind + "Url"] + "?sslmode=disable";
}
/** Data validation is not profile authority. No caller may supply this data to mint a profile. */
export function checkedReminderLocal18Inputs(value) {
  exact(value, INPUT_KEYS);
  must(value.marker === "local-reminder-pg18-v1" && /^[a-f0-9]{40}$/.test(value.commit));
  must(/^local-[a-f0-9]{16}$/.test(value.runId) && Number.isInteger(value.port) && value.port >= 65100 && value.port <= 65535);
  must(value.directory === DIRECTORY && /^[1-9][0-9]{9,29}$/.test(value.system) && /^[1-9][0-9]{0,19}$/.test(value.started));
  for (const kind of ["bootstrap", "owner", "runtime"]) {
    const text = value[kind + "Url"]; must(typeof text === "string");
    let url; try { url = new URL(text); } catch { throw refused(); }
    must(url.protocol === "postgresql:" && url.hostname === "127.0.0.1" && url.port === String(value.port) && url.pathname === "/charitology_reminder_fixture" && url.username === ROLE[kind] && /^[a-f0-9]{32,128}$/.test(url.password) && url.search === "" && url.hash === "");
    must(text === `postgresql://${url.username}:${url.password}@127.0.0.1:${value.port}/charitology_reminder_fixture`);
  }
  return Object.freeze(Object.fromEntries(INPUT_KEYS.map(k => [k, value[k]])));
}
async function localInputs() {
  const state = await lstat(DESCRIPTOR);
  must(state.isFile() && !state.isSymbolicLink() && state.size > 0 && state.size <= 8192 && (state.mode & 0o777) === 0o600 && state.uid === process.getuid() && await realpath(DESCRIPTOR) === DESCRIPTOR);
  const text = await readFile(DESCRIPTOR, "utf8");
  const value = checkedReminderLocal18Inputs(JSON.parse(text));
  must(await realpath(value.directory) === value.directory);
  return value;
}
function commonRole(row) {
  must(row.database === "charitology_reminder_fixture" && TARGET !== null && row.port === TARGET.port && typeof row.address === "string" && isIP(row.address) !== 0);
  must(Number.isInteger(row.version_num) && row.version_num === 180006);
  must(typeof row.version === "string" && /^18\.6(?:\s|$)/.test(row.version) && row.version.length <= 200 && row.rolcanlogin === true && row.memberships === 0);
  for (const key of ["rolsuper", "rolcreatedb", "rolcreaterole", "rolinherit", "rolreplication", "rolbypassrls"]) must(typeof row[key] === "boolean");
  for (const [key, value] of Object.entries(TIMEOUTS)) must(row[key] === value, "REMINDER_LOCAL18_TIMEOUTS");
}
export function checkedReminderLocal18Bootstrap(row) {
  exact(row, BOOT_KEYS); commonRole(row);
  must(row.role === ROLE.bootstrap && row.rolsuper === true && row.rolbypassrls === true);
  must(row.directory === TARGET.directory);
  must(row.system === TARGET.system);
  must(row.started === TARGET.started);
  return Object.freeze(Object.fromEntries(BOOT_KEYS.map(k => [k, row[k]])));
}
export function checkedReminderLocal18Role(row, kind, identity) {
  exact(row, ROLE_KEYS); commonRole(row); checkedReminderLocal18Bootstrap(identity);
  must(["owner", "runtime"].includes(kind) && row.role === ROLE[kind] && row.address === identity.address && row.version === identity.version && row.version_num === identity.version_num);
  for (const key of ["rolsuper", "rolcreatedb", "rolcreaterole", "rolinherit", "rolreplication"]) must(row[key] === false);
  must(row.rolbypassrls === (kind === "owner"));
  return Object.freeze(Object.fromEntries(ROLE_KEYS.map(k => [k, row[k]])));
}
export function requireReminderLocal18Profile(value) {
  must(admitted.has(value), "REMINDER_LOCAL18_AUTHORITY"); return value;
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
  must(commit === input.commit && /^[a-f0-9]{40}$/.test(tree));
  must(await git(["status", "--porcelain=v1"]) === "");
  const paths = (await git(["ls-files", "-z", "--", ".nvmrc", ".github/workflows/charity-os-check.yml", "package-lock.json", "services/charity-os/package.json", "services/charity-os/package-lock.json", "services/charity-os/lib", "services/charity-os/test-db", "services/charity-os/test/participation-reminder-pg-admission.test.mjs", "services/charity-os/test/fixtures/contact-reconciliation-legacy75-v1.json", "services/charity-os/test/fixtures/contact-schema-column-vectors-v1.json"])).split("\0").filter(Boolean);
  must(paths.length > 10 && paths.length <= 512 && new Set(paths).size === paths.length);
  const files = [];
  for (const name of paths) {
    must(!path.isAbsolute(name) && !name.split("/").includes(".."));
    const b = await regular(path.join(ROOT, name)); files.push({ path: name, bytes: b.length, sha256: hash(b) });
  }
  return Object.freeze({ commit, tree, files: Object.freeze(files), sha256: hash(JSON.stringify(files)) });
}
const ROLE_SQL = "SELECT current_database() AS database,current_user AS role,host(inet_server_addr()) AS address,inet_server_port() AS port,current_setting('server_version') AS version,current_setting('server_version_num')::int AS version_num,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls,rolcanlogin,(SELECT count(*)::int FROM pg_auth_members WHERE member=pg_roles.oid) AS memberships," +
  "(extract(epoch FROM current_setting('statement_timeout')::interval)*1000)::int AS statement_timeout_ms," +
  "(extract(epoch FROM current_setting('lock_timeout')::interval)*1000)::int AS lock_timeout_ms," +
  "(extract(epoch FROM current_setting('idle_in_transaction_session_timeout')::interval)*1000)::int AS idle_timeout_ms," +
  "(extract(epoch FROM current_setting('transaction_timeout')::interval)*1000)::int AS transaction_timeout_ms";
const BOOT_SQL = ROLE_SQL + ",current_setting('data_directory') AS directory,(SELECT system_identifier::text FROM pg_control_system()) AS system,floor(extract(epoch FROM pg_postmaster_start_time()))::bigint::text AS started FROM pg_roles WHERE rolname=current_user";
const SCHEMA = /^os_reminder_local_[a-f0-9]{16}$/;
const quote = value => '"' + value.replaceAll('"', '""') + '"';

/** Authority is minted only after real source, bootstrap and both role proofs. */
export async function createReminderLocal18Profile() {
  must(arguments.length === 0, "REMINDER_LOCAL18_AUTHORITY");
  const runtimeSource = await readReminderRuntimeSource(ROOT); // UNBOUND refuses before descriptor, driver or target access.
  must(TARGET === null, "REMINDER_LOCAL18_ALREADY_MINTED");
  const input = await localInputs(); TARGET = input;
  const source = await sourceProof(input);
  must(JSON.stringify(await readReminderRuntimeSource(ROOT)) === JSON.stringify(runtimeSource), "REMINDER_LOCAL18_SOURCE_BINDING");
  const pgPackage = JSON.parse((await regular(path.join(ROOT, "services/charity-os/node_modules/pg/package.json"))).toString("utf8"));
  must(pgPackage.version === "8.23.1");
  const pg = (await import(pathToFileURL(path.join(ROOT, "services/charity-os/node_modules/pg/lib/index.js")).href)).default;
  let driverFailed = false, finished = false;
  const seen = new WeakSet(), watched = new WeakSet(), records = [], baselines = new Map();
  const healthy = () => must(!driverFailed && !finished);
  const watch = pool => {
    healthy(); must(!watched.has(pool));
    const BaseClient = pool.Client; must(typeof BaseClient === "function");
    // Install before any connection. Preserve only the fixture's closed search
    // path; startup bounds also cover the advisory lock before db.tx callbacks.
    // PG17 introduced transaction_timeout; its actual value is read back above.
    pool.Client = class extends BaseClient {
      constructor(config) {
        const options = config.options ?? "";
        must(options === "" || /^-c search_path=os_reminder_local_[a-f0-9]{16}$/.test(options));
        super({ ...config, options: (options ? options + " " : "") + STARTUP, query_timeout: 45000, connectionTimeoutMillis: 5000 });
        this.on("error", () => { driverFailed = true; });
      }
    };
    watched.add(pool);
    const client = c => { if (!seen.has(c)) { seen.add(c); c.on("error", () => { driverFailed = true; }); } };
    pool.on("error", () => { driverFailed = true; }); pool.on("connect", client); pool.on("acquire", client);
  };
  const makePool = kind => { const p = new pg.Pool({ connectionString: checkedReminderLocal18Url(TARGET[kind + "Url"], kind), ssl: false, max: 1, connectionTimeoutMillis: 5000, query_timeout: 45000, idleTimeoutMillis: 1000 }); watch(p); return p; };
  const bootstrap = makePool("bootstrap"), initialOwner = makePool("owner"), initialRuntime = makePool("runtime");
  async function readOnly(pool, read) {
    healthy(); const c = await pool.connect();
    try { await c.query("BEGIN READ ONLY"); const value = await read(c); await c.query("ROLLBACK"); healthy(); return value; }
    catch { try { await c.query("ROLLBACK"); } catch {} throw refused(); }
    finally { c.release(driverFailed); }
  }
  const readBootstrap = () => readOnly(bootstrap, async c => checkedReminderLocal18Bootstrap((await c.query(BOOT_SQL)).rows[0]));
  let identity, primary = null;
  try {
    identity = await readBootstrap();
    for (const [pool, kind] of [[initialOwner, "owner"], [initialRuntime, "runtime"]]) await readOnly(pool, async c => checkedReminderLocal18Role((await c.query(ROLE_SQL + " FROM pg_roles WHERE rolname=current_user")).rows[0], kind, identity));
  } catch { primary = refused(); }
  finally { for (const pool of [initialRuntime, initialOwner]) try { await pool.end(); } catch { driverFailed = true; } }
  if (primary || driverFailed) { try { await bootstrap.end(); } catch {} throw primary || refused(); }
  const assertSource = async () => { const next = await sourceProof(input); must(next.commit === source.commit && next.tree === source.tree && next.sha256 === source.sha256); must(JSON.stringify(await readReminderRuntimeSource(ROOT)) === JSON.stringify(runtimeSource), "REMINDER_LOCAL18_SOURCE_BINDING"); };
  const assertTarget = async () => { healthy(); await assertSource(); must(JSON.stringify(await readBootstrap()) === JSON.stringify(identity)); healthy(); };
  const roleClient = async (c, kind) => { healthy(); checkedReminderLocal18Role((await c.query(ROLE_SQL + " FROM pg_roles WHERE rolname=current_user")).rows[0], kind, identity); healthy(); };
  const assertRole = (pool, kind) => readOnly(pool, c => roleClient(c, kind));
  const namespaces = async c => { const rows = (await c.query("SELECT nspname,nspowner::text AS owner,COALESCE(nspacl::text,'') AS acl FROM pg_namespace ORDER BY nspname LIMIT 513")).rows; must(rows.length <= 512); return rows; };
  const beforeSchema = async (schema, owner) => {
    healthy(); must(SCHEMA.test(schema) && baselines.size === 0);
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
      must(records.length < 1 && SCHEMA.test(schema)); records.push(Object.freeze(result));
    }
    if (!primaryError && (failed || driverFailed)) throw refused("REMINDER_LOCAL18_CLEANUP");
  };
  const finish = async () => {
    let failure = null;
    try {
      await assertTarget();
      must(records.length === 1 && records.every(r => r.created && r.appSettled && r.migrationSettled && r.identityVerified && r.dropped && r.namespacesUnchanged && r.ownerSettled && !r.driverFailure));
    } catch { failure = refused("REMINDER_LOCAL18_FINAL"); }
    finally { try { await bootstrap.end(); } catch { driverFailed = true; } finished = true; }
    if (failure || driverFailed) throw failure || refused();
    return Object.freeze({ profile: "local-reminder-pg18-v1", sourceCommit: source.commit, sourceTree: source.tree, sourceFiles: source.files.length, sourceSha256: source.sha256, runId: input.runId, actualServerVersion: identity.version, actualServerVersionNum: identity.version_num, nodeVersion: process.versions.node, pgVersion: pgPackage.version, timeoutsVerified: true, cleanupVerified: true, ownedSchemas: records.length, testAssertionsNotInferredFromCleanup: true });
  };
  const abandon = async () => { if (!finished) { try { await bootstrap.end(); } catch { driverFailed = true; } finished = true; } };
  const profile = Object.freeze({ sourceRoot: ROOT, sourceCommit: source.commit, sourceTree: source.tree, runtimeSourceProof: runtimeSource, assertSource, kind: "reminder-local18", expectedServerVersionNum: 180006, databaseName: "charitology_reminder_fixture", ownerRole: ROLE.owner, runtimeRole: ROLE.runtime, ownerUrl: checkedReminderLocal18Url(TARGET.ownerUrl, "owner"), runtimeUrl: checkedReminderLocal18Url(TARGET.runtimeUrl, "runtime"), schemaPrefix: "os_reminder_local_", checkUrl: text => must([TARGET.ownerUrl + "?sslmode=disable", TARGET.runtimeUrl + "?sslmode=disable"].includes(text)), watch, assertTarget, assertRole, beforeSchema, cleanup, cleanupCount: () => records.length, cleanupsAfter: n => records.slice(n), finish, abandon });
  admitted.add(profile); return profile;
}
