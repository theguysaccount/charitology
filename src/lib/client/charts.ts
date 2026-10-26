// Charts for the model tools. One series wears one color (--series-1), text
// wears ink tokens, gridlines are solid hairlines, and every mark has a hover
// and keyboard tooltip. The histogram is drawn at the container's own pixel
// width, so its labels stay readable on a phone. Values a tooltip shows are
// also available as direct labels or in a table, so tooltips never gate.

import { clear, h } from './dom';
import { niceStep, niceTicks } from './montecarlo';

const NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, text?: string): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text != null) node.textContent = text;
  return node;
}

/** One tooltip per chart. It wraps on narrow screens and is kept inside its container. */
function makeTip(container: HTMLElement) {
  const tip = h('div', { class: 'chart-tip', role: 'tooltip', hidden: true });
  tip.style.whiteSpace = 'normal';
  tip.style.width = 'max-content';
  tip.style.maxWidth = 'min(280px, 100%)';
  container.append(tip);
  return {
    show(text: string, x: number, y: number) {
      tip.textContent = text;
      tip.hidden = false;
      const half = tip.offsetWidth / 2;
      const w = container.clientWidth;
      tip.style.left = `${Math.min(Math.max(x, half), Math.max(half, w - half))}px`;
      tip.style.top = `${y}px`;
    },
    hide() {
      tip.hidden = true;
    },
  };
}

function decimalsOf(step: number): number {
  const s = step.toFixed(10).replace(/0+$/, '');
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : Math.min(6, s.length - dot - 1);
}

const pctTick = (share: number, step: number) => `${(share * 100).toFixed(decimalsOf(step * 100))}%`;

/** Rough text width for 12px sans, used to keep labels inside the frame. */
const textWidth = (s: string) => s.length * 6.7;

function fit(s: string, width: number): string {
  const max = Math.floor(width / 6.7);
  return s.length <= max ? s : `${s.slice(0, Math.max(1, max - 1))}…`;
}

/** A column with a 4px rounded data end and a square foot on the baseline. */
function column(x: number, y: number, w: number, hgt: number, r = 4): string {
  const rr = Math.min(r, w / 2, hgt);
  return `M${x},${y + hgt}V${y + rr}A${rr},${rr} 0 0 1 ${x + rr},${y}H${x + w - rr}A${rr},${rr} 0 0 1 ${x + w},${y + rr}V${y + hgt}Z`;
}

// ---------- Histogram ----------

export interface HistBar {
  x0: number;
  x1: number;
  count: number;
}

export interface HistogramOptions {
  /** Total draws, so bar heights are shares of all draws. */
  total: number;
  /** Accessible description of the whole chart. */
  label: string;
  xTitle: string;
  yTitle?: string;
  tick: (value: number, step: number) => string;
  tip: (bar: HistBar, share: number) => string;
  /** A labeled reference line, such as the median. */
  marker?: { value: number; label: string };
  /** Direct label for the tallest bar. Defaults to its share of draws, like 15.2%. */
  peakLabel?: (bar: HistBar, share: number) => string;
}

interface Hit {
  cx: number;
  top: number;
  text: string;
  mark?: SVGPathElement;
}

interface HistState {
  bars: HistBar[];
  opts: HistogramOptions;
  width: number;
  focus: number;
  hits: Hit[];
  tip?: ReturnType<typeof makeTip>;
  live?: HTMLElement;
}

const hists = new WeakMap<HTMLElement, HistState>();
let watcher: ResizeObserver | undefined;

function highlight(st: HistState, i: number, announce = false) {
  const hit = st.hits[i];
  if (!hit) return;
  st.hits.forEach((x, j) => x.mark?.style.setProperty('opacity', j === i ? '0.7' : '1'));
  st.focus = i;
  st.tip?.show(hit.text, hit.cx, hit.top);
  if (announce && st.live) st.live.textContent = hit.text;
}

function unhighlight(st: HistState) {
  st.hits.forEach((x) => x.mark?.style.setProperty('opacity', '1'));
  st.tip?.hide();
}

