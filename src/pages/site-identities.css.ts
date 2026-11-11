import { routes, symbols } from '../lib/site-identities';
import { datasetSymbols, ecosystemSymbols, fragmentSymbols } from '../lib/list-identities';
import { url } from '../lib/site';

export function GET() {
  const assets = Object.entries(symbols).map(([name, path]) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${path}" fill="none" stroke="black" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    return `--glyph-${name}:url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  });
  const page = Object.keys(symbols).map((name) => `[data-site-symbol="${name}"]{--site-symbol:var(--glyph-${name})}`);
  const tones = [...new Set(routes.map(({ tone }) => tone))].map((tone) =>
    `[data-site-tone="${tone}"]{--site-tone:var(--tone-${tone})}`);
  // Shorter route prefixes come first. A specific link overrides its section.
  const links = routes.map(({ path, symbol, tone }) => {
    const match = path === '/' ? '=' : '^=';
    return `a[href${match}"${url(path)}"]{--link-glyph:var(--glyph-${symbol});--link-tone:var(--tone-${tone});--list-mark:inline-block}`;
  });
  links.unshift(
    'a[href^="https://"]{--link-glyph:var(--glyph-external)}',
    'a[href="https://os.charitology.org"],a[href^="https://os.charitology.org/"]{--link-glyph:var(--glyph-board);--link-tone:var(--tone-green)}',
    'a[href^="mailto:"]{--link-glyph:var(--glyph-mail)}',
    'a[download]{--link-glyph:var(--glyph-download)}',
  );
  const datasetLinks = Object.entries(datasetSymbols).map(([name, symbol]) =>
    `a[href="${url(`/api/v1/${name}.json`)}"]{--link-glyph:var(--glyph-${symbol});--list-mark:inline-block}`);
  const ecosystemLinks = Object.entries(ecosystemSymbols).map(([href, symbol]) =>
    `a[href^="${href}"]{--link-glyph:var(--glyph-${symbol});--list-mark:inline-block}`);
  const fragments = Object.entries(fragmentSymbols).flatMap(([path, entries]) =>
    Object.entries(entries).map(([id, symbol]) =>
      `a[href="${url(path)}#${id}"],main[data-site-path="${path}"] a[href="#${id}"]{--link-glyph:var(--glyph-${symbol})}`));
  return new Response([`:root{${assets.join(';')}}`, ...page, ...tones, ...links, ...datasetLinks, ...ecosystemLinks, ...fragments].join('\n'), {
    headers: { 'Content-Type': 'text/css; charset=utf-8' },
  });
}
