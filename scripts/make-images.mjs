// Generates the social card (public/og.png), touch icon and extension icons from SVG.
// macOS only (uses Quick Look and sips). The PNGs are committed, so contributors
// never need to run this unless the artwork changes: `node scripts/make-images.mjs`.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { markSvg } from '../src/lib/mark.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'charitology-img-'));
const font = (file) => readFileSync(join(root, 'node_modules/@fontsource-variable', file)).toString('base64');
const fraunces = font('fraunces/files/fraunces-latin-opsz-normal.woff2');
const frauncesItalic = font('fraunces/files/fraunces-latin-opsz-italic.woff2');

const MARK = (x, y, s, id, opts = {}) =>
  `<g transform="translate(${x} ${y}) scale(${s})">${markSvg({ id, ink: '#1a1915', ink2: '#45423b', accent: '#8b1e2d', accent2: '#5c1019', pivot: '#f6f3ec', ...opts })}</g>`;

const depth = ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281'];
const names = ['Relief', 'Repair', 'Prevention', 'Structure', 'Source'];

// Quick Look renders square thumbnails and sips crops from the center, so the
// card is drawn in the middle of a square canvas and cropped to 1200x630.
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
<defs>
<style>
@font-face{font-family:F;src:url(data:font/woff2;base64,${fraunces}) format('woff2');font-weight:100 900}
@font-face{font-family:FI;font-style:italic;src:url(data:font/woff2;base64,${frauncesItalic}) format('woff2');font-weight:100 900}
</style>
<radialGradient id="wash" cx="0.85" cy="0" r="0.8"><stop offset="0" stop-color="#f4e6e3"/><stop offset="1" stop-color="#f6f3ec" stop-opacity="0"/></radialGradient>
</defs>
<g transform="translate(0 285)">
<rect width="1200" height="630" fill="#f6f3ec"/>
<rect width="1200" height="630" fill="url(#wash)"/>
<text x="80" y="128" font-family="Helvetica Neue, Helvetica, Arial" font-size="22" font-weight="700" letter-spacing="4" fill="#8b1e2d">AN OPEN SCIENCE · EST. 2026</text>
<text x="74" y="290" font-family="F" font-size="150" font-weight="600" letter-spacing="-4" fill="#1a1915">Charitology</text>
<text x="80" y="370" font-family="FI" font-style="italic" font-size="50" font-weight="400" fill="#47443c">The science of doing the most good.</text>
${MARK(880, 50, 3.9, 'og')}
${depth.map((c, i) => `<rect x="${80 + i * 150}" y="470" width="144" height="14" rx="2" fill="${c}"/><text x="${80 + i * 150}" y="512" font-family="Helvetica Neue, Helvetica, Arial" font-size="20" fill="#47443c">${names[i]}</text>`).join('')}
<text x="80" y="575" font-family="Helvetica Neue, Helvetica, Arial" font-size="24" fill="#6b665c">Charity is a system. Charitology studies it so we can fix it.</text>
</g>
</svg>`;

const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#f6f3ec"/>${MARK(40, 40, 6.75, 'icon')}</svg>`;
const iconSmall = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#f6f3ec"/>${MARK(32, 32, 7, 'icons', { simple: true })}</svg>`;

function render(svg, name, size) {
  const file = join(tmp, `${name}.svg`);
  writeFileSync(file, svg);
  execFileSync('qlmanage', ['-t', '-s', String(size), '-o', tmp, file], { stdio: 'ignore' });
  return `${file}.png`;
}

function resize(src, dest, px) {
  copyFileSync(src, dest);
  execFileSync('sips', ['-z', String(px), String(px), dest], { stdio: 'ignore' });
}

const ogPng = render(og, 'og', 1200);
copyFileSync(ogPng, join(root, 'public/og.png'));
execFileSync('sips', ['--cropToHeightWidth', '630', '1200', join(root, 'public/og.png')], { stdio: 'ignore' });
execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '88', join(root, 'public/og.png'), '--out', join(root, 'public/og.jpg')], { stdio: 'ignore' });
rmSync(join(root, 'public/og.png'));
const iconPng = render(icon, 'icon', 512);
resize(iconPng, join(root, 'public/apple-touch-icon.png'), 180);
mkdirSync(join(root, 'extension/icons'), { recursive: true });
const iconSmallPng = render(iconSmall, 'icon-small', 512);
for (const px of [16, 32, 48, 128]) resize(px < 48 ? iconSmallPng : iconPng, join(root, `extension/icons/icon-${px}.png`), px);
console.log('Wrote public/og.jpg, public/apple-touch-icon.png and extension/icons/*.png');
