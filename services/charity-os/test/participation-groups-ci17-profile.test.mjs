/** Negative admission tests only: no valid factory, driver, SQL or socket. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  checkedGroupCi17Inputs, checkedGroupCi17Url,
  checkedGroupCi17Bootstrap, checkedGroupCi17Role,
  requireGroupCi17Profile, createGroupCi17Profile,
} from "../test-db/fixtures/participation-groups-ci17-profile.mjs";

// Public disposable CI literals and invented catalog data, never observed SQL.
const bootstrapUrl = "postgresql://os_test_owner:ci-owner-only-password@127.0.0.1:5432/charitology_os_ci";
const ownerUrl = "postgresql://os_group_ci_owner:ci-group-owner-only-password@127.0.0.1:5432/charitology_os_ci";
const runtimeUrl = "postgresql://os_test_app:ci-app-only-password@127.0.0.1:5432/charitology_os_ci";
const inputs = () => ({ marker: "github-group-pg17-v1", githubActions: "true", githubSha: "a".repeat(40), runId: "123", runAttempt: "1", repository: "fictional/repository", databaseUrl: bootstrapUrl, runtimeUrl });
const bootstrap = () => ({ database: "charitology_os_ci", role: "os_test_owner", address: "172.18.0.2", port: 5432, version: "17.11 (fictional unit row)", version_num: 170011, rolsuper: true, rolcreatedb: true, rolcreaterole: true, rolinherit: true, rolreplication: true, rolbypassrls: true, rolcanlogin: true, memberships: 0, directory: "/fictional/postgres/data", system: "1234567890123456789", started: "1900000000", statement_timeout_ms: 30000, lock_timeout_ms: 3000, idle_timeout_ms: 30000, transaction_timeout_ms: 120000 });
const role = (kind = "owner") => {
  const { directory, system, started, ...row } = bootstrap();
  return { ...row, role: kind === "owner" ? "os_group_ci_owner" : "os_test_app", rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolinherit: false, rolreplication: false, rolbypassrls: kind === "owner" };
};
const refusal = code => error => error.code === code;

test("GROUP marker and closed GitHub source selectors refuse CI=true and check-in admission", () => {
  for (const change of [{ marker: undefined }, { marker: "github-pg17-v1" }, { marker: "local" }, { githubActions: "false" }, { githubActions: true }, { githubSha: "wrong" }, { githubSha: "A".repeat(40) }, { runId: "0" }, { runAttempt: "-1" }, { repository: "not-a-repository" }, { CI: "true" }])
    assert.throws(() => checkedGroupCi17Inputs({ ...inputs(), ...change }));
});

test("fixed client targets reject role substitution, aliases, remote targets and overrides", () => {
  for (const kind of ["bootstrap", "owner", "runtime"]) {
    const url = { bootstrap: bootstrapUrl, owner: ownerUrl, runtime: runtimeUrl }[kind];
    for (const value of [url.replace("127.0.0.1", "localhost"), url.replace("127.0.0.1", "127.1"), url.replace("127.0.0.1", "172.18.0.2"), url.replace(":5432", ":65182"), url.replace("charitology_os_ci", "charitology_group_business_fixture"), url.replace("postgresql:", "postgres:"), url + "?options=-csearch_path=public", url + "?sslmode=require", url + "?sslmode=disable&sslmode=disable", url + "#fragment"])
      assert.throws(() => checkedGroupCi17Url(value, kind));
    for (const other of [bootstrapUrl, ownerUrl, runtimeUrl].filter(value => value !== url))
      assert.throws(() => checkedGroupCi17Url(other, kind));
  }
  for (const kind of ["__proto__", "checkin", undefined, new String("runtime")])
    assert.throws(() => checkedGroupCi17Url(runtimeUrl, kind));
});

test("input descriptors reject accessors, hidden keys, symbols, prototypes and proxy traps", () => {
  let calls = 0;
  const accessor = inputs();
  Object.defineProperty(accessor, "marker", { enumerable: true, get() { calls++; return "github-group-pg17-v1"; } });
  const hidden = inputs(); Object.defineProperty(hidden, "marker", { value: hidden.marker, enumerable: false });
  const decorated = inputs(); decorated[Symbol("extra")] = true;
  const inherited = Object.assign(Object.create({ marker: "github-group-pg17-v1" }), inputs());
  const proxy = new Proxy(inputs(), { ownKeys() { calls++; return []; }, getPrototypeOf() { calls++; return Object.prototype; } });
  for (const value of [accessor, hidden, decorated, inherited, proxy, { ...inputs(), connect() { calls++; } }])
    assert.throws(() => checkedGroupCi17Inputs(value));
  assert.equal(calls, 0);
});

test("declared source and profile-shaped data never mint opaque GROUP authority", () => {
  for (const value of [undefined, null, inputs(), Object.freeze(inputs()), { ...inputs(), ownerUrl }, { schemaPrefix: "os_group_ci_", assertTarget() {}, cleanup() {} }])
    assert.throws(() => requireGroupCi17Profile(value), refusal("GROUP_CI17_AUTHORITY"));
});

test("factory refuses injected callbacks or even explicit undefined before reading context", async () => {
  let calls = 0;
  for (const value of [undefined, { connect() { calls++; } }, new Proxy({}, { get() { calls++; throw Error("TRAP"); } })])
    await assert.rejects(createGroupCi17Profile(value), refusal("GROUP_CI17_AUTHORITY"));
  assert.equal(calls, 0);
});

test("ordinary unit factory refuses the absent GROUP marker before source or driver IO", async () => {
  assert.equal(process.env.GROUP_TEST_PROFILE, undefined);
  await assert.rejects(createGroupCi17Profile(), refusal("GROUP_CI17_CONTEXT"));
});

test("bootstrap selectors refuse wrong database, PG version, role and identity shape", () => {
  for (const change of [{ database: "production" }, { role: "os_group_ci_owner" }, { port: 65182 }, { address: null }, { address: "database.invalid" }, { version_num: 180006, version: "18.6" }, { version_num: 160010, version: "16.10" }, { version_num: "170011" }, { rolsuper: false }, { rolbypassrls: false }, { rolcanlogin: false }, { memberships: 1 }, { directory: "relative" }, { system: "unknown" }, { started: "" }, { extra: true }])
    assert.throws(() => checkedGroupCi17Bootstrap({ ...bootstrap(), ...change }));
});

test("catalog row getters and proxies are rejected without invocation", () => {
  let calls = 0;
  const row = bootstrap(); Object.defineProperty(row, "database", { enumerable: true, get() { calls++; return "charitology_os_ci"; } });
  assert.throws(() => checkedGroupCi17Bootstrap(row));
  const proxy = new Proxy(role(), { ownKeys() { calls++; return []; } });
  assert.throws(() => checkedGroupCi17Role(proxy, "owner", bootstrap()));
  const identity = new Proxy(bootstrap(), { ownKeys() { calls++; return []; } });
  assert.throws(() => checkedGroupCi17Role(role(), "owner", identity));
  assert.equal(calls, 0);
});

test("owner and runtime reject elevated privileges, memberships and observed-server changes", () => {
  for (const kind of ["owner", "runtime"]) {
    for (const key of ["rolsuper", "rolcreatedb", "rolcreaterole", "rolinherit", "rolreplication"])
      assert.throws(() => checkedGroupCi17Role({ ...role(kind), [key]: true }, kind, bootstrap()));
    for (const change of [{ memberships: 1 }, { address: "172.18.0.3" }, { database: "another_database" }, { role: "os_test_owner" }, { role: "os_checkin_ci_owner" }, { version: "17.12 (different observed server)" }, { version_num: 170012 }, { rolcanlogin: false }, { rolbypassrls: kind !== "owner" }])
      assert.throws(() => checkedGroupCi17Role({ ...role(kind), ...change }, kind, bootstrap()));
  }
  assert.throws(() => checkedGroupCi17Role(role(), "bootstrap", bootstrap()));
});

test("all four actual timeout values must match, including the PG17 transaction bound", () => {
  for (const key of ["statement_timeout_ms", "lock_timeout_ms", "idle_timeout_ms", "transaction_timeout_ms"]) {
    for (const value of [0, 1, "120000", undefined, NaN]) {
      assert.throws(() => checkedGroupCi17Bootstrap({ ...bootstrap(), [key]: value }), refusal("GROUP_CI17_TIMEOUTS"));
      assert.throws(() => checkedGroupCi17Role({ ...role(), [key]: value }, "owner", bootstrap()), refusal("GROUP_CI17_TIMEOUTS"));
    }
  }
});
