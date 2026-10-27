# Program record recovery plan

Pre-implementation contract · October 27, 2026 · AI-assisted · engineering review: accepted. This plan covers five older general program desks and the smaller browser-local Charity OS. It does not change the shared OS service. Read the [interfaces](PROGRAM_RECORD_RECOVERY_INTERFACES.md) and [writing standard](../STYLE.md). The root implementation agent accepted the capacities and interfaces below before runtime implementation; commit history records that boundary. This is engineering review, not human or institutional validation.

## Result and scope

A person can open their existing records, save a change, recover an unreadable or conflicting saved copy, and restore their own native JSON export without silently replacing unseen work. A failed browser write preserves the exact valid candidate for export or explicit retry. Form text that has not been submitted remains separate from saved records and has its own recovery download.

Preserve the six final keys, version 1 native shapes, record IDs, array order, unknown-versus-zero values and existing calculations. No account, server submission, shared approval, booking, payment, external API or additional browser key is introduced. The nine partner desks, graph companion and released donor/course/research/publication stores are outside this slice.

| General desk             | Exact final key                                        | Collections                               |
| ------------------------ | ------------------------------------------------------ | ----------------------------------------- |
| `university-chapters`    | `charitology.program-workspace-v1.university-chapters` | `sessions`, `roles`, `tasks`              |
| `local-charitology`      | `charitology.program-workspace-v1.local-charitology`   | `needs`, `activities`, `questions`        |
| `time-charitology`       | `charitology.program-workspace-v1.time-charitology`    | `roles`, `logs`                           |
| `corporate-program`      | `charitology.program-workspace-v1.corporate-program`   | `scenarios`, `tasks`                      |
| `policy-program`         | `charitology.program-workspace-v1.policy-program`      | `options`, `evidence`, `equity`, `tasks`  |
| Browser-local Charity OS | `charitology.charity-os`                               | `projects`, `grants`, `tasks`, `outcomes` |

`partner-programs.ts` uses the separate `charitology.partner-workspace-v1.*` namespace. It imports some types/helpers from the older general model; it does not read these five keys. The source search found only `_program-workspace.astro` and local `charity-os.astro` as writers of the six target keys. The shared OS migration consumes the local OS's native exported envelope; keep that envelope compatible.

## Findings from the actual implementation

The audit read the shared general component, all five wrappers/configurations, both pure models, `store.ts`, `persist.ts` and the local OS component. Eight controlled reproductions executed actual Astro SSR markup and inline scripts, or the actual pure model, with fictional inputs in a bounded DOM. These are engineering reproductions, not native browser or persisted-file acceptance.

| Trigger                                                                                        | Observed behavior                                                                   | Required correction                                                                              |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Another writer updates a general key before its storage event arrives; this page saves context | Older local memory overwrites the new saved value                                   | Compare exact observed saved bytes under the common lock before every write                      |
| General key read throws; a later save succeeds                                                 | Apparent blank workspace remains editable and replaces the existing value           | Read denial is unavailable, with no writable blank fallback                                      |
| General workspace receives a storage event, then confirmed Clear runs                          | Clear clears the block and writes empty records over the current saved value        | Clear needs its own fresh, owned replacement review                                              |
| Native general export has 150 valid sessions with bounded text                                 | Export is 3,050,400 bytes; current file chooser refuses above 2,000,000 bytes       | Use one exact whole-native-backup capacity for save, export, parse and restore                   |
| Local OS saved JSON parses but its workspace is invalid                                        | Recovery changes a 70-byte original into 62-byte reserialized JSON                  | Preserve exact original UTF-16 code units; never regenerate raw recovery from parsed data        |
| Local OS context write throws                                                                  | Status says “Saved mission and context”; no unload guard protects the failed memory | Return an awaited truthful result; retain valid memory and raw-form scope                        |
| Local OS file A has a valid preview; newer B is invalid                                        | Old A remains applicable                                                            | Every new file choice revokes prior authority before validation, including empty/invalid choices |
| Local OS file A is still reading when Cancel runs                                              | A's late result recreates the preview                                               | Bind every async read/preview/apply to a captured generation and owned bytes                     |

