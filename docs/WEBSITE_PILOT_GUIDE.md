# Website pilot case guide

Status: local implementation, pending owner review and publication. Practice draft 0.1; an untested editorial proposal, labeled Hypothesis. No charity, participant, adoption or outcome is established by this work. The original 66-item scope is unchanged.

The guide on `/for-charities/website-pilots/#case-guide` carries one visitor task from an observation to a proposed private change, separate decision notes and follow-up. It prepares both existing working briefs and a compatible native Nonprofit Advisory v1 JSON file. It does not generate or host a website, fetch the entered URL, publish a change, send messages or create accounts, access grants or OS records.

## File and privacy boundary

The guide is file-first. It reads no localStorage key and opens no recovery/storage session. Existing Nonprofit Advisory and all other saved work remain untouched. Write in the page, review the exact native-file identity and both briefs, then choose each download. A download request is not proof that the browser saved a file; it does not clear the unfinished-work warning.

The native JSON is the unchanged bare Nonprofit Advisory `ProgramState` version 1: nine context fields and the five existing collections (`diagnostics`, `evidence`, `actions`, `learning`, `readiness`). Ten ordinary named records identify the guide’s case: one diagnostic, one observation, one action, five distinct readiness notes and two learning checkpoints. No wrapper, codec version, field, storage key or schema is added to that format.

Readiness notes keep website publication, website recurring updates, optional OS participation, OS recurring updates and public case-study permission separate. Their local status remains self-recorded. It grants no authority, permission or subscription and reveals no OS link automatically. Website and OS findings are separate checkpoints; a website comment cannot populate OS results.

Restore uses the existing strict native parser and producer admission, bounded to the complete 8,000,000-byte file. Duplicate/unknown keys, invalid UTF8, wrong program/shape, invalid saved fields and oversized files refuse. The focused guide requires its named case records; other valid Nonprofit Advisory files remain for the existing full desk. It refuses without repairing or rewriting the current case.

Extra records in a compatible restored file are retained in the complete native JSON. The two briefs contain only the guide’s selected case fields. Previewing a file changes no writing. Replacing the page requires a fresh, exact acknowledgment bound to the current form, native state and selected file. Opening the picker revokes prior authority and clears only the old selection, so choosing the same saved file again starts a fresh preview. Cancelling keeps current writing. Invalid/replaced/cancelled files and late callbacks revoke prior authority. Only one abortable FileReader is active, with a bounded 30-second deadline.

Untouched imported field strings, their order and extra records are preserved, including line endings a browser control normalizes for display. Only a visibly changed field replaces that native value. No-op review preserves the native timestamp and existing producer serialization; byte identity applies to producer-formatted files, including the actual browser-saved file tested below. Arbitrary compact formatting or extra JSON whitespace in an imported file is not preserved: downloads use the existing native producer’s normal serialization. Invalid or unfinished fields remain in the page; a separate JSON-quoted text copy preserves literal UTF16 writing, while the last valid native backup preserves the complete accepted record graph. The text copy is not a restore format. Neither recovery download silently discards writing.

## Claims and handoff

The briefs use the existing draft 0.1 templates and show the exact native case-file SHA256. That identifies the case file, not a website preview or approval. Uncollected hosting, route verification, rollback, approved versions and other facts stay explicitly unknown. Freeform decision notes are not parsed into unrelated factual answers. Observation-table measures stay unknown until independently entered; narrative findings do not become numeric measurements.

The optional shared-workspace choice reveals only the clean published OS home. Sign-in and organization choice remain separate. No file or fields are transferred. This guide does not expose an experimental Learning route as a working published feature. The local Nonprofit Advisory desk is the current compatible-file workflow. Any later shared inspection still needs its actual service release, permissions and explicit source/target review.

Use public, fictional or non-identifying information and roles. Keep private contact information, beneficiary records and confidential documents out of the case. Publication of a name, quotation, logo or case study still needs its own decision. Relief, repair, prevention, structure and source describe mechanisms, not grades; no charity rating is produced.

## Implementation and pinned basis

The implementation starts at published main `4188b725a0e92c27651aab89680e0e745f1abcbe`. Nine exact source hashes in `test-fixtures/website-pilot/source-pins.json` pin the existing producer, strict native schema/parser, inert field definitions and two original templates. Those files remain unchanged.

- `src/lib/client/website-pilot-model.ts` maps visible fields to ordinary native records and prepares escaped, selected-field briefs.
- `src/lib/client/website-pilot.ts` uses the existing owned `RRViewTracker` token/generation authority without opening a storage session. Synchronous bounded hashing avoids a backlog of unabortable digest jobs.
- `src/components/WebsitePilotGuide.astro` renders disabled unnamed controls before JavaScript, normal labeled fields, separate review/restore acknowledgments and the explicit home-only OS choice.
- `scripts/check-website-pilot.mjs` executes the actual model, native producer/parser, Astro SSR and mounted controller using fictional DOM/reader boundaries.

