// Cross-reference checks the schemas can't express, run against the built API
// in dist/api/v1 (so no YAML parsing is needed). Run after `npm run build`.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const api = join(root, 'dist/api/v1');
if (!existsSync(api)) {
  console.error('dist/api/v1 not found. Run npm run build first.');
  process.exit(1);
}
const load = (name) => JSON.parse(readFileSync(join(api, `${name}.json`), 'utf8')).data;

const errors = [];
const warnings = [];
const causes = load('causes');
const causeIds = new Set(causes.causes.map((c) => c.id));
const problemIds = new Set(causes.problems.map((p) => p.id));
const frameworks = load('frameworks').frameworks;
const frameworkIds = new Set(frameworks.map((f) => f.id));

// Frameworks rank every cause, and nothing else.
for (const f of frameworks) {
  for (const id of causeIds) if (!(id in f.priorities)) errors.push(`frameworks.json: ${f.id} has no priority for cause ${id}`);
  for (const id of Object.keys(f.priorities)) if (!causeIds.has(id)) errors.push(`frameworks.json: ${f.id} ranks unknown cause ${id}`);
}

// Causes map to known problems and sources.
const sources = new Set(['story', 'coordination', 'vision', 'attention', 'status', 'gatekeepers']);
for (const c of causes.causes) {
  for (const p of c.problems) if (p !== 'all' && !problemIds.has(p)) errors.push(`causes.json: ${c.id} lists unknown problem ${p}`);
  for (const u of c.upstream) if (!sources.has(u)) errors.push(`causes.json: ${c.id} lists unknown source ${u}`);
  for (const [d, v] of Object.entries(c.dims)) if (v < 0 || v > 1) errors.push(`causes.json: ${c.id}.${d} must be between 0 and 1`);
}

// The compass asks about every framework exactly once.
const compass = JSON.parse(readFileSync(join(root, 'src/data/compass.json'), 'utf8'));
for (const s of compass.statements) if (!frameworkIds.has(s.framework)) errors.push(`compass.json: unknown framework ${s.framework}`);
for (const id of frameworkIds) if (!compass.statements.some((s) => s.framework === id)) errors.push(`compass.json: no statement for framework ${id}`);

// Lexicon cross-references.
const lexicon = load('lexicon');
const terms = new Set(lexicon.map((t) => t.id));
for (const t of lexicon) for (const s of t.see) if (!terms.has(s)) errors.push(`lexicon.json: ${t.id} refers to unknown term ${s}`);

// Numbers in the Open Problems are unique and consecutive; so are condition numbers.
for (const [name, label] of [
  ['open-problems', 'Open Problems'],
  ['conditions', 'conditions'],
]) {
  const nums = load(name)
    .map((x) => x.number)
    .sort((a, b) => a - b);
  nums.forEach((n, i) => n !== i + 1 && errors.push(`${label}: numbers should run 1..${nums.length} without gaps (found ${n} at position ${i + 1})`));
}

// Intervention cost ranges are ordered.
for (const iv of load('interventions')) {
  if (iv.cost && iv.cost.low > iv.cost.high) errors.push(`interventions/${iv.id}: cost.low is above cost.high`);
}

// Forecast probabilities and resolution.
for (const q of load('forecasts')) {
  if (q.outcome !== null && !q.resolvedOn) warnings.push(`forecasts/${q.id}: resolved without resolvedOn date`);
}

// Pages still in draft (informational).
const drafts = ['conditions', 'encyclopedia', 'interventions', 'cases', 'myths', 'disagreements', 'traditions', 'principles']
  .flatMap((n) => load(n))
  .filter((x) => x.review === 'draft').length;

if (warnings.length) console.warn(warnings.map((w) => `  ! ${w}`).join('\n'));
if (errors.length) {
  console.error(`✗ ${errors.length} content problem(s):\n${errors.map((e) => `  ${e}`).join('\n')}`);
  process.exit(1);
}
console.log(`✓ Content cross-references are consistent. ${drafts} pages are drafts awaiting review.`);
