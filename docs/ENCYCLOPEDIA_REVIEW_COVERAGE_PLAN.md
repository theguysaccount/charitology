# Encyclopedia review coverage: implementation contract

Recorded November 7, 2026 before runtime or capture changes, against published main `e2c4e0fe7a89841892557d66a9d41998e0aab9eb`. This is the bounded SW-REVIEW-01 extension of the [research ledger](RESEARCH_LEDGER_PLAN.md) and its [frozen interfaces](RESEARCH_LEDGER_INTERFACES.md). It registers exact source versions; it does not assert that anyone independently checked their sources.

## Complete family, unchanged content

Cover every current entry in `src/content/encyclopedia/`: 26 Markdown files totaling 108,688 raw UTF-8 bytes at the inspected source. The largest file is 5,805 bytes. All 26 omit `review` and default to draft. These are repository inventory facts, not external factual or scientific verification. No encyclopedia wording, sources, declared review, original mega-list item or source A54 artifact is changed by this slice.

The initial path inventory is:

- beneficiary-feedback
- charity-as-a-system
- cost-effectiveness-analysis
- counterfactual-impact
- discounting
- donor-advised-funds
- effective-altruism
- expected-value
- identifiable-victim-effect
- impact-investing
- moral-uncertainty
- mutual-aid
- neglectedness
- outputs-and-outcomes
- overhead-ratio
- participatory-grantmaking
- private-foundations
- psychic-numbing
- randomized-controlled-trials
- restricted-and-unrestricted-funding
- scale-neglectedness-tractability
- source-depth
- symptoms-and-sources
- systemic-change
- theory-of-change
- warm-glow-giving

An explicit committed-source inventory must match all 26 paths and current working bytes before capture. A newly added, missing, renamed, nested, nonregular or symbolic-link entry cannot silently escape coverage. A later supported addition needs its own explicit capture. Renames retain a stable record identity through the existing alias contract; paths cannot recycle another identity.

## Separate frozen adapter

Retain `captureResearchEntry` and every existing `research-content-v1` projection unchanged. Add a distinct pure `research-encyclopedia-v1` whole-entry adapter, with an explicit profile dispatch used by source/version validation and the current Astro adapter. A new encyclopedia version must name that profile. Existing version objects keep their original adapter labels and hashes. The new profile cannot reinterpret old problems, journal, cases or methodology subjects.

The exact substantive subject is:

```ts
{
  type: 'entry',
  collection: 'encyclopedia',
  frontmatter: {
    title, summary, aliases, conditions, related, sources
  },
  body
}
```

Include every substantive schema field. Exclude only compatibility `review`; no encyclopedia `status` exemption exists. Title is required bounded text of at most 500 characters and summary at most 4,000. Aliases default to an empty array, contain at most 20 bounded strings of at most 500 characters and preserve their order and text. Conditions default to an empty array of at most 20 source slugs, normalized to the existing exact `{collection:'conditions',id}` references. Related routes default to an empty array, with at most 20 bounded root-relative routes including an optional fragment; reject protocol-relative, credential-bearing, backslash, traversal and control-character forms. Sources default to an empty array and reuse the existing at-most-20 exact normalized `title,url,publisher,year,note` objects. Unknown optional source properties remain null under that existing profile. Do not sort, trim or deduplicate source arrays.

Reuse the existing bounded YAML parser, strict plain-data/prototype guards, duplicate/alias/merge refusal, 128 KiB raw source bound, 32,768-character exact body bound, canonical hashing and detached frozen output. Preserve raw BOM, newlines and UTF-8 identity separately from normalized frontmatter. Historical snapshots remain inert text; never compile or execute them. Only Astro's display-body comparison may trim; archived body and subject hashing may not.

Astro parity must compare every included field against actual schema-parsed entry data, including defaults. Unknown raw frontmatter fields fail before Astro can strip them. The current raw source, exact captured source and substantive version must agree. Changing a body, source, alias, route, summary or condition changes the substantive subject. Changing only the compatible review field leaves that subject hash intact but still requires a new exact raw source capture and a qualifying recorded review before the current page can claim reviewed.

## Records, coverage and editions

Use stable `concept:<slug>` records, mapped only to encyclopedia entry subjects. The UI calls them “Encyclopedia entry.” A concept has ordinary exact-source review qualification; journal peer-review and scientific problem disposition remain inapplicable. Do not treat an encyclopedia entry as a case, method, study or scientific result.

Accept the old manifest's `research-content-v1` coverage and a new `research-content-v2` manifest whose fixed family inventory adds encyclopedia. This label is an inventory revision, not permission to alter the old subject adapters. Dispatch historical subject validation by its version's supported profile. Source snapshot paths and supporting artifact references must resolve through the matching closed profile, not a permissive generic Markdown parser.

Append one new edition, with 26 new source snapshots, concept records, v1 subject versions and undated baseline events. Baselines retain `occurredAt:null`, `timeBasis:'undated'`, unknown/incomplete authorship, no actor IDs and no review declarations. The actual explicit capture instant is their recording time, never an invented date of authorship, source reading, review or scientific discovery. Continue global ordinals after the existing 43 events and retain complete predecessor/pin closure.