function drawHistogram(container: HTMLElement, st: HistState) {
  const { bars, opts } = st;
  clear(container);
  container.style.position = 'relative';
  container.setAttribute('aria-label', `${opts.label} Use the left and right arrow keys to read each bar.`);
  st.width = container.clientWidth;
  st.hits = [];
  if (!bars.length) {
    container.append(h('p', { class: 'empty' }, 'Nothing to chart yet.'));
    return;
  }

  const width = Math.max(240, Math.round(container.clientWidth || 640));
  const height = 272;
  const m = { top: 42, right: 16, bottom: 50, left: 46 };
  const pw = width - m.left - m.right;
  const ph = height - m.top - m.bottom;
  const baseY = m.top + ph;

  const maxShare = Math.max(...bars.map((b) => b.count)) / opts.total;
  const yStep = niceStep((maxShare || 1) / 4);
  // Leave headroom above the tallest bar for its direct label.
  const yTop = Math.max(yStep, Math.ceil((maxShare * 1.14) / yStep - 1e-9) * yStep);
  const ys = (share: number) => baseY - (share / yTop) * ph;

  let x0 = bars[0].x0;
  let x1 = bars[bars.length - 1].x1;
  if (!(x1 > x0)) {
    const pad = Math.abs(x0) * 0.1 || 1;
    x0 -= pad;
    x1 += pad;
  }
  const xs = (v: number) => m.left + ((v - x0) / (x1 - x0)) * pw;

  const root = el('svg', { width, height, viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true', focusable: 'false' });
  root.style.display = 'block';
  root.style.fontSize = '12px';
  root.style.fontFamily = 'var(--font-sans)';

  root.append(el('text', { x: 0, y: 14, style: 'fill: var(--ink-3)' }, fit(opts.yTitle ?? 'Share of draws', width)));
  for (let v = yStep; v <= yTop + yStep * 1e-9; v += yStep) {
    const y = Math.round(ys(v)) + 0.5;
    root.append(el('line', { x1: m.left, x2: m.left + pw, y1: y, y2: y, style: 'stroke: var(--grid); stroke-width: 1' }));
  }
  for (let v = 0; v <= yTop + yStep * 1e-9; v += yStep) {
    root.append(
      el('text', { x: m.left - 8, y: ys(v), 'text-anchor': 'end', 'dominant-baseline': 'middle', style: 'fill: var(--ink-3); font-variant-numeric: tabular-nums' }, pctTick(v, yStep)),
    );
  }

  bars.forEach((b, i) => {
    const left = xs(b.x0);
    const right = xs(b.x1);
    const span = right - left;
    const bw = span > 0 ? Math.max(1, Math.min(24, span - 2)) : 24;
    const cx = span > 0 ? (left + right) / 2 : xs(b.x0);
    const share = b.count / opts.total;
    const hgt = b.count > 0 ? Math.max(1, baseY - ys(share)) : 0;
    const top = baseY - hgt;
    const g = el('g');
    let mark: SVGPathElement | undefined;
    if (hgt > 0) {
      mark = el('path', { d: column(cx - bw / 2, top, bw, hgt), style: 'fill: var(--series-1); transition: opacity 0.12s' });
      g.append(mark);
    }
    const hitW = span > 0 ? span : 28;
    const hit = el('rect', { x: cx - hitW / 2, y: m.top, width: hitW, height: ph, style: 'fill: transparent' });
    hit.addEventListener('pointerenter', () => highlight(st, i));
    // A finger lifting off fires pointerleave at once; keep the tip until the next touch.
    hit.addEventListener('pointerleave', (e) => e.pointerType !== 'touch' && unhighlight(st));
    g.append(hit);
    root.append(g);
    st.hits.push({ cx, top, text: opts.tip(b, share), mark });
  });

  root.append(el('line', { x1: m.left, x2: m.left + pw, y1: baseY + 0.5, y2: baseY + 0.5, style: 'stroke: var(--axis); stroke-width: 1' }));

  const xTicks = niceTicks(x0, x1, Math.max(4, Math.floor(pw / 56)));
  const xStep = xTicks.length > 1 ? xTicks[1] - xTicks[0] : x1 - x0;
  for (const t of xTicks) {
    const x = xs(t);
    const label = opts.tick(t, xStep);
    const half = textWidth(label) / 2;
    const anchor = x - half < 0 ? 'start' : x + half > width ? 'end' : 'middle';
    root.append(el('line', { x1: x, x2: x, y1: baseY, y2: baseY + 5, style: 'stroke: var(--axis); stroke-width: 1' }));
    root.append(el('text', { x, y: baseY + 19, 'text-anchor': anchor, style: 'fill: var(--ink-3); font-variant-numeric: tabular-nums' }, label));
  }
  root.append(el('text', { x: m.left + pw / 2, y: height - 6, 'text-anchor': 'middle', style: 'fill: var(--ink-2)' }, fit(opts.xTitle, width)));

  if (opts.marker && Number.isFinite(opts.marker.value)) {
    const x = xs(Math.min(x1, Math.max(x0, opts.marker.value)));
    const half = textWidth(opts.marker.label) / 2;
    const anchor = x - half < 0 ? 'start' : x + half > width ? 'end' : 'middle';
    root.append(el('line', { x1: x, x2: x, y1: m.top - 8, y2: baseY, style: 'stroke: var(--ink); stroke-width: 1.5' }));
    root.append(el('text', { x, y: m.top - 14, 'text-anchor': anchor, style: 'fill: var(--ink); font-weight: 650' }, opts.marker.label));
  }

  // One direct label, on the tallest bar. A surface-colored halo keeps it legible over the marker line.
  const peak = st.hits.reduce((best, hit, i) => (bars[i].count > bars[best].count ? i : best), 0);
  if (bars[peak]?.count) {
    const label = (opts.peakLabel ?? ((_: HistBar, share: number) => pctTick(share, 0.001)))(bars[peak], bars[peak].count / opts.total);
    root.append(
      el(
        'text',
        {
          x: st.hits[peak].cx,
          y: st.hits[peak].top - 6,
          'text-anchor': 'middle',
          style: 'fill: var(--ink); font-weight: 600; font-variant-numeric: tabular-nums; paint-order: stroke; stroke: var(--surface); stroke-width: 3px; stroke-linejoin: round',
        },
        label,
      ),
    );
  }

  container.append(root);
  st.tip = makeTip(container);
  st.live = h('span', { class: 'visually-hidden', 'aria-live': 'polite' });
  container.append(st.live);
  if (st.focus >= st.hits.length) st.focus = -1;
}

function startIndex(st: HistState): number {
  const v = st.opts.marker?.value;
  if (v != null && Number.isFinite(v)) {
    const i = st.bars.findIndex((b) => v >= b.x0 && v <= b.x1);
    if (i >= 0) return i;
  }
  let best = 0;
  st.bars.forEach((b, i) => (b.count > st.bars[best].count ? (best = i) : 0));
  return best;
}

/** Draw a single-series histogram as SVG. Call again with new bars to update it. */
export function renderHistogram(container: HTMLElement, bars: HistBar[], opts: HistogramOptions): void {
  const fresh = !hists.has(container);
  const st: HistState = { bars, opts, width: 0, focus: -1, hits: [] };
  hists.set(container, st);
  if (fresh) {
    container.tabIndex = 0;
    container.setAttribute('role', 'group');
    container.addEventListener('focus', () => {
      const s = hists.get(container);
      if (s?.hits.length) highlight(s, s.focus >= 0 ? s.focus : startIndex(s), true);
    });
    container.addEventListener('blur', () => {
      const s = hists.get(container);
      if (s) unhighlight(s);
    });
    container.addEventListener('keydown', (e) => {
      const s = hists.get(container);
      if (!s?.hits.length) return;
      let i = s.focus >= 0 ? s.focus : startIndex(s);
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') i = Math.min(s.hits.length - 1, i + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') i = Math.max(0, i - 1);
      else if (e.key === 'Home') i = 0;
      else if (e.key === 'End') i = s.hits.length - 1;
      else if (e.key === 'Escape') return unhighlight(s);
      else return;
      e.preventDefault();
      highlight(s, i, true);
    });
    if (typeof ResizeObserver !== 'undefined') {
      watcher ??= new ResizeObserver((entries) => {
        for (const entry of entries) {
          const target = entry.target as HTMLElement;
          const s = hists.get(target);
          if (s && target.clientWidth > 0 && Math.abs(target.clientWidth - s.width) > 2) drawHistogram(target, s);
        }
      });
      watcher.observe(container);
    }
  }
  drawHistogram(container, st);
}

// ---------- Range bars ----------

export interface RangeRow {
  label: string;
  lo: number;
  /** Infinity draws the bar to the right edge: "no outcome" at that end. */
  hi: number;
  /** Direct label at the end of the row. */
  display: string;
  tip: string;
}

/**
 * Horizontal bars that each span a range on one shared scale, with an optional
 * reference line through every row. Used for one-at-a-time sensitivity.
 */
export function renderRangeBars(
  container: HTMLElement,
  rows: RangeRow[],
  opts: { label: string; tick: (value: number, step: number) => string; base?: number },
): void {
  clear(container);
  container.classList.add('rbars');
  container.setAttribute('role', 'list');
  container.setAttribute('aria-label', opts.label);
  container.style.position = 'relative';

  const values = rows.flatMap((r) => [r.lo, r.hi]);
  if (opts.base != null) values.push(opts.base);
  const finite = values.filter(Number.isFinite);
  let min = finite.length ? Math.min(...finite) : 0;
  let max = finite.length ? Math.max(...finite) : 1;
  if (!(max > min)) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const step = niceStep((max - min) / 4);
  const d0 = Math.floor(min / step + 1e-9) * step;
  const d1 = Math.max(d0 + step, Math.ceil(max / step - 1e-9) * step);
  const pos = (v: number) => (Number.isFinite(v) ? ((v - d0) / (d1 - d0)) * 100 : 100);
  const tip = makeTip(container);

  for (const r of rows) {
    const a = pos(r.lo);
    const b = pos(r.hi);
    const fill = h('span', { class: 'rb-fill' });
    fill.style.left = `${a}%`;
    fill.style.width = `${Math.max(0, b - a)}%`;
    const track = h('div', { class: 'rb-track' });
    if (opts.base != null && Number.isFinite(opts.base)) {
      const line = h('span', { class: 'rb-base' });
      line.style.left = `${pos(opts.base)}%`;
      track.append(line);
    }
    track.append(fill);
    const row = h(
      'div',
      { class: 'rb-row', role: 'listitem', tabindex: 0, 'aria-label': `${r.label}: ${r.display}` },
      h('span', { class: 'rb-label' }, r.label),
      track,
      h('span', { class: 'rb-value' }, r.display),
    );
    const show = () => {
      const box = fill.getBoundingClientRect();
      const host = container.getBoundingClientRect();
      tip.show(r.tip, box.left - host.left + box.width / 2, box.top - host.top);
    };
    row.addEventListener('pointerenter', show);
    row.addEventListener('focus', show);
    row.addEventListener('pointerleave', (e) => e.pointerType !== 'touch' && tip.hide());
    row.addEventListener('blur', tip.hide);
    container.append(row);
  }

  const ticks = h('div', { class: 'rb-ticks' });
  for (let v = d0; v <= d1 + step * 1e-9; v += step) {
    const t = h('span', {}, opts.tick(Number(v.toPrecision(12)), step));
    t.style.left = `${pos(v)}%`;
    ticks.append(t);
  }
  container.append(h('div', { class: 'rb-axis', 'aria-hidden': 'true' }, h('span'), ticks, h('span')));
}
