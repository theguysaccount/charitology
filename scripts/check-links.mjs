// Checks every internal href/src in the built site, including relative URLs.
// Run after npm run build. URL resolution follows each emitted page's public
// location; a repository-relative Markdown link is not a public source URL.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'parse5';

const origin = 'https://charitology-link-check.invalid';
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

// The HTML parser decodes named/numeric character references before URLs or
// fragments are interpreted. Read actual attributes, not href-like code samples
// or script text; script-free fallback markup is checked as well.
function documentLinks(text) {
  const ids = new Set(), refs = [];
  let baseHref;
  function visit(node, inTemplate = false) {
    for (const attr of node.attrs || []) {
      if (attr.name === 'id' && !inTemplate) ids.add(attr.value);
      if (node.tagName === 'base' && attr.name === 'href') {
        if (!inTemplate && baseHref === undefined) baseHref = attr.value;
      } else if (attr.name === 'href' || attr.name === 'src') refs.push(attr.value);
    }
    for (const child of node.childNodes || []) visit(child, inTemplate);
    // Template content can become live later, so inspect its URLs, but its
    // inert IDs cannot satisfy a fragment in the current document.
    if (node.content) visit(node.content, true);
  }
  visit(parse(text, { scriptingEnabled: false }));
  return { ids, refs, baseHref };
}

function fragmentId(hash) {
  try { return decodeURIComponent(hash); }
  catch { return null; }
}

export function checkBuiltLinks({ dist, base = '' }) {
  dist = resolve(dist);
  base = base.replace(/\/$/, '');
  const html = walk(dist).filter((file) => file.endsWith('.html'));
  const documents = new Map();
  const documentIn = (file) => {
    if (!documents.has(file)) documents.set(file, documentLinks(readFileSync(file, 'utf8')));
    return documents.get(file);
  };
  function resolveTarget(pathname) {
    let path;
    try { path = decodeURIComponent(pathname); }
    catch { return null; }
    if (base) {
      if (path === base) path = '/';
      else if (path.startsWith(base + '/')) path = path.slice(base.length);
      else return null;
    }
    if (!path.startsWith('/')) return null;
    const file = resolve(dist, '.' + path);
    if (file !== dist && !file.startsWith(dist + sep)) return null;
    if (path.endsWith('/')) return existsSync(join(file, 'index.html')) ? join(file, 'index.html') : null;
    if (existsSync(file) && statSync(file).isFile()) return file;
    if (existsSync(join(file, 'index.html'))) return join(file, 'index.html');
    return null;
  }
  const problems = [];
  let checked = 0;
  for (const file of html) {
    const page = relative(dist, file).split(sep).join('/');
    const document = documentIn(file);
    // A generated directory index is served at its trailing-slash route.
    const route = '/' + page.replace(/(?:^|\/)index\.html$/, (match) => match.startsWith('/') ? '/' : '');
    const pageUrl = new URL(base + route, origin);
    let documentUrl = pageUrl;
    if (document.baseHref !== undefined) {
      try {
        documentUrl = new URL(document.baseHref, pageUrl);
        if (documentUrl.origin !== origin) {
          problems.push(`${page}: external base URL prevents internal-link verification`);
          documentUrl = pageUrl;
        }
      } catch {
        problems.push(`${page}: invalid base URL ${document.baseHref}`);
      }
    }
    for (const ref of document.refs) {
      let url;
      try { url = new URL(ref, documentUrl); }
      catch {
        checked++;
        problems.push(`${page}: invalid link ${ref}`);
        continue;
      }
      // Classify after native URL parsing, which trims surrounding ASCII
      // whitespace and resolves protocol-relative and backslash URL syntax.
      if (url.origin !== origin || url.protocol !== 'https:') continue;
      checked++;
      const target = resolveTarget(url.pathname);
      if (!target) {
        problems.push(`${page}: broken link ${ref}`);
        continue;
      }
      if (url.hash.length > 1 && target.endsWith('.html') && !documentIn(target).ids.has(fragmentId(url.hash.slice(1)))) {
        problems.push(`${page}: missing anchor ${ref}`);
      }
    }
  }
  return { problems, checked, pages: html.length };
}

function main() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const dist = join(root, 'dist');
  if (!existsSync(dist)) {
    console.error('dist/ not found. Run npm run build first.');
    process.exitCode = 1;
    return;
  }
  const { problems, checked, pages } = checkBuiltLinks({ dist, base: process.env.BASE_PATH || '/' });
  if (problems.length) {
    console.error(`✗ ${problems.length} broken internal link(s) out of ${checked} checked:\n`);
    console.error([...new Set(problems)].map((problem) => `  ${problem}`).join('\n'));
    process.exitCode = 1;
    return;
  }
  console.log(`✓ ${checked} internal links and assets checked across ${pages} pages. None broken.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
