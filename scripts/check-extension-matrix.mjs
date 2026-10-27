// Execute actual extension scripts with protected-page/network sentinels.
// This is synthetic runtime/matching evidence, never installed-browser/store acceptance.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  extensionFixture,
  descendants,
  deferred,
  flush,
  FixtureNode,
} from "../test-fixtures/extension/runtime-fixture.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (name) => readFileSync(join(root, name), "utf8");
const manifest = JSON.parse(read("extension/manifest.json"));
const popup = read("extension/popup.js"),
  content = read("extension/content.js"),
  checklist = JSON.parse(read("extension/checklist.json"));
const plain = (v) => JSON.parse(JSON.stringify(v));
let groups = 0;

// Restricted to the exact pattern family in this release. Do not invent a fundraiser classifier.
// Chrome: https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns
// MDN: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Match_patterns
// Path includes query; fragment excluded. Omitted Chrome pattern port is wildcard.
// Chromium URLPattern::MatchesPath additionally unescapes normal encodings and accepts terminal /* prefix.
// https://raw.githubusercontent.com/chromium/chromium/main/extensions/common/url_pattern.cc
const patterns = manifest.content_scripts.flatMap((row) => row.matches);
assert.equal(patterns.length, 4);
const escape = (s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
const matchers = patterns.map((pattern) => {
  const parsed = /^https:\/\/([a-z0-9.-]+)(\/[^#?]*)$/.exec(pattern);
  assert.ok(
    parsed,
    "This checker deliberately requires an explicit update for a new match-pattern family.",
  );
  return {
    pattern,
    prefix: parsed[2].endsWith("/*") ? parsed[2].slice(0, -2) : null,
    host: parsed[1],
    path: new RegExp("^" + parsed[2].split("*").map(escape).join(".*") + "$"),
  };
});
const matches = (raw) => {
  try {
    const url = new URL(raw);
    return matchers
      .filter(
        (m) =>
          url.protocol === "https:" &&
          url.hostname === m.host &&
          (() => {
            const path = url.pathname + url.search;
            // Current patterns have ASCII literal prefixes. Chromium NORMAL unescaping includes unreserved ASCII.
            const normal = path.replace(/%([0-9a-f]{2})/gi, (encoded, hex) => {
              const character = String.fromCharCode(parseInt(hex, 16));
              return /[A-Za-z0-9._~-]/.test(character) ? character : encoded;
            });
            return (
              normal === m.prefix || m.path.test(normal) || m.path.test(path)
            );
          })(),
      )
      .map((m) => m.pattern);
  } catch {
    return [];
  }
};
const urlCases = JSON.parse(read("test-fixtures/extension/url-cases.json"));
for (const row of urlCases)
  assert.equal(
    matches(row.url).length > 0,
    row.match,
    `${row.case}: ${row.url}`,
  );
for (const { pattern, host } of matchers) {
  const path = pattern
    .slice(pattern.indexOf("/", 8))
    .replaceAll("*", "synthetic");
  assert.ok(
    matches(`https://${host}${path}?fixture=1#ignored`).includes(pattern),
  );
  assert.equal(matches(`http://${host}${path}`).length, 0);
  assert.equal(matches(`https://other.${host}${path}`).length, 0);
}
assert.deepEqual(manifest.permissions, ["activeTab", "storage"]);
assert.equal(manifest.background, undefined);
assert.equal(manifest.host_permissions, undefined);
assert.equal(
  manifest.content_scripts.every(
    (s) => s.all_frames === undefined || s.all_frames === false,
  ),
  true,
);
groups++;

function noLeak(f) {
  assert.deepEqual(f.calls.protected, []);
  assert.deepEqual(f.calls.network, []);
}
async function popupFixture(options = {}) {
  const f = extensionFixture({ kind: "popup", checklist, ...options });
  f.run(popup);
  await flush();
  return f;
}
async function contentFixture(options = {}) {
  const f = extensionFixture({ kind: "content", ...options });
  f.run(content);
  await flush();
  return f;
}
function shadowNode(f, tag, text) {
  return descendants(f.shadow()).find(
    (x) => x.tagName === tag && x.textContent === text,
  );
}
const submit = (f) => f.ids.get("lookup").dispatch("submit");
const lookup = (f) => shadowNode(f, "a", "Look it up");
function destination(url) {
  const parsed = new URL(url);
  assert.equal(
    parsed.search,
    "",
    "Lookup input must never be in the HTTP query.",
  );
  return {
    url: parsed,
    query: new URLSearchParams(parsed.hash.slice(1)).get("q"),
  };
}

let f = await popupFixture({
  title: 'Donate to Aid & Care / 救援 "A" % # ? 😀 | GoFundMe',
});
assert.equal(f.ids.get("q").value, 'Aid & Care / 救援 "A" % # ? 😀');
assert.equal(f.calls.created.length, 0);
assert.deepEqual(f.calls.fetch, ["checklist.json"]);
assert.equal(f.calls.title, 0);
assert.equal(f.calls.tabTitle, 1);
assert.deepEqual(plain(f.calls.query), [{ active: true, currentWindow: true }]);
await submit(f);
let d = destination(f.calls.created[0].url);
assert.equal(d.url.origin, "https://charitology.org");
assert.equal(d.url.pathname, "/tools/charity-lookup/");
assert.equal(d.query, 'Aid & Care / 救援 "A" % # ? 😀');
assert.equal(f.calls.closed, 1);
noLeak(f);
groups++;

// Checkbox state belongs to this popup instance only, never page or extension storage.
f = await popupFixture();
let boxes = f.ids.get("checklist").querySelectorAll('input[type="checkbox"]');
assert.equal(boxes.length, 10);
assert.equal(f.ids.get("count").textContent, "0 of 10 answered");
boxes[0].checked = true;
await boxes[0].dispatch("change");
boxes[9].checked = true;
await boxes[9].dispatch("change");
assert.equal(f.ids.get("count").textContent, "2 of 10 answered");
assert.deepEqual(f.calls.get, []);
assert.deepEqual(f.calls.set, []);
const nextPopup = await popupFixture();
assert.equal(nextPopup.ids.get("count").textContent, "0 of 10 answered");
noLeak(f);
noLeak(nextPopup);
groups++;

// Empty is a legitimate generic lookup; manual oversized/ill-formed Unicode is rejected without truncation.
for (const manual of [
  "",
  "   ",
  "a".repeat(121),
  "\ud800",
  "left\udc00right",
]) {
  f = await popupFixture();
  f.ids.get("q").value = manual;
  await f.ids.get("q").dispatch("input");
  await submit(f);
  if (manual.trim().length === 0) {
    assert.equal(f.calls.created.length, 1);
    assert.equal(new URL(f.calls.created[0].url).hash, "");
  } else {
    assert.equal(f.calls.created.length, 0);
    assert.equal(f.ids.get("q").value, manual);
    assert.match(
      f.ids.get("lookup-status").textContent,
      /at most 120|invalid character/,
    );
    assert.equal(f.calls.closed, 0);
  }
  noLeak(f);
}
groups++;

// Auto-title bounding never splits a pair; arbitrary title surrogates become visible replacements.
for (const [title, expected] of [
  ["x".repeat(119) + "😀 suffix", "x".repeat(119)],
  ["x".repeat(118) + "😀 suffix", "x".repeat(118) + "😀"],
  ["left\ud800right", "left\uFFFDright"],
  ["end\ud800", "end\uFFFD"],
  ["\udc00start", "\uFFFDstart"],
  [
    "Fundraiser by Fictional Organizer: Fictional Cause — JustGiving",
    "Fictional Cause",
  ],
]) {
  f = await popupFixture({ title });
  assert.equal(f.ids.get("q").value, expected);
  assert.ok(f.ids.get("q").value.length <= 120);
  await submit(f);
  assert.equal(destination(f.calls.created[0].url).query, expected);
  noLeak(f);
}
groups++;

// Missing/restricted active-tab APIs leave manual lookup and checklist operational.
for (const options of [
  { tabMode: "denied" },
  { tabMode: "empty" },
  { tabMode: "missing" },
  { apiFamily: "none" },
  { apiFamily: "chrome", tabMode: "denied" },
]) {
  f = await popupFixture(options);
  assert.equal(f.ids.get("q").value, "");
  assert.equal(
    f.ids.get("checklist").querySelectorAll('input[type="checkbox"]').length,
    10,
  );
  f.ids.get("q").value = "Fictional manually entered cause";
  await f.ids.get("q").dispatch("input");
  await submit(f);
  assert.equal(f.ids.get("q").value, "Fictional manually entered cause");
  if (options.apiFamily === "none") {
    assert.equal(f.ids.get("lookup-manual").hidden, false);
    assert.equal(
      destination(f.ids.get("lookup-manual").href).query,
      "Fictional manually entered cause",
    );
  } else
    assert.equal(
      destination(f.calls.created[0].url).query,
      "Fictional manually entered cause",
    );
  noLeak(f);
}
groups++;

const delayedTitle = deferred();
f = extensionFixture({
  kind: "popup",
  title: "Old delayed title",
  tabMode: delayedTitle,
  checklist,
});
f.run(popup);
f.ids.get("q").value = "Manual text typed before tab access returned";
await f.ids.get("q").dispatch("input");
delayedTitle.resolve();
await flush();
assert.equal(
  f.ids.get("q").value,
  "Manual text typed before tab access returned",
);
assert.notEqual(
  f.ids.get("q").selected,
  true,
  "A delayed title must not select/steal edited input.",
);
noLeak(f);
groups++;

for (const fetchMode of ["denied", "bad-json"]) {
  f = await popupFixture({ fetchMode });
  assert.equal(f.ids.get("count").textContent, "Checklist unavailable");
  f.ids.get("q").value = "Manual cause after bundled read failure";
  await submit(f);
  assert.equal(
    destination(f.calls.created[0].url).query,
    "Manual cause after bundled read failure",
  );
  noLeak(f);
}
groups++;

f = await popupFixture({ createMode: "denied" });
const preserved = f.ids.get("q").value;
await submit(f);
assert.equal(f.calls.closed, 0);
assert.equal(f.ids.get("q").value, preserved);
assert.equal(f.ids.get("lookup-manual").hidden, false);
assert.match(f.ids.get("lookup-status").textContent, /direct link/);
assert.equal(destination(f.ids.get("lookup-manual").href).query, preserved);
assert.equal(f.ids.get("lookup-manual").href, f.calls.created[0].url);
noLeak(f);
groups++;

const createPending = deferred();
f = await popupFixture({ createMode: createPending });
const first = submit(f);
await submit(f);
await submit(f);
assert.equal(f.calls.created.length, 1);
assert.equal(f.calls.closed, 0);
createPending.reject(Error("Synthetic create failure"));
await first;
assert.equal(f.calls.closed, 0);
assert.equal(f.ids.get("lookup-manual").hidden, false);
f.api.tabs.create = (options) => {
  f.calls.created.push(options);
  return Promise.resolve({ id: 43 });
};
await submit(f);
assert.equal(f.calls.created.length, 2);
assert.equal(f.calls.closed, 1);
noLeak(f);
groups++;

// Hostile strings go to text, never markup. Bundled content cannot introduce a remote resource.
f = await popupFixture({
  title: "<img src=x onerror=alert(1)> | Every.org",
  checklist: [
    { question: "<script>fictional</script>", detail: "<img src=remote>" },
  ],
});
assert.equal(
  descendants(f.ids.get("checklist")).some(
    (x) => x.tagName === "img" || x.tagName === "script",
  ),
  false,
);
assert.match(f.ids.get("checklist").textContent, /<script>/);
await submit(f);
assert.equal(
  destination(f.calls.created[0].url).query,
  "<img src=x onerror=alert(1)>",
);
noLeak(f);
groups++;

// Content never reads page title until a deliberate lookup click and never reads form/body/tab URL.
f = await contentFixture({
  title: "Fundraiser by Fictional Person: Aid & Care / 救援 | GoFundMe",
});
assert.ok(f.card());
assert.equal(f.calls.title, 0);
assert.equal(f.shadow().tagName, "shadow");
assert.equal(
  descendants(f.shadow()).filter((x) => x.tagName === "li").length,
  3,
);
assert.equal(f.calls.created.length, 0);
assert.deepEqual(f.calls.fetch, []);
assert.equal(lookup(f).href, "https://charitology.org/tools/charity-lookup/");
await lookup(f).dispatch("click");
assert.equal(f.calls.title, 1);
d = destination(lookup(f).href);
assert.equal(d.query, "Aid & Care / 救援");
assert.equal(lookup(f).getAttribute("rel"), "noopener noreferrer");
noLeak(f);
groups++;

// All title cleanup/Unicode cases are shared expectations across the two real entry points.
for (const title of [
  "Fundraiser for Fictional Aid · Every.org",
  "Donate to <b>Fictional & 救援</b> ?%# / — JustGiving",
  "x".repeat(119) + "😀 more",
  "end\ud800",
  "mid\ud800dle",
]) {
  const a = await popupFixture({ title }),
    b = await contentFixture({ title });
  assert.equal(b.calls.title, 0);
  await lookup(b).dispatch("click");
  assert.equal(destination(lookup(b).href).query, a.ids.get("q").value);
  assert.equal(
    descendants(b.shadow()).some(
      (x) => x.tagName === "b" || x.tagName === "img" || x.tagName === "script",
    ),
    false,
  );
  noLeak(a);
  noLeak(b);
}
groups++;

// A closed card is document-local; only explicit host hide writes an extension-local key.
f = await contentFixture();
await descendants(f.shadow())
  .find(
    (x) => x.tagName === "button" && x.getAttribute("aria-label") === "Close",
  )
  .dispatch("click");
assert.equal(f.card(), undefined);
assert.deepEqual(f.calls.set, []);
noLeak(f);
const hostStorage = new Map();
f = await contentFixture({ storage: hostStorage });
await shadowNode(f, "button", "Don’t show on www.gofundme.com").dispatch(
  "click",
);
assert.equal(hostStorage.get("hidden:www.gofundme.com"), true);
assert.equal(f.card(), undefined);
assert.deepEqual(plain(f.calls.set), [{ "hidden:www.gofundme.com": true }]);
const hidden = await contentFixture({ storage: hostStorage });
assert.equal(hidden.card(), undefined);
const otherHost = await contentFixture({
  storage: hostStorage,
  hostname: "www.justgiving.com",
});
assert.ok(otherHost.card());
assert.deepEqual(otherHost.calls.get, ["hidden:www.justgiving.com"]);
noLeak(f);
noLeak(hidden);
noLeak(otherHost);
groups++;

// Failure to read a preference permits a card; failure to save never claims it persisted.
f = await contentFixture({ getMode: "denied", setMode: "denied" });
assert.ok(f.card());
await shadowNode(f, "button", "Don’t show on www.gofundme.com").dispatch(
  "click",
);
assert.ok(f.card());
assert.match(f.shadow().textContent, /Could not save this preference/);
assert.equal(f.storage.has("hidden:www.gofundme.com"), false);
await descendants(f.shadow())
  .find(
    (x) => x.tagName === "button" && x.getAttribute("aria-label") === "Close",
  )
  .dispatch("click");
assert.equal(f.card(), undefined);
noLeak(f);
groups++;

const pendingHide = deferred();
f = await contentFixture({ setMode: pendingHide });
const hideButton = shadowNode(f, "button", "Don’t show on www.gofundme.com");
const hideOne = hideButton.dispatch("click");
await hideButton.dispatch("click");
assert.equal(f.calls.set.length, 1);
pendingHide.resolve();
await hideOne;
assert.equal(f.card(), undefined);
noLeak(f);
groups++;

// Two independently injected initializations racing the same async storage read still mount once.
const pendingGet = deferred();
f = extensionFixture({ kind: "content", getMode: pendingGet });
f.run(content);
f.run(content);
assert.equal(f.card(), undefined);
assert.equal(f.calls.get.length, 2);
pendingGet.resolve();
await flush();
assert.equal(
  f.all().filter((x) => x.id === "charitology-before-you-give").length,
  1,
);
assert.equal(f.calls.title, 0);
noLeak(f);
groups++;

// A page-colliding host ID causes safe noninjection; no scan or hidden title read compensates for it.
f = extensionFixture({ kind: "content" });
const collision = new FixtureNode("div");
collision.id = "charitology-before-you-give";
f.html.append(collision);
f.run(content);
await flush();
assert.equal(f.calls.get.length, 0);
assert.equal(f.calls.title, 0);
assert.equal(f.all().length, 1);
noLeak(f);
groups++;

// With extension APIs absent, content remains dismissible and reports failure if persistence is requested.
f = await contentFixture({ apiFamily: "none" });
assert.ok(f.card());
await shadowNode(f, "button", "Don’t show on www.gofundme.com").dispatch(
  "click",
);
assert.match(f.shadow().textContent, /Could not save/);
assert.ok(f.card());
noLeak(f);
groups++;

// A release base path is a fixed baked literal, never an input-controlled redirect or query.
const bakedPopup = popup.replace(
  /(["'])__CHARITOLOGY_SITE__\1/,
  JSON.stringify("https://example.invalid/charitology"),
);
f = extensionFixture({
  kind: "popup",
  checklist,
  title: "Donate to Fictional Cause",
});
f.run(bakedPopup);
await flush();
await submit(f);
assert.equal(
  new URL(f.calls.created[0].url).pathname,
  "/charitology/tools/charity-lookup/",
);
assert.equal(
  f.ids.get("method").href,
  "https://example.invalid/charitology/method/#checklist",
);
assert.equal(destination(f.calls.created[0].url).query, "Fictional Cause");
noLeak(f);
groups++;

// The manual cap is UTF-16 units, matching the actual input maxlength; a full pair at120 is valid.
for (const q of ["x".repeat(120), "😀".repeat(60)]) {
  f = await popupFixture();
  f.ids.get("q").value = q;
  await f.ids.get("q").dispatch("input");
  await submit(f);
  assert.equal(destination(f.calls.created[0].url).query, q);
  noLeak(f);
}
groups++;

// A page whose title getter would throw still gets its initial card without reading the title.
f = await contentFixture({
  title: () => {
    throw Error("Protected title unavailable until chosen action");
  },
});
assert.ok(f.card());
assert.equal(f.calls.title, 0);
noLeak(f);
groups++;

const bakedContent = content.replace(
  /(["'])__CHARITOLOGY_SITE__\1/,
  JSON.stringify("https://example.invalid/charitology"),
);
f = extensionFixture({ kind: "content", title: "Donate to Fictional Cause" });
f.run(bakedContent);
await flush();
assert.equal(
  lookup(f).href,
  "https://example.invalid/charitology/tools/charity-lookup/",
);
await lookup(f).dispatch("click");
assert.equal(destination(lookup(f).href).query, "Fictional Cause");
assert.equal(
  shadowNode(f, "a", "All 10 questions").href,
  "https://example.invalid/charitology/method/#checklist",
);
noLeak(f);
groups++;

// A rejected old navigation cannot expose a fallback for a query edited while the API was pending.
const staleCreate = deferred();
f = await popupFixture({
  title: "Old fictional query",
  createMode: staleCreate,
});
const staleSubmit = submit(f);
f.ids.get("q").value = "New fictional query";
await f.ids.get("q").dispatch("input");
staleCreate.reject(Error("Synthetic denied create"));
await staleSubmit;
assert.equal(f.ids.get("q").value, "New fictional query");
assert.equal(f.ids.get("lookup-manual").hidden, true);
assert.match(f.ids.get("lookup-status").textContent, /changed|again/);
assert.equal(f.calls.closed, 0);
assert.equal(destination(f.calls.created[0].url).query, "Old fictional query");
noLeak(f);
groups++;

// A visible failure link is invalidated immediately by a later manual edit.
f = await popupFixture({ createMode: "denied" });
await submit(f);
assert.equal(f.ids.get("lookup-manual").hidden, false);
f.ids.get("q").value = "Edited after failure";
await f.ids.get("q").dispatch("input");
assert.equal(f.ids.get("lookup-manual").hidden, true);
await submit(f);
assert.equal(f.ids.get("lookup-manual").hidden, false);
assert.equal(
  destination(f.ids.get("lookup-manual").href).query,
  "Edited after failure",
);
noLeak(f);
groups++;

console.log(
  `✓ Extension matrix: ${urlCases.length} documented URL cases, ${groups} actual-entry-point privacy/recovery scenario groups passed. Synthetic DOM/API only; installed-browser/store status is unverified.`,
);