Private reproducibility evidence is retained at `work/os-private/program-record-recovery-repros.mjs` and `program-record-recovery-audit.json`; public checks must use excluded fictional fixtures and cannot depend on private files.

A separate immediate privacy correction was authorized before this contract: local OS context fields and submit now start inside a disabled fieldset, the first script action intercepts native submit, and initialization enables the fieldset only at the end. The focused `check-program-record-form-privacy.mjs` has three passing actual SSR/script groups, including startup failure. This is local controlled evidence; publication/build evidence belongs to that separate release. Other general private fields and local OS editor fields are created by JavaScript, rather than present as named static controls.

## Native formats and semantic preservation

General keys store a bare `{version:1,program,updated,context,records}` object. Every context/record field is a string. A record is exactly `{id,values}`. Export uses two-space JSON with no terminal newline. There are at most 250 records per collection and 500 across one desk. IDs match `[A-Za-z0-9_-]{1,100}` and are unique across that desk's collections. Do not add fields to this format to store recovery metadata.

The local OS key stores `{format:'charitology.charity-os',version:1,exportedAt,workspace}`. JSON export keeps this same envelope, two-space indentation and no terminal newline. Workspace has organization, mission, community, currency and four arrays. At most 2,000 records are allowed across the four arrays. IDs match `[A-Za-z0-9_-]{1,80}` and are unique within each collection, not globally. All nonempty project references must resolve to `projects`. Existing native producer timestamps are retained; export is not a new assertion that records were reviewed.

The new boundary validates without rewriting IDs, trimming retained text, rounding money, changing array order or dropping fields. Use the complete frozen producer schema, not an alias's weak predicate. Text/numeric semantic checks may inspect a trimmed read-only copy; retained strings remain exact. Existing producer-canonical IDs, dates, enum values and currency remain required. Noncanonical identity/enum/date spellings, unsupported future fields/versions and duplicate keys are protected with an explanation, not silently normalized. Any later normalization/migration needs a separately previewed explicit adapter; none is included in this slice.

General text limits stay 500 code units, or 5,000 for textarea. Requiredness, exact choices, real dates, configured numeric bounds and the annual-high/low relation remain. Context permits existing optional/incomplete text; required numeric context defaults remain defined by the real configuration. `employees` and `years` remain whole numbers; years is at least one. Valid existing public HTTP links remain readable; new links are validated without credentials, control characters or literal backslashes. Unsupported link spellings are preserved as protected raw data, not executed.

Local OS limits remain: organization/title/indicator 160; mission/community/goal 2,000; owner 120; funder 160; next step 1,000; unit 80; evidence URL 1,200; notes 4,000. Exact status/priority/evidence choices stay as defined in `charity-os.ts`. Dates are real 1900–2200 dates. Money stays finite nonnegative numbers up to 1e12. Outcome values may be signed finite numbers or null; depth is null or integer 0–4. The existing compact validated-workspace limit of 4,500,000 UTF-8 bytes remains in addition to whole-backup capacity. This slice does not change numeric representation or claim financial precision that the old model did not have.

The pure version-1 schema definitions must be explicit/inert and tested against every current config's context/collection/field/choice/default/bound. A future config edit cannot silently reinterpret old v1 saves; the compatibility check must fail until its version/migration choice is reviewed. No current field is added to a v1 saved object.

### Exact context and collection fields

- **university-chapters:** `name`, `institution`, `purpose`, `access`, `governance`, `term`, `meeting`.
- **local-charitology:** `name`, `place`, `population`, `question`, `method`, `limits`, `date`.
- **time-charitology:** `name`, `available`, `skills`, `wage`, `currency`, `access`.
- **corporate-program:** `name`, `employees`, `currency`, `period`, `eligibility`, `flexibility`, `privacy`, `learning`.
- **policy-program:** `name`, `jurisdiction`, `question`, `baseline`, `years`, `discount`, `currency`, `uncertainty`.

