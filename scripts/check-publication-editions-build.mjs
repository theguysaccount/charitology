// Offline checks of the actual checked-in archive and static build. No browser,
// provider, private proposal, live hosting or human-review acceptance is implied.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, parseFragment } from "parse5";
import ts from "typescript";
import {
  readPublicationRegistryDirectory,
  publicationRegistryFiles,
} from "../src/lib/publication-editions-capture.mjs";
import {
  publicationRegistryMetadata,
  makeProposalCatalog,
  makeProposalBasisBundle,
  makePublicationDownload,
  comparePublicationEditions,
  PUBLICATION_LIMITS,
} from "../src/lib/publication-editions-model.mjs";
import { renderPublicationMarkdown } from "../src/lib/publication-editions-view.ts";
const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  dist = join(root, "dist");
const base = (process.env.BASE_PATH || "/").replace(/\/$/, ""),
  site = process.env.SITE_URL || "https://charitology.org",
  href = (p) => base + p;
const sha = (v) => createHash("sha256").update(v).digest("hex");
const input = readPublicationRegistryDirectory(
  join(root, "src/data/publication-editions"),
);
const catalog = makeProposalCatalog(input, { basePath: base });
const registryFiles = publicationRegistryFiles(input);
const storedBytes = [...registryFiles.values()].reduce(
    (n, s) => n + Buffer.byteLength(s),
    0,
  ),
  basisBytes = input.editions.reduce(
    (n, e) => n + Buffer.byteLength(makeProposalBasisBundle(input, e.core.id)),
    0,
  );
const inventory = {
  files: registryFiles.size,
  storedBytes,
  basisBytes,
  shippedBytes: storedBytes + basisBytes,
};
assert.ok(
  existsSync(dist),
  "Build the actual dist/ before checking publication output.",
);
const editionPath = (id) => `/record/editions/${id}/`,
  sourcePath = (id) => `/record/editions/sources/${id}/source.txt`,
  ledgerPath = (id) => `/research-ledger/editions/${encodeURIComponent(id)}/`;
function routeFile(p) {
  assert.ok(p.startsWith("/") && !p.startsWith("//"));
  const path = decodeURIComponent(new URL(p, "https://build.invalid").pathname),
    target = resolve(dist, "." + path);
  assert.ok(target.startsWith(dist + sep), "Routes stay inside dist/.");
  const file = p.endsWith("/") ? join(target, "index.html") : target;
  assert.ok(
    existsSync(file) && statSync(file).isFile(),
    `Missing built route: ${p}`,
  );
  return file;
}
const bytes = (p) => readFileSync(routeFile(p)),
  raw = (p) => bytes(p).toString("utf8"),
  json = (p) => JSON.parse(raw(p)),
  html = (p) => parse(raw(p));
const attr = (n, k) => n.attrs?.find((a) => a.name === k)?.value;
const all = (n, test) => {
  const out = [];
  const visit = (v) => {
    if (test(v)) out.push(v);
    for (const c of v.childNodes || []) visit(c);
  };
  visit(n);
  return out;
};
const find = (n, test) => all(n, test)[0];
const text = (n) =>
  n.nodeName === "#text" ? n.value : (n.childNodes || []).map(text).join("");
const tidy = (s) => s.replace(/\s+/g, " ").trim();
const cls = (n, k) => (attr(n, "class") || "").split(/\s+/).includes(k);
const links = (n) =>
  all(n, (v) => v.tagName === "a").map((v) => attr(v, "href"));
const includes = (n, s, label = s) =>
  assert.ok(
    tidy(text(n)).includes(tidy(String(s))),
    `Missing rendered content: ${label}`,
  );
const sameKeys = (v, keys) =>
  assert.deepEqual(Object.keys(v).sort(), [...keys].sort());
let groups = 0,
  memberCount = 0,
  qualificationCount = 0,
  assetCount = 0;
