# Charitology handoff

Read this first, then `STYLE.md`. The full original brief is preserved; do not replace it with a list of what is already built.

## The full ambition: all 66 original items

- **Original Claude mega list:** [docs/ORIGINAL_BRIEF.md](docs/ORIGINAL_BRIEF.md). The owner supplied it again on October 25, 2026. It includes **26 programs, 19 tools and 21 information bases**, with their original descriptions.
- **Master plan:** [MASTER_PLAN.md](MASTER_PLAN.md). Every original item maps to its current page, scope and remaining work.
- **Live roadmap:** https://charitology.org/roadmap/. It reads current page statuses at build time. No original item is silently dropped. Original wording is shown separately from present implementation.
- **Additional requests:** trackers and **Charity OS**, an **external tools directory**, and a **benefits directory**. These were added separately from the original 66-item list and are linked from `/for-charities/`.
- The original brief proposed ratings, higher-impact alternatives and automatic payment splitting. The later framing and STYLE.md govern: no ratings of named charities before public method review, honest evidence, no judgment of people. The site explains those adaptations instead of pretending the initial rating/payment features are operating.

## Where everything is

- **Public repo:** https://github.com/theguysaccount/charitology, branch `main`.
- **Live site:** https://charitology.org/, with HTTPS enforced. The old https://theguysaccount.github.io/charitology/ address redirects there.
- **Deploy:** every push to `main` runs `.github/workflows/deploy.yml`, builds, checks and publishes to GitHub Pages. Pull requests run `.github/workflows/check.yml`.
- **Domains:** registered at Namecheap. `.org` has four GitHub Pages A records (`185.199.108–111.153`) and `www` CNAME to `theguysaccount.github.io.`. GitHub's certificate covers the apex and www; approval was checked in this session. Do not treat the certificate's current expiry as permanent—GitHub manages renewal.
- **`.com`:** `charitology.com` and `www.charitology.com` have Namecheap URL301 records to https://charitology.org/. Both HTTP redirects were verified. Namecheap's service does not serve an HTTPS endpoint for `.com`; a separate HTTPS redirect host would be needed.
- **Related repos:** humanityschecklist, systemic-altruism, charity-impact-media and whofunds-open-grant-graph. Charitology links them as open instruments; each retains its own methods and licenses.

## The frame

“The science of doing the most good.” The subject is **charity as a system**: givers → signals → channels → the work → outcomes, and the feedback and institutions around them.

- **No judgment of the good being done.** Study mechanisms and published actions, never people's character or motives.
- **Symptoms and sources:** from Humanity's Checklist, whose six proposed sources are story, coordination, vision, attention, status and gatekeepers. Its causal map is a hypothesis, not an established finding.
- **Depth:** 0 Relief, 1 Repair, 2 Prevention, 3 Structure, 4 Source. It describes the work; it never grades it. Every level is needed.
- **Moral lenses:** welfare, rights, justice, care, faith and tradition, future generations, all life and flourishing. Editorial framework priorities are open to challenge.
- **Evidence:** established, documented, debated or hypothesis for conditions; intervention grades are separate. Say what the project has not measured without claiming no other research exists.
- **No ratings of named charities** before the method passes public red-team review. Index depth classifications are hypotheses.
- **Manifesto:** “Ten Dollars,” the founding poem. Its literary framing is not a historical finding that philanthropy lacked research or education.

## What is built

The completion pass builds **217 HTML pages**. Counts below distinguish working software from charters and starter collections.

- **Diagnosis:** 15 conditions in `src/content/conditions/`.
- **Open Problems:** 23 questions in `src/content/problems/`, with progress tracked in public.
- **Programs:** all 26 original charters in `src/content/programs/`. States remain live, seeded, designed or partners. Publishing a charter does not establish a funded institution.
- **Tools:** the original 19 browser tools plus **Charity OS**, for 20 catalog tools. The original set includes the Values Compass, Portfolio Builder, Charity Lookup, extension, Impact Calculator, Compare Tool, Giving Dashboard, Wrapped, split planner, Legacy Planner, Disaster Response Guide, Gift Giving, Impact Measurement Toolkit, Model Kit, Grant Evaluator, Due Diligence Checklist, retrieval-only AI Charitologist, API and forecasting platform.
- **Charity OS:** `/tools/charity-os/`; local organization context, projects, grant pipeline/deadlines, tasks and observations. Edit/delete/undo, filters, validated JSON import/export, CSV export, storage-failure/corruption notices. No shared accounts, cloud sync, reminders, grant submission, accounting certification or money handling.
- **For charities:** `/for-charities/` links OS and the directories. `/for-charities/tools/` has 15 external tools; `/for-charities/benefits/` has 16 offers. JSON files contain cost models, official sources, eligibility/limits, check dates and draft review status. These are sourced starting points, not independent product tests or guaranteed eligibility.
- **Record:** all 21 original information-base pages, with 26 encyclopedia entries, 15 interventions, 13 cases, 8 myths, 8 disagreements, 8 traditions, a 10-chapter textbook, 49-term lexicon, journal and starter Index of 16 organizations.
- **Data and API:** `src/data/`; 26 static JSON API datasets, including the journal, original roadmap and new directories. Directory citations feed the Evidence Library.
- **Review queue:** `/contribute/review/` covers every content collection. The old count of 103 drafts counted only eight collections. There are now **215 draft content entries**, plus **31 directory listings** labeled editorial drafts. The 215 includes catalog/program/forecast/charity entries that default to draft under the schema. No AI-assisted audit changed them to reviewed.
- **Brand:** original compass/open-C geometry stays in `src/lib/mark.mjs`. Complete SVG/PNG/ICO/touch icon set, 1200×630 `public/og.jpg`, and a real 10-second H.264 video at `public/social/charitology-intro.mp4`. The homepage emits `og:video` and all pages have OG/Twitter image fallbacks. Platforms choose whether to show video; metadata does not guarantee autoplay.
- **Extension:** Manifest V3, version 0.1.1. Separate Chrome and Firefox ZIPs plus a developer ZIP. The search name travels in a URL fragment (`#q=`), not the HTTP query. Firefox data declarations and desktop/Android minimums are present. No analytics or background data transmission. Privacy is at `/tools/browser-extension/privacy/`.
- **Standards and licenses:** STYLE.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md. Code MIT; content CC BY 4.0.

