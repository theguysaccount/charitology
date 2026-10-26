// Shared, deterministic artwork for the social card and silent introduction.
// All geometry comes from the site's compass mark; no stock imagery or tracking.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { markSvg } from '../src/lib/mark.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const font = (file) => readFileSync(join(root, 'node_modules/@fontsource-variable', file)).toString('base64');
const roman = font('fraunces/files/fraunces-latin-opsz-normal.woff2');
const italic = font('fraunces/files/fraunces-latin-opsz-italic.woff2');
export const COLORS = { paper: '#f6f3ec', ink: '#1a1915', muted: '#645f55', red: '#8b1e2d', line: '#d8d0c2' };
export const mark = (x, y, size, id, opts = {}) => `<g transform="translate(${x} ${y}) scale(${size / 64})">${markSvg({ id, ink: COLORS.ink, ink2: '#625b50', accent: COLORS.red, accent2: '#5c1019', pivot: COLORS.paper, ...opts })}</g>`;
const clamp = (n) => Math.max(0, Math.min(1, n));
const smooth = (n) => { const p = clamp(n); return p * p * (3 - 2 * p); };
const at = (x, y, r, a) => `${(x + r * Math.cos(a)).toFixed(2)} ${(y + r * Math.sin(a)).toFixed(2)}`;