- **university-chapters / sessions:** `title`, `date`, `facilitator`, `location`, `objective`, `agenda`, `reading`, `output`, `notes`.
- **university-chapters / roles:** `title`, `responsibility`, `handover`, `term`.
- **university-chapters / tasks:** `title`, `owner`, `date`, `status`, `notes`.
- **local-charitology / needs:** `title`, `population`, `period`, `finding`, `source`, `evidence`, `limits`, `voice`.
- **local-charitology / activities:** `title`, `organization`, `cause`, `coverage`, `depth`, `mechanism`, `source`, `date`, `limits`.
- **local-charitology / questions:** `title`, `reason`, `voices`, `owner`, `date`, `status`, `notes`.
- **time-charitology / roles:** `title`, `organization`, `status`, `hours`, `travel`, `prep`, `staff`, `cost`, `skills`, `confirmed`, `outcome`, `feedback`, `source`.
- **time-charitology / logs:** `title`, `date`, `hours`, `travel`, `observation`, `next`.
- **corporate-program / scenarios:** `title`, `participation`, `gift`, `ratio`, `cap`, `budget`, `admin`, `assumptions`.
- **corporate-program / tasks:** `title`, `owner`, `date`, `status`, `notes`.
- **policy-program / options:** `title`, `mechanism`, `depth`, `upfront`, `annualCost`, `annualLow`, `annualHigh`, `unpriced`, `uncertainty`.
- **policy-program / evidence:** `title`, `option`, `source`, `evidence`, `finding`, `limits`, `date`.
- **policy-program / equity:** `title`, `option`, `effects`, `voice`, `safeguards`.
- **policy-program / tasks:** `title`, `owner`, `date`, `status`, `notes`.

Local OS row fields are the exact current `Project`, `Grant`, `Task` and `Outcome` types. `Project`: id/title/status/owner/due/depth/budget/spent/goal/notes. `Grant`: id/title/funder/projectId/status/requested/awarded/deadline/owner/next/notes. `Task`: id/title/projectId/status/priority/due/owner/notes. `Outcome`: id/date/projectId/indicator/value/unit/evidence/source/notes. Unknown fields are not a place to hide unsupported future data.

## Accepted capacities

- Whole native JSON: **8,000,000 UTF-8 bytes**, including the entire existing native envelope when present, no terminal newline. The whole limit wins over count/field maxima; refuse before state assignment and offer splitting/export, never truncate. This closes the general desk's demonstrated export/import inconsistency. The existing local OS compact 4,500,000-byte check also applies.
- Strict JSON depth: 32. Fatal UTF-8 for byte inputs; no BOM, duplicate decoded keys, accessors, proxies, custom prototypes, sparse/decorated arrays, cycles or nonfinite numbers. Escaped lone UTF-16 surrogates round-trip as JSON; actual unrepresentable raw string input is refused before UTF-8 conversion.
- Exact raw-saved-copy archive: **64,000,000 UTF-8 bytes** for the entire escaped JSON wrapper. It preserves raw UTF-16 code units and key/copy identity. Raw is inert, not executable or valid native import. Oversize refusal leaves the saved key and memory untouched.
- Unfinished-form recovery: **524,288 UTF-8 bytes** whole wrapper, up to five known forms for a general desk or context plus one editor for OS. Bound each raw field by its actual control limit; include invalid numeric/date strings without pretending they validate as records. Entire maximum-length general form controls are below this cap even with JSON escaping (largest current character-limit sum is 71,000 for Policy, at most 426,000 escaped string bytes before its bounded wrapper). If an out-of-contract DOM value cannot fit, keep it in the tab and offer clearly labeled plain text recovery; do not clear it because a backup failed.
- File read deadline: 30 seconds, owned detached bytes. At most one running save and one unstarted full replacement per session; replacing the pending job drops its prior candidate reference immediately. No closure per keystroke behind a held lock.

These capacities were accepted before the contract was frozen. Tests must construct meaningful exact-boundary native exports, not accept padding outside a schema or test only a byte counter.

## Persistence and recovery guarantees

Use a new namespaced engine for only these six keys, with a separate pure fixed-schema/format module and controls module. Reuse the proven guarded-byte algorithm; do not refactor a released store or extend the donor engine's fixed registry. All callers become async and await the result. A Promise must never be treated as a boolean saved result.

