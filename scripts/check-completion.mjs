import assert from "node:assert/strict";
import { readFileSync, statSync, existsSync } from "node:fs";
import { transformSync } from "esbuild";
const root = new URL("../", import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root), "utf8"));
const code = transformSync(
  readFileSync(new URL("src/lib/client/completion-models.ts", root), "utf8"),
  { loader: "ts", format: "esm", target: "es2022" },
).code;
const {
  safeCsvText,
  validateDepthSample,
  depthCoverage,
  validateNominations,
  nominationFields,
  nominationDepths,
  validateManuscript,
  manuscriptFields,
  manuscriptKinds,
} = await import(
  "data:text/javascript;base64," + Buffer.from(code).toString("base64")
);
const row = {
  id: "a",
  activity: "Real activity record",
  amount: 0,
  depth: "unknown",
  source: "Public report, date and rationale",
};
assert.ok(validateDepthSample({ currency: "USD", rows: [row] }));
assert.equal(
  depthCoverage({ currency: "USD", rows: [row] }).classifiedShare,
  null,
  "Zero denominator must stay undefined",
);
assert.equal(
  depthCoverage({ currency: "USD", rows: [{ ...row, amount: 100 }] })
    .classifiedShare,
  0,
  "Unclassified money is not depth0",
);
assert.equal(
  depthCoverage({
    currency: "USD",
    rows: [
      { ...row, amount: 0.1, depth: "0" },
      { ...row, id: "b", amount: 0.2, depth: "unknown" },
    ],
  }).total,
  0.3,
  "Money uses integer cents",
);
for (const amount of [-1, NaN, Infinity, 0.001, 1000000001])
  assert.ok(
    !validateDepthSample({ currency: "USD", rows: [{ ...row, amount }] }),
  );
for (const currency of ["usd", "US", "USD\n", null])
  assert.ok(!validateDepthSample({ currency, rows: [row] }));
assert.ok(
  !validateDepthSample({ currency: "USD", rows: [row, row] }),
  "Duplicate IDs must fail",
);
assert.ok(
  !validateDepthSample({ currency: "USD", rows: [{ ...row, depth: "5" }] }),
);
assert.ok(
  !validateDepthSample({ currency: "USD", rows: [{ ...row, source: "" }] }),
);
const nomination = {
  id: "n",
  ...Object.fromEntries(
    nominationFields.map((f) => [
      f,
      "Explicit unknown or source-linked account",
    ]),
  ),
  depth: "unknown",
};
assert.ok(validateNominations([nomination]));
assert.ok(!validateNominations([nomination, nomination]));
assert.ok(!validateNominations([{ ...nomination, conflicts: "" }]));
assert.ok(
  !validateNominations([{ ...nomination, evidence: "x".repeat(10001) }]),
);
for (const depth of nominationDepths)
  assert.ok(validateNominations([{ ...nomination, depth }]));
for (const depth of ["5", "Depth 3", "0", "unknown "])
  assert.ok(
    !validateNominations([{ ...nomination, depth }]),
    "An imported depth must survive the native select",
  );
const manuscript = {
  ...Object.fromEntries(manuscriptFields.map((f) => [f, ""])),
  kind: "Proposed method",
};
assert.ok(
  validateManuscript(manuscript),
  "Partial manuscript backups should restore",
);
for (const kind of manuscriptKinds)
  assert.ok(validateManuscript({ ...manuscript, kind }));
for (const kind of ["unrecognized", "", null])
  assert.ok(
    !validateManuscript({ ...manuscript, kind }),
    "An imported article type must survive the native select",
  );
assert.ok(!validateManuscript({ ...manuscript, methods: "x".repeat(20001) }));
const guardCode = transformSync(
  readFileSync(new URL("src/lib/client/guarded-draft.ts", root), "utf8"),
  { loader: "ts", format: "esm", target: "es2022" },
).code;
const { guardedDraft } = await import(
  "data:text/javascript;base64," + Buffer.from(guardCode).toString("base64")
);
const savedStorage = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage",
);
const stored = new Map();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
  },
});
try {
  const first = guardedDraft("test");
  const second = guardedDraft("test");
  first.read();
  second.read();
  first.write("first tab work");
  assert.throws(() => second.write("stale second tab work"), /Another tab/);
  assert.equal(stored.get("test"), "first tab work");
  first.write("new first tab work");
  const unread = guardedDraft("unread");
  assert.throws(() => unread.write("replacement"), /could not be read/);
  assert.ok(!stored.has("unread"));
} finally {
  if (savedStorage)
    Object.defineProperty(globalThis, "localStorage", savedStorage);
  else delete globalThis.localStorage;
}
const countries = read("src/data/countries.json");
assert.equal(countries.countries.length, 217);
assert.equal(new Set(countries.countries.map((c) => c.id)).size, 217);
assert.equal(countries.indicators.length, 5);
let observations = 0;
for (const country of countries.countries) {
  assert.ok(country.region && country.name);
  for (const [id, value] of Object.entries(country.values)) {
    assert.ok(countries.indicators.some((i) => i.id === id));
    assert.ok(value.year >= 2020 && value.year <= 2025);
    assert.ok(Number.isFinite(value.value));
    assert.ok(value.value >= 0);
    if (id.endsWith(".ZS")) assert.ok(value.value <= 100.001);
    observations++;
    assert.ok(
      existsSync(
        new URL(
          `dist/record/countries/${country.id.toLowerCase()}/index.html`,
          root,
        ),
      ),
    );
  }
}
assert.equal(observations, 1050);
for (const indicator of countries.indicators) {
  assert.ok(
    indicator.definition &&
      indicator.organization &&
      indicator.apiUrl.startsWith("https://api.worldbank.org/"),
  );
}
const podcast = read("src/data/podcast.json");
assert.equal(podcast.episodes.length, 6);
for (const episode of podcast.episodes) {
  const file = new URL("public" + episode.audio, root);
  assert.equal(statSync(file).size, episode.bytes);
  assert.ok(episode.seconds > 300);
  assert.ok(episode.transcript.length > 4000);
  const bytes = readFileSync(file);
  assert.equal(bytes.subarray(0, 3).toString(), "ID3");
  assert.ok(
    existsSync(new URL(`dist/record/podcast/${episode.id}/index.html`, root)),
  );
}
for (const feed of ["podcast.xml", "newsletter.xml"]) {
  const xml = readFileSync(new URL("dist/" + feed, root), "utf8");
  assert.match(xml, /<rss version="2.0"/);
  assert.match(xml, /<item>/);
}
const rss = readFileSync(new URL("dist/podcast.xml", root), "utf8");
assert.equal((rss.match(/<enclosure /g) || []).length, 6);
console.log(
  "✓ Completion models: unknown vs0, integer cents, invalid imports and nomination disclosures. Country snapshot:217economies/1,050observations. Podcast:6actualMP3s and feeds.",
);

for (const value of [
  "=SUM(1,2)",
  " =SUM(1,2)",
  "\t=1+1",
  "\n+1",
  "  @SUM(A1:A2)",
  "-1",
])
  assert.equal(safeCsvText(value), "'" + value);
assert.equal(safeCsvText("Ordinary source"), "Ordinary source");
