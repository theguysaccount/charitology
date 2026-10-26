// Checks every internal link and asset reference in the built site (dist/).
// Run after `npm run build`. Fails if any link points at a page or file that
// doesn't exist, or at an #anchor that isn't on the target page.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const base = (process.env.BASE_PATH || '/').replace(/\/$/, '');

if (!existsSync(dist)) {
  console.error('dist/ not found. Run npm run build first.');
  process.exit(1);
}

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const html = walk(dist).filter((f) => f.endsWith('.html'));
const idsCache = new Map();
const idsIn = (file) => {
  if (!idsCache.has(file)) {
    const ids = new Set([...readFileSync(file, 'utf8').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    idsCache.set(file, ids);
  }
  return idsCache.get(file);
};

function resolveTarget(pathname) {
  let p = decodeURIComponent(pathname);
  if (base && p.startsWith(base)) p = p.slice(base.length);
  if (!p.startsWith('/')) return null;
  const file = join(dist, p);
  if (p.endsWith('/')) return existsSync(join(file, 'index.html')) ? join(file, 'index.html') : null;
  if (existsSync(file) && statSync(file).isFile()) return file;
  if (existsSync(join(file, 'index.html'))) return join(file, 'index.html');
  return null;
}

const problems = [];
let checked = 0;
for (const file of html) {
  const page = relative(dist, file).split(sep).join('/');
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    const ref = m[1].replace(/&amp;/g, '&');
    if (/^(https?:|mailto:|data:|javascript:|\/\/)/.test(ref)) continue;
    if (ref.startsWith('#')) {
      if (ref.length > 1 && !idsIn(file).has(ref.slice(1))) problems.push(`${page}: missing anchor ${ref}`);
      checked++;
      continue;
    }
    if (!ref.startsWith('/')) continue;
    const [pathname, hash] = ref.split('#');
    const target = resolveTarget(pathname.split('?')[0]);
    checked++;
    if (!target) {
      problems.push(`${page}: broken link ${ref}`);
      continue;
    }
    if (hash && target.endsWith('.html') && !idsIn(target).has(hash)) problems.push(`${page}: missing anchor ${ref}`);
  }
}

if (problems.length) {
  console.error(`✗ ${problems.length} broken internal link(s) out of ${checked} checked:\n`);
  console.error([...new Set(problems)].map((p) => `  ${p}`).join('\n'));
  process.exit(1);
}
console.log(`✓ ${checked} internal links and assets checked across ${html.length} pages. None broken.`);
