# Tools and information-base audit

Date: October 25, 2026. AI-assisted editorial and code review. No content was marked human-reviewed.

This pass examined the original 19 tool descriptions and 21 information-base descriptions, focusing on whether the text matches the shipped code, whether factual claims have appropriately narrow scope, and whether the initial brief is represented honestly. The broad combined read was supplemented by focused reads of the affected entries and components. It was not a complete verification of every external source.

## Corrections and code checks

- Removed the assertion that retrieval cannot return false information; source passages can contain mistakes and drafts.
- Removed unsupported claims about most donors, most tools, the prevalence of failure reporting and universal gaps in the literature. Described what this project has and has not measured instead.
- Corrected the extension description to match title access, supported URL patterns, local settings and normal web requests. Moved suggested lookup text from the query into a fragment.
- Exercised the actual popup code with a special-character title and verified no navigation happens until submission and no query is sent in the destination URL. In the browser, the fragment populated GiveWell and returned one locally rendered match.
- Validated all three generated ZIPs and every referenced popup/script/icon/checklist asset. Mozilla web-ext lint reported zero errors, warnings and notices after the Android minimum-version declaration was corrected.
- Distinguished a split planner from money transfer, a gift card from a donation, a legacy worksheet from an executed will, and editorial cause matches from charity ratings in the master roadmap.
- Kept the Charitology100 as a draft method; its stronger claim about ranked lists was removed.
- Described the Charity Index as a starter set rather than a worldwide census. Removed unsupported claims about what no other registry records.
- Expanded the review queue to all content collections, rather than the old eight-collection subset. Program/tool/catalog entries remain drafts under the schema default.
- Added the directories' official source links to the Evidence Library and exposed the journal, roadmap and directories through the API.

## Official technical references read

- Chrome: developer registration, publication steps and image requirements at developer.chrome.com/docs/webstore/.
- Firefox: submitting an add-on, add-on policies and built-in data consent at extensionworkshop.com/documentation/.

## Limits that remain

The financial, legal, disaster-response and intervention sources already cited in the tool pages were not all reread in this pass. Their claim-level verification remains in the human review queue. The source audits for concepts and the Record describe their own narrower verification limits. New directory listings have provider source checks, not independent product tests or eligibility guarantees. Store publication is pending publisher access and external review.

## Original entries examined

- record/case-studies.md
- record/cause-atlas.md
- record/charitology-100.md
- record/charity-index.md
- record/country-profiles.md
- record/disagreements.md
- record/encyclopedia.md
- record/evidence-library.md
- record/failure-archive.md
- record/gap-map.md
- record/interventions.md
- record/journal.md
- record/lexicon.md
- record/methodology.md
- record/myths.md
- record/open-datasets.md
- record/podcast-and-newsletter.md
- record/principles.md
- record/progress-report.md
- record/state-of-charity.md
- record/traditions.md
- tools/ai-charitologist.md
- tools/browser-extension.md
- tools/charitology-wrapped.md
- tools/charity-lookup.md
- tools/compare-tool.md
- tools/cost-effectiveness-model-kit.md
- tools/disaster-response-guide.md
- tools/due-diligence-checklist.md
- tools/forecasting-platform.md
- tools/gift-giving.md
- tools/giving-dashboard.md
- tools/grant-evaluator.md
- tools/impact-calculator.md
- tools/impact-measurement-toolkit.md
- tools/legacy-planner.md
- tools/one-click-split.md
- tools/portfolio-builder.md
- tools/public-api.md
- tools/values-compass.md
