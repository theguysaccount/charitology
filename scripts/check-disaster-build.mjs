// Actual offline built-output acceptance. This is not browser/native Save,
// independent source review, current needs verification or world coverage.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, join, sep } from "node:path";
import { parse } from "parse5";
import { loadDisasters, disasterEditionHref, disasterSelectedHref, disasterIncidentHref, disasterSourceHref } from "../src/lib/disaster-incidents/public.mjs";
const root = resolve("."), dist = join(root, "dist"), base = (process.env.BASE_PATH || "/").replace(/\/$/, ""), site = process.env.SITE_URL || "https://charitology.org";
const file = p => { assert.ok(p.startsWith("/") && !p.includes("..")); const f = resolve(dist, "." + p + (p.endsWith("/") ? "index.html" : "")); assert.ok(f.startsWith(dist + sep)); return f; };
const bytes = p => readFileSync(file(p)), raw = p => bytes(p).toString("utf8"), json = p => JSON.parse(raw(p));
const attr = (n, k) => n.attrs?.find(a => a.name === k)?.value;
function all(n, p) { const out = []; function visit(v) { if (p(v))
    out.push(v); for (const c of v.childNodes ?? [])
    visit(c); } visit(n); return out; }
const text = n => n.nodeName === "#text" ? n.value : (n.childNodes ?? []).map(text).join("");
const includes = (doc, s) => assert.ok(text(doc).includes(String(s)), `Missing rendered value: ${s}`);
let groups = 0;
function check(name, fn) { fn(); groups++; console.log(`✓ ${name}`); }
function html(p) { const d = parse(raw(p)); const canonical = all(d, n => n.tagName === "link" && attr(n, "rel") === "canonical"); assert.equal(canonical.length, 1); assert.equal(attr(canonical[0], "href"), new URL(base + p, site).href); for (const property of ["og:image", "og:title", "og:url", "og:description"])
    assert.equal(all(d, n => n.tagName === "meta" && attr(n, "property") === property).length, 1); const ids = all(d, n => attr(n, "id") !== undefined).map(n => attr(n, "id")); assert.equal(new Set(ids).size, ids.length, `Duplicate HTML ids at ${p}`); return d; }
