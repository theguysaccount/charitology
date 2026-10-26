// Horizontal bar list with direct value labels and a hover tooltip.
// Bars share one baseline and one scale; colors come from CSS tokens
// (--series-N for identity, --depth-N for source depth), never from text.

import { clear, h } from './dom';

export interface BarRow {
  label: string;
  value: number;
  display?: string;
  color?: string;
  note?: string;
}

export function renderBars(container: HTMLElement, rows: BarRow[], opts: { max?: number; ariaLabel?: string } = {}): void {
  clear(container);
  container.classList.add('bars');
  if (opts.ariaLabel) container.setAttribute('aria-label', opts.ariaLabel);
  container.setAttribute('role', 'list');
  const max = opts.max ?? Math.max(...rows.map((r) => r.value), 0);
  const tip = h('div', { class: 'chart-tip', role: 'tooltip', hidden: true });
  container.style.position = 'relative';
  for (const row of rows) {
    const width = max > 0 ? Math.max(0, (row.value / max) * 100) : 0;
    const fill = h('div', { class: 'bar-fill' });
    fill.style.width = `${width}%`;
    if (row.color) fill.style.background = row.color;
    const el = h(
      'div',
      { class: 'bar-row', role: 'listitem', tabindex: 0, 'aria-label': `${row.label}: ${row.display ?? row.value}` },
      h('span', { class: 'bar-label', title: row.label }, row.label),
      h('div', { class: 'bar-track' }, fill),
      h('span', { class: 'bar-value' }, row.display ?? String(row.value)),
    );
    const show = () => {
      tip.textContent = [row.label, row.display ?? String(row.value), row.note].filter(Boolean).join(' · ');
      tip.hidden = false;
      const box = el.getBoundingClientRect();
      const host = container.getBoundingClientRect();
      tip.style.left = `${box.left - host.left + box.width / 2}px`;
      tip.style.top = `${box.top - host.top}px`;
    };
    el.addEventListener('pointerenter', show);
    el.addEventListener('focus', show);
    el.addEventListener('pointerleave', () => (tip.hidden = true));
    el.addEventListener('blur', () => (tip.hidden = true));
    container.append(el);
  }
  container.append(tip);
}
