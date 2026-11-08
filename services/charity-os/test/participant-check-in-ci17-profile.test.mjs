/** Pure admission negatives only. No valid factory call, driver or socket. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  checkedCheckInCi17Inputs, checkedCheckInCi17Url,
  checkedCheckInCi17Bootstrap, checkedCheckInCi17Role,
  requireCheckInCi17Profile, createCheckInCi17Profile,
} from "../test-db/fixtures/participant-check-in-ci17-profile.mjs";

// Public disposable CI literals and invented catalog rows; not actual results.
const bootstrapUrl = "postgresql://os_test_owner:ci-owner-only-password@127.0.0.1:5432/charitology_os_ci";
const runtimeUrl = "postgresql://os_test_app:ci-app-only-password@127.0.0.1:5432/charitology_os_ci";
const inputs = () => ({ marker: "github-pg17-v1", githubActions: "true", githubSha: "a".repeat(40), runId: "123", runAttempt: "1", repository: "fictional/repository", databaseUrl: bootstrapUrl, runtimeUrl });
const bootstrap = () => ({ database: "charitology_os_ci", role: "os_test_owner", address: "172.18.0.2", port: 5432, version: "17.11 (fictional unit row)", version_num: 170011, rolsuper: true, rolcreatedb: true, rolcreaterole: true, rolinherit: true, rolreplication: true, rolbypassrls: true, rolcanlogin: true, memberships: 0, directory: "/fictional/postgres/data", system: "1234567890123456789", started: "1900000000" });
const role = (kind = "owner") => {
  const { directory, system, started, ...row } = bootstrap();
  return { ...row, role: kind === "owner" ? "os_checkin_ci_owner" : "os_test_app", rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolinherit: false, rolreplication: false, rolbypassrls: kind === "owner" };
};

test("closed marker and GitHub context are required; CI=true is not admission", () => {
  const admittedData = checkedCheckInCi17Inputs(inputs()); assert(Object.isFrozen(admittedData));
  for (const change of [{ marker: undefined }, { marker: "local" }, { githubActions: "false" }, { githubActions: undefined }, { githubSha: "wrong" }, { runId: "0" }, { runAttempt: "-1" }, { repository: "not-a-repository" }, { CI: "true" }])
    assert.throws(() => checkedCheckInCi17Inputs({ ...inputs(), ...change }));
});
test("fixed client targets refuse aliases, ports, remote hosts, roles and query overrides", () => {
  assert.equal(checkedCheckInCi17Url(bootstrapUrl, "bootstrap"), bootstrapUrl + "?sslmode=disable");
  assert.equal(checkedCheckInCi17Url(runtimeUrl + "?sslmode=disable", "runtime"), runtimeUrl + "?sslmode=disable");
  for (const text of [bootstrapUrl.replace("127.0.0.1", "127.1"), bootstrapUrl.replace("127.0.0.1", "localhost"), bootstrapUrl.replace("127.0.0.1", "172.18.0.2"), bootstrapUrl.replace(":5432", ":65176"), bootstrapUrl.replace("charitology_os_ci", "other_database"), runtimeUrl, bootstrapUrl + "?options=-csearch_path=public", bootstrapUrl + "?sslmode=require", bootstrapUrl + "#fragment", bootstrapUrl.replace("postgresql:", "postgres:")])
    assert.throws(() => checkedCheckInCi17Url(text, "bootstrap"));
});
test("input getters, proxies and extra fields cannot execute an admission hook", () => {
  let calls = 0; const value = inputs();
  Object.defineProperty(value, "marker", { enumerable: true, get() { calls++; return "github-pg17-v1"; } });
  assert.throws(() => checkedCheckInCi17Inputs(value)); assert.equal(calls, 0);
  const proxy = new Proxy(inputs(), { ownKeys() { calls++; return []; } });
  assert.throws(() => checkedCheckInCi17Inputs(proxy)); assert.equal(calls, 0);
  assert.throws(() => checkedCheckInCi17Inputs({ ...inputs(), connect: () => { calls++; } })); assert.equal(calls, 0);
});
test("a declared source/target data object never mints opaque fixture authority", () => {
  const data = checkedCheckInCi17Inputs(inputs());
  for (const value of [undefined, null, data, Object.freeze({ ...data, ownerUrl: bootstrapUrl }), { assertTarget() {} }])
    assert.throws(() => requireCheckInCi17Profile(value), e => e.code === "CHECKIN_CI17_AUTHORITY");
});
test("factory rejects supplied fake callbacks before it can inspect environment or connect", async () => {
  let calls = 0;
  await assert.rejects(createCheckInCi17Profile({ connect() { calls++; } }), e => e.code === "CHECKIN_CI17_AUTHORITY");
  assert.equal(calls, 0);
});
test("ordinary unit execution refuses actual factory at the missing explicit marker", async () => {
  assert.equal(process.versions.node, "24.22.1");
  assert.equal(process.env.CHECKIN_TEST_PROFILE, undefined);
  await assert.rejects(createCheckInCi17Profile(), e => e.code === "CHECKIN_CI17_CONTEXT");
});
test("bootstrap checks require actual PG17 shape, privileged declared role and fixed service", () => {
  assert(Object.isFrozen(checkedCheckInCi17Bootstrap(bootstrap())));
  for (const change of [{ database: "production" }, { role: "other_owner" }, { port: 65176 }, { address: null }, { version_num: 180006, version: "18.6" }, { version_num: 160010 }, { rolsuper: false }, { rolbypassrls: false }, { memberships: 1 }, { directory: "relative" }, { system: "unknown" }, { started: "" }])
    assert.throws(() => checkedCheckInCi17Bootstrap({ ...bootstrap(), ...change }));
});
test("owner and runtime all privilege flags, memberships and observed server identity are checked", () => {
  const identity = checkedCheckInCi17Bootstrap(bootstrap());
  assert(Object.isFrozen(checkedCheckInCi17Role(role(), "owner", identity)));
  assert(Object.isFrozen(checkedCheckInCi17Role(role("runtime"), "runtime", identity)));
  for (const kind of ["owner", "runtime"]) {
    for (const key of ["rolsuper", "rolcreatedb", "rolcreaterole", "rolinherit", "rolreplication"])
      assert.throws(() => checkedCheckInCi17Role({ ...role(kind), [key]: true }, kind, identity));
    for (const change of [{ memberships: 1 }, { address: "172.18.0.3" }, { role: "os_test_owner" }, { version: "17.12 (different server)" }, { rolbypassrls: kind !== "owner" }])
      assert.throws(() => checkedCheckInCi17Role({ ...role(kind), ...change }, kind, identity));
  }
  assert.throws(() => checkedCheckInCi17Role(role(), "bootstrap", identity));
});
