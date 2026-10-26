import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { createServer } from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  publicRegistry,
  PUBLIC_REGISTRY_ASSETS,
} from "../lib/public-registry.mjs";
import {
  IRS_SOURCE,
  IRS_FIELDS,
  COVERAGE,
  createRegistry,
  normalizeRegistryRow,
  normalizeRegistryName,
  normalizeEin,
  registryQuery,
  validateRegistryManifest,
  statusLabel,
  deductibilityLabel,
} from "../../../src/lib/irs-registry.mjs";
import {
  csvRows,
  buildRegistry,
} from "../../../scripts/update-irs-registry.mjs";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function fixture() {
  const records = [
    ["001234567", "FOOD, CARE & CO", null, null, "03", "01", null, 4],
    ["123456789", "FOOD FOR ALL", "EXAMPLE CITY", "VA", "04", "02", "2", 2],
    ...Array.from({ length: 101 }, (_, i) => [
      String(200000000 + i),
      `FOOD TEST ${String(i).padStart(3, "0")}`,
      "EXAMPLE",
      "VA",
      "03",
      "01",
      "1",
      2,
    ]),
  ];
  const files = new Map(),
    manifest = {
      format: "charitology-irs-eobmf",
      version: 1,
      fields: IRS_FIELDS,
      source: { name: "IRS fixture", url: IRS_SOURCE },
      coverage: COVERAGE,
      dataDate: "2026-10-13",
      recordCount: records.length,
      compressedBytes: 0,
      sources: Array.from({ length: 4 }, (_, i) => ({
        region: i + 1,
        url: `https://www.irs.gov/pub/irs-soi/eo${i + 1}.csv`,
        sha256: "a".repeat(64),
        bytes: 1000,
        retrievedAt: "2026-10-26T00:00:00.000Z",
        rows: records.filter((r) => r[7] === i + 1).length,
      })),
      shards: { names: {}, eins: {} },
    };
  const directories = new Map();
  for (const r of records) {
    const prefix = r[0].slice(0, 2);
    if (!directories.has(prefix)) directories.set(prefix, []);
    directories.get(prefix).push(r[0].slice(2) + "F");
  }
  function put(kind, key, text, rows) {
    const raw = Buffer.from(text),
      compressed = gzipSync(raw),
      path = `${kind}/${key}.${kind === "names" ? "json" : "txt"}.gz`;
    files.set(path, compressed);
    manifest.shards[kind][key] = {
      path,
      rows,
      bytes: compressed.length,
      decodedBytes: raw.length,
      sha256: sha(compressed),
      decodedSha256: sha(raw),
    };
    manifest.compressedBytes += compressed.length;
  }
  put("names", "F", JSON.stringify(records), records.length);
  for (const [key, rows] of directories)
    put("eins", key, rows.sort().join("\n"), rows.length);
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    assert.equal(new URL(url).origin, "https://charitology.org");
    assert.equal(options.credentials, "omit");
    assert.equal(options.redirect, "error");
    assert.equal(options.referrerPolicy, "no-referrer");
    const relative = url.slice(PUBLIC_REGISTRY_ASSETS.length);
    if (relative === "manifest.json")
      return new Response(JSON.stringify(manifest));
    return files.has(relative)
      ? new Response(files.get(relative))
      : new Response("", { status: 404 });
  };
  return { records, manifest, files, calls, fetcher };
}
test("IRS normalization preserves leading-zero EINs and missing fields; does not invent a country or financial data", () => {
  const row = normalizeRegistryRow(
    {
      EIN: "001234567",
      NAME: "Test entity",
      CITY: "",
      STATE: "",
      SUBSECTION: "00",
      STATUS: "",
      DEDUCTIBILITY: "0",
    },
    4,
  );
  assert.deepEqual(row, [
    "001234567",
    "Test entity",
    null,
    null,
    "00",
    null,
    "0",
    4,
  ]);
  assert.equal(normalizeEin("00-1234567"), "001234567");
  assert.equal(normalizeRegistryName("École — du, Test!"), "ECOLE DU TEST");
  assert.throws(() => normalizeEin(1234567));
  assert.throws(() => normalizeRegistryRow({ EIN: "123456789", NAME: "" }, 1));
  assert.match(statusLabel("12"), /4947/);
  assert.match(statusLabel("77"), /Unmapped/);
  assert.equal(deductibilityLabel(null), "Not supplied");
  assert.match(deductibilityLabel("2"), /not deductible/);
});
test("actual CSV parser accepts embedded commas, quotes, multiline and BOM, rejects malformed rows", () => {
  assert.deepEqual(
    [...csvRows('\uFEFFEIN,NAME\r\n001234567,"A, B ""C""\nD"\r\n')],
    [
      ["EIN", "NAME"],
      ["001234567", 'A, B "C"\nD'],
    ],
  );
  assert.throws(() => [...csvRows('A\n"unfinished')]);
  assert.throws(() => [...csvRows('A\n"quoted"tail')]);
});
test("invalid or ambiguous queries are rejected before any request; result and input bounds are enforced", async () => {
  let requests = 0;
  const registry = createRegistry({
    base: PUBLIC_REGISTRY_ASSETS,
    fetcher: async () => {
      requests++;
      throw Error("not expected");
    },
  });
  for (const input of [
    { q: "ab" },
    { q: "123" },
    { q: "x".repeat(121) },
    { ein: "001234567", q: "FOOD" },
    { q: "food", state: "../" },
    { q: "food", limit: 101 },
    { q: "food", limit: 1.5 },
  ])
    await assert.rejects(registry.search(input), RangeError);
  assert.equal(requests, 0);
  assert.equal(registryQuery({ q: "00-1234567" }).ein, "001234567");
});
test("public resolver exact EIN downloads only its directory and one identity shard, never sends the full query", async () => {
  const f = fixture(),
    registry = publicRegistry({ fetcher: f.fetcher });
  assert.equal(f.calls.length, 0);
  const r = await registry.lookup({ ein: "00-1234567" });
  assert.equal(r.organizations.length, 1);
  assert.equal(r.organizations[0].ein, "001234567");
  assert.equal(r.organizations[0].country, null);
  assert.equal(r.organizations[0].registryJurisdiction, "US");
  assert.equal(r.organizations[0].city, null);
  assert.equal(
    r.organizations[0].sourceUrl,
    "https://www.irs.gov/pub/irs-soi/eo4.csv",
  );
  assert.equal(r.organizations[0].sourceSha256, "a".repeat(64));
  assert.equal(r.organizations[0].sourceRecordCount, 1);
  assert.equal(r.dataDate, "2026-10-13");
  assert.equal(r.source.url, IRS_SOURCE);
  assert.ok(Number.isFinite(Date.parse(r.queriedAt)));
  assert.deepEqual(
    f.calls.map((c) => c.url.replace(PUBLIC_REGISTRY_ASSETS, "")),
    ["manifest.json", "eins/00.txt.gz", "names/F.json.gz"],
  );
  await registry.lookup({ q: "FOOD CARE" });
  assert.equal(f.calls.length, 3, "validated shard is reused");
  assert.equal(
    (await registry.lookup({ ein: "991234567" })).total,
    0,
    "absent prefix is a valid empty result",
  );
});
test("name starts-with search and filing state filter return at most 100 with honest total/truncation", async () => {
  const f = fixture(),
    registry = publicRegistry({ fetcher: f.fetcher });
  const all = await registry.lookup({ q: "food" });
  assert.equal(all.total, 103);
  assert.equal(all.organizations.length, 100);
  assert.equal(all.truncated, true);
  const virginia = await registry.lookup({ q: "food", state: "va" });
  assert.equal(virginia.total, 102);
  assert.equal((await registry.lookup({ q: "food care" })).total, 1);
  assert.equal(
    (await registry.lookup({ q: "care" })).total,
    0,
    "words in the middle are not misleadingly claimed as matches",
  );
  assert.equal(
    (await registry.lookup({ ein: "001234567", state: "VA" })).total,
    0,
  );
});
test("malformed provenance/path/totals cannot become a general URL fetch", async () => {
  const f = fixture();
  for (const mutate of [
    (m) => (m.shards.names.F.path = "../../private"),
    (m) => (m.sources[0].url = "https://attacker.example/data"),
    (m) => m.recordCount++,
    (m) => (m.shards.names.F.bytes = 11 * 1024 ** 2),
    (m) => (m.shards.names.F.decodedBytes = 51 * 1024 ** 2),
  ]) {
    const altered = structuredClone(f.manifest);
    mutate(altered);
    assert.throws(() => validateRegistryManifest(altered));
  }
  const altered = structuredClone(f.manifest);
  altered.shards.names.F.path = "https://attacker.example/data";
  const registry = createRegistry({
    base: PUBLIC_REGISTRY_ASSETS,
    fetcher: async () => new Response(JSON.stringify(altered)),
  });
  await assert.rejects(registry.search({ q: "food" }), /shard/);
});
test("tampered bytes and network failure fail closed and can be retried", async () => {
  const f = fixture();
  const good = f.files.get("names/F.json.gz");
  f.files.set("names/F.json.gz", Buffer.from("tampered"));
  const registry = publicRegistry({ fetcher: f.fetcher });
  await assert.rejects(
    registry.lookup({ q: "food" }),
    /integrity|decoded size/,
  );
  f.files.set("names/F.json.gz", good);
  assert.equal((await registry.lookup({ q: "food care" })).total, 1);
  const broken = createRegistry({
    base: PUBLIC_REGISTRY_ASSETS,
    fetcher: async () => new Response("", { status: 503 }),
  });
  await assert.rejects(broken.search({ q: "food" }), /unavailable/);
});
test("decoded size and logical identity validation fail closed even with matching compressed hashes", async () => {
  const f = fixture();
  f.manifest.shards.names.F.decodedBytes++;
  await assert.rejects(
    publicRegistry({ fetcher: f.fetcher }).lookup({ q: "food" }),
    /decoded size/,
  );
  f.manifest.shards.names.F.decodedBytes--;
  const rows = structuredClone(f.records);
  rows[0][0] = 1234567;
  const raw = Buffer.from(JSON.stringify(rows)),
    compressed = gzipSync(raw),
    spec = f.manifest.shards.names.F;
  f.manifest.compressedBytes += compressed.length - spec.bytes;
  Object.assign(spec, {
    bytes: compressed.length,
    decodedBytes: raw.length,
    sha256: sha(compressed),
    decodedSha256: sha(raw),
  });
  f.files.set(spec.path, compressed);
  await assert.rejects(
    publicRegistry({ fetcher: f.fetcher }).lookup({ q: "food" }),
    /identity/,
  );
});
test("actual HTTP Fetch handles both raw gzip files and transparent HTTP gzip decoding with integrity intact", async () => {
  const f = fixture();
  let contentEncoding = true,
    corrupt = false;
  const server = createServer((request, response) => {
    const relative = new URL(request.url, "http://localhost").pathname.slice(1);
    if (relative === "manifest.json") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(f.manifest));
      return;
    }
    const bytes = f.files.get(relative);
    if (!bytes) {
      response.statusCode = 404;
      response.end();
      return;
    }
    response.setHeader("content-type", "application/gzip");
    if (contentEncoding) response.setHeader("content-encoding", "gzip");
    // Content-Length stays compressed even when Fetch exposes decoded bytes.
    const body = corrupt
      ? gzipSync(Buffer.from("changed but valid HTTP gzip"))
      : bytes;
    response.setHeader("content-length", body.length);
    response.end(body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}/`;
    const decoded = createRegistry({
      base,
      decode: async () => {
        throw Error(
          "Already HTTP-decoded data must not be decompressed twice.",
        );
      },
    });
    assert.equal(
      (await decoded.search({ ein: "00-1234567" })).organizations[0].ein,
      "001234567",
    );
    contentEncoding = false;
    assert.equal(
      (await createRegistry({ base }).search({ q: "food care" })).total,
      1,
    );
    contentEncoding = true;
    corrupt = true;
    await assert.rejects(
      createRegistry({ base }).search({ q: "food care" }),
      /integrity|decoded size/,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
test("actual refresh workflow verifies four source files and never replaces prior published data after a mixed-release/count error", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "charitology-irs-test-"));
  const inputDir = path.join(dir, "raw"),
    outputDir = path.join(dir, "published");
  await fs.mkdir(inputDir);
  try {
    const page =
      "Updated data posting date:&nbsp;<strong>10/13/2026</strong><p>Record count:&nbsp;<strong>4</strong>";
    await fs.writeFile(path.join(inputDir, "source-page.html"), page);
    for (let region = 1; region <= 4; region++) {
      const bytes = Buffer.from(
        `EIN,NAME,CITY,STATE,SUBSECTION,STATUS,DEDUCTIBILITY\r\n00123456${region},TEST ${region},,,03,01,\r\n`,
      );
      await fs.writeFile(path.join(inputDir, `eo${region}.csv`), bytes);
      await fs.writeFile(
        path.join(inputDir, `eo${region}.metadata.json`),
        JSON.stringify({
          url: `https://www.irs.gov/pub/irs-soi/eo${region}.csv`,
          sha256: sha(bytes),
          bytes: bytes.length,
          retrievedAt: "2026-10-26T00:00:00Z",
          lastModified: "Tue, 13 Oct 2026 19:13:10 GMT",
        }),
      );
    }
    const m = await buildRegistry({ inputDir, outputDir });
    assert.equal(m.recordCount, 4);
    const prior = await fs.readFile(
      path.join(outputDir, "manifest.json"),
      "utf8",
    );
    await fs.writeFile(
      path.join(inputDir, "source-page.html"),
      page.replace("<strong>4</strong>", "<strong>5</strong>"),
    );
    await assert.rejects(
      buildRegistry({ inputDir, outputDir }),
      /count differs/,
    );
    assert.equal(
      await fs.readFile(path.join(outputDir, "manifest.json"), "utf8"),
      prior,
    );
    await fs.writeFile(
      path.join(inputDir, "source-page.html"),
      page.replace("10/13/2026", "10/14/2026"),
    );
    await assert.rejects(
      buildRegistry({ inputDir, outputDir }),
      /mixed IRS release/,
    );
    assert.equal(
      await fs.readFile(path.join(outputDir, "manifest.json"), "utf8"),
      prior,
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