Expected total inventory after this capture is 69 records, 71 versions, 69 events, 70 sources, two editions, zero reviews and zero actors; the four old public metadata observations remain unchanged. Current source coverage becomes 66 pages: the previous 40 plus these 26. That count is separate from the original mega list's 66 programs, tools and information bases.

There are 181 existing ledger files including the mutable manifest: preserve all 180 existing nonmanifest files byte for byte. The initial edition remains exactly `edition:2026-10-27-initial`, with its original pins, capture, period, coverage, raw sources, hashes and projection. Its recorded file SHA-256 is `d3e65c0aa5cf272be8eb1b274c160ea4a16fed574b2506a579c4477699b8a2a3`. Append a new edition rather than rewriting that file or rerunning the initial seed into current data. The new edition carries all previous objects and their exact heads plus the new concepts. Retain unknown earlier baseline and all existing scientific limitations. Its progress interval stays explicit and cannot imply a completed year.

## Genuine source commit and append-only capture

Use the established two-commit sequence. Commit A contains the reviewed adapter, command, fixtures and documentation, with the exact source text to be captured. Commit B appends the actual captured data and changes the manifest. `manifest.capture.commit` and each new source snapshot identify committed A, not B. This slice changes no encyclopedia content, but must still read exact A objects and prove working bytes match them.

Add a separate extension command; preserve the initial seed generator and its historical output. The new command requires an explicit source commit, expected prior manifest hash, new edition/capture IDs and canonical recording instant. It performs no network operation, wall-clock substitution or ordinary-build capture. It rejects a missing Git object, wrong repository/path inventory, dirty covered source, existing conflicting ID, changed/deleted historical file, stale manifest, backward capture or exceeded existing bound before writing.

Preparation derives a complete deterministic candidate and added-file inventory without changing the checked-in ledger. Root reviews that candidate before the explicit write step. The write preflight checks exact prior and new bytes, writes only new objects with exclusive creation and replaces the mutable manifest last. A failure cannot overwrite an old immutable object. An interrupted attempt must remain detectable and recoverable from the exact prepared inventory; do not silently ignore orphaned/conflicting files. Ordinary builds load committed inert data only. No dependency, provider, service, OS, mail or credential change belongs here.

## Corrections, responses and review

A challenge can target an exact concept version and subject hash using the existing challenge subject. A response event retains the substantive response, public references and dissent. A correction appends a new concept version and `version-recorded` event, with exact previous/current references and public issue, response or pull-request evidence. A changed substantive head removes the old whole-entry qualification until the new head independently qualifies. Compatibility frontmatter must match that derived state.

Preserve the existing claim-only grammar for `artifact.changes` and corrected/scope-narrowed `resultingClaims`. Do not pass a whole entry through those fields or invent a new whole-entry disposition. The extension supports exact whole-entry versions and challenge/response links; a broader correction-disposition grammar needs a separate explicit contract. Existing claim selectors and the real PR #3 editorial artifact remain unchanged. No synthetic challenge, response, correction or reviewer is published merely to demonstrate a UI.

A declaration does not establish a human reviewer, independence, source reading or truth. Existing public authorship, human declaration, conflict inspection, distinct-identity, exact-subject and withdrawal gates continue unchanged. All new real records start draft with unknown authorship. Independent human review, ratings and scientific problem dispositions remain separate.

## Files and software acceptance

Expected runtime changes are the new profile/dispatch in `src/lib/research-ledger-capture.mjs`, strict profile/kind/path support in `research-ledger-model.mjs`, the current family inventory/parity adapter in `research-ledger.ts` and the concept label in `ResearchLedger.astro`. Add an extension preparation/write script and excluded fixtures; extend the existing model, seed, build and typing checks. New captured objects and the manifest are the only data changes. Existing API and per-record/source/edition routes should derive their additions without a new private write endpoint.

Meaningful checks must establish:

- Every one of the 26 actual source subjects matches raw/default/body boundaries and actual Astro schema output. Missing, extra, nested, renamed and duplicate coverage refuse.
- Existing four adapters, claim selectors, original seed objects, initial edition JSON/CSV/projection and fixed publication-edition R4 inputs retain their exact meaning and bytes. Test historical seed counts on its pinned edition, not by weakening them to current expanded counts.
- Every substantive encyclopedia field changes its exact subject; review-only changes preserve subject identity while raw capture identity changes. Unsupported fields, malformed data, invalid routes and all existing size limits refuse.
- The new real capture is complete and deterministic, contains no invented reviewers or historical dates, and keeps the exact old object closure. Changed/deleted historical objects, source/profile mismatch, stale manifest and interrupted/conflicting output refuse.
- Fictional exact-version reviews qualify only under the existing human/declaration contract; new substantive versions, withdrawal and unsupported author claims revoke qualification. Fictional concept challenge → response → version correction retains original argument/dissent and does not inflate scientific or claim-correction counters.
- Built current and historical ledger HTML, API, JSON/CSV, source downloads, concept labels, page review notices and exact version anchors agree with the validated model. Existing pinned progress/publication outputs remain historical, without recapture.
- Run the appropriate focused checks, strict typing and complete ordinary build/check on the final B candidate. Actual browser and public-byte verification, exact-head CI and release remain distinct later gates.

This contract closes no human review or operating gate. It preserves all original 66 mega-list mappings and all 22 stable software backlog IDs. This is one additional exact-source family, not a completion claim for wider traditions, interventions, profiles, scientific consensus or the full project.