## How to run and verify

```sh
git clone https://github.com/theguysaccount/charitology.git
cd charitology
npm ci
npm run dev
npm run build
npm run check
```

- Astro **5.18.2** remains pinned. Do not force an upgrade without testing the migration. Node 22 or newer; `.nvmrc` selects 24.
- The schema in `src/content.config.ts` validates content. Build creates extension ZIPs, Astro pages and Pagefind.
- Checks cover content cross-references, every internal link, actual favicon/social media files and metadata, extension packages/privacy, and preservation of the original roadmap/directory data.
- Workflows use verified Node 24 action releases, pinned by commit SHA.
- Markdown links are root-relative. The build adds `BASE_PATH`. Delete `node_modules/.astro` if switching the base locally.
- `npm run images` rebuilds static artwork on macOS. `npm run images -- --video` also renders the video and needs ffmpeg (set `FFMPEG` to its executable if not on PATH). Promotional store artwork: `node scripts/make-extension-store-images.mjs`.

## What this pass actually finished

- Preserved and mapped every original brief item; added the three requested operational extensions.
- Corrected source scope, dates, denominators, model ranges and evidence labels. The ledgers are [concepts](docs/source-audit-concepts.md), [Record](docs/source-audit-record.md) and [tools/catalog](docs/source-audit-tools.md). They state which sources were read and what remains unchecked.
- Added a CHANGELOG, updated workflows, completed media and prepared extension publication materials.
- Created all labels used by the site, including correction, red-team, idea, open-problem, question, extension, built-with, myth, methodology, program and review, plus the specific catalog labels still in use.
- Opened [the reviewer call, issue #1](https://github.com/theguysaccount/charitology/issues/1) and [store publication, issue #2](https://github.com/theguysaccount/charitology/issues/2).
- Build, internal links, social files and extension checks passed. Browser checks covered the new flows, including OS import/export/reload and mobile layout. See [release notes](docs/RELEASE_NOTES.md).

## Remaining work that must stay honest

1. **Independent human review.** A second human contributor checks every source and the framing before marking an entry reviewed. AI source checks are assistance, not that review. No claim that all sources were verified is warranted.
2. **Store submission/approval.** Packages, copy, privacy text, promo images and a labeled popup-source screenshot are ready. See [the store kit](docs/extension-store-listing.md). Opening the Chrome publisher console through the available browser automation was denied. No upload, developer agreement, payment or store approval occurred. Use the owner's publisher access; record actual URLs only after acceptance.
3. **Operating programs.** Funds, paid fellowships/bounties/prizes, field audits, credentials, chapters, conferences and locally coauthored profiles need the people, funding and governance in their charters. The original 66-item roadmap keeps those milestones visible. Do not relabel a plan as a live institution.
4. **Dependency migration.** The pinned dependency tree still reports npm audit findings, including a critical Astro advisory. This static deployment uses passthrough images, but no security clearance or advisory fix is claimed. A tested major upgrade is separate work; see release notes.
5. **Optional `.com` HTTPS redirect hosting.** HTTP forwarding is working; HTTPS forwarding is a distinct hosting change.

## Notes for the next contributor

- Commit author: `theguysaccount <35159900+theguysaccount@users.noreply.github.com>`. End commit messages with a Co-Authored-By line.
- Disclose AI assistance in pull requests and keep significant corrections public.
- Preserve `docs/ORIGINAL_BRIEF.md` and the 66 original roadmap mappings when adding features. New ideas belong alongside them, not in place of them.
