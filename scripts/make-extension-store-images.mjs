// Original store artwork. This is promotional art, not a product screenshot.
// Reuses the compass geometry that drives the site and extension icons.
// Run after npm ci: node scripts/make-extension-store-images.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { markSvg } from '../src/lib/mark.mjs';

const output = new URL('../public/extension-store/', import.meta.url);
const paper = '#f6f3ec', ink = '#1a1915', red = '#8b1e2d', muted = '#645f55', line = '#d8d0c2';
const mark = (x, y, size, id) => `<g transform="translate(${x} ${y}) scale(${size / 64})">${markSvg({ id, ink, ink2: '#625b50', accent: red, accent2: '#5c1019', pivot: paper })}</g>`;
const text = (x, y, size, value, attrs = '') => `<text x="${x}" y="${y}" font-size="${size}" fill="${ink}" ${attrs}>${value}</text>`;
const frame = (width, height, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>text{font-family:Helvetica,Arial,sans-serif}.serif{font-family:Georgia,serif}.muted{fill:${muted}}.red{fill:${red}}</style><rect width="${width}" height="${height}" fill="${paper}"/>${body}</svg>`;

const small = frame(440, 280, `
<rect x="12.5" y="12.5" width="415" height="255" fill="none" stroke="${line}"/>
${text(28, 40, 14, 'CHARITOLOGY', 'letter-spacing="2" class="red"')}
${mark(362, 23, 44, 'small-promo')}
${text(26, 100, 38, 'Before you give.', 'class="serif"')}
${text(28, 131, 15, 'A pause for better questions.', 'class="muted"')}
<path d="M28 148H412" stroke="${line}"/>
<circle cx="32" cy="172" r="2.5" fill="${red}"/>
<circle cx="32" cy="197" r="2.5" fill="${red}"/>
<circle cx="32" cy="222" r="2.5" fill="${red}"/>
${text(45, 177, 15, 'Symptom or source?')}
${text(45, 202, 15, 'What happens if I don’t give?')}
${text(45, 227, 15, 'How do we know it works?')}
${text(28, 253, 11, '10 QUESTIONS · BROWSER EXTENSION', 'letter-spacing=".4" class="muted"')}
${text(412, 253, 11, 'charitology.org', 'text-anchor="end" class="red"')}
`);

const centerX = 1085, centerY = 253;
const ticks = Array.from({ length: 48 }, (_, i) => {
  const angle = i * Math.PI / 24, major = i % 4 === 0;
  const inner = major ? 180 : 187, outer = 195;
  const point = (radius) => `${(centerX + radius * Math.cos(angle)).toFixed(2)} ${(centerY + radius * Math.sin(angle)).toFixed(2)}`;
  return `<path d="M${point(inner)}L${point(outer)}" stroke="${major ? '#b8aa94' : line}" stroke-width="${major ? 1.4 : 1}"/>`;
}).join('');
const marquee = frame(1400, 560, `
<rect x="22.5" y="22.5" width="1355" height="515" fill="none" stroke="${line}"/>
<path d="M846 253H1324M1085 39V467" stroke="${line}" stroke-dasharray="3 7"/>
<circle cx="${centerX}" cy="${centerY}" r="211" fill="none" stroke="${line}"/>
<circle cx="${centerX}" cy="${centerY}" r="164" fill="none" stroke="${line}"/>
${ticks}
${mark(953, 121, 264, 'marquee')}
${text(68, 74, 19, 'CHARITOLOGY', 'letter-spacing="3.8" class="red"')}
${text(63, 194, 82, 'Before you give.', 'class="serif"')}
${text(68, 252, 29, 'A pause for better questions.', 'class="muted"')}
<path d="M68 286H772" stroke="${line}"/>
<circle cx="76" cy="328" r="4" fill="${red}"/>
<circle cx="76" cy="372" r="4" fill="${red}"/>
<circle cx="76" cy="416" r="4" fill="${red}"/>
${text(99, 336, 25, 'Symptom or source?')}
${text(99, 380, 25, 'What happens if I don’t give?')}
${text(99, 424, 25, 'How do we know it works?')}
<path d="M68 465H772" stroke="${line}"/>
${text(68, 503, 16, '10 QUESTIONS · YOUR OWN JUDGMENT', 'letter-spacing="1.2" class="muted"')}
${text(centerX, 503, 23, 'charitology.org', 'text-anchor="middle" class="red"')}
`);

await mkdir(output, { recursive: true });
for (const [name, svg, width, height] of [
  ['small-promo-440x280', small, 440, 280],
  ['marquee-1400x560', marquee, 1400, 560],
]) {
  await writeFile(new URL(`${name}.svg`, output), svg);
  await sharp(Buffer.from(svg)).flatten({ background: paper }).removeAlpha().png().toFile(new URL(`${name}.png`, output).pathname);
  console.log(`Wrote ${name}.png (${width}×${height}, RGB)`);
}