// Quick Look thumbnails are square. Keep the 1200×630 artwork centered in a
// square, then crop the raster (or the video encoder's input) without scaling.
export function socialSvg(time = null) {
  const isPoster = time === null;
  const t = isPoster ? 10 : time;
  const fadeIn = smooth(t / 0.8);
  const first = isPoster ? 0 : fadeIn * (1 - smooth((t - 2.8) / 0.65));
  const second = isPoster ? 0 : smooth((t - 3.05) / 0.55) * (1 - smooth((t - 5.2) / 0.65));
  const last = isPoster ? 1 : smooth((t - 5.45) / 0.8);
  const turn = isPoster ? 0 : -34 * (1 - smooth(t / 5.6));
  const orbit = isPoster ? 0 : 8 * Math.sin(t * Math.PI / 10);
  const cx = 992, cy = 286;
  const ticks = Array.from({ length: 72 }, (_, i) => {
    const a = i * Math.PI / 36;
    const major = i % 6 === 0;
    return `<path d="M ${at(cx, cy, major ? 188 : 193, a)} L ${at(cx, cy, 199, a)}" stroke="${major ? '#b8aa94' : '#d7cdbd'}" stroke-width="${major ? 1.5 : 1}"/>`;
  }).join('');
  const names = ['Relief', 'Repair', 'Prevention', 'Structure', 'Source'];
  const blues = ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281'];
  const depth = names.map((name, i) => `<rect x="${64 + i * 137}" y="491" width="129" height="5" fill="${blues[i]}"/><text x="${64 + i * 137}" y="521" class="sans" font-size="17" fill="${COLORS.muted}">${name}</text>`).join('');
  const nodes = ['Givers', 'Signals', 'Channels', 'The work', 'Outcomes'];
  const strip = nodes.map((name, i) => `<circle cx="${78 + i * 136}" cy="421" r="4" fill="${COLORS.paper}" stroke="${COLORS.red}" stroke-width="1.5"/><text x="${78 + i * 136}" y="450" class="sans" font-size="15" fill="${COLORS.muted}" text-anchor="middle">${name}</text>`).join('');
  // A single signal travels along the system and returns through its feedback
  // loop. Every frame is rendered directly; no flashing or rapid transitions.
  const phase = ((t - 0.7) / 6.7) % 1;
  const active = !isPoster && t > 0.7 && t < 7.4;
  const pulseX = phase < 0.73 ? 78 + 544 * phase / 0.73 : 622 - 544 * ((phase - 0.73) / 0.27);
  const pulseY = phase < 0.73 ? 421 : 470;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
<defs>
<style>@font-face{font-family:F;src:url(data:font/woff2;base64,${roman}) format('woff2');font-weight:100 900}@font-face{font-family:FI;src:url(data:font/woff2;base64,${italic}) format('woff2');font-weight:100 900;font-style:italic}.sans{font-family:Helvetica Neue,Helvetica,Arial,sans-serif}.serif{font-family:F,Georgia,serif}.italic{font-family:FI,Georgia,serif;font-style:italic}</style>
<radialGradient id="paper"><stop stop-color="#fffdf8"/><stop offset="1" stop-color="${COLORS.paper}"/></radialGradient>
<radialGradient id="halo"><stop stop-color="#eee2cf" stop-opacity=".45"/><stop offset="1" stop-color="#eee2cf" stop-opacity="0"/></radialGradient>
</defs>
<g transform="translate(0 285)">
<rect width="1200" height="630" fill="url(#paper)"/>
<rect x="24" y="24" width="1152" height="582" fill="none" stroke="${COLORS.line}"/>
<circle cx="${cx}" cy="${cy}" r="279" fill="url(#halo)"/>
<circle cx="${cx}" cy="${cy}" r="218" fill="none" stroke="#ddd3c3" stroke-width=".8"/>
<circle cx="${cx}" cy="${cy}" r="176" fill="none" stroke="#d5c9b5" stroke-width=".8"/>
<path d="M 756 ${cy} H 1200 M ${cx} 50 V 522" stroke="#d7cdbd" stroke-width=".8" stroke-dasharray="3 7"/>
<g transform="rotate(${orbit.toFixed(3)} ${cx} ${cy})">${ticks}</g>
<path d="M 1190 286 A 198 198 0 0 0 992 88" fill="none" stroke="${COLORS.red}" stroke-width="2" opacity=".64"/>
<circle cx="992" cy="88" r="3" fill="${COLORS.red}"/>
<g transform="rotate(${turn.toFixed(3)} ${cx} ${cy})">${mark(cx - 126, cy - 126, 252, 'og')}</g>
<text x="${cx}" y="551" class="sans" text-anchor="middle" font-size="14" letter-spacing="3" fill="${COLORS.red}">AIM WITH CARE.</text>
${mark(64, 56, 35, 'small', { simple: true })}
<text x="117" y="80" class="sans" font-size="16" font-weight="600" letter-spacing="3" fill="${COLORS.red}">CHARITY AS A SYSTEM</text>
<text x="58" y="222" class="serif" font-size="127" font-weight="600" letter-spacing="-4.5" fill="${COLORS.ink}">Charitology</text>
<g opacity="${first.toFixed(4)}"><text x="65" y="295" class="italic" font-size="42" fill="${COLORS.ink}">The generosity</text><text x="65" y="346" class="italic" font-size="42" fill="${COLORS.ink}">was never missing.</text></g>
<g opacity="${second.toFixed(4)}"><text x="65" y="325" class="italic" font-size="62" fill="${COLORS.red}">The aim was.</text></g>
<g opacity="${last.toFixed(4)}"><text x="65" y="295" class="italic" font-size="41" fill="${COLORS.ink}">The science of doing</text><text x="65" y="346" class="italic" font-size="41" fill="${COLORS.ink}">the most good.</text></g>
<path d="M 78 421 H 622" fill="none" stroke="#c7bbab" stroke-width="1.2"/>
<path d="M 622 427 V 470 H 78 V 427" fill="none" stroke="#c7bbab" stroke-width="1" stroke-dasharray="3 5"/>
${strip}
${active ? `<circle cx="${pulseX.toFixed(2)}" cy="${pulseY}" r="10" fill="${COLORS.red}" opacity=".09"/><circle cx="${pulseX.toFixed(2)}" cy="${pulseY}" r="3.2" fill="${COLORS.red}"/>` : ''}
${depth}
<path d="M 64 552 H 726" stroke="${COLORS.line}"/>
<text x="64" y="581" class="sans" font-size="14" letter-spacing="1.6" fill="${COLORS.muted}">EVERY LEVEL IS NEEDED.</text>
<text x="727" y="581" class="sans" text-anchor="end" font-size="17" fill="${COLORS.red}">charitology.org</text>
</g></svg>`;
}
