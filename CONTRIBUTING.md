# Contributing to Charitology

Thank you for practicing charitology. Every page on the site is a file in this repository, and every one can be improved.

## Ways in

- **Fix something.** Every page has an *Improve this page* link that opens the file in GitHub’s editor. No install needed.
- **Report an error.** Every page links to a prefilled *correction* issue.
- **Challenge a claim.** Every page links to a prefilled *red-team* issue. A challenge stays open until it is answered with evidence.
- **Write for the Record.** Add an encyclopedia entry, intervention, case study, myth, disagreement or tradition. Copy an existing file in the same folder and follow [STYLE.md](STYLE.md).
- **Review a draft.** Check every source on a page marked `review: draft`. If it holds up, change it to `review: reviewed` in a pull request that says what you checked.
- **Work on an open problem.** Open an issue labeled `open-problem` with your approach, data or partial result.
- **Build something designed.** Programs, tools and record entries with `status: designed` have written charters. Open an issue saying you’re on it, then ship the first milestone.
- **Forecast.** Add a forecast to a question in `src/content/forecasts/`. The Forecasting Platform page writes the lines for you.

## The rules that matter most

The full standard is [STYLE.md](STYLE.md). In short:

1. **No judgment of the good being done.** Write about mechanisms and systems, never about anyone’s character.
2. **Every factual claim has a source you have read**, listed in the entry’s `sources`. If you can’t find one, leave the claim out.
3. **Label honestly.** Evidence labels on conditions, evidence grades on interventions. Charitology’s own untested claims are `hypothesis`.
4. **Unknown stays unknown.** Write “nobody has measured this” instead of guessing.
5. **No ratings of named charities.** Depth classifications are descriptions, labeled as hypotheses.
6. **AI assistance is fine, disclosed.** Say so in your pull request, and check every claim yourself.

## Set up locally

```sh
git clone https://github.com/theguysaccount/charitology.git
cd charitology
npm ci
npm run dev
```

Before opening a pull request, run:

```sh
npm run build && npm run check
```

The build validates every entry against its schema in `src/content.config.ts`. The checks verify cross-references (causes, frameworks, lexicon terms) and every internal link. CI runs the same commands.

## Where things live

| Path | What |
|---|---|
| `src/content/conditions/` | The Diagnosis |
| `src/content/problems/` | The Open Problems |
| `src/content/programs/`, `tools/`, `record/` | The catalog: one file per program, tool and information base |
| `src/content/encyclopedia/`, `interventions/`, `cases/`, `myths/`, `disagreements/`, `traditions/`, `principles/`, `journal/` | The Record’s entries |
| `src/content/forecasts/` | Forecast questions and forecasts |
| `src/content/charities/` | The Charity Index |
| `src/data/` | Causes, frameworks, depth scale, checklist, compass questions, headline figures, lexicon |
| `src/components/tools/` | Interactive tools, one component per tool, named after its catalog entry |
| `src/components/record/` | Live views for information bases, named after their catalog entry |
| `src/lib/client/` | The shared browser kit: storage, DOM helpers, formatting, files, bars, search |
| `extension/` | The browser extension |
| `scripts/` | Build helpers and checks |

## Adding a tool

1. Write the catalog entry, `src/content/tools/<id>.md`.
2. Write the component, `src/components/tools/<id>.astro`. The tool page renders it automatically.
3. Use the shared kit classes (`.tool`, `.field`, `.btn`, `.kpi`, `.bars`, `table.data`) and helpers in `src/lib/client/`. Use only CSS color tokens, so dark mode works. Store data only through `src/lib/client/store.ts`. Never send anything over the network.
4. Make it work at 375px wide, with a keyboard, and with storage blocked.

## Pull requests

- Keep each pull request to one change.
- Fill in the template: what changed, which sources you checked, whether AI helped.
- Be kind in review. Critique claims, not people.

By contributing, you agree that your code is released under the MIT license and your content under CC BY 4.0. See the [Code of Conduct](CODE_OF_CONDUCT.md).
