# Grant-period reports

Implementation and acceptance record · October 26, 2026 · review: draft · AI-assisted

The bounded O2 feature assembles a report for **one grant agreement, one program and one inclusive date period** from selected, currently approved records. It preserves source revisions, financial missingness, individual observations and an immutable output. It adds no accounting integration, funder submission, payment, public publication or email delivery.

Runtime **`c9750a92f0ac6d5f2b717875f5e0a85f08e98edb`** is promoted as **`dpl_6FZTpTgrSCfiJcsPazysjGdNfW5D`** at [the shared application](https://os.charitology.org). [Exact CI run 40457150312](https://github.com/theguysaccount/charitology/actions/runs/40457150312) passed 244 OS unit/browser-model checks, 69 actual OS PostgreSQL checks, 75 mail unit checks, 9 mail PostgreSQL checks and the 447-page build/check. Controlled authenticated Chrome, downloaded JSON, print preview and board privacy passed with fictional data. Narrow-screen browser acceptance remains unverified. [SHARED_OS_RELEASE.md](SHARED_OS_RELEASE.md) records the hosted proof and its limits. The [frozen implementation plan](GRANT_REPORT_PLAN.md) preserves the pre-code decisions.

## Prepare, approve and freeze

1. Keep the application, recorded agreement, financial references and outcome definitions in their typed modules. A submitted application's server-recorded artifact remains distinct from its later current revision. The report requires current independent approval of each factual source; an older approved snapshot cannot substitute for an edited working record.
2. Save an ordinary Reporting record with assembly method `grant-report-v1`, its explicit program/agreement, period, intended staff or board audience, selected receipt/finance/outcome IDs, summary and gaps. Write summary and limitations for that audience. Do not put private case or personal information into a board narrative.
3. In **Grant reports**, choose the saved manifest and select **Prepare sources**. The server checks source eligibility, permissions, dates and relationships and shows a source-derived preparation view. This accepts an unapproved manifest, with approved factual sources. It does not approve or freeze anything.
4. Inspect the preparation, then choose **Save these source versions to the manifest**. The normal revision-checked save stores a source digest and clears earlier approval. A different authorized contributor must review and approve that exact saved revision, then move the manifest to Approved. A source or manifest-data change requires fresh preparation and approval.
5. Choose **Preview approved report**. Inspect the exact report and its missingness, source references and limitations. The preview expires after ten minutes. Freezing rechecks current membership, scope, manifest, source data and independent approvals inside the organization transaction.
6. Explicitly acknowledge the version and select **Freeze this reviewed version**. The server stores an append-only report and minimal audit event together. Authorized readers can reopen it, download its JSON or use the print view. Printing and downloading do not publish it or send it to a funder.

Software approval records an authorized second account's action. It does not establish professional accreditation, independent verification of the contents or actual human review of synthetic test data. Tasks and reminders remain separate workflow tools; a completed task does not prove grant compliance.

## What the numbers mean

The output keeps agreement award, commitment and recorded agreement spending separate from selected external receipts, selected cash-spent references and planning context. An award or budget is never labeled cash received. A parent budget is context, not another amount to add. This version rejects unresolved amendments or conflicting restrictions instead of choosing a precedence rule.

Receipt inputs are explicitly agreement-linked Fundraising gift references with a date, receipt reference and external source identity. Spending totals use Finance references explicitly classified `cash-spent` with a date in the reporting period. Other finance references remain labeled context or planning. Their external records have not been reconciled to a bank or certified as a complete ledger by the OS.

Money retains integer minor units, currency and precision. All selected money must match the agreement currency; there is no exchange conversion or inferred refund/net calculation. An unknown amount stays null. If any selected amount is unknown, the headline total is unknown and the known subtotal and missing-reference count remain visible. An empty selection is not evidence of zero activity. Duplicate selected IDs and repeated normalized external identities are rejected, but different identifiers alone do not prove that two references describe different cash movements.

The full reporting period must fit within the agreement. Selected dated facts and complete selected measurement periods must fit within the reporting period; no proration is inferred. Each outcome observation or harm retains its own value, unit, period, denominator where required, method, evidence and limitations. Zero remains distinct from unknown. Different indicators, populations or units are not pooled, and a reported change is not proof that the program caused it.

## Access and privacy

Creation requires current Reporting write/export permission plus current read/export permission for every copied source module and explicit program scope for the entire source closure. The service rechecks membership rather than trusting historical creator flags or client-supplied authority.

Staff readers need current source-module read/export permission and scope for the frozen material. A board reader with current Reporting read permission and matching program scope receives only the stored board projection of a manifest deliberately marked for a board audience. External reviewers have no grant-report access in this version. Generic module snapshots retain their previous permissions and shape.

The board projection includes the approved summary, period, program, restrictions, separate financial facts, aggregate observations, gaps and safe source IDs/revisions/hashes. It excludes full application context and narrative, donor/contact references, external receipt or ledger identities/URLs, source URLs, actor and command metadata, comments, attachment bytes and raw source envelopes. The board checksum covers that projection; it does not verify the private staff payload. The full payload has a separate checksum that includes the board result.

An allowlisted projection cannot guarantee that an author has kept a free-text summary or limitation free of personal information. Authorized contributors must inspect those fields before approving a board manifest. There is no public report endpoint or automatic sharing. Access revocation cannot recall a file already downloaded.

## Stale work, replay and corrections

Changed source data, approval or membership invalidates a cached preview. The service creates no partial report when validation or quota admission fails. After an interrupted freeze, inspect saved reports or retry the exact original command; a lost response is not proof that nothing was stored.

The original mutating command is durably bound to its actor, key and reviewed preview. Its exact replay returns the same immutable report only while the caller retains current read permission. A changed body with that recorded key returns a conflict. A newly reviewed command for the same approved manifest revision and source digest opens the existing edition without adding a row. That read-existing response has `commandRecorded:false`: it does not permanently bind the new key or rewrite the original command.

A correction requires changed manifest data, a reason and a reference to the earlier same-agreement report, then fresh source preparation and independent approval. It appends a new edition. Later source edits do not recalculate the old bytes or checksum.

Private workspace backups preserve frozen report payloads. Recovery retains historical reports only in the administrator's original source archive; it does not recreate active reports, previews, trusted approvals or board access. Imported manifests start unapproved. A new destination report needs fresh local approvals. Keep the original source archive separately from later current-workspace backups.

## Bounds and interfaces

The implementation permits at most 100 explicitly selected rows, 250 records in the dependency closure and 2 MiB of canonical final report JSON. Four live previews share an 8 MiB measured Postgres row budget per organization and expire after ten minutes. Preview proof storage includes a small bounded authorization envelope. Previews and frozen reports count toward the existing ordinary workspace budget; report previews do not occupy committed import-archive slots.

Commands are bounded at 16 KiB. Grant-report endpoints allow 120 reads and 60 prepare/preview/freeze commands per account per hour. Lists return at most twenty accessible reports per page. These bounds do not reserve future capacity or promise exact-time availability.

All paths below start with `/api/orgs/:orgId/grant-reports`. Mutations use the existing authenticated session, exact origin and CSRF token. Private fields belong in the JSON body, never a query string.

| Method/path      | Input and output                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| `POST /prepare`  | `{reportingRecordId,revision}` → source digest and preparation report; no report is saved.      |
| `POST /preview`  | Same body → expiring preview ID, review hash and exact approved report.                         |
| `POST /freeze`   | `{previewId,reviewHash,idempotencyKey}` → immutable report plus `reused` and `commandRecorded`. |
| `GET (base)`     | Current accessible metadata, optional returned `cursor`, at most twenty rows and `nextCursor`.  |
| `GET /:reportId` | Current-authority-selected full staff payload or board projection.                              |

Source: [pure model](../services/charity-os/lib/grant-report-model.mjs), [tenant service](../services/charity-os/lib/grant-reports.mjs), [reader and workflow UI](../services/charity-os/public/grant-reports.js), [module contracts](../services/charity-os/docs/MODULES.md).

## Verification and remaining gates

- **Focused automated checks passed:** 29 pure-model groups and four service tests cover arithmetic, unknowns, date/period bounds, historical submission lineage, source closure, permissions, board-private fields, checksums, stale authority and request bounds.
- **Isolated actual Postgres checks passed:** nine tests, including the parent and eight workflow groups, exercised the real request handler, constrained runtime role/FORCE RLS, normal separate-account approval transitions, concurrent freeze, original-key conflict, natural edition reuse, correction immutability, stale source/membership rejection, quota rollback, legacy report compatibility and private recovery. The fixture used synthetic source approvals/submission artifacts and injected server identities, then dropped its random schema. It did not exercise actual Better Auth sign-in, a human review, an accounting system, a production grant or a provider send.
- **Exact release checks passed:** the linked runtime CI passed all 244 OS checks and 69 actual database checks, plus mail and static checks. Production inspection confirmed 22 forced-RLS tenant tables, a constrained application role, context-free zero preview rows and append/read-only frozen-report privileges. All 29 protected-stage and 30 public-origin checks passed, including nine exact committed asset/shell hashes and HTTPS enforcement. No new provider credentials or production financial records were created.
- **Controlled actual Chrome passed:** real Better Auth and temporary constrained PostgreSQL supported author preparation/digest save, a separately authenticated synthetic second account’s API approval, keyboard acknowledgement/freeze, one saved edition, actual 54,278-byte downloaded JSON with recomputed staff/board checksums and HTTP equality, a ten-page Chrome print preview, board projection, stale-source rejection, unchanged historical checksums and both logouts clearing private DOM. The fictional scenario kept a USD1,000 award, USD300 receipt, USD100 spending reference, USD800 planning budget and a measured zero observation distinct. Fixture cleanup exited successfully and drop-verified its schema; provider calls were zero. The viewport override did not change the actual width, so narrow-screen acceptance is unverified. Print preview was cancelled; no physical print or PDF, comprehensive accessibility review or real pilot is claimed.
- **Operating gates remain open:** a consenting pilot, actual two-person review and reporting cycle, accountant-reviewed source mapping, measured administrative burden, independent security/accessibility review and support/retention decisions. Multi-program reports, external funder access, effective-dated amendments, automatic ledger connections and causal evaluation are outside this slice.

The registry now contains 26 modules and 339 fields. This bounded report feature does not complete all OS operations, the original 66-item ambition or a staffed charitable institution.