Web Locks serialize cooperating updated tabs using the exact final storage key as lock name. No lock support means read-only recovery/export. Compare the exact saved presence and string against the observed baseline under the lock, and perform final memory/view/input-generation checks immediately before writing. This is not atomic compare-and-swap against arbitrary direct localStorage writes or old cached clients that ignore the lock. A useful notice recommends reloading older open tabs after release; it does not promise universal transactions or security.

Absent, unreadable and valid empty saved objects are different. A readable absent key can initialize a valid empty unsaved workspace without writing it. Initial corrupt/read-denied values do not become an apparent loaded blank workspace. `hasCurrent` explicitly distinguishes no valid value from a valid empty model. Persistence labels distinguish saved, absent, unsaved memory and unreadable. Before leaving, warn for dirty forms, pending operations and retained meaningful unsaved memory.

Capture the full candidate, options, timestamps and owned view token synchronously before waiting. Never rerun a UI command during retry. A failed set/remove retains its exact intent and the valid memory candidate, while the saved key stays as observed. A new ordinary save is refused until the pending failure is retried exactly or an explicit recovery/reload-discard replaces it. An explicit undo may discard a failed candidate only after review, under the same disk/view checks; failure does not destroy earlier undo or retry authority.

A save no-op is allowed only when the exact readable saved baseline already represents the requested valid logical records, persistence is saved and there is no pending unsaved value. An absent fallback equal to the candidate must still write on explicit Save. Memory equality after a failed write cannot produce a false “Saved” result. Save-generated timestamps change once for a real candidate, not on each retry; native restore retains its own timestamp envelope. A same-content saved no-op does not rewrite a timestamp.

Protected corrupt A and newly observed B remain separately downloadable. Every newly unseen disk value must first warn and invalidate previews, even when A already blocked the session. After that visible warning, a second explicit fresh preview may bind B. If B becomes C, warn again. Never replace the only protected A with B silently. Read denial is `undefined`, not absent `null`; no authority can bind an unreadable baseline. Reload read/parse failure keeps valid memory, raw forms, original recovery copies and pending desired export, and must not claim a saved version loaded.

A recovery preview is instance-owned, one-use and tied to key, exact bytes/presence, current memory hash, session generation and view token. File selection, empty/invalid replacement choice, cancel, save/delete/sample, undo, reload, external-change notice, form change and disposal revoke prior authority at their start. Older reads/digests cannot reopen previews or reset a newer form. Preview does not adopt unseen disk bytes without warning. Apply performs no fetch or file read and rechecks all bindings under the lock.

Clear is an explicit **remove of only the selected saved key**, with a fresh empty unsaved model after success. Its review says this plainly; it never silently writes a blank object or clears all localStorage. A valid empty object can still be explicitly saved/restored. The previous valid state is available for one guarded undo. Sample is a fictional full replacement requiring review, not an escape around corruption/conflict. Undo is one guarded replacement, never a direct assignment followed by a hopeful save.

No application callback runs under a held lock. Production factory options cannot accept caller validators, alternate keys or serializers. A test-only generic cell may inject storage/locks/checkers from excluded fixtures; it must not be imported by application code. Constructor observers are notification-only after locks release. Controls verify the exact owned session/tracker pair through a private binding helper, not a matching key string.

## UI journeys and dirty-form scope

1. **Open:** install submit interception and disable mutation controls before any awaited initialization. Read one fixed key. Render valid records, or clearly offer raw recovery without inventing an empty saved view. No probe/startup/automatic migration write is allowed.
2. **Edit/save:** preserve raw form text. Capture the entire logical candidate based on the current session. Await the guarded save. Reset/close/mark-clean only the same captured form and only if its generation is unchanged. A newer form remains intact after either success or error. Library-only actions do not mark unrelated forms clean.
3. **Export:** native JSON includes the complete current valid records, including a failed-save candidate, with an accurate persistence warning. Search/status filters never shrink it. CSV/Markdown remain derived working documents; neither is a restore file. Native JSON excludes unsubmitted controls. Offer a separate raw-form archive plus separate protected/observed saved-copy archives. Download initiation is not native saved-file proof or permission to discard forms.
4. **Restore:** read a bounded selected file explicitly, show program/organization, four/five scope counts and replacement/dirty-form warning, then require deliberate Apply. Wrong program, bad schema, extra future fields, invalid new file, timeout and cancellation leave all existing data untouched. A stale preview cannot be revived.
5. **Reload/conflict:** explain saved bytes versus this tab's memory and dirty forms. Explicit reload may discard only the captured local state; newer edits revoke it. Failure retains recovery. Replace-local is a fresh preview, not today's unguarded Keep this page action.
6. **Clear/undo/sample:** each is a deliberate guarded operation. Failed writes remain unsaved and exportable. Partial UI cleanup does not imply persistence. No source data, auxiliary key, graph, or shared organization is changed.

