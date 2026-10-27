# Contributing to Charitology

Thank you for practicing charitology. Every page on the site is a file in this repository, and every one can be improved.

## Ways in

- **Fix something.** Every page has an _Improve this page_ link that opens the file in GitHub’s editor. No install needed.
- **Report an error.** Every page links to a prefilled _correction_ issue.
- **Challenge a claim.** Every page links to a prefilled _red-team_ issue. A challenge stays open until it is answered with evidence.
- **Write for the Record.** Add an encyclopedia entry, intervention, case study, myth, disagreement or tradition. Copy an existing file in the same folder and follow [STYLE.md](STYLE.md).
- **Review a draft.** Check every source and the framing, publish a statement about the exact version, and record its scope and independence. A `review: reviewed` edit alone does not qualify a page. Follow the research-ledger workflow below; an uncovered entry needs registration before it can claim reviewed status.
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

## Public research and review records

The source-controlled [research ledger](docs/RESEARCH_LEDGER_ACCEPTANCE.md) implements exact subjects, archived source bytes, public declarations, corrections and dated progress. Its first coverage is 23 problems, three journal manuscripts, 13 source-derived cases and the Methodology Handbook, plus two bounded claims and one genuine editorial correction. All remain draft; the seed supplies no reviewer, qualifying research result, peer-reviewed manuscript or problem resolution. Runtime `796bea1ce6c520fb920cbb408f2498a422d7bc31` passed [exact CI](https://github.com/theguysaccount/charitology/actions/runs/40478918490); [PR #17](https://github.com/theguysaccount/charitology/pull/17) is still a draft. Bounded browser checks are recorded separately in the acceptance document. Full browser/export/narrow-screen and final publication acceptance remain provisional; the subsequent header fix still needs its actual retest and follow-up CI.

The [plan](docs/RESEARCH_LEDGER_PLAN.md) and [interfaces](docs/RESEARCH_LEDGER_INTERFACES.md) define the exact schema. Cite stable record ID, version and subject hash in a review, challenge or correction. Link public evidence and retain objections, responses and dissent. Opening or closing an issue, merging a PR, passing a test or hashing a local result does not establish scientific progress. The private study/artifact registers are not automatically read or published by this ledger. Remove private data before deliberately proposing any public material.

Qualification requires actual public statements that a maintainer has inspected:

- A whole-entry source/framing review needs an approving statement about that exact subject from a second human contributor who checked every source and the framing. A claim-only statement cannot qualify its parent manuscript. Unknown/incomplete target authorship does not qualify; document the relevant public authors and completeness rather than inferring a person from a project byline.
- A review identifies a public person declaring human work, the exact statement and checked-source references, independence and conflict disclosures. Its recorded inspection is by a documented human maintainer distinct from the reviewer. An author may inspect the existence and scope of another person's statement; that inspection cannot replace the independent review. Unknown conflicts do not qualify. Declared conflicts need an explicit inspected explanation of why they do not disqualify the review.
- Journal peer-reviewed wording additionally needs two distinct eligible independent human peer-review statements about the exact manuscript. A peer-review statement can also supply ordinary source/framing review only when it explicitly covers that scope and a separate source-framing record cites it. No scope is promoted implicitly.
- A scientific problem disposition needs qualifying research evidence and an exact reviewed decision tied to the current problem and its progress criterion. Empirical, replication, synthesis and explicitly labeled theoretical results are distinguishable; editorial corrections, proposed methods and software checks cannot supply the result. Eligible research and disposition reviews must span at least two distinct human identities independent of the relevant authors. One person's two statements cannot satisfy that distinction. Public decision/review instants must support the claimed date.
- Known aliases represent the same identity; separate account strings do not prove different people. Identity, source reading, conflicts and independence remain human inspection responsibilities. The validator checks recorded declarations and relationships, not whether a human really performed the work.

Record a review/result withdrawal or new disqualifying identity evidence promptly. No replacement result is needed to remove unsupported qualification: the current dependent problem becomes `under-review`, its review fallback becomes draft, and the compatibility frontmatter must match in the same PR. Retain the earlier decision and old editions. A later scientific disposition needs fresh qualifying support; issue closure alone changes nothing. These rules do not authorize named-charity ratings or bypass public method review.

### Source commit A, ledger commit B

1. Commit covered source changes on the PR branch as **A**, including any intended compatibility review/problem-status edit. That transitional head may fail the ledger gate. Do not merge it as the completed change.
2. Pin the exact committed bytes from A in new inert source snapshots. Use schema-aware capture, not hand-edited excerpts or string replacement. `review` and problem `status` are excluded from the substantive subject hash to avoid a cycle; all other source/body/date/evidence changes remain substantive. A compatibility-only edit still needs its new exact raw-source pin. Never label changed bytes as belonging to an earlier commit.
3. Append the necessary versions, public evidence/reviews/events and a new closed edition in **B**. Keep old IDs, bytes, hashes, predecessors, declarations and edition pins immutable. A substantive or authorship change needs its new version; qualification is not carried forward merely because the title is unchanged. `manifest.capture.commit` names source baseline A, not the later self-including ledger commit B.
4. Validate the final B head and merge only after its complete checks pass. Normal builds read checked-in snapshots and current content; they do not fetch Git history or call GitHub. Explicit maintainer capture may read local committed Git objects and must prove current covered bytes match its chosen baseline.

The current `scripts/capture-research-ledger.mjs` is an **initial-seed reproduction tool**, not an automatic future-edition editor. Its default is a no-write preview using the pinned capture instant; any write requires an explicit committed `--baseline-ref` and refuses altered or extra existing outputs. Historical Git objects are needed only for deliberate reproduction, never ordinary build validation. Later editions require deliberately appended schema-valid files and public evidence under the interfaces; this release does not supply an automatic edition-advance command. Never replace an old capture, backdate local recording or manufacture a reviewer to make the gate pass.

For targeted ledger checks:

```sh
node scripts/check-research-ledger.mjs
node scripts/check-research-ledger-seed.mjs
node scripts/check-research-ledger-ui.mjs
node scripts/check-research-ledger-types.mjs
```

The first two distinguish excluded synthetic qualification tests from the real editorial seed. Passing them is not evidence of actual human review, performed research or publication. The global adapter also rejects any uncovered entry marked reviewed until an additive registration/capture adapter supplies its exact review path; uncovered drafts retain their ordinary draft label.

## Where things live

| Path                                                                                                                          | What                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src/content/conditions/`                                                                                                     | The Diagnosis                                                                                                  |
| `src/content/problems/`                                                                                                       | The Open Problems                                                                                              |
| `src/content/programs/`, `tools/`, `record/`                                                                                  | The catalog: one file per program, tool and information base                                                   |
| `src/content/encyclopedia/`, `interventions/`, `cases/`, `myths/`, `disagreements/`, `traditions/`, `principles/`, `journal/` | The Record’s entries                                                                                           |
| `src/content/forecasts/`                                                                                                      | Forecast questions and forecasts                                                                               |
| `src/content/charities/`                                                                                                      | The Charity Index                                                                                              |
| `src/data/`                                                                                                                   | Causes, frameworks, depth scale, checklist, compass questions, headline figures, lexicon                       |
| `src/data/research-ledger/`                                                                                                   | Immutable public source snapshots, subjects, events, observations and editions; no private local-register data |
| `src/components/tools/`                                                                                                       | Interactive tools, one component per tool, named after its catalog entry                                       |
| `src/components/record/`                                                                                                      | Live views for information bases, named after their catalog entry                                              |
| `src/lib/client/`                                                                                                             | The shared browser kit: storage, DOM helpers, formatting, files, bars, search                                  |
| `extension/`                                                                                                                  | The browser extension                                                                                          |
| `scripts/`                                                                                                                    | Build helpers and checks                                                                                       |

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
