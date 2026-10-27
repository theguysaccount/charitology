// Real static integration; no private browser data or synthetic acceptance seed.
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url)),
  dist = join(root, "dist");
const programs = [
  "the-charitology-fund",
  "charity-incubator",
  "question-bounties",
  "the-charitology-prize",
  "charitology-fellowship",
  "charitology-summit",
  "donor-advisory",
  "nonprofit-advisory",
  "field-verification",
];
let checkedAssets = 0;
for (const program of programs) {
  const html = readFileSync(
    join(dist, "programs", program, "index.html"),
    "utf8",
  );
  assert.equal(
    [...html.matchAll(/\sdata-program-graph(?:\s|=|>)/g)].length,
    1,
    `${program}: exactly one companion mount`,
  );
  assert.ok(
    html.includes(`data-initial-program="${program}"`),
    `${program}: exact known source identity`,
  );
  assert.ok(
    html.includes(`id="partner-workspace-${program}"`),
    `${program}: original workspace retained`,
  );
  assert.ok(
    html.includes('id="pw-context"') && html.includes('id="pw-collections"'),
    `${program}: original editor retained`,
  );
  assert.ok(
    html.includes("Connect your program work") &&
      html.includes("The companion notebook is loading."),
    `${program}: real loading shell and limits`,
  );
  assert.doesNotMatch(
    html,
    /fictional-state-|Substituted candidate B|Unsaved B|New work ahead of reload/,
    "Excluded acceptance records must not be production HTML",
  );
  const assets = [
    ...html.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))"/g),
  ].map((match) => match[1]);
  assert.ok(assets.length > 0, `${program}: executable and style assets exist`);
  for (const asset of assets) {
    if (!asset.startsWith("/")) continue;
    let path = decodeURIComponent(asset);
    const base = (process.env.BASE_PATH ?? "/").replace(/\/$/, "");
    if (base && path.startsWith(base + "/")) path = path.slice(base.length);
    assert.ok(existsSync(join(dist, path)), `${program}: ${asset}`);
    checkedAssets++;
  }
}
const graphBundles = readdirSync(join(dist, "_astro"))
  .filter((name) => name.endsWith(".js"))
  .filter((name) =>
    readFileSync(join(dist, "_astro", name), "utf8").includes(
      "charitology.program-graph.v1",
    ),
  );
assert.ok(
  graphBundles.length > 0,
  "Built graph entry uses the final isolated key",
);
for (const name of graphBundles) {
  const code = readFileSync(join(dist, "_astro", name), "utf8");
  assert.doesNotMatch(
    code,
    /Substituted candidate B|New work ahead of reload|fictional-state-/,
    "No test seed in graph runtime",
  );
}
console.log(
  `Program graph static integration: ${programs.length} real program mounts, original editors and ${checkedAssets} referenced script/style assets verified; no new catalog item or private seed.`,
);
