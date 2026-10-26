// The Charitology mark: a compass rose behind an open C, with the needle
// aiming out through the C's opening. The generosity was never missing; the
// aim was. Shared by the site (Mark.astro, Seal.astro) and the image script
// (scripts/make-images.mjs), so there is one source of truth for the geometry.
// Drawn on a 64×64 grid centered at (32, 32).

const C = 32;
const pt = (r, deg) => {
  const a = (deg * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
};
const f = ([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`;

/** A two-faced compass point from the center (or `tail`) out to radius `r`. */
function point(deg, r, halfWidth, light, dark, tail = 0) {
  const tip = pt(r, deg);
  const back = pt(tail, deg);
  const n = ((deg + 90) * Math.PI) / 180;
  const s1 = [C + halfWidth * Math.cos(n), C + halfWidth * Math.sin(n)];
  const s2 = [C - halfWidth * Math.cos(n), C - halfWidth * Math.sin(n)];
  return `<path d="M ${f(tip)} L ${f(s1)} L ${f(back)} Z" fill="${light}"/><path d="M ${f(tip)} L ${f(s2)} L ${f(back)} Z" fill="${dark}"/>`;
}

/**
 * Inner SVG markup for the mark. Colors can be hex values or CSS (var(), currentColor).
 * `id` must be unique on the page because the rose is masked to sit outside the C.
 * `simple` drops the rose for tiny sizes such as favicons.
 */
export function markSvg({
  id = 'mark',
  ink = 'currentColor',
  ink2 = 'currentColor',
  ink2Opacity = 0.68,
  accent = '#8b1e2d',
  accent2 = '#5c1019',
  pivot = '#f6f3ec',
  simple = false,
} = {}) {
  const dark = ink2 === ink && ink2Opacity < 1 ? ink : ink2;
  const shade = (svg) => (ink2 === ink && ink2Opacity < 1 ? svg.replace(/fill="([^"]+)"\/>$/, `fill="$1" fill-opacity="${ink2Opacity}"/>`) : svg);
  const rose = simple
    ? ''
    : `<mask id="${id}-m"><rect width="64" height="64" fill="#fff"/><circle cx="32" cy="32" r="23.6" fill="#000"/></mask><g mask="url(#${id}-m)">${[
        ...[-135, -45, 45, 135].map((d) => shade(point(d, 28.5, 7.2, ink, dark))),
        ...[-90, 90, 180].map((d) => shade(point(d, 31.5, 10.5, ink, dark))),
      ].join('')}</g>`;
  const gap = 44;
  const ringR = 18.4;
  const ring = `<path d="M ${f(pt(ringR, gap))} A ${ringR} ${ringR} 0 1 1 ${f(pt(ringR, -gap))}" fill="none" stroke="${ink}" stroke-width="${simple ? 8.6 : 7.4}"/>`;
  const needle = point(0, 31.5, simple ? 6.4 : 5.4, accent, accent2, -8.5);
  const pin = `<circle cx="32" cy="32" r="2.5" fill="${pivot}" stroke="${ink}" stroke-width="1.4"/>`;
  return rose + ring + needle + pin;
}
