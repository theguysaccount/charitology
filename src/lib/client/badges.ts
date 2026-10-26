// Depth and evidence badges built in the browser, matching src/components/Badges.astro
// so tools label things exactly the way the rest of the site does.

import { DEPTH, GRADE } from '../labels';
import { h } from './dom';

export type Grade = keyof typeof GRADE;

/** Source depth as five cells colored with --depth-N plus the level's name, so meaning never rests on color. */
export function depthBadge(level: number): HTMLElement {
  const d = DEPTH.find((x) => x.level === level);
  if (!d) return h('span', { class: 'badge' }, 'Depth unknown');
  return h(
    'span',
    { class: 'badge', title: `Source depth ${d.level} of 4: ${d.verb}` },
    h(
      'span',
      { class: 'depth' },
      h(
        'span',
        { class: 'cells', 'aria-hidden': 'true' },
        [0, 1, 2, 3, 4].map((i) => h('span', { class: i <= d.level ? `cell on d${i}` : 'cell' })),
      ),
      h('span', { class: 'visually-hidden' }, `Source depth ${d.level} of 4: `),
      d.name,
    ),
  );
}

export function gradeBadge(grade: string): HTMLElement {
  const g = GRADE[grade as Grade];
  return h('span', { class: 'badge', title: g?.note ?? '' }, g?.label ?? 'Evidence unknown');
}

export const depthInfo = (level: number) => DEPTH.find((x) => x.level === level);
export const gradeInfo = (grade: string) => GRADE[grade as Grade];
