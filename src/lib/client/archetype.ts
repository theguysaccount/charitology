// Giving archetypes for Charitology Wrapped, read from a year's depth mix.
// Depth describes where gifts act. It never grades them, so every archetype
// is a strength, and each comes with a next frontier rather than a verdict.

export interface Archetype {
  id: string;
  name: string;
  line: string;
  frontier: string;
}

export const ARCHETYPES: Record<string, Archetype> = {
  unclassified: {
    id: 'unclassified',
    name: 'Still to describe',
    line: 'Some gifts do not yet have a depth description. They still count in your giving.',
    frontier: 'Keep unknowns visible. Add a description when you have evidence about the work.',
  },
  relief: {
    id: 'relief',
    name: 'The First Responder',
    line: 'You show up when the need is now. Your giving means someone eats, sleeps safe or gets care today.',
    frontier: 'Add one gift that prevents the need you care about most, so the line is shorter next year.',
  },
  repair: {
    id: 'repair',
    name: 'The Rebuilder',
    line: 'You help people get back what they lost: a home, their health, their work.',
    frontier: 'Add a gift that stops the same harm from reaching the next family.',
  },
  prevention: {
    id: 'prevention',
    name: 'The Protector',
    line: 'You stop harm before it starts, so people never need rescuing.',
    frontier: 'Look one step upstream, to the people changing the rules that create the risk.',
  },
  structure: {
    id: 'structure',
    name: 'The Architect',
    line: 'You fund new rules: the laws, institutions and norms that stop a harm being produced.',
    frontier: 'Ask the people closest to the problem how the new rules land, and keep one gift for today’s need.',
  },
  source: {
    id: 'source',
    name: 'The Root-Seeker',
    line: 'You go upstream of everything, to the stories and incentives that feed many problems at once.',
    frontier: 'Source work is slow to show. Ask each organization how it will know it’s working.',
  },
  balance: {
    id: 'balance',
    name: 'The Balancer',
    line: 'You give along the whole chain, from today’s need to its source. Every level is needed.',
    frontier: 'Make the mix deliberate: choose the share you want at each level next year, then compare.',
  },
};

const BY_LEVEL = ['relief', 'repair', 'prevention', 'structure', 'source'];

/** The leading level names the archetype if it carries 40% or more and leads by 5 points; otherwise the Balancer. */
export function archetypeFor(shares: number[]): Archetype {
  const ranked = shares.map((share, level) => ({ share, level })).sort((a, b) => b.share - a.share);
  const [first, second] = ranked;
  if (!first || !(first.share > 0)) return ARCHETYPES.balance;
  if (first.share < 0.4 || (second && first.share - second.share < 0.05)) return ARCHETYPES.balance;
  return ARCHETYPES[BY_LEVEL[first.level]] ?? ARCHETYPES.balance;
}
