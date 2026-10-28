import { charityNetworks } from './charity-networks.mjs';

export const networkGuides = Object.freeze([
  {
    id: 'founder-networks', kind: 'founder', label: 'Founders',
    title: 'Networks and programs for charity founders',
    description: 'Find founder support, incubation and social enterprise programs. Compare the audience, application route and limits before choosing.',
    intro: 'Starting an organization is one possible response to a problem. First ask whether an existing organization, community or partnership could do the work. If a new organization is warranted, these programs offer different kinds of founder support. Some serve charities; others include social enterprises or a narrower kind of intervention.',
    questions: ['Does the program support your legal model, country and stage?', 'Are you looking for peers, structured training, incubation or funding?', 'What selection process, participation commitment and current costs apply?', 'Can the program help you challenge the need for a new organization as well as launch one?'],
    closing: 'A place in a fellowship or accelerator does not establish the effectiveness of the proposed work. Keep the mission, assumptions, community feedback and evidence separate from the decision to launch. If you already have a team, make one shared record of who owns each next step.',
  },
  {
    id: 'leadership-networks', kind: 'leadership', label: 'Leaders and professional peers',
    title: 'Places to find charity leadership support',
    description: 'Explore chief executive associations, professional communities and selective leadership programs, with their different access requirements.',
    intro: 'An executive peer network, a professional association and a leadership placement program answer different needs. This guide keeps those differences visible. The entries below include charity-specific groups and broader professional organizations; check the stated audience before paying for membership or applying.',
    questions: ['Is membership for an individual leader, a profession or the whole organization?', 'Does the group serve your country and the role you actually hold?', 'Can you access the peer activity you need, or only a course or publication?', 'What confidentiality, accessibility, fees and time commitments should you clarify first?'],
    closing: 'Try to name the question you want help with: a difficult handover, a board relationship, fundraising follow-up or learning from a program. Membership alone does not resolve it. Bring a bounded example, respect the group’s rules and ask before sharing another organization’s experience.',
  },
  {
    id: 'sector-networks', kind: 'umbrella', label: 'Sector and local connections',
    title: 'Networks that connect and support charities',
    description: 'Find umbrella bodies, local support directories, civil society networks and nonprofit technology communities.',
    intro: 'The system around a charity matters: shared infrastructure, local relationships, representation and ways to exchange knowledge. These organizations work at different scales. Some welcome direct members, some connect national or local bodies, and some provide a route to a more appropriate support organization.',
    questions: ['Does this body work directly with charities like yours, or through member organizations?', 'Would a local association understand your setting better than a national network?', 'Are you seeking representation, practical support, technology access or peer learning?', 'What belongs in a public community, and what needs a private, permissioned conversation?'],
    closing: 'A network can be a place to ask how others handled a problem. It is not evidence that every answer is correct or that every organization has the same needs. Keep useful context and disagreement when turning advice into a local test. Share what you learn only with permission.',
  },
]);

const ids = new Set();
for (const entry of charityNetworks) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id) || ids.has(entry.id)) throw new Error('Invalid or duplicate network identifier');
  ids.add(entry.id);
  if (!networkGuides.some(g => g.kind === entry.kind) || entry.review !== 'draft') throw new Error(`Invalid network category/review: ${entry.id}`);
  for (const key of ['name', 'networkType', 'region', 'audience', 'summary', 'access', 'limits', 'checkedAt']) {
    if (typeof entry[key] !== 'string' || !entry[key].trim()) throw new Error(`Missing network ${key}: ${entry.id}`);
  }
  if (!Array.isArray(entry.helps) || !entry.helps.length || !Array.isArray(entry.sources) || entry.sources.length < 2) throw new Error(`Missing network evidence: ${entry.id}`);
  for (const value of [entry.officialUrl, entry.engagement.url, ...entry.sources.map(s => s.url)]) {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error(`Unsafe network URL: ${entry.id}`);
  }
  if (entry.sources.filter(s => s.readStatus === 'read').length < 2 || !entry.sources.every(s => s.title && s.supports && ['read','limited'].includes(s.readStatus) && Number.isFinite(Date.parse(s.accessedAt)))) throw new Error(`Incomplete source reading record: ${entry.id}`);
}
if (!charityNetworks.length || !networkGuides.every(g => charityNetworks.some(e => e.kind === g.kind))) throw new Error('Each network guide needs sourced entries');

export function guideForNetwork(entry) { return networkGuides.find(g => g.kind === entry.kind); }
export function entriesForGuide(guide) { return charityNetworks.filter(e => e.kind === guide.kind); }
