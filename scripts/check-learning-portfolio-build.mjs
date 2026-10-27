// Actual generated routes/configuration and legacy wrapper integration.
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
const root = process.cwd(),
  dist = join(root, "dist");
const registry = JSON.parse(
  readFileSync(join(root, "src/data/course-criteria/registry.json"), "utf8"),
);
let assets = 0;
for (const [program, mode] of [
  ["principles-course", "course"],
  ["certified-charitologist", "completion"],
]) {
  const html = readFileSync(
    join(dist, "programs", program, "index.html"),
    "utf8",
  );
  assert.equal(
    [...html.matchAll(/\sdata-learning-portfolio(?:\s|=|>)/g)].length,
    1,
    program + ": one guarded shared mount",
  );
  const script = html.match(
    /<script\b[^>]*class="learning-portfolio-config"[^>]*>([\s\S]*?)<\/script>/,
  );
  assert(script, program + ": inert exact criteria config");
  const config = JSON.parse(script[1]);
  assert.equal(config.mode, mode);
  assert.equal(config.criteriaRegistry.currentId, registry.currentId);
  assert.deepEqual(config.criteriaRegistry, registry);
  assert.equal(config.currentCriteria.id, registry.currentId);
  assert(
    config.knownCriteria.some(
      (c) =>
        c.id === config.currentCriteria.id &&
        c.hash === config.currentCriteria.hash,
    ),
  );
  for (const criteria of config.knownCriteria)
    assert.equal(
      criteria.hash,
      registry.entries.find((e) => e.id === criteria.id)?.hash,
    );
  assert.equal([...html.matchAll(/id="pc-title"/g)].length, 1, "Existing program content keeps its #pc-title link target");
  assert(html.includes("The guarded local course and portfolio are loading."));
  assert(html.includes("No accreditation, independent assessor"));
  assert(
    !html.includes('id="pc-storage"'),
    "Unsafe legacy course handler is no longer mounted",
  );
  if (mode === "course")
    for (const unit of config.currentCriteria.units)
      assert.equal(
        [...html.matchAll(new RegExp(`id="lp-reading-${unit.id}"`, "g"))]
          .length,
        1,
        "Every exact current chapter remains server-readable",
      );
  assert.doesNotMatch(
    html,
    /Fictional study practice|held-before-restore|Synthetic learner A|synthetic-course-criteria/,
    "Excluded learner fixtures must not be production HTML",
  );
  for (const [, asset] of html.matchAll(
    /(?:src|href)="([^"?#]+\.(?:js|css))"/g,
  )) {
    if (!asset.startsWith("/")) continue;
    let path = decodeURIComponent(asset);
    const base = (process.env.BASE_PATH ?? "/").replace(/\/$/, "");
    if (base && path.startsWith(base + "/")) path = path.slice(base.length);
    assert(
      existsSync(join(dist, path)),
      program + ": executable/style asset exists",
    );
    assets++;
  }
}
const scripts = readdirSync(join(dist, "_astro"))
  .filter((x) => x.endsWith(".js"))
  .map((x) => readFileSync(join(dist, "_astro", x), "utf8"))
  .filter((x) => x.includes("charitology.learning-portfolio.v1"));
assert(
  scripts.length > 0,
  "Actual client bundle contains the final companion key",
);
assert(
  scripts.some((x) => x.includes("charitology.principles-course-v1")),
  "Actual guarded course final key is bundled",
);
for (const script of scripts)
  assert.doesNotMatch(
    script,
    /Synthetic learner A|synthetic-course-criteria|held-before-restore/,
    "No acceptance learner seed bundled",
  );
const wrapper = readFileSync(
  join(root, "src/components/programs/_principles-learning.astro"),
  "utf8",
);
assert(
  wrapper.includes("loadCourseCriteria") &&
    wrapper.includes("LearningPortfolio"),
);
assert.doesNotMatch(wrapper, /readCourse|writeCourse|from.*client\/store/);
console.log(
  `Learning portfolio static integration: 2 real mounts, exact frozen criteria/config, ten server-readable current chapters and ${assets} referenced assets verified. Browser files, print and learners are separate evidence.`,
);
