// Actual public loader/API/route modules over excluded temporary synthetic bytes.
// Content collection reads alone are stubbed for Astro's virtual module; no
// real source capture, data-root mutation, Git write, browser or network occurs.
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm, readFile } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { build } from "esbuild";
import { transform } from "@astrojs/compiler";
import ts from "typescript";
import { disasterFixture } from "./lib/disaster-model-fixtures.mjs";
const root = process.cwd(),
  temporary = await mkdtemp(join(resolve("node_modules"), ".disaster-public-"));
let count = 0,
  serial = 0;
const check = async (name, run) => {
  await run();
  console.log(`ok ${++count} ${name}`);
};
const astroVirtual = {
  name: "disaster-public-content-only",
  setup(b) {
    b.onResolve({ filter: /^astro:content$/ }, () => ({
      path: "content",
      namespace: "disaster-content",
    }));
    b.onLoad({ filter: /.*/, namespace: "disaster-content" }, () => ({
      contents:
        "export const getCollection=async()=>[];export const getEntry=async()=>undefined;",
      loader: "js",
    }));
  },
};
async function bundle(entry, source) {
  const outfile = join(temporary, `module-${serial++}.mjs`);
  await build({
    ...(source
      ? {
          stdin: {
            contents: source,
            resolveDir: dirname(resolve(entry)),
            sourcefile: entry,
            loader: "ts",
          },
        }
      : { entryPoints: [entry] }),
    outfile,
    absWorkingDir: root,
    bundle: true,
    format: "esm",
    platform: "node",
    packages: "external",
    plugins: [astroVirtual],
    define: { "import.meta.env.BASE_URL": '"/charitology/"' },
    logLevel: "silent",
  });
  return import(pathToFileURL(outfile).href);
}
async function fixtureRoot(name, fixture) {
  const p = join(temporary, name);
  await mkdir(p, { recursive: true });
  if (fixture)
    for (const [file, bytes] of fixture.files) {
      const target = join(p, "src/data/disaster-incidents", file);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes);
    }
  return p;
}
function declarations(source) {
  const ast = ts.createSourceFile(
    "api.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  let list;
  function visit(n) {
    if (ts.isVariableDeclaration(n) && n.name.getText(ast) === "ENDPOINTS")
      list = n.initializer;
    ts.forEachChild(n, visit);
  }
  visit(ast);
  assert.ok(ts.isArrayLiteralExpression(list));
  const printer = ts.createPrinter({ removeComments: true });
  return new Map(
    list.elements.map((n) => {
      const p = n.properties.find(
        (p) => ts.isPropertyAssignment(p) && p.name.getText(ast) === "name",
      );
      return [
        p.initializer.text,
        printer.printNode(ts.EmitHint.Unspecified, n, ast),
      ];
    }),
  );
}
const source = await readFile("src/lib/api.ts", "utf8");
const baseline = childProcess.execFileSync(
  "git",
  ["show", "8206614a67c22232b7deb08debbf86b9f6a502f5:src/lib/api.ts"],
  { encoding: "utf8", maxBuffer: 1024 * 1024 },
);
const oldAPI = await bundle("src/lib/api.ts", baseline),
  api = await bundle("src/lib/api.ts");
const fake = disasterFixture({ productionShape: true }),
  bad = disasterFixture();
const emptyRoot = await fixtureRoot("uncaptured"),
  realRoot = await fixtureRoot("synthetic-allowed-shape", fake),
  badRoot = await fixtureRoot("fictional-refused", bad),
  invalidRoot = await fixtureRoot("invalid-present");
await mkdir(join(invalidRoot, "src/data/disaster-incidents"), {
  recursive: true,
});
await writeFile(
  join(invalidRoot, "src/data/disaster-incidents/registry.json"),
  "{}\n",
);
const NativeDate = Date,
  originalExec = childProcess.execFileSync,
  originalFetch = globalThis.fetch;
function guardOffline() {
  childProcess.execFileSync = () => {
    throw Error("Unexpected Git/child command from offline public runtime");
  };
  syncBuiltinESMExports();
  globalThis.fetch = () => {
    throw Error("Unexpected network from offline public runtime");
  };
  globalThis.Date = class extends NativeDate {
    constructor(...args) {
      if (!args.length) throw Error("Unexpected build clock");
      super(...args);
    }
    static now() {
      throw Error("Unexpected build clock");
    }
  };
}
function restore() {
  process.chdir(root);
  globalThis.Date = NativeDate;
  childProcess.execFileSync = originalExec;
  syncBuiltinESMExports();
  globalThis.fetch = originalFetch;
}
try {
  await check("all36 old source-declared endpoint objects remain exact", () => {
    const before = declarations(baseline),
      after = declarations(source);
    assert.equal(before.size, 36);
    assert.equal(after.size, 38);
    for (const [n, v] of before) assert.equal(after.get(n), v, n);
  });
  await check(
    "old36 actual wrapper behavior remains exact with fixed content/date inputs",
    async () => {
      const Fixed = class extends NativeDate {
        constructor(...args) {
          super(...(args.length ? args : ["2026-01-02T03:04:05.678Z"]));
        }
      };
      globalThis.Date = Fixed;
      try {
        for (const endpoint of oldAPI.ENDPOINTS) {
          const current = api.ENDPOINTS.find((e) => e.name === endpoint.name);
          const value = {
            ordered: ["second", "first"],
            stamp: new Fixed("2025-02-03T04:05:06.789Z"),
            ref: { id: "source-ref", collection: "causes" },
            unknown: null,
            zero: 0,
          };
          endpoint.build = current.build = async () => value;
          for (const capture of [false, true]) {
            if (capture)
              endpoint.capturedAt = current.capturedAt = async () =>
                "2025-04-05T06:07:08.901Z";
            else (delete endpoint.capturedAt, delete current.capturedAt);
            assert.deepEqual(
              await api.buildEndpoint(endpoint.name),
              await oldAPI.buildEndpoint(endpoint.name),
              endpoint.name,
            );
          }
        }
      } finally {
        globalThis.Date = NativeDate;
      }
    },
  );
  await check(
    "no-data A omits new endpoints and returns empty404 history without Git/network/clock",
    async () => {
      process.chdir(emptyRoot);
      const current = await bundle("src/lib/api.ts"),
        history = await bundle("src/pages/disasters/history.json.ts"),
        names = await bundle("src/pages/api/v1/[name].json.ts"),
        index = await bundle("src/pages/api/v1/index.json.ts");
      guardOffline();
      try {
        assert.equal((await current.availableEndpoints()).length, 36);
        assert.equal((await names.getStaticPaths()).length, 36);
        const body = await (
          await index.GET({ site: new URL("https://example.org/") })
        ).json();
        assert.equal(body.endpoints.length, 36);
        const r = history.GET();
        assert.equal(r.status, 404);
        assert.equal(await r.text(), "");
        await assert.rejects(
          () => current.buildEndpoint("disaster-incidents"),
          /no committed/,
        );
      } finally {
        restore();
      }
    },
  );
  await check(
    "actual public loader validates and freezes DTOs; bytes are owned per call",
    async () => {
      const pub = await bundle("src/lib/disaster-incidents/public.mjs");
      process.chdir(realRoot);
      guardOffline();
      try {
        const one = pub.loadDisasters(),
          before = Buffer.from(one.selected.artifacts["edition.json"]),
          history = Buffer.from(one.history);
        assert.ok(Object.isFrozen(one.registry));
        assert.ok(Object.isFrozen(one.selected.projection.packet.incidents));
        assert.throws(() => {
          one.selected.projection.packet.incidents[0].name = "mutated";
        }, TypeError);
        assert.throws(() => {
          one.registry.editions.pop();
        }, TypeError);
        one.selected.artifacts["edition.json"].fill(0);
        one.history.fill(0);
        const two = pub.loadDisasters();
        assert.deepEqual(
          Buffer.from(two.selected.artifacts["edition.json"]),
          before,
        );
        assert.deepEqual(Buffer.from(two.history), history);
        const selected = one.selectedIncident(
          one.registry.selected.id,
          one.selected.projection.incidents[0].incident.id,
        );
        assert.equal(
          JSON.parse(Buffer.from(selected.artifacts["edition.json"]).toString())
            .scope.kind,
          "selected-incident",
        );
        selected.artifacts["edition.csv"].fill(0);
        const fresh = two.selectedIncident(
          two.registry.selected.id,
          two.selected.projection.incidents[0].incident.id,
        );
        assert.notEqual(fresh.artifacts["edition.csv"][0], 0);
        const input = Uint8Array.of(65, 66, 67),
          r = pub.disasterArtifactResponse(input, "edition.json");
        input.fill(0);
        assert.equal(await r.text(), "ABC");
      } finally {
        restore();
      }
    },
  );
  await check(
    "actual new API wrappers have exactly4 fields and retain captured instants/data arrays",
    async () => {
      const current = await bundle("src/lib/api.ts");
      process.chdir(realRoot);
      guardOffline();
      try {
        const endpoints = await current.availableEndpoints();
        assert.equal(endpoints.length, 38);
        for (const name of [
          "disaster-incidents",
          "disaster-incident-coverage",
        ]) {
          const body = await current.buildEndpoint(name);
          assert.deepEqual(Object.keys(body).sort(), [
            "data",
            "generated",
            "license",
            "name",
          ]);
          assert.equal(body.generated, fake.editions.at(-1).capturedAt);
          assert.equal(body.name, name);
          assert.ok(!body.license.includes("no rights restrictions"));
          if (name === "disaster-incidents") {
            assert.deepEqual(body.data.edition, fake.editions.at(-1));
            assert.equal(body.data.incidents.length, 2);
            assert.equal(
              body.data.claims.find((c) => c.content.kind === "reported-need")
                .content.quantity.reportedText,
              "0",
            );
          } else assert.equal(body.data.asOf, fake.editions.at(-1).asOf);
        }
      } finally {
        restore();
      }
    },
  );
  await check(
    "present invalid or fictional history refuses instead of looking uncaptured",
    async () => {
      for (const p of [badRoot, invalidRoot]) {
        const pub = await bundle("src/lib/disaster-incidents/public.mjs");
        process.chdir(p);
        guardOffline();
        try {
          assert.throws(() => pub.loadDisasters());
        } finally {
          restore();
        }
      }
    },
  );
  await check(
    "actual dynamic artifact routes select exact edition/incident and return exact bytes",
    async () => {
      const edition = await bundle(
          "src/pages/disasters/editions/[id]/[artifact].ts",
        ),
        selected = await bundle(
          "src/pages/disasters/editions/[id]/incidents/[incidentId]/[artifact].ts",
        );
      process.chdir(realRoot);
      guardOffline();
      try {
        assert.equal(edition.getStaticPaths().length, fake.editions.length * 3);
        assert.equal(
          selected.getStaticPaths().length,
          fake.editions.length * 2 * 2,
        );
        const id = fake.editions[0].id,
          response = edition.GET({ params: { id, artifact: "edition.json" } });
        assert.deepEqual(
          Buffer.from(await response.arrayBuffer()),
          Buffer.from(fake.files.get(`exports/${id}/edition.json`)),
        );
        assert.equal(response.headers.get("x-content-type-options"), "nosniff");
        const r = selected.GET({
          params: {
            id,
            incidentId: fake.incidents[0][0].id,
            artifact: "edition.json",
          },
        });
        const body = await r.json();
        assert.equal(body.edition.id, id);
        assert.equal(body.scope.incidentId, fake.incidents[0][0].id);
        assert.throws(() =>
          edition.GET({ params: { id, artifact: "unknown.json" } }),
        );
      } finally {
        restore();
      }
    },
  );
  await check(
    "all new Astro routes compile actual source and direct relative imports exist",
    async () => {
      const paths = [
        "src/pages/disasters/index.astro",
        "src/pages/disasters/incidents/[id].astro",
        "src/pages/disasters/editions/[id].astro",
        "src/pages/disasters/editions/[id]/incidents/[incidentId].astro",
        "src/pages/disasters/sources/[id]/[version].astro",
        "src/components/DisasterDesk.astro",
      ];
      for (const file of paths) {
        const raw = await readFile(file, "utf8"),
          compiled = await transform(raw, {
            filename: resolve(file),
            internalURL: "astro/compiler-runtime",
            renderScript: true,
          });
        assert.equal(
          compiled.diagnostics.filter((d) => d.severity === 1).length,
          0,
          file,
        );
        for (const m of raw.matchAll(
          /(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g,
        )) {
          const p = resolve(dirname(file), m[1]);
          if (/\.(?:astro|mjs|js|css)$/.test(p))
            assert.ok((await readFile(p)).length > 0, p);
        }
      }
    },
  );
  console.log(
    `${count} Disaster public/API/route groups passed; temporary synthetic fixtures only.`,
  );
} finally {
  restore();
  await rm(temporary, { recursive: true, force: true });
}
