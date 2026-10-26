import { test } from "node:test";
import assert from "node:assert/strict";
import {
  csrf,
  checkCsrf,
  hash,
  stable,
  encrypt,
  decrypt,
  body,
} from "../lib/security.mjs";
import { makeBackup, validateBackup, toCsv } from "../lib/backup.mjs";
import { MODULES, exampleRecords } from "../lib/modules.mjs";
import {
  publicAddress,
  integrationUrl,
  providerRequest,
  mapRows,
} from "../lib/integrations.mjs";
test("CSRF binds a live session and rejects cross-site or opaque application mutations", () => {
  const settings = {
      origin: "https://os.charitology.org",
      secret: "a".repeat(40),
    },
    session = { session: { id: "one" } };
  const req = (origin, token) =>
    new Request(settings.origin, {
      method: "POST",
      headers: { origin, "x-csrf-token": token },
    });
  assert.doesNotThrow(() =>
    checkCsrf(
      req(settings.origin, csrf("one", settings.secret)),
      session,
      settings,
    ),
  );
  for (const origin of ["https://evil.invalid", "null"])
    assert.throws(() =>
      checkCsrf(req(origin, csrf("one", settings.secret)), session, settings),
    );
  assert.throws(() =>
    checkCsrf(
      req(settings.origin, csrf("two", settings.secret)),
      session,
      settings,
    ),
  );
});
test("Private integration credentials authenticate ciphertext and never return plaintext in configuration", () => {
  const key = "z".repeat(40),
    token = "private-test-token";
  const encoded = encrypt(token, key);
  assert(!encoded.includes(token));
  assert.equal(decrypt(encoded, key), token);
  assert.throws(() => decrypt(encoded, "other"));
});
test("Backups survive JSON serialization including database timestamps and reject tampering", () => {
  const records = exampleRecords("a"),
    backup = makeBackup(
      { name: "Test", currency: "USD", time_zone: "UTC" },
      records,
      { events: [{ created_at: new Date("2026-01-01T00:00:00Z") }] },
    );
  const copy = JSON.parse(JSON.stringify(backup));
  assert.equal(validateBackup(copy, "b", "user").length, 26);
  assert(
    validateBackup(copy, "b", "user").every(
      (r) => r.orgId === "b" && r.approval === null && r.snapshot === null,
    ),
  );
  copy.records[0].data.title = "changed";
  assert.throws(() => validateBackup(copy, "b", "user"));
  assert.equal(
    hash(Buffer.from("abc")),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});
test("CSV export preserves unknowns/quotes and prevents formula execution", () => {
  const text = toCsv(
    [
      {
        id: "x",
        status: "draft",
        revision: 1,
        data: { title: "=SUM(1,2)", kind: "x" },
      },
    ],
    MODULES[0],
  );
  assert(text.includes("'=SUM(1,2)"));
  assert(!text.includes("undefined"));
});
test("Remote connectors refuse internal/reserved hosts and credentials in URLs", () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.1.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.2",
    "100.64.0.1",
    "::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert(publicAddress("8.8.8.8"));
  for (const url of [
    "http://example.org",
    "https://localhost",
    "https://user:pass@example.org",
    "https://example.org:8443",
    "https://example.org/private",
  ])
    assert.throws(() => integrationUrl(url));
  assert.equal(integrationUrl("https://example.org"), "https://example.org");
});
test("Provider requests use documented read-only paths and header credentials", () => {
  const expected = {
    civicrm: "/civicrm/ajax/api4/Contact/get",
    openproject: "/api/v3/work_packages",
    kobo: "/api/v2/assets/",
  };
  for (const [provider, path] of Object.entries(expected)) {
    const r = providerRequest(
      { provider, config: { baseUrl: "https://example.org" } },
      "secret",
    );
    assert.equal(new URL(r.url).pathname, path);
    assert(!r.url.includes("secret"));
    assert(
      Object.values(r.headers).some(
        (x) => x.includes("secret") || x.startsWith("Basic "),
      ),
    );
  }
});
test("Import previews preserve source identity and return explicit changed-source conflicts", () => {
  const integration = {
      id: "i",
      provider: "csv",
      config: { moduleId: "projects", fieldMap: {} },
    },
    rows = [{ id: "external1", title: "Imported" }];
  const first = mapRows(rows, integration, [], "org", "user");
  assert.equal(first.summary.accepted, 1);
  assert.equal(
    mapRows(rows, integration, first.records, "org", "user").summary.skipped,
    1,
  );
  const changed = mapRows(
    [{ id: "external1", title: "Changed" }],
    integration,
    first.records,
    "org",
    "user",
  );
  assert.equal(changed.summary.conflicts, 1);
  assert.equal(changed.summary.accepted, 0);
});
test("Body limits apply to actual streamed bytes, not only Content-Length", async () => {
  await assert.rejects(
    () =>
      body(
        new Request("https://example.org", {
          method: "POST",
          body: JSON.stringify({ x: "x".repeat(100) }),
        }),
        20,
      ),
    (e) => e.status === 413,
  );
});
