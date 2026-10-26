# Charitology

**The science of doing the most good.** An open field that studies charity as a system: where generosity flows, why it flows there, and how to route it from the symptoms of the world’s problems to their sources.

Giving USA estimates that [U.S. charitable giving reached $617.2 billion in 2025](https://givingusa.org/giving-usa-charitable-giving-rose-to-617-20-billion-in-2025-surpassing-the-600-billion-mark-for-the-first-time/). Charitology proposes a shared craft for studying the signals, channels, incentives and feedback that aim generosity. It connects existing work in philanthropy, ethics and evaluation across causes and moral frameworks. Its own causal claims remain hypotheses to test.

## What’s here

|                                                |                                                                                                                                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[The Diagnosis](src/content/conditions/)**   | Fifteen conditions of the charity system, each labeled established, documented, debated or hypothesis. No judgment of the good being done; the system is the subject.                             |
| **[The Method](src/pages/method.astro)**       | Nine instruments a charitologist uses, from the five-level depth scale (relief → repair → prevention → structure → source) to the Giver’s Checklist.                                              |
| **[The Open Problems](src/content/problems/)** | Twenty-three unanswered questions, Hilbert-style, each with a test for what counts as progress.                                                                                                   |
| **[Programs](src/content/programs/)**          | 26 programs: 17 have working browser functions, while 9 need institutional partners. Each page states its exact scope.                                                                            |
| **[Tools](src/content/tools/)**                | 20 free tools that run in the browser, including Charity OS: Values Compass, Portfolio Builder, Impact Calculator, Cost-Effectiveness Model Kit, Giving Dashboard, Forecasting Platform and more. |
| **[The Record](src/content/record/)**          | 21 information bases: Encyclopedia, Intervention Database, Cause Atlas, Gap Map, Failure Archive, Disagreement Register, Principles textbook, Lexicon and more.                                   |
| **[Public API](src/lib/api.ts)**               | 29 datasets as static JSON at `/api/v1/*.json`, CC BY 4.0.                                                                                                                                        |
| **[Browser extension](extension/)**            | The Giver’s Checklist on supported donation pages, without analytics or background data transmission.                                                                                             |

Every page follows [the Charitology Standard](STYLE.md): a source for every factual claim, honest evidence labels, unknowns left unknown, and no ratings of named charities until a rating method has survived public red-team review.

**[All 31 formerly seeded/designed items now have implemented software or published editions](docs/IMPLEMENTATION_NOTES.md)**, including the self-paced course, research desks, 217 country/economy data profiles, reference workbenches and six actual narrated podcast episodes. The [full roadmap](https://charitology.org/roadmap/) preserves every original idea and its current boundaries.

**Edition 0 was drafted with AI assistance and is being reviewed in public.** Every page shows whether a second contributor has reviewed it yet.

## Run it

Node 22 or newer.

```sh
npm ci
npm run dev      # http://localhost:4321, live reload
npm run build    # static site in dist/, with the search index and extension zip
npm run check    # content cross-references and every internal link
npm run preview  # serve dist/ (search works here, not in dev)
```

There are no services, keys or databases. The site is static HTML with browser-local TypeScript workspaces.

## How it’s built

- [Astro](https://astro.build) 5 with content collections. Every collection is validated by a schema in [`src/content.config.ts`](src/content.config.ts), so a malformed entry fails the build.
- Content is Markdown with YAML front matter in `src/content/`. Shared data (causes, moral frameworks, the depth scale, the checklist, headline figures with sources) is JSON in `src/data/`.
- Tools are plain TypeScript in `src/components/tools/`, with a small shared kit in `src/lib/client/`. They store nothing outside the browser.
- Search is [Pagefind](https://pagefind.app), built at deploy time.
- `npm run check` runs content, link, media, extension, original-brief, model, reference-export and publication TypeScript checks in CI on every pull request.

## Deploy

Pushing to `main` deploys to GitHub Pages through [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). The workflow reads the Pages address, so the same build works at `https://<owner>.github.io/charitology/` or on a custom domain such as `charitology.org`. To use a custom domain, set it in the repository’s Pages settings and point the domain’s DNS at GitHub Pages.

## Contribute

Anyone can become a charitologist. Fix a fact, write an entry, take on an open problem, improve a tool, or red-team a claim. Start with [CONTRIBUTING.md](CONTRIBUTING.md).

## Related open instruments

Charitology links independent open projects that already measure parts of the system:

- [Humanity’s Checklist](https://humanityschecklist.org/): six proposed sources linked to world problems; Charitology treats its causal map as a hypothesis
- [Systemic Altruism](https://charities.systemicaltruism.com/): an evidence tracker for structural change
- [Charity Impact Media](https://theguysaccount.github.io/charity-impact-media/): sourced Form 990 spending for about 25,000 U.S. charities
- [WHOFUNDS](https://theguysaccount.github.io/whofunds-open-grant-graph/): the open grant graph of U.S. private foundations

## License

Code: [MIT](LICENSE). Content and data: [CC BY 4.0](CONTENT-LICENSE.md). Cite as “Charitology (charitology.org)”. Cited sources keep their own rights.
