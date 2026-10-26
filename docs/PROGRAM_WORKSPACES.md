# Nine program workspaces: scope and verification

October 26, 2026. This records the software added after the [31-item implementation pass](IMPLEMENTATION_NOTES.md). That earlier record is historical and remains intact.

All nine formerly partner-only program pages now have usable browser planning workflows. Together they contain **46 collections and 68 fictional example records**, including a separate institutional-readiness collection in each workspace. These counts describe software and examples, not operating programs, participants, commitments or results. All 26 program pages now have live functions; the nine institutions described here still need people, authority, resources and outside review.

## What each workspace does

| Program | Saved work and useful output | Operating requirements that the software does not establish |
| --- | --- | --- |
| [The Charitology Fund](https://charitology.org/programs/the-charitology-fund/) | Grant proposals, conflicts and recusals, conditional allocation decisions and a nonpayment authorization ledger. The summary separates proposal asks, allocation plans and ledger entries. A selected-field transparency draft can be exported separately from the internal kit. | A legal home, fiscal sponsorship, independent governance, real resources and an allocation method that has passed public review. No gift is accepted, grant funded, eligibility verified or payment authorized through this tool. |
| [Charity Incubator](https://charitology.org/programs/charity-incubator/) | Gap and existing-work checks, project stages, experiments, milestones and handover notes. Keep the search for an existing partner visible before proposing a new organization. | A host, funded resources, experienced people, safeguards and actual permission to launch. A gap in the notebook does not prove no organization exists. No founder is recruited and no charity is established. |
| [Question Bounties](https://charitology.org/programs/question-bounties/) | Question specifications, answer criteria and appeal plans, unverified conditional pledges, evidence submissions and local review/conditional-award records. | A legal home, verified funds, an actual offer and independent judging. No pledge is collected or verified, contract created or prize opened, promised or paid. |
| [The Charitology Prize](https://charitology.org/programs/the-charitology-prize/) | Categories and criteria, nominations of public work, jury interests and recusals, deliberation reasons and dissent. Export a draft jury packet. | Prize funding, an accountable host, an appointed independent jury, safeguards and a fair process. The software produces no automatic winner, numerical charity rating or awarded prize. |
| [Charitology Fellowship](https://charitology.org/programs/charitology-fellowship/) | Public project proposals by code, curriculum and facilitated sessions, milestones and supervision plans, and fairness/review notes. | A host, supervisors, resources, consent and a real review process. No application is submitted, person recruited or selected, stipend offered, employment established or competence certified. |
| [Donor Advisory](https://charitology.org/programs/donor-advisory/) | Goals and unresolved choices, alternative giving scenarios, moral lenses, evidence questions, decisions and follow-up. Export a discussion notebook that keeps tradeoffs visible. | Qualified people, a defined engagement, independent conflict rules, privacy and a challenge process. This is not a charity recommendation or personalized tax, legal, investment or estate service. |
| [Nonprofit Advisory](https://charitology.org/programs/nonprofit-advisory/) | Diagnostic questions, evidence and full-cost notes, proportionate actions and learning/adaptation checkpoints. Export an organization learning plan. | Advisors, evaluation partners, independent funding, organizational ownership, capacity and appropriate safeguards. No consulting engagement, financial audit, evaluation finding or certification is established. |
| [Charitology Summit](https://charitology.org/programs/charitology-summit/) | Provisional sessions, facilitation-role placeholders, access and production checks, working outputs and follow-up. The summary checks overlapping slots; complete noncancelled slots can be exported as a tentative UTC calendar. | A responsible host, venue, actual schedule, funding, access arrangements, safeguarding and recording consent. No speaker, invitation, registration or event is confirmed. |
| [Field Verification](https://charitology.org/programs/field-verification/) | A claim/evidence checklist, nonpersonal findings and uncertainty notes, unresolved safeguards, response/correction records and proposed corrective actions/rechecks. Export a protocol and limitations, not a verified verdict. | Funded and appropriately qualified local partners, community participation, ethics/consent/safety arrangements, independence, data governance and an agreed response/correction process. No visit, interview, audit or independent verification has been conducted by publishing this software. |

Each page retains its longer-term charter and states its current limits. Institutional-readiness records have statuses such as “Not established” and “Evidence recorded locally.” Even a completed local record is not outside authorization or independent approval.

Depth describes a specific activity and remains a hypothesis where entered. It does not grade the good being done. The workspaces do not score or rank named charities, infer motives, assess applicants automatically or turn planning amounts into measured impact.

## Shared editing and exports

Every workspace provides context and scope fields, dedicated collection forms, create/edit/delete actions, a one-step undo, search across saved text, collection counts, explicit empty states, fictional examples and a generated draft preview. Save each form before relying on a summary or export. The preview and exports use saved workspace state, not text still being edited in a form.

Three exports are available in all nine:

- **JSON backup:** the editable, versioned workspace, including context, record IDs and every collection. Import validates the program, version, field types, enum choices, dates, URLs, IDs and size before replacing the current workspace. A backup from another program is rejected. Unrecognized fields are omitted rather than treated as approval metadata.
- **CSV:** all saved fields in a long format with section, record ID, field, label and value. Text resembling a spreadsheet formula is escaped. This is an analysis/interchange export, not the supported editable restore format.
- **Markdown kit:** saved context and records, planning summaries, working prompts, limitations and a review-status notice. It includes all records even when a search filter hides some on screen. It is a draft to inspect before sharing, not a publication or submission.

The Fund also exports a **selected-field transparency draft**: the public-purpose summary, conditional allocation records and nonpayment ledger fields. Internal proposal/intake and conflict records are excluded. This selection is not a privacy guarantee; inspect all included free text, sources and authority before sharing.

The Summit also exports **ICS calendar files**. Entries use UTC, remain tentative and contain no attendee or organizer invitations. Incomplete or cancelled sessions are excluded and the export reports its included/excluded counts. Sessions can cross midnight; overlapping slots are disclosed rather than silently rescheduled. Importing a calendar into another application does not announce a summit.

No export sends email, publishes a document, contacts a partner, submits an application, schedules a server reminder or moves money. References between records are user-entered codes or labels, not verified identities or externally reconciled transactions.

## Planning numbers and limits

Blank optional amounts remain unknown; an explicit zero remains zero. Known amounts are grouped by currency/unit without combining unlike units or inventing an exchange rate. Currency labels that differ only in letter case are grouped together. Proposal requests, conditional allocations and ledger authorizations describe different stages and are never added together as one cash balance. Illustrative and withdrawn pledges do not count as funded prizes.

Each workspace supports at most **500 records in total**, **250 in one collection** and **8,000,000 bytes for a formatted JSON backup**, with capacity reserved for the next save timestamp. Text limits are 500 characters for ordinary fields and 5,000 for long notes. Oversized imports and mutations are rejected before replacing the working data. Large projects need separate exported workspaces before reaching those limits.

The backup limit is not a promise of browser storage capacity. A browser quota, private window or blocked storage can prevent saving earlier. Amount fields accept bounded planning inputs with at most two decimal places; these are not a general accounting or multicurrency settlement system. The public pages and source-linked program charters explain each workspace's other boundaries.

## Local persistence and recovery

Data stays in the browser's local storage under `charitology.partner-workspace-v1.<program-id>`. Each program has a separate key. There is no login, server database, cross-device synchronization, encryption service, access control or organization tenancy. Clearing browser/site data or losing the browser profile can remove the only local copy.

Use public information, aggregate notes, project codes and role placeholders. Do not enter private finances, contact details, personnel or applicant records, beneficiary histories, medical information or confidential documents. The field-protocol workspace also excludes site coordinates and participant accounts. A local-only design does not make a shared browser a suitable sensitive-record system.

Recovery paths are explicit:

1. **Back up routinely.** Export JSON after saving forms and before changing devices, clearing a workspace or replacing it with an example/import. Keep a separate copy under the organization's own appropriate storage arrangements.
2. **If saving fails, keep the page open.** A warning identifies in-memory-only changes. Export the current JSON before reloading or leaving. Unsaved forms are not included; copy their text separately if they cannot be saved. Navigation warns when forms or failed-save changes remain unsaved.
3. **If another tab changes the workspace, do not overwrite it.** Editing pauses and writes check the stored version. Export the current page's version if needed, then load the stored version. No automatic merge is attempted. Loading a storage version clears the previous undo snapshot so it cannot restore unrelated older data over the new version.
4. **If stored data is unreadable, preserve it first.** Editing pauses and the original stored text can be downloaded. Import a valid backup for that program, or deliberately clear/load an example after retaining any data needed for recovery. An invalid import does not replace the existing workspace.
5. **Use undo for the last local mutation.** It is a single snapshot for the current loaded session, not a version history or durable backup. A later mutation replaces it; a reload or explicit storage-version load clears it. Clear/example actions require confirmation, and replacement prompts disclose unsaved work.

## Verification evidence and remaining browser checks

This record distinguishes model checks from browser checks. It does not claim a human content/source review, a completed institutional process or provider acceptance.

| Evidence | Result recorded for this pass |
| --- | --- |
| [`scripts/check-partner-programs.mjs`](../scripts/check-partner-programs.mjs) | **16 scenario groups passed**, rerun while writing this document. The script bundles the actual model and checks all nine configurations, 68 examples, empty/sample JSON round trips and strict TypeScript for the real Astro browser module. |
| Numerical and export cases in that script | Unknown versus zero amounts; currency grouping without stage double-counting; withdrawn/illustrative pledges; precision and unsafe inputs; selected-field exclusions; formula-safe CSV; tentative UTC calendars, midnight rollover, overlaps and calendar injection/folding. |
| State/recovery cases in that script | CRUD identity and stale edit IDs; malformed/wrong-program imports; duplicate IDs and limits; stale-tab writes during edits, clears and imports; backups larger than 2 MB; the 8 MB boundary and next-timestamp reserve; rejected mutations leaving state intact; undo invalidation and failed-save warnings. |
| Separate agent review | The maintainer reports **eight adversarial checks** by a separate agent. This is additional technical review, not independent human review of the project or its sources. |
| Desktop browser checks | The maintainer verified create/edit, reload persistence, filtering and generated drafts across all nine routes. |
| Mobile browser checks | At a **390 × 844 browser viewport**, the maintainer loaded each of the nine fictional examples, deleted one card and used Undo to restore the exact count. Each document stayed at 390 pixels wide without horizontal overflow. The temporary viewport was reset afterward; these are browser checks, not tests on a physical phone. |
| Browser import flows | The maintainer verified a valid seven-record import and rejection of an invalid backup without changing the record count. A real **2,149,860-byte JSON file** imported successfully and displayed 140 cards; deleting one produced 139 and Undo restored 140. This does not claim a browser test at the full 8 MB limit. |
| Actual browser downloads | The maintainer downloaded and inspected representative shared-engine exports: field-protocol JSON with nine records; CSV with 71 rows and five columns; an 11,464-character field-protocol Markdown kit; a Summit calendar with one `VEVENT` inside a valid `VCALENDAR`; and a 1,087-character Fund transparency draft that excluded internal conflicts. These checks cover the common export implementation and the two program-specific formats; they do not claim every possible record combination was exercised. |

Run the bounded model and type checks from the repository root after `npm ci`:

```sh
node scripts/check-partner-programs.mjs
```

They also run through `npm run check:completion`. The release's ordinary build, content, reference and internal-link checks remain necessary; see [HANDOFF.md](../HANDOFF.md) for the current commands and final release state.

The shared implementation is [`PartnerWorkspace.astro`](../src/components/programs/PartnerWorkspace.astro), [`partner-programs.ts`](../src/lib/client/partner-programs.ts) and the [`partner-*` configuration files](../src/data/partner-programs.ts). Each public route has its own matching wrapper and charter. This document records this pass's scope; it does not replace the charters, [original brief](ORIGINAL_BRIEF.md) or earlier release history.

## Shared Charity OS plan and email state

The new [OS planning page](https://charitology.org/for-charities/os-plan/) publishes [a draft implementation plan](CHARITY_OS_PLAN.md), ten official-source system dossiers and a purposive sample of twenty public discussions. Its 26-module feature universe and Phases 0–5 describe proposed work, with architecture comparisons and pilot acceptance gates before a shared build. Features, licenses, prices and repository observations are dated research, not independently tested integrations or a complete market census. No shared OS service or pilot outcome is established by publishing the plan.

Email delivery remains pending. Provider authorization and end-to-end confirmation, unsubscribe, suppression and delivery checks are not completed; no working newsletter service is claimed here. The exact setup state belongs in [EMAIL_DELIVERY.md](EMAIL_DELIVERY.md), which the maintainer will update when implementation and controlled delivery are verified. Public letter and RSS availability are separate from email delivery.