General recovery forms include context and each open/new/edit record form, with collection and editing record ID; no record ID is regenerated when saving an edit. Local OS recovery includes context and the currently open editor with kind/record ID, including invalid amount/date/depth text. A saved-record backup does not claim to include these raw forms. Search/filter controls may reset after an explicit successful reload; they do not carry saved-record authority.

OS project deletion retains its existing explicit behavior: linked grants/tasks/outcomes stay present with `projectId:''`. The confirmation must show the affected counts before this full candidate is captured. No shared-service contact/approval/booking is removed. The planning controls' “confirmed” labels and outcome evidence choices remain self-recorded local data, not proof of real authorization, volunteer placement, fieldwork or independent review.

## Implementation ownership and acceptance

Proposed files: new `src/lib/client/program-record-recovery-schemas.ts`, `program-record-recovery-formats.ts`, `program-record-recovery.ts` (internal namespaced cell permitted) and `program-record-recovery-controls.ts`; focused schema/engine/mounted tests and excluded fixtures. Integrate `_program-workspace.astro` once for its five wrappers and `tools/charity-os.astro` once. Remove their opt-in synchronous `save`/`canPersist` paths; leave general `store.ts`, `persist.ts`, nine partner desks and shared OS untouched. `charity-os.ts`/`program-workspaces.ts` keep pure business helpers; boundary/async integration must not leave a bypass synchronous writer in these two callers.

| Acceptance                 | Meaningful test                                                                                                                                                             | State                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Exact native compatibility | All five actual sample/empty exports plus real field-limit/choice matrix; OS linked fixture with null, zero, negative value and per-collection IDs; no byte/ID/field repair | Required before code freeze  |
| Safe loading               | Absent, saved empty, literal null, duplicate JSON, malformed UTF-8, future fields, read denial; no write/probe and no invented loaded blank                                 | Required                     |
| Concurrent save            | Two real sessions using the same lock; one running/one pending; silent foreign bytes before commit refuse; no Promise-truthiness success                                    | Required                     |
| Failed persistence         | Full valid memory/raw forms survive set/remove denial; exact retry and explicit failed-memory undo; absent-equal and failed-equal are not saved no-ops                      | Required                     |
| Recovery A/B/C             | Initially corrupt A, silent B before preview, repeated C; first warning plus distinct A/B downloads; no hidden adopt-on-preview                                             | Required                     |
| Async ownership            | Held lock; mutated options/caller input; A file then invalid B/cancel; queued stale restore/clear/reload/undo/save; late results never overwrite newer DOM                  | Required                     |
| Native capacity            | Exact whole 8,000,000-byte general fixture and +1; OS compact and whole admission; full escaping/multibyte; same export reimports                                           | Proposed cap, required proof |
| Raw scope                  | UTF-16 exact raw archive, dirty invalid form archive; full versus filtered exports; native record backup visibly excludes forms                                             | Required                     |
| Six mounted callers        | Actual SSR/inline scripts, current scripts' eight failures become refusals/recovery; failed write never closes newer editor, no-JS submit remains safe                      | Required                     |
| Native browser             | Fictional own keys only; two tabs, quota/read denial through controlled harness, file chooser restore, keyboard and 320/390 light/dark                                      | Pending; no current claim    |
| Publication                | Exact final build/check/CI and public-byte proof                                                                                                                            | Pending; no deployment claim |

The public contract and meaningful checks must land before the runtime slice is called complete. Native Save is a separate capability check; generated Blob bytes and file chooser input are not evidence that an operating system wrote a downloaded file. Human institutions, pilots and actual independent review remain outside these engineering tests.
