# The Charitology Standard

How Charitology is written. Every page follows these rules, and reviewers check them before a page is marked `reviewed`.

## The frame

1. **The system is the subject.** Charitology studies the system that aims generosity: its signals, channels, incentives and feedback. It does not judge the people inside it.
2. **No judgment of the good being done.** Every food bank, clinic and volunteer is doing real good. Write about mechanisms, never about anyone’s character or motives.
3. **Symptoms and sources.** Most writing should say where on the [depth scale](src/data/depth.json) a piece of work acts: relief, repair, prevention, structure or source. Depth describes. It never grades. Every level is needed.
4. **Every framework gets a fair hearing.** Charitology looks at giving through welfare, rights, justice, care, faith and tradition, future generations, all life and flourishing. Don’t write as if one of them is obviously right.

## Evidence

5. **Every factual claim has a source you have read.** Any number, date, named study, quote or claim about a real organization links to a source in the entry’s `sources` list or inline. If you can’t find a source, leave the claim out.
6. **Label claims honestly.** Conditions use `established`, `documented`, `debated` or `hypothesis`. Interventions use `strong`, `moderate`, `mixed`, `weak` or `unknown`. Charitology’s own untested claims are always `hypothesis`.
7. **Unknown stays unknown.** Write “nobody has measured this” instead of guessing. A gap in the Record is a finding, so link it to an [open problem](src/content/problems/) when one fits.
8. **Show both sides of a live debate.** When credible people disagree, say who, what they claim and what would settle it. The [Disagreement Register](src/content/disagreements/) is the place for the full version.
9. **No ratings of named charities.** Charitology publishes no ratings or rankings of named organizations until its method has passed public red-team review. Depth classifications in the Charity Index are descriptions, labeled as hypotheses, and open to challenge.
10. **Prefer primary sources.** Use the study over the news story about it and the official report over the summary. Where a source is paywalled, add a freely readable one if one exists.

## Writing

11. **Plain language.** Short sentences, active voice, everyday words. Define a technical term the first time you use it, or link it to the [Encyclopedia](src/content/encyclopedia/) or [Lexicon](src/data/lexicon.json).
12. **American English**, sentence-case headings, the Oxford comma only where it prevents ambiguity.
13. **Quote sparingly.** Summarize in your own words. A direct quote stays under 15 words, in quotation marks, with attribution.
14. **People.** Describe published work and public actions only. No private individuals and no personal details about the people charities serve.
15. **Links.** Internal links are root-relative, like `/diagnosis/story-bias/`. The build adds the base path. External links are full `https://` URLs.

## Process

16. **Every new entry starts as `review: draft`.** A second contributor who has checked the sources changes it to `reviewed`.
17. **AI assistance is allowed and must be disclosed** in the pull request. You are responsible for every claim, so check each source yourself.
18. **Corrections are public.** Every page links to a prefilled issue for corrections and red-team challenges. Fix mistakes in the open and note significant ones in the pull request.
