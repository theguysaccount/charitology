# Cost-per-output spreadsheet acceptance

This follows original item 40 and the bounded SW-SHEET-01 design. It supplies one formula-bearing `.xlsx` beside the existing Model Kit. It does not replace that kit's frozen expected-outcome interpretation, establish empirical impact or complete source-model admission. AI assisted the implementation and checks; no independent human method review is claimed.

## Implemented scope

The [static spreadsheet page](../src/pages/tools/cost-effectiveness-model-kit/spreadsheet.astro), discovered from a scoped link above the existing Model Kit controls and its [tool entry](../src/content/tools/cost-effectiveness-model-kit.md), offers one editable worksheet and public [formula specification](../public/downloads/output-cost-planner-v1.formulas.json) and [native verification record](../public/downloads/output-cost-planner-v1.verification.json). Instructions/download links require no JavaScript. Public publication remains separate from the actual local browser download recorded below.

The defined method is `planned-cash-cost-per-defined-output-v1`: sum three nominal-USD cash-cost components for one inclusive period, then divide by one explicitly defined output count. Staff, direct nonstaff and allocated shared costs are distinct. Unpriced volunteer time and donated resources remain exclusions. Dates, price year, scope, inclusions, exclusions and source/rationale writing are explicit. The included workshop, prices, counts, January 2027 dates and source descriptions are illustrative authored assumptions, not empirical data.

The point result uses point inputs. Each conditional bound uses the corresponding cost bound and opposite output bound. Missing bounds leave that bound unknown without erasing a valid point result. Zero cost with positive output remains numeric zero; zero point outputs make the point ratio unavailable. Positive possible cost with zero lower outputs has no finite upper ratio. Zero cost / zero outputs stays undefined, including when positive outputs are otherwise possible. Bounds are not probability or confidence intervals. No named charities, causal estimates, ratings, inferred benefit or source-level mechanism claim is included.

The page/workbook connect this limited planning record to inspection of charity-system signals and revision from feedback. They assign no depth score. Existing calculator data, simulation arithmetic, bundle formats, keys, fixed references, CSV behavior, source registry and all OS/mail services are unchanged.

## Actual authoring and artifact checks

Artifact Tool **2.8.99** authored the file using bundled Node **24.19.0**; this is distinct from the repository's frozen-model reference runtime. The required authoring marker ran successfully once immediately before first workbook creation. No authoring package was added to production dependencies. A single private builder retained source/formula metadata, explicit typed inputs and the literal-text boundary. Supporting builders, render and disposable test copies stay outside Git.

Artifact Tool recalculated the final worksheet, inspected key values/formulas and found zero matches for unexpected formula errors. The complete rendered worksheet was visually inspected after the final text edit: headers, wrapped definitions, source notes, numbers and result labels were readable, without merged working cells or clipped values. The final file has one visible worksheet, fourteen formula cells and no worksheet protection, macro project, external workbook relationship or data connection.

| Final material | Identity |
| --- | --- |
| Workbook | 7,675 bytes; SHA-256 `29ef1b668f6a14bdc76ad8fa57ad305cf21a5ac8a7a28d40712675b51979fbd7` |
| Formula specification | SHA-256 `f343b4e15013326a95f675bc5cfec2537fda2beab08d202954407c8d4b6f3dc9` |
| Public verification record | SHA-256 `748ca7c5d8d955f65cfd502ebce7a4bc22e80233ded4f6097892f20fdf55b7b1` |
| Retained full native receipt | SHA-256 `76c5049c58778edabf07af4339690c987de5300a5cfcb912596ddb55067e168a` |
| Final rendered view | SHA-256 `0530af1ac9dd2ed6951a558ef825fde6307779f1f20f941954bb346cf1586b37` |

The [standard-library committed-artifact check](../scripts/check-output-cost-planner.py), wired into `npm run check`, passes. It compares actual bytes with the public identity, all saved formulas and typed defaults with the public source, the baseline cached arithmetic, and active-content/relationship/sheet boundaries. It needs no private authoring dependency or spreadsheet app. This static check reads saved baseline values and is explicitly not native recalculation evidence.

## Actual native recalculation

The already bundled native arm64 **LibreOfficeDev 26.8.0.0.alpha0**, build `2c87e51eeaa2b413ff4ae097b2705eea1995d8e5`, completed twenty sequential headless cases. Each used a new disposable input/output directory and owned user profile. All fourteen formula caches were removed before each native load/conversion; calculation settings requested automatic/full calculation, and actual native output values were then independently checked. Every conversion exited 0, every expected numeric/text result matched and no native formula-error cell was found. All twenty profiles were removed, no owned headless process remained, and the final authored workbook's bytes were unchanged.

The [public verification record](../public/downloads/output-cost-planner-v1.verification.json) retains each fictional input change, observed result, input/output hashes, exit status and cache-removal fact without private paths. Cases cover:

- Baseline 100, approximately 57.142857 and 200 USD/output; cost change to 110; further output change back to 100; changed output-unit text with a coherent generic count row and result unit.
- Blank point cost, blank lower cost and blank point count, preserving other valid results and explicit unknowns.
- All-zero costs with positive outputs; zero point output; zero lower output with positive possible cost; zero-cost/zero-output undefined behavior.
- Reversed bounds, text/negative/fractional counts, text/negative costs, missing definition and reversed period.
- An actual Artifact Tool literal-writer copy with formula-leading definition/source strings. They remained text through native conversion, with only the original fourteen formula cells and no external relationship.

The preliminary ZIP checker refused a standard ISO-date cell (`t="d"`) before any native conversion because it initially assumed every nontext value was a float. That checker-only assumption was corrected to admit the explicit OOXML date type; the failed source/log remain preserved separately. No workbook formula, input limit, expected value or native failure was waived. All twenty native cases belong to the corrected checker run.

