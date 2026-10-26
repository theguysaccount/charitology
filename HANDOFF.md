# Charitology handoff

Read this first to continue the project in a new session without losing context.

## Where everything is

- **Repo (public):** https://github.com/theguysaccount/charitology (branch `main`)
- **Live site:** https://charitology.org/ (custom domain, HTTPS enforced). The old address https://theguysaccount.github.io/charitology/ redirects there.
- **Deploy:** every push to `main` runs `.github/workflows/deploy.yml`, which builds, checks and publishes to GitHub Pages. Pull requests run `.github/workflows/check.yml`.
- **Domains:** `charitology.org` and `charitology.com` are registered at Namecheap. charitology.org DNS is done: four A records for `@` (185.199.108–111.153) and a CNAME `www` → `theguysaccount.github.io.`. GitHub Pages has the custom domain set, with a certificate approved through 2027-01-23. charitology.com isn’t pointed anywhere yet.
- **Related repos (same owner):** humanityschecklist, systemic-altruism, charity-impact-media, whofunds-open-grant-graph. Charitology links to them as its "open instruments".

## What Charitology is (the frame)

“The science of doing the most good.” It studies **charity as a system**: givers → signals → channels → the work → outcomes, with a mostly missing feedback loop, and the “field” around it all.

- **No judgment of the good being done.** The system is the subject, never people.
- **Symptoms vs sources.** This comes from Humanity’s Checklist, whose six sources are story, coordination, vision, attention, status and gatekeepers.
- **Depth scale.** 0 Relief, 1 Repair, 2 Prevention, 3 Structure, 4 Source. Depth describes the work; it never grades it.
- **Every moral lens.** Welfare, rights, justice, care, faith and tradition, future generations, all life, flourishing.
- **Honest labels.** Claims are labeled established, documented, debated or hypothesis. Unknown stays unknown.
- **No ratings of named charities** until a rating method passes public red-team review.
- **The manifesto** is the poem “Ten Dollars”: the domain cost about $10, and the generosity was never missing, the aim was.

## What’s built (Edition 0, 210 pages)

- **The Diagnosis:** 15 conditions of the charity system (`src/content/conditions/`).
- **The Open Problems:** 23 Hilbert-style questions (`src/content/problems/`).
- **Programs:** 26 charters (`src/content/programs/`). Honest statuses: live, seeded, designed, partners.
- **Tools:** 19 browser-only tools (`src/content/tools/` and `src/components/tools/`). Values Compass, Portfolio Builder, Charity Lookup, Browser Extension, Impact Calculator, Compare Tool, Giving Dashboard, Charitology Wrapped, One-Click Split (a planner only; it never handles money), Legacy Planner, Disaster Response Guide, Gift Giving, Impact Measurement Toolkit, Cost-Effectiveness Model Kit, Grant Evaluator, Due Diligence Checklist, AI Charitologist (search only, nothing generated), Public API, Forecasting Platform (forecasts are submitted by pull request and scored with Brier scores).
- **The Record:** 21 information bases (`src/content/record/` with views in `src/components/record/`). They include:
  - 26 encyclopedia entries
  - 15 interventions with cost figures checked against GiveWell and J-PAL
  - 13 case studies, including failures
  - 8 myths, 8 disagreements and 8 giving traditions
  - a 10-chapter textbook, a 49-term lexicon, the journal and the Charity Index (16 organizations, depth labeled as a hypothesis)
  - the Gap Map, Cause Atlas and State of Charity, which pull from `src/data/figures.json`
- **Shared data:** `src/data/`. Causes, frameworks, depth, checklist, compass questions, figures (each with its source), ecosystem and lexicon.
- **Logo:** `src/lib/mark.mjs`, a compass rose behind an open C with the needle aiming out through the opening. It drives the header mark, the seal, the favicon, `public/og.jpg` and the extension icons. Regenerate the images with `npm run images` (macOS only).
- **Extension:** `extension/` (Manifest V3). It is zipped into `public/downloads/` at build time.
- **Standards:** `STYLE.md` (content rules), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`. Code is MIT; content is CC BY 4.0.

## How to work on it

```sh
git clone https://github.com/theguysaccount/charitology.git && cd charitology
npm ci
npm run dev       # localhost:4321
npm run build     # full build: extension zip + Astro + Pagefind search
npm run check     # content cross-references + every internal link
```

- Astro **5.18.2**, pinned on purpose. Do not upgrade to Astro 7 without testing.
- Node 22 or newer (`.nvmrc` says 24).
- Every collection is validated by `src/content.config.ts`. A bad entry fails the build.
- Internal links in Markdown are root-relative (`/diagnosis/story-bias/`). The build adds the base path.
- If you switch `BASE_PATH` locally, delete `node_modules/.astro` first.

## Next steps

1. **Optional: point charitology.com.** Add a URL Redirect for `@` in Namecheap to https://charitology.org/ (permanent 301).
2. **Review the drafts.** 103 pages are `review: draft`. A human should check their sources and flip them to `reviewed`.
3. **Create the GitHub labels** the site links to: correction, red-team, idea, open-problem, question, extension, built-with, myth, methodology, program.
4. **Optional:** submit the extension to the Chrome Web Store and Firefox Add-ons, add a CHANGELOG, and recruit reviewers.
5. **The workflows use actions@v4/v5 on Node 20** (deprecated warning only). Bump them later.

## Notes for an AI continuing this

- Commit author: `theguysaccount <35159900+theguysaccount@users.noreply.github.com>`. Commit messages end with a Co-Authored-By line.
- Keep to STYLE.md: plain language, verify every number at its source, no ratings, no judgment of people.
- Edition 0 was drafted with AI assistance, and the site says so.