## Acceptance

Local focused checks cover unchanged source pins; native/producer roundtrip; unknown and negative findings; separate permission scopes; retained extra records and exact text; no invented hosting/approval/version facts; native field/calendar/shape/UTF8 admission; exact 8,000,000/+1 file bounds; literal Markdown escaping; actual disabled SSR controls and base-aware links; three reviewed outputs; zero storage/backend calls; stale/no-event form and file changes; preview-only restore; source spelling under control normalization; invalid replacement/cancel/error/deadline/dispose; one active reader; and fresh home-only OS choice.

The focused checker passes 19 actual model, SSR and mounted-controller groups, including strict TypeScript compilation without shims. Actual browser acceptance found a same-file retry defect; a native-picker regression failed against the preserved predecessor and passes after the bounded picker-opening correction. The local Astro 7.4.7 build passes with 579 HTML pages. The complete normal `npm run check` passed before that narrow controller/test correction, including 51,181 internal links/assets with none broken and the existing social, recovery, source-history, model and static-build gates. The correction receives focused checks and a fresh build; the final complete check belongs to exact-head CI. Run `npm run check:website-pilot` for the focused checks; `npm run build && npm run check` includes the existing site gates and this new checker.

The mounted fixture is not a native browser or Save proof. The browser adapter refused navigation before reaching the local page; its two blank task-created tabs and temporary server were closed. Actual narrow-screen/keyboard inspection, owner review, exact-head CI and publication remain pending until their separate results are recorded. A distinct pure compatibility check against the pinned unpublished Learning admission accepted the fictional 4,241-byte native file and both learning-row selections. That is future codec compatibility only, not hosted acceptance or an available canonical handoff. No production database, provider, mail, outreach or charity data operation is part of this feature.

## Actual local browser follow-up — 2026-11-06

The corrected controller (`a6c3b2e9b8d4222c7683fa2ffd5aabe5624fecc0bc1e3fd0c661312f1a912b92`) and rebuilt page (`447f8117673b2d203d830f2eff0d3979d359fee9834fbaa498bf2372f0675ec1`) passed the following local in-app-browser checks with fictional engineering data at 390 × 844 in the default dark theme. This follow-up supplies the previously pending narrow-screen and scoped keyboard/Save evidence; it does not replace the earlier check history.

Actual keyboard Tab moved from the alias field to the visitor field; Enter activated Review and explicit Apply. A native Save produced the 4,407-byte case file below, independently rehashed from the filesystem. Selecting that saved file through the actual chooser prepared a preview while retaining unfinished alias B. Editing the current method invalidated the preview. Selecting the same saved path again then produced a fresh preview with an unchecked acknowledgment; explicit Apply restored all ten records. A no-op review reproduced the native file byte for byte.

The first browser attempt on the preserved predecessor had failed at that same-path retry because no new change event arrived. That finding remains retained, alongside the failing old-source regression and the corrected 19-group focused pass. No file-identity or current-form guard was weakened to make the retry pass.

All three final browser downloads were independently rehashed from the filesystem. Both Markdown files matched the exact visible completed brief text.

| Saved output | Bytes | SHA-256 |
| --- | ---: | --- |
| Complete native Nonprofit Advisory v1 case | 4,407 | `b45f5a27de19edeea5a818386dafa3da5fb9a2e897e895e5dedbbc3f837123eb` |
| Website preview brief | 6,746 | `a299d22aa411fe6d51950a007363e911314a2c2c5cac172ec4779909df4d686a` |
| Separate optional OS brief | 6,971 | `85005d44d990eddede171a145b497ec359fd05523523ad701d47cc22387ba06d` |

Fictional boundary files selected through the actual native chooser proved admission at 8,000,000 bytes and refusal at 8,000,001 bytes, with unfinished B retained on refusal. The accepted file contained JSON whitespace padding; the same accepted records serialize to the normal 4,407-byte native backup, without retaining that padding. This is file-admission evidence, not an 8,000,000-byte native Save claim. The separate optional choice revealed only the canonical OS home link; it was not followed. An edit unchecked the choice and removed its href. A bounded read of up to 100 warning/error log entries returned none; this is not a blanket browser-network or security claim.

Two unedited 390 × 844 JPEG screenshots were retained. The task tab was closed, the viewport override reset and the owned static server exited successfully. Four task-created downloads were removed only after matching retained copies. No preexisting tab, process or user file was removed.

Native picker Cancel remains unverified because the browser chooser API required at least one file; that pending chooser was resolved with a valid file and explicit Apply. The controlled mounted cancel tests remain separate evidence. Native Print/PDF, other themes/viewports, authenticated hosted OS transport, independent review, exact-head CI and publication are not established by this local browser result. No charity participant, adoption, permission, independent human review or causal outcome is established.