### Unpublished output-unit label correction

An additional AI-assisted implementation review found that editable output unit C11 and the linked H5 result label could disagree with B31's fixed “Completed workshops” text. Before publication, B31 was changed to the generic **Defined output count** through the same existing builder, without another authoring marker. Exact comparison confirms that every other default and cell XML, all fourteen formula-cell XML fragments and the authoring builder remain byte-identical. The only default-cell change is B31; the final source/formula/file identities above belong to the corrected file.

The initial unpublished file remains preserved at SHA-256 `c193aff03fcfcea1194cfab20859aa613df94fb345ec435bacc2366ea2a28034`, with its own twenty native cases and original receipt `5bf511a2ccb08e2e83de25c540052205876120b5cb60913596ba4005a2e20165`. Those results are not relabeled as corrected-file evidence. A fresh isolated native run checked twenty cases at the new artifact hash; it replaces the earlier duplicate baseline-repeat case with an explicit C11 unit-change case. That actual case observes B31 “Defined output count”, H5 “USD per delivered package” and the unchanged numeric result 100. The fresh baseline, missing/zero/bounds/literal cases and all profile cleanup pass at the corrected bytes. The public verification record distinguishes both unpublished artifact identities and includes the label-only comparison. No formula or calculation policy changed.

This is fresh headless LibreOffice calculation evidence. It is not Excel, Google Sheets, GUI editing, app keyboard/screen-reader, native Save-dialog or print acceptance, nor exact binary Monte Carlo reproduction. Native round-trip copies were not substituted for the final artifact.

## Isolated site checks

On source base `5610309a177b1985961636631dbb40ad4e7ae631` plus this held change, locked `npm ci` succeeds using repository Node 24.22.1/npm 11.19.1, with the lock file unchanged. The final Astro build succeeds with **580 pages**. All **51,239** checked internal links/assets pass, along with social/favicon checks across all 580 pages, the exact committed-workbook check, all **174** existing Model Kit cases and **19** strict frozen references. Built copies of all three workbook downloads equal the exact committed source bytes. The server-rendered discovery link precedes the calculator form; the child instructions and download are present in static HTML. This is build/source inspection, not a browser or HTTP download.

The first local Model Kit run rejected a discovery paragraph inserted into its retained exact top-slot composition. The paragraph was moved to the header's existing slot; the original Tool + ModelBundles fragment and all existing tests remain unchanged. The rebuilt candidate and complete targeted Model Kit check then pass. The failed local log is retained; no numerical failure, reference change or test relaxation is inferred.

At that isolated checkpoint the full check was deliberately left for the separately reviewed funding integration, which changes its source inventories. The complete integrated check below supersedes that pending local gate. Installed site dependencies are the repository's locked packages; no Artifact Tool dependency was added to them.

## Integrated full check and actual browser download

Feature commit `f60e66c5db68c106a68009fffa7935a41de76dbb` was merged with actual published main `729d6ecbcc14645878796d5723e003ec01ffd6cd`, producing source `6c0d1c65e6e3b9b0ea05f17a8dea9b7bb2ca37a9`, tree `54da95281fd357b7688ad6a3d8aeb0ce478a0368`. Its source-A funding ancestor remains reachable. Only the two expected Handoff/package conflicts needed resolution; both new checks and all prior fields/history were preserved. A single ordinary full `npm test` completed with exit 0 on repository Node 24.22.1/npm 11.19.1. The retained 419,447-byte log has SHA-256 `ec5fc98e65f75b2ae112b3560119412651c6389900db765525990feac312e58b`. No history/reference gate was inferred, skipped or relaxed.

An actual in-app-browser journey read the child page, followed its Model Kit breadcrumb, found both scoped discovery links and returned through the header link. Rendered instructions include the MIT template/formula notice, the twenty-case source and the optional Charity OS home link; no private case is sent. At a temporary 390 × 844 viewport, document width remained 390 pixels; the table and wrapped hash each occupied 358 pixels without page overflow. The reviewed screenshot shows readable instructions and download controls. Console warning/error capture was empty.

The actual browser download callback returned a local `.xlsx` file. Its 7,675 bytes and full SHA-256 equal the final authored workbook above; the retained copy was hashed before removing only the task-created Downloads copy. The private download receipt is bound to this integrated source. This verifies the real page link and saved browser file, not native Excel/Google Sheets editing, a native Save dialog or new recalculation. The tab was closed, viewport override reset and owned loopback server stopped normally.

The initial new-branch push [42392085256](https://github.com/theguysaccount/charitology/actions/runs/42392085256) completed three jobs successfully, but its static job correctly refused the actual new-branch event's absent nonzero observation-history base before the build. Its failed step/log remains retained (SHA-256 `aa53aa684837b2e793135bc3dbcf52ee82f4ee5b1394fb436ea3ec33f9870f1d`). No rerun, inferred base, history bypass or success claim was substituted. The PR event and this factual acceptance follow-up provide their own actual event/base checks; final exact-head CI and public byte verification remain separate.

## Frozen interpretation and release gates

The three v1 interpretation sources, generated registry/golden fixture, original calculator component, bundle desk and old client math/format files retain their inspected hashes. No dispatch from a selected bundle to this planning workbook exists. The existing frozen-engine/reference suites still govern their own separate runtime checks.

The integrated full check and actual child-page/browser-file reading now have the scoped evidence above. Final exact-head CI and public byte verification remain pending at this checkpoint. Successful local checks or native private recalculation do not establish publication. The new route/content remains a draft. No OS schema, production data, provider, mail, payment, account or real charity record was touched.
