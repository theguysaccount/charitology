import { routes, symbols } from '../lib/site-identities';
import { datasetSymbols, ecosystemSymbols, fragmentSymbols } from '../lib/list-identities';
import { sectionNavigation } from '../lib/section-navigation';
import { url } from '../lib/site';

export function GET() {
  const assets = Object.entries(symbols).map(([name, path]) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${path}" fill="none" stroke="black" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    return `--glyph-${name}:url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  });
  const page = Object.keys(symbols).map((name) => `[data-site-symbol="${name}"]{--site-symbol:var(--glyph-${name})}`);
  const contentMarks = Object.keys(symbols).flatMap((name) => [
    `[data-section-symbol="${name}"]{--heading-glyph:var(--glyph-${name});--heading-mark:inline-block}`,
    `a[data-source-symbol="${name}"]{--link-glyph:var(--glyph-${name})}`,
  ]);
  const tones = [...new Set(routes.map(({ tone }) => tone))].map((tone) =>
    `[data-site-tone="${tone}"]{--site-tone:var(--tone-${tone})}`);
  // Shorter route prefixes come first. A specific link overrides its section.
  const links = routes.map(({ path, symbol, tone }) => {
    const match = path === '/' ? '=' : '^=';
    const href = url(path);
    const selector = `a[href${match}"${href}"]`;
    const encoded = href.includes(':') ? `,a[href${match}"${href.replace(':', '%3A')}" i]` : '';
    return `${selector}${encoded}{--link-glyph:var(--glyph-${symbol});--link-tone:var(--tone-${tone});--list-mark:inline-block}`;
  });
  links.unshift(
    'a:is([href^="https://"],[href^="http://"]){--link-glyph:var(--glyph-external);--list-mark:inline-block}',
    'a[href="https://os.charitology.org"],a[href^="https://os.charitology.org/"]{--link-glyph:var(--glyph-personCheck);--link-tone:var(--tone-green)}',
    'a[href^="mailto:"]{--link-glyph:var(--glyph-mail);--list-mark:inline-block}',
    'a[download]{--link-glyph:var(--glyph-download);--list-mark:inline-block}',
    'a[href^="#"]{--link-glyph:var(--glyph-bookmark);--list-mark:inline-block}',
  );
  const datasetLinks = Object.entries(datasetSymbols).map(([name, symbol]) =>
    `a[href="${url(`/api/v1/${name}.json`)}"]{--link-glyph:var(--glyph-${symbol});--list-mark:inline-block}`);
  const ecosystemLinks = Object.entries(ecosystemSymbols).map(([href, symbol]) =>
    `a[href^="${href}"]{--link-glyph:var(--glyph-${symbol});--list-mark:inline-block}`);
  const fragments = Object.entries(fragmentSymbols).flatMap(([path, entries]) =>
    Object.entries(entries).map(([id, symbol]) =>
      `a[href="${url(path)}#${id}"],main[data-site-path="${path}"] a[href="#${id}"]{--link-glyph:var(--glyph-${symbol})}`));
  const sectionLinks = Object.entries(sectionNavigation).flatMap(([path, entries]) =>
    entries.flatMap(([id, , symbol]) => [
      `a[href="${url(path)}#${id}"],main[data-site-path="${path}"] a[href="#${id}"]{--link-glyph:var(--glyph-${symbol})}`,
      `main[data-site-path="${path}"] :is(h2,h3)[id="${id}"],main[data-site-path="${path}"] :is(section,aside,div)[id="${id}"] > h2:first-of-type{--heading-glyph:var(--glyph-${symbol});--heading-mark:inline-block}`,
    ]));
  const utilityLinks = [
    'a[href*="github.com/theguysaccount/charitology/issues/new"][href*="correction"]{--link-glyph:var(--glyph-checks)}',
    'a[href*="github.com/theguysaccount/charitology/issues/new"][href*="red-team"]{--link-glyph:var(--glyph-flag)}',
    `a[href="${url('/feed.xml')}"]{--link-glyph:var(--glyph-signal);--list-mark:inline-block}`,
  ];
  return new Response([`:root{${assets.join(';')}}`, ...page, ...tones, ...links, ...contentMarks, ...datasetLinks, ...ecosystemLinks, ...fragments, ...sectionLinks, ...utilityLinks].join('\n'), {
    headers: { 'Content-Type': 'text/css; charset=utf-8' },
  });
}
