import { defineCollection, reference, z } from 'astro:content';
import { file, glob } from 'astro/loaders';
import causesData from './data/causes.json';

// Every collection is validated here. A pull request with a missing field,
// a misspelled status or a link to a condition that doesn't exist fails the build.

const status = z.enum(['live', 'seeded', 'designed', 'partners']);
const evidence = z.enum(['established', 'documented', 'debated', 'hypothesis']);
const review = z.enum(['draft', 'reviewed']).default('draft');
const depth = z.number().int().min(0).max(4);

const source = z.object({
  title: z.string(),
  url: z.string().url(),
  publisher: z.string().optional(),
  year: z.union([z.number(), z.string()]).optional(),
  note: z.string().optional(),
});
const sources = z.array(source).default([]);
const conditions = z.array(reference('conditions')).default([]);
/** Cause ids must exist in src/data/causes.json. */
const causeId = z.enum(causesData.causes.map((c) => c.id) as [string, ...string[]]);

const md = (dir: string) => glob({ pattern: '**/[^_]*.md', base: `./src/content/${dir}` });

const catalog = (groups: [string, ...string[]]) =>
  z.object({
    title: z.string(),
    group: z.enum(groups),
    order: z.number(),
    summary: z.string(),
    status,
    statusNote: z.string().optional(),
    conditions,
    firstMilestone: z.string().optional(),
    help: z.array(z.string()).default([]),
    related: z.array(z.string()).default([]),
    sources,
    review,
  });

/** The Diagnosis: the conditions of the charity system. */
const conditionsCollection = defineCollection({
  loader: md('conditions'),
  schema: z.object({
    title: z.string(),
    number: z.number().int().positive(),
    summary: z.string(),
    evidence,
    node: z.enum(['givers', 'signals', 'channels', 'work', 'outcomes', 'feedback', 'field']),
    upstream: z.enum(['story', 'coordination', 'vision', 'attention', 'status', 'gatekeepers']).optional(),
    flip: z.string(),
    sources,
    review,
  }),
});

const programs = defineCollection({
  loader: md('programs'),
  schema: catalog(['Research', 'Funding', 'People and education', 'Reach']),
});

const tools = defineCollection({
  loader: md('tools'),
  schema: catalog(['For donors', 'For nonprofits and funders', 'For everyone']),
});

const record = defineCollection({
  loader: md('record'),
  schema: catalog(['Flagship references', 'Annual publications', 'Research archives', 'Thought and teaching']),
});

/** The Open Problems of Charitology. */
const problems = defineCollection({
  loader: md('problems'),
  schema: z.object({
    title: z.string(),
    number: z.number().int().positive(),
    statement: z.string(),
    progress: z.string(),
    conditions,
    status: z.enum(['open', 'partial', 'solved']).default('open'),
    bounty: z.string().optional(),
    sources,
    review,
  }),
});

const encyclopedia = defineCollection({
  loader: md('encyclopedia'),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    aliases: z.array(z.string()).default([]),
    conditions,
    related: z.array(z.string()).default([]),
    sources,
    review,
  }),
});

const interventions = defineCollection({
  loader: md('interventions'),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    depth,
    evidence: z.enum(['strong', 'moderate', 'mixed', 'weak', 'unknown']),
    mechanism: z.string(),
    causes: z.array(causeId).min(1),
    timeToEffect: z.enum(['immediate', 'months', 'years', 'decades', 'unknown']),
    durability: z.enum(['while funded', 'years', 'generations', 'permanent', 'unknown']),
    feedback: z.enum(['strong', 'some', 'weak', 'unknown']),
    agency: z.enum(['community-led', 'co-designed', 'top-down', 'unknown']),
    cost: z
      .object({
        outcome: z.string(),
        low: z.number().positive(),
        high: z.number().positive(),
        asOf: z.string(),
        source,
        note: z.string().optional(),
      })
      .optional(),
    conditions,
    sources: z.array(source).min(1),
    review,
  }),
});

/** History: what worked, what failed, and what was mixed. */
const cases = defineCollection({
  loader: md('cases'),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    kind: z.enum(['success', 'failure', 'mixed']),
    era: z.string(),
    place: z.string(),
    depth,
    lessons: z.array(z.string()).min(1),
    conditions,
    sources: z.array(source).min(1),
    review,
  }),
});

const traditions = defineCollection({
  loader: md('traditions'),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    tradition: z.string(),
    origin: z.string(),
    practice: z.string(),
    lens: z.string(),
    sources: z.array(source).min(1),
    review,
  }),
});

const myths = defineCollection({
  loader: md('myths'),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    verdict: z.enum(['false', 'misleading', 'half-true']),
    conditions,
    sources: z.array(source).min(1),
    review,
  }),
});

const disagreements = defineCollection({
  loader: md('disagreements'),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    status: z.enum(['open', 'narrowing', 'settled']),
    positions: z.array(z.object({ name: z.string(), claim: z.string() })).min(2),
    cruxes: z.array(z.string()).min(1),
    conditions,
    sources: z.array(source).min(1),
    review,
  }),
});

/** Principles of Charitology: the founding textbook, one chapter per file. */
const principles = defineCollection({
  loader: md('principles'),
  schema: z.object({
    title: z.string(),
    chapter: z.number().int().nonnegative(),
    summary: z.string(),
    sources,
    review,
  }),
});

const journal = defineCollection({
  loader: md('journal'),
  schema: z.object({
    title: z.string(),
    author: z.string(),
    date: z.coerce.date(),
    summary: z.string(),
    volume: z.number().int().nonnegative(),
    issue: z.number().int().positive(),
    review,
  }),
});

/** Forecast questions. Forecasts are added by pull request and scored when a question resolves. */
const forecasts = defineCollection({
  loader: md('forecasts'),
  schema: z.object({
    title: z.string(),
    question: z.string(),
    resolution: z.string(),
    closes: z.coerce.date(),
    outcome: z.boolean().nullable().default(null),
    resolvedOn: z.coerce.date().optional(),
    conditions,
    forecasts: z
      .array(
        z.object({
          by: z.string(),
          p: z.number().min(0).max(1),
          date: z.coerce.date(),
          rationale: z.string().optional(),
        }),
      )
      .default([]),
    sources,
    review,
  }),
});

/** The Global Charity Index: Charitology's depth layer on top of the public registries. */
const charities = defineCollection({
  loader: md('charities'),
  schema: z.object({
    name: z.string(),
    website: z.string().url(),
    summary: z.string(),
    depth,
    causes: z.array(causeId).min(1),
    interventions: z.array(reference('interventions')).default([]),
    note: z.string().optional(),
    sources,
    review,
  }),
});

const lexicon = defineCollection({
  loader: file('src/data/lexicon.json'),
  schema: z.object({
    term: z.string(),
    definition: z.string(),
    see: z.array(z.string()).default([]),
  }),
});

export const collections = {
  conditions: conditionsCollection,
  programs,
  tools,
  record,
  problems,
  encyclopedia,
  interventions,
  cases,
  traditions,
  myths,
  disagreements,
  principles,
  journal,
  forecasts,
  charities,
  lexicon,
};