assert.ok(existsSync(dist), "Build dist before checking Disaster Desk.");
check("Shared page metadata and the homepage brand video remain available", () => { const home = html("/"); assert.equal(all(home, n => n.tagName === "meta" && attr(n, "property") === "og:video" && attr(n, "content") === new URL(base + "/social/charitology-intro.mp4", site).href).length, 1); assert.ok(bytes("/social/charitology-intro.mp4").length > 0); });
const data = loadDisasters();
if (!data) {
    check("Uncaptured source A has explicit no-data HTML and no fabricated API datasets", () => { includes(html("/disasters/"), "No source edition has been captured yet"); const names = json("/api/v1/index.json").endpoints.map(e => e.name); assert.ok(!names.includes("disaster-incidents") && !names.includes("disaster-incident-coverage")); for (const name of ["disaster-incidents", "disaster-incident-coverage"])
        assert.equal(existsSync(file(`/api/v1/${name}.json`)), false); if (existsSync(file("/disasters/history.json")))
        assert.equal(bytes("/disasters/history.json").length, 0); });
}
else {
    check("Two API envelopes retain exact admitted data, capture instant and source-specific rights", () => { for (const [name, expected] of [["disaster-incidents", data.selected.projection.packet], ["disaster-incident-coverage", data.selected.coverage]]) {
        const v = json(`/api/v1/${name}.json`);
        assert.deepEqual(Object.keys(v).sort(), ["name", "generated", "license", "data"].sort());
        assert.equal(v.name, name);
        assert.equal(v.generated, data.selected.projection.capturedAt);
        assert.deepEqual(v.data, expected);
        assert.match(v.license, /External originals remain with their publishers/);
        assert.match(v.license, /no independently verified current needs/);
    } const names = json("/api/v1/index.json").endpoints.map(e => e.name); assert.equal(names.length, 38); for (const n of ["disaster-incidents", "disaster-incident-coverage"])
        assert.equal(names.filter(x => x === n).length, 1); });
    check("Complete public history JSON matches exact admitted bytes and excludes private originals", () => { assert.deepEqual(bytes("/disasters/history.json"), Buffer.from(data.history)); const h = json("/disasters/history.json"); assert.equal(h.format, "charitology-disaster-history"); assert.deepEqual(h.registry, data.registry); assert.ok(h.files.every(f => !f.file.path.startsWith("exports/") && !f.file.path.startsWith("originals/"))); assert.deepEqual(h.files.map(f => f.file.path), h.files.map(f => f.file.path).sort()); });
    for (const e of data.editions) {
        check(`Exact edition artifacts and HTML agreement: ${e.pin.id}`, () => { const p = disasterEditionHref(e.pin.id), doc = html(p); for (const [name, b] of Object.entries(e.artifacts))
            assert.deepEqual(bytes(p + name), Buffer.from(b)); for (const value of [e.pin.id, e.pin.hash, e.projection.asOf, e.projection.capturedAt, "Not live.", "Not established"])
            includes(doc, value); for (const { incident, freshness, claims } of e.projection.incidents) {
            includes(doc, incident.name);
            includes(doc, incident.lifecycle.value);
            includes(doc, incident.editorial.placement);
            includes(doc, incident.checkedAt);
            includes(doc, incident.recheckAfter);
            includes(doc, freshness.atCapture === "review-overdue-at-capture" ? "Review overdue at capture" : "Review not due at capture");
            for (const c of claims) {
                includes(doc, c.attributedSummary);
                includes(doc, c.hash);
                includes(doc, c.standing.value);
                if (c.content.kind === "status")
                    includes(doc, c.content.value);
                if ("quantity" in c.content && c.content.quantity !== null)
                    includes(doc, c.content.quantity.reportedText);
            }
        } for (const s of e.projection.packet.sources) {
            includes(doc, s.title);
            includes(doc, s.retrievedAt);
            includes(doc, s.hash);
        } for (const omission of e.projection.coverage.omitted)
            includes(doc, omission); });
        for (const { incident } of e.projection.incidents)
            check(`Selected incident artifacts preserve exact parent header: ${e.pin.id}/${incident.id}`, () => { const selected = data.selectedIncident(e.pin.id, incident.id), p = disasterSelectedHref(e.pin.id, incident.id), doc = html(p); for (const [name, b] of Object.entries(selected.artifacts))
                assert.deepEqual(bytes(p + name), Buffer.from(b)); const packet = json(p + "edition.json"); assert.deepEqual(packet.edition, e.projection.packet.edition); assert.deepEqual(packet.scope, { kind: "selected-incident", incidentId: incident.id }); includes(doc, incident.name); includes(doc, "incomplete history"); for (const c of selected.projection.packet.claims)
                includes(doc, c.hash); });
    }
    for (const { source: s, note } of data.sources)
        check(`Retained source metadata, rights and authored locators: ${s.id}/v${s.version}`, () => { const doc = html(disasterSourceHref(s.id, s.version)); for (const value of [s.title, s.publisher, s.retrievedAt, s.hash, s.publicNote.sha256, s.rights.reason, s.requestedUrl, s.finalUrl])
            includes(doc, value); if (s.original) {
            includes(doc, s.original.sha256);
            includes(doc, s.original.bytes);
            includes(doc, s.original.mediaType);
            if (s.original.responseContentType !== null)
                includes(doc, s.original.responseContentType);
        } for (const t of [s.published, s.sourceUpdated, s.documentCreated, s.documentModified])
            if (t !== null) {
                includes(doc, t.literal);
                includes(doc, t.kind === "day" ? t.day : t.instant);
            } for (const item of note.items) {
            includes(doc, item.authoredText);
            const n = all(doc, n => attr(n, "id") === `dd-note-${s.id}-v${s.version}-${item.id}`);
            assert.equal(n.length, 1);
            if (item.locator.kind === "metadata") {
                includes(doc, item.locator.parser);
                includes(doc, item.locator.observedLiteral);
            }
            if (item.locator.kind === "pdf")
                includes(doc, `PDF page ${item.locator.pdfPage}`);
        } if (s.previous)
            assert.ok(all(doc, n => n.tagName === "a" && attr(n, "href") === base + disasterSourceHref(s.previous.id, s.previous.version)).length); });
    check("Current incident aliases and fixed index retain selected capture scope", () => { const doc = html("/disasters/"); includes(doc, data.registry.selected.id); for (const { incident } of data.selected.projection.incidents) {
        includes(doc, incident.name);
        includes(html(disasterIncidentHref(incident.id)), incident.hash);
    } });
    check("Disaster guide composition keeps the desk outside the existing D1 tool root", () => { const doc = html("/tools/disaster-response-guide/"), tools = all(doc, n => n.tagName === "section" && (attr(n, "class") || "").split(/\s+/).includes("tool")), desks = all(doc, n => attr(n, "data-disaster-desk") !== undefined); assert.equal(tools.length, 1); assert.equal(desks.length, 1); assert.equal(all(tools[0], n => attr(n, "data-disaster-desk") !== undefined).length, 0); assert.equal(all(doc, n => attr(n, "id") === "dr-planner").length, 1); });
}
console.log(`Disaster built output: ${groups} groups passed; no browser, native Save or live verification claim.`);
