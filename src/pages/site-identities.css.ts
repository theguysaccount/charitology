import { routes, symbols } from '../lib/site-identities';
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
  const links = routes.map(({ path, symbol, tone }) =>
    `a[href^="${url(path)}"]{--link-glyph:var(--glyph-${symbol});--link-tone:var(--tone-${tone})}`);
  links.unshift(
    'a[href^="https://"]{--link-glyph:var(--glyph-external)}',
    'a[href^="https://os.charitology.org"]{--link-glyph:var(--glyph-board);--link-tone:var(--tone-green)}',
    'a[href^="mailto:"]{--link-glyph:var(--glyph-mail)}',
  );
  return new Response([`:root{${assets.join(';')}}`, ...page, ...tones, ...links].join('\n'), {
    headers: { 'Content-Type': 'text/css; charset=utf-8' },
  });
}
