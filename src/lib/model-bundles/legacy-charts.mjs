import { displayTicks, formatMoneyTick } from './legacy-display.mjs';
const SVG = 'http://www.w3.org/2000/svg';
const node = (tag, text = '') => { const element = document.createElement(tag); element.textContent = text; return element; };
const svgNode = (tag, attributes, text = '') => {
  const element = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  element.textContent = text; return element;
};
const failure = text => { const element = node('p', text); element.className = 'note'; return element; };
const chartFailure = 'The chart cannot represent this numerical range safely. The calculated numbers and CSV remain available.';

/** Build off-DOM: no old chart axis, floating loop, observer or partial result. */
export function buildLegacyHistogram(plan, options) {
  const wrapper = node('div'); wrapper.className = 'mb-legacy-chart';
  if (plan.kind !== 'available') {
    wrapper.append(failure(plan.reason === 'no-finite-cost-draws' ? 'There are no finite-cost draws to chart. The calculated numbers and CSV remain available.' : chartFailure));
    return wrapper;
  }
  try {
    const bins = plan.bins;
    if (!Array.isArray(bins) || !bins.length || bins.length > 128 || options.total !== 5000) throw new Error();
    let min = bins[0].x0, max = bins[bins.length - 1].x1;
    if (min === max) { const pad = Math.abs(min) * 0.1; if (!(pad > 0)) throw new Error(); min -= pad; max += pad; }
    const span = max - min, ticks = displayTicks(min, max, 5);
    if (!Number.isFinite(min) || !Number.isFinite(max) || !(span > 0) || !Number.isFinite(span) || ticks.kind !== 'available') throw new Error();
    const x = value => 58 + (value - min) / span * 636;
    const largest = Math.max(...bins.map(bin => bin.count));
    if (!Number.isSafeInteger(largest) || largest < 0 || largest > 5000) throw new Error();
    const svg = svgNode('svg', { viewBox: '0 0 720 270', width: '100%', role: 'img', 'aria-label': options.label });
    svg.append(svgNode('line', { x1: 58, x2: 694, y1: 220, y2: 220, stroke: 'currentColor' }));
    const marks = [];
    for (const bin of bins) {
      if (![bin.x0, bin.x1].every(Number.isFinite) || bin.x0 > bin.x1 || !Number.isSafeInteger(bin.count) || bin.count < 0 || bin.count > 5000) throw new Error();
      const left = x(bin.x0), right = x(bin.x1), height = largest ? bin.count / largest * 180 : 0;
      if (![left, right, height].every(Number.isFinite) || left < 57 || right > 695) throw new Error();
      const bar = svgNode('rect', { x: left, y: 220 - height, width: Math.max(1, right - left - 1), height, fill: 'currentColor', opacity: 0.65 });
      bar.append(svgNode('title', {}, options.tip(bin, bin.count / 5000))); svg.append(bar); marks.push(bar);
    }
    for (const tick of ticks.ticks) svg.append(svgNode('text', { x: x(tick), y: 242, 'text-anchor': 'middle', fill: 'currentColor', 'font-size': 11 }, formatMoneyTick(tick, ticks.step)));
    svg.append(svgNode('text', { x: 376, y: 264, 'text-anchor': 'middle', fill: 'currentColor', 'font-size': 12 }, options.xTitle));
    const live = node('p', 'Use the left and right arrow keys to read each bar. The complete bin counts also appear in the table.');
    live.className = 'note'; live.setAttribute('aria-live', 'polite');
    wrapper.tabIndex = 0; wrapper.setAttribute('role', 'group'); wrapper.setAttribute('aria-label', options.label);
    let index = -1;
    wrapper.addEventListener('keydown', event => {
      let next = index;
      if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(bins.length - 1, index + 1);
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(0, index - 1);
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = bins.length - 1;
      else return;
      event.preventDefault(); index = next;
      marks.forEach((mark, i) => mark.setAttribute('opacity', i === index ? '1' : '0.65'));
      live.textContent = options.tip(bins[index], bins[index].count / 5000);
    });
    wrapper.append(svg, live);
  } catch { wrapper.replaceChildren(failure(chartFailure)); }
  return wrapper;
}

export function buildLegacySensitivity(domain, rows, label) {
  const wrapper = node('div'); wrapper.className = 'mb-legacy-sensitivity';
  wrapper.setAttribute('role', 'list'); wrapper.setAttribute('aria-label', label);
  if (domain.kind !== 'available') wrapper.append(failure(chartFailure));
  for (const row of rows.slice(0, 6)) {
    const item = node('div'); item.className = 'mb-legacy-range';
    item.setAttribute('role', 'listitem'); item.tabIndex = 0; item.setAttribute('aria-label', row.tip);
    item.append(node('strong', row.label), node('span', row.display));
    if (domain.kind === 'available') {
      const span = domain.max - domain.min, a = (row.lo - domain.min) / span * 100, b = (row.hi - domain.min) / span * 100;
      if (Number.isFinite(a) && Number.isFinite(b) && a >= 0 && b <= 100 && b >= a) {
        const track = node('div'); track.className = 'mb-legacy-track'; track.setAttribute('aria-hidden', 'true');
        const bar = node('span'); bar.style.left = `${a}%`; bar.style.width = `${Math.max(0, b - a)}%`; track.append(bar); item.append(track);
      }
    }
    item.append(node('span', row.tip)); wrapper.append(item);
  }
  if (domain.kind === 'available') {
    const axis = node('p', domain.ticks.map(value => formatMoneyTick(value, domain.step)).join(' · ')); axis.className = 'note'; wrapper.append(axis);
  }
  return wrapper;
}