const check = (name, fn) => {
  fn();
  groups++;
  console.log("✓ " + name);
};
function headAndHeader(doc, path) {
  const head = find(doc, (n) => n.tagName === "head"),
    header = find(doc, (n) => n.tagName === "header" && cls(n, "site-header"));
  assert.ok(head && header, "Shared document head and site header exist.");
  const canonical = all(
    head,
    (n) => n.tagName === "link" && attr(n, "rel") === "canonical",
  );
  assert.equal(canonical.length, 1);
  assert.equal(attr(canonical[0], "href"), new URL(href(path), site).href);
  for (const property of ["og:title", "og:description", "og:url", "og:image"])
    assert.equal(
      all(head, (n) => n.tagName === "meta" && attr(n, "property") === property)
        .length,
      1,
      property,
    );
  assert.equal(
    attr(
      find(head, (n) => attr(n, "property") === "og:url"),
      "content",
    ),
    new URL(href(path), site).href,
  );
  assert.equal(
    attr(
      find(head, (n) => attr(n, "property") === "og:image"),
      "content",
    ),
    new URL(href("/og.jpg"), site).href,
  );
  assert.equal(
    all(head, (n) => attr(n, "property") === "og:video").length,
    0,
    "Article archives do not inherit the home-only brand video.",
  );
  assert.ok(
    links(header).includes(href("/")) &&
      links(header).includes(href("/record/")),
    "Header respects deployment base.",
  );
  for (const name of ["/favicon.ico", "/favicon.svg", "/site.webmanifest"])
    assert.ok(
      all(head, (n) => n.tagName === "link").some(
        (n) => attr(n, "href") === href(name),
      ),
    );
  for (const n of all(
    doc,
    (n) =>
      (n.tagName === "script" && attr(n, "src")) ||
      (n.tagName === "link" && attr(n, "rel") === "stylesheet"),
  )) {
    const value = attr(n, "src") || attr(n, "href");
    if (!value?.startsWith("/")) continue;
    assert.ok(
      !base || value.startsWith(base + "/"),
      `Wrong asset base: ${value}`,
    );
    const p = base ? value.slice(base.length) : value;
    routeFile(p);
    assetCount++;
  }
}
check(
  "All five real initial families, 410-source closure and exact hash-bearing public API are retained",
  () => {
    assert.equal(input.editions.length, 5);
    assert.equal(new Set(input.editions.map((e) => e.core.family)).size, 5);
    assert.equal(input.sources.length, 410);
    assert.ok(inventory.shippedBytes <= PUBLICATION_LIMITS.totalBytes);
    const actual = json("/api/v1/publication-editions.json");
    sameKeys(actual, ["name", "description", "license", "generated", "data"]);
    assert.equal(actual.name, "publication-editions");
    assert.match(actual.generated, /^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual(actual.data, {
      ...publicationRegistryMetadata(input),
      inventory,
    });
    for (const e of input.editions) {
      assert.equal(e.core.editorial.label, "editorial-draft");
      assert.equal(e.core.sequence, 1);
      assert.match(e.core.sourceCommit, /^[a-f0-9]{40}$/);
      assert.notEqual(
        e.core.sourceCommit,
        "a".repeat(40),
        "Synthetic capture label cannot be the real archive baseline.",
      );
    }
  },
);
check(
  "API discovery has exactly the actual 34 source-declared datasets with complete bounded wrappers",
  () => {
    const ast = ts.createSourceFile(
      "api.ts",
      readFileSync(join(root, "src/lib/api.ts"), "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    let declarations;
    const visit = (n) => {
      if (ts.isVariableDeclaration(n) && n.name.getText(ast) === "ENDPOINTS")
        declarations = n.initializer;
      ts.forEachChild(n, visit);
    };
    visit(ast);
    assert.ok(declarations && ts.isArrayLiteralExpression(declarations));
    const expected = declarations.elements.map((n) => {
      assert.ok(ts.isObjectLiteralExpression(n));
      const field = (k) => {
        const p = n.properties.find(
          (p) => ts.isPropertyAssignment(p) && p.name.getText(ast) === k,
        );
        assert.ok(p && ts.isStringLiteral(p.initializer));
        return p.initializer.text;
      };
      return { name: field("name"), description: field("description") };
    });
    assert.equal(expected.length, 36);
    assert.equal(new Set(expected.map((e) => e.name)).size, 36);
    const index = json("/api/v1/index.json");
    sameKeys(index, ["name", "version", "license", "docs", "endpoints"]);
    assert.equal(index.version, 1);
    assert.equal(index.endpoints.length, 36);
    assert.equal(index.docs, new URL(href("/tools/public-api/"), site).href);
    assert.deepEqual(
      index.endpoints,
      expected.map((e) => ({
        ...e,
        url: new URL(href(`/api/v1/${e.name}.json`), site).href,
      })),
    );
    for (const e of expected) {
      const body = json(`/api/v1/${e.name}.json`);
      sameKeys(body, ["name", "description", "license", "generated", "data"]);
      assert.equal(body.name, e.name);
      assert.equal(body.description, e.description);
      if (
        ["countries", "observations", "observation-coverage"].includes(e.name)
      ) {
        assert.match(body.license, /World Bank/);
        assert.match(body.license, /source-specific terms/);
        assert.match(body.license, /Financial documents have separate terms/);
      } else assert.equal(body.license, index.license);
      assert.match(body.generated, /^\d{4}-\d{2}-\d{2}$/);
    }
  },
);
check(
  "Each edition renders every real member and provenance with safe source/body presentation",
  () => {
    for (const e of input.editions) {
      const path = editionPath(e.core.id),
        doc = html(path),
        article = find(
          doc,
          (n) => attr(n, "data-publication-edition") === e.core.id,
        );
      assert.ok(article);
      headAndHeader(doc, path);
      includes(article, e.hash);
      includes(article, e.coreHash);
      includes(article, e.core.sourceCommit);
      includes(article, e.core.coverage.scope);
      includes(article, e.core.coverage.geography);
      includes(article, e.core.editorial.aiAssistance);
      includes(
        article,
        "Freezing content does not establish independent review",
      );
      assert.ok(
        all(article, (n) => n.tagName === "time").some(
          (n) => attr(n, "datetime") === e.core.capturedAt,
        ),
      );
      for (const limit of [
        ...e.core.coverage.limitations,
        ...e.core.editorial.limitations,
      ])
        includes(article, limit);
      const ids = all(article, (n) => attr(n, "id")).map((n) => attr(n, "id"));
      assert.equal(
        ids.length,
        new Set(ids).size,
        `Duplicate archive IDs: ${e.core.id}`,
      );
      const members = all(article, (n) => attr(n, "data-publication-member"));
      assert.equal(members.length, e.core.members.length);
      for (const m of e.core.members) {
        memberCount++;
        const section = members.find(
            (n) => attr(n, "data-publication-member") === m.id,
          ),
          p = m.payload;
        assert.ok(section);
        includes(section, m.id);
        includes(section, m.contentHash);
        assert.ok(links(article).includes("#member-" + m.id));
        if (p.title) includes(section, p.title);
        if (p.summary) includes(section, p.summary);
        for (const s of p.sources || []) {
          includes(section, s.title);
          assert.ok(links(section).includes(s.url), s.url);
          for (const v of [s.publisher, s.year, s.note])
            if (v !== null && v !== undefined) includes(section, v);
        }
        if (p.kind === "chapter-v1" || p.kind === "manuscript-v1") {
          const prose = find(section, (n) => cls(n, "prose"));
          assert.ok(prose);
          assert.equal(
            tidy(text(prose)),
            tidy(text(parseFragment(renderPublicationMarkdown(p.body, base)))),
            m.id + " complete body",
          );
          includes(section, "Source review declaration: " + p.declaredReview);
          for (const n of all(prose, (n) => n.tagName))
            assert.ok(
              !["script", "iframe", "img", "object", "embed", "form"].includes(
                n.tagName,
              ),
              "Source markup stays inert.",
            );
        }
        if (p.qualification) {
          qualificationCount++;
          for (const v of [
            p.qualification.recordId,
            p.qualification.subjectHash,
            p.qualification.ledgerEditionId,
            p.qualification.ledgerEditionHash,
          ])
            includes(section, v);
          assert.ok(
            links(section).includes(
              href(ledgerPath(p.qualification.ledgerEditionId)),
            ),
          );
        }
        if (p.kind === "legacy-letter-v1") {
          const plain = find(section, (n) => cls(n, "pe-text")),
            source = find(section, (n) => n.tagName === "pre");
          assert.equal(text(plain), p.text);
          assert.equal(text(source), p.html);
          includes(section, p.legacyContentHash);
          assert.equal(
            all(section, (n) =>
              ["script", "iframe", "img", "object", "embed", "form"].includes(
                n.tagName,
              ),
            ).length,
            0,
          );
        }
        if (p.kind === "figure-input-v1") {
          includes(section, p.label);
          includes(
            section,
            p.value === null ? "Unknown / source description" : p.value,
          );
          includes(section, p.geography);
          includes(section, p.measure);
          if (p.value !== null) includes(section, p.unit);
          if (p.currency) includes(section, p.currency);
          includes(section, p.denominator ?? "Not supplied / not applicable");
          for (const limit of p.limitations) includes(section, limit);
        }
        if (p.kind === "project-census-v1") {
          for (const row of p.collections) {
            const tr = all(section, (n) => n.tagName === "tr").find(
              (n) =>
                tidy(
                  text(
                    find(n, (c) => c.tagName === "th") || { childNodes: [] },
                  ),
                ) === row.collection,
            );
            assert.ok(tr, row.collection);
            assert.deepEqual(
              all(tr, (n) => n.tagName === "td").map((n) => Number(text(n))),
              [row.entries, row.drafts],
            );
          }
          for (const r of [
            ...p.evidence,
            ...p.availability,
            ...p.problemStates.counts,
          ])
            includes(section, `${r.label ?? r.status ?? r.state}: ${r.count}`);
          includes(section, p.problemStates.ledgerEditionHash);
          assert.ok(
            links(section).includes(
              href(ledgerPath(p.problemStates.ledgerEditionId)),
            ),
          );
        }
        if (p.kind === "r4-progress-v1") {
          const progress = JSON.parse(p.progressJson);
          assert.ok(
            all(section, (n) => n.tagName === "pre").some(
              (n) => text(n) === p.progressJson,
            ),
          );
          includes(section, p.progressSha256);
          includes(section, p.ledgerEditionHash);
          assert.ok(
            links(section).includes(href(ledgerPath(p.ledgerEditionId))),
          );
          assert.equal(progress.endingStates.length, 23);
          assert.equal(progress.coverage.baselineKnownFrom, null);
          assert.equal(progress.counters.dispositionsRecorded, 0);
          assert.equal(progress.counters.currentlySupportedDispositions, 0);
          const rows = all(
            section,
            (n) => n.tagName === "tr" && attr(n, "data-problem-record"),
          );
          assert.equal(rows.length, progress.endingStates.length);
          for (const r of progress.endingStates) {
            const row = rows.find(
              (n) => attr(n, "data-problem-record") === r.recordId,
            );
            assert.ok(row, `Missing exact problem row: ${r.recordId}`);
            const cells = (row.childNodes || []).filter(
              (n) => n.tagName === "td",
            );
            assert.equal(cells.length, 4);
            assert.equal(
              tidy(text(cells[1])),
              progress.startingStates.find((s) => s.recordId === r.recordId)
                ?.status ?? "unknown",
            );
            assert.equal(tidy(text(cells[2])), r.status ?? "unknown");
            assert.ok(
              links(cells[0]).includes(
                href(`/open-problems/${r.recordId.slice("problem:".length)}/`),
              ),
            );
            assert.ok(
              links(cells[3]).includes(
                href(`/research-ledger/${encodeURIComponent(r.recordId)}/`),
              ),
            );
          }
        }
      }
      for (const pin of e.core.sourcePins) {
        const source = input.sources.find((s) => s.id === pin.id);
        assert.ok(source && source.hash === pin.hash);
        assert.ok(links(article).includes(href(sourcePath(source.id))));
        includes(article, source.rawSha256);
        includes(article, source.hash);
      }
    }
    assert.equal(
      qualificationCount,
      3,
      "Three initial journal manuscripts retain their own pinned references.",
    );
  },
);
check(
  "Exact edition JSON, both complete text artifacts and selected basis offers preserve bytes/hashes/closure",
  () => {
    for (const e of input.editions) {
      const path = editionPath(e.core.id),
        doc = html(path);
      const manifest = bytes(path + "edition.json");
      assert.deepEqual(
        manifest,
        Buffer.from(
          makePublicationDownload(input, e.core.id, { format: "json" }),
        ),
      );
      assert.deepEqual(JSON.parse(manifest.toString()), e);
      for (const a of e.artifacts) {
        const actual = bytes(path + a.fileName),
          source = input.artifacts.find(
            (x) => x.editionId === e.core.id && x.fileName === a.fileName,
          );
        assert.ok(source);
        assert.deepEqual(actual, Buffer.from(source.text));
        assert.equal(actual.length, a.byteLength);
        assert.equal(sha(actual), a.sha256);
        assert.ok(
          links(doc).includes(href(path + a.fileName)),
          `Missing visible artifact download: ${a.fileName}`,
        );
      }
      const offer = catalog.basisOffers.find((x) => x.editionId === e.core.id),
        actual = bytes(path + "basis.json");
      assert.ok(offer);
      assert.equal(offer.href, href(path + "basis.json"));
      assert.equal(actual.length, offer.byteLength);
      assert.equal(sha(actual), offer.sha256);
      assert.equal(
        actual.toString(),
        makeProposalBasisBundle(input, e.core.id),
      );
      const basis = JSON.parse(actual);
      sameKeys(basis, ["format", "version", "edition", "sources"]);
      assert.deepEqual(basis.edition, e);
      assert.deepEqual(
        basis.sources,
        e.core.sourcePins.map((p) =>
          input.sources.find((s) => s.id === p.id && s.hash === p.hash),
        ),
      );
    }
  },
);
check(
  "All 410 source-text routes retain exact inert UTF-8 and raw SHA-256",
  () => {
    for (const source of input.sources) {
      const actual = bytes(sourcePath(source.id));
      assert.deepEqual(actual, Buffer.from(source.rawUtf8));
      assert.equal(sha(actual), source.rawSha256);
    }
  },
);
check(
  "All twenty initial comparison routes display the actual cross-family incompatibility without false trends",
  () => {
    let count = 0;
    const index = html("/record/editions/compare/");
    headAndHeader(index, "/record/editions/compare/");
    for (const from of input.editions)
      for (const to of input.editions)
        if (from.core.id !== to.core.id) {
          count++;
          const path = `/record/editions/compare/${from.core.id}/${to.core.id}/`,
            doc = html(path),
            model = comparePublicationEditions(input, {
              fromId: from.core.id,
              toId: to.core.id,
            });
          headAndHeader(doc, path);
          assert.ok(links(index).includes(href(path)));
          assert.equal(model.differences.length, 1);
          assert.equal(model.differences[0].code, "not-comparable");
          const d = model.differences[0];
          includes(doc, d.reason);
          includes(doc, d.before);
          includes(doc, d.after);
          includes(doc, from.hash);
          includes(doc, to.hash);
          assert.ok(
            links(doc).includes(href(editionPath(from.core.id))) &&
              links(doc).includes(href(editionPath(to.core.id))),
          );
          includes(doc, "No effect is pooled");
        }
    assert.equal(count, 20);
  },
);
check(
  "Archive proposal catalog is metadata-only and all current-family integrations reach the pinned real edition",
  () => {
    const index = html("/record/editions/");
    headAndHeader(index, "/record/editions/");
    const scripts = all(
      index,
      (n) => n.tagName === "script" && cls(n, "publication-proposal-catalog"),
    );
    assert.equal(scripts.length, 1);
    assert.equal(attr(scripts[0], "type"), "application/json");
    const serialized = text(scripts[0]);
    assert.deepEqual(JSON.parse(serialized), catalog);
    assert.ok(Buffer.byteLength(serialized) < 65536);
    assert.equal(serialized.includes("rawUtf8"), false);
    assert.equal(
      serialized.includes("charitology-publication-proposal-basis"),
      false,
    );
    assert.ok(
      !/Unrelated unfinished new project|Substituted candidate B|Fictional future Letter fixture/.test(
        raw("/record/editions/"),
      ),
    );
    const routes = {
      "state-of-charity": "/record/state-of-charity/",
      "progress-report": "/record/progress-report/",
      principles: "/record/principles/",
      journal: "/record/journal/",
      letter: "/record/podcast-and-newsletter/",
    };
    for (const [family, path] of Object.entries(routes)) {
      const id = input.registry.current[family],
        doc = html(path);
      assert.ok(links(index).includes(href(editionPath(id))));
      if (["state-of-charity", "progress-report"].includes(family)) {
        assert.ok(find(doc, (n) => attr(n, "data-publication-edition") === id));
        includes(doc, input.editions.find((e) => e.core.id === id).hash);
      } else {
        const notice = find(
          doc,
          (n) => attr(n, "data-current-publication") === family,
        );
        assert.ok(notice, `${family}: current capture discovery`);
        assert.ok(links(notice).includes(href(editionPath(id))));
        includes(notice, "editorial draft");
      }
    }
    for (const e of input.editions)
      assert.ok(
        raw("/sitemap.xml").includes(
          new URL(href(editionPath(e.core.id)), site).href,
        ),
      );
  },
);
console.log(
  `Publication static build: ${groups} groups, ${input.editions.length} real editions, ${memberCount} complete members, ${input.sources.length} exact source downloads, 20 bounded comparisons and ${assetCount} referenced assets. Static bytes only; live hosting, downloaded browser files and independent review remain separate.`,
);
