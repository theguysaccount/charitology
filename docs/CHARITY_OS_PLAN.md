# Charity OS: research and implementation plan

Editorial draft · October 25, 2026 · AI-assisted desktop research. No pilot organizations have tested this plan. The existing browser workspace is live; the shared service described here is proposed.

## The decision

Build a modular operating and learning workspace for charities, beginning with a small shared program-and-grant workflow. Connect to established systems where they already do the job. Before selecting the shared architecture, run the same pilot scenario against an integration with CiviCRM and a small Charitology-owned workspace. Keep the current local workspace available and make migration optional.

This recommendation is a design hypothesis. Public discussions support investigating fragmented records, repetitive reporting, grant restrictions, scheduling and migration burden. They do not establish market size, willingness to pay or that another application will improve outcomes. A useful OS should reduce repeated administration while making decisions, uncertainty and feedback easier to inspect.

Charitology studies charity as a system. The OS should connect a program's resources, work, intended change, evidence and decisions. It must accommodate relief, repair, prevention, structure and source without treating depth as a grade. It must let communities challenge assumptions without publishing personal service histories. It must not turn incomplete data into ratings of named charities.

## What exists today

The [current Charity OS](https://charitology.org/tools/charity-os/) stores organization context, projects, grant stages, tasks and observations in one browser. It supports editing, deletion, undo, search, filters and validated JSON backups plus CSV export. It has storage-error and conflicting-tab notices.

It has no shared accounts, server database, organization permissions, email reminders, payment handling, accounting ledger or individual case-management system. A JSON backup is a useful transfer format, not cloud synchronization. Browser data must remain recoverable when the shared product is introduced.

## Research and limits

The public research desk publishes a provider matrix, a 20-discussion needs register and this plan at [the OS planning page](https://charitology.org/for-charities/os-plan/). Each observation links to its primary discussion. Provider claims link to official documentation or repositories. Repository status, prices and features are dated snapshots, not independent product tests. An unknown feature is not recorded as absent.

The discussion sample is purposive and predominantly English-language. It overrepresents people who seek technical help and may contain promotional replies. Removed original posts were excluded; vendor comments were not used as product verification. No people were contacted, no private communities were accessed and no user identity or beneficiary records are reproduced. A thread is one observation even when it has many replies. Repeated themes are signals for interviews, not estimates of prevalence.

### What the observations suggest

| Proposed requirement                                   | Supporting observations | Design implication                                                                                      |
| ------------------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------- |
| Flexible volunteer schedules and participation history | U01–U04, U20            | Partial shifts, capacity, overnight attendance and a simple portal need explicit scenarios.             |
| Grant workflow beyond a deadline list                  | U05, U06, U14, U15      | Connect application versions, approvals, restrictions, commitments and reporting deadlines.             |
| Reusable reports from defined data                     | U07, U09, U13           | Preserve units, dates, denominators, sources and missingness; reports need traceable inputs.            |
| A migration and adoption process                       | U08, U11, U19, U20      | Preview imports, reconcile totals, keep a rollback and train multiple administrators.                   |
| Controlled sensitive service records                   | U03, U09, U10           | Separate restricted case systems from general operations; specialist review precedes real service data. |
| Affordable modular operation                           | U01, U11, U12, U16, U19 | Publish total operating costs and allow one module to work with the organization's existing tools.      |
| Nonprofit language and offline inclusion               | U12, U17, U18           | People without email must still be representable; a planning status must not imply payment settlement.  |

These links identify evidence for investigation. They do not validate a finished solution.

## Who the first pilot serves

Proposed first users are a small charity's program lead, grant coordinator and operations administrator, plus a board reader and a community adviser. Pilot recruitment is still open. Seek three organizations with different contexts: a volunteer-led local service, a grant-funded program and a membership or advocacy organization. Include at least one team with low technical support and one low-bandwidth workflow. Staff size is not yet a product limit.

Before recruitment, agree on who owns hosting, support, privacy decisions and the recurring budget. Ask participants for consent to research their workflows. Use synthetic records for the architecture comparison. Do not request beneficiary histories in public issues or pull requests.

### Questions to test with users

1. Show the last grant application and report process using redacted examples. Which information was entered more than once? Where did a handoff fail?
2. Which deadlines or decisions are currently missed, and who notices? What is the baseline time spent each month?
3. Which data can be exported today, with what attachments and identifiers? Which records must remain in another system?
4. Who may see, edit, approve, export and delete each kind of record? Who should never see it?
5. How do people affected by the work correct a record or contest a decision? Can they do that without an account or email?
6. Which volunteer schedule exceptions occur in a normal month? How are overnight attendance, cancellations and substitutions handled?
7. What would the team stop doing if it adopted this tool? What is the ongoing time and cash budget, including administration and training?
8. What evidence after one reporting cycle would justify continuing, changing direction or stopping?

Do not ask only which features people want. Observe a workflow and test whether the proposed change removes work.

## The full feature universe

The list below preserves the ambition without pretending that every module belongs in the first release. “Connect” means evaluate an integration; it does not claim an existing connector.

| Module                         | Proposed scope                                                                                                    | Initial approach                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Organization and access        | Organizations, teams, invitations, roles, scoped permissions, account recovery, administrator handover            | Shared foundation                                            |
| Mission and program design     | System map, theory of change, stakeholders, optional depth hypotheses, assumptions and decision records           | Build on current workspace                                   |
| Projects and tasks             | Owners, dependencies, recurring work, milestones, board/calendar views and review dates                           | Extend current workspace; compare an OpenProject connection  |
| Grant seeking                  | Prospects, eligibility, deadlines, application text, attachments, approvals and immutable submission snapshots    | First shared workflow                                        |
| Grant delivery                 | Agreements, restrictions, budget lines, commitments, reporting periods, amendments and renewals                   | Second workflow; accountant review                           |
| Finance planning               | Budgets, scenarios, currency, allocation factors, capped proposed allocations and budget-to-actual reconciliation | Planning plus ledger integration                             |
| Accounting and payroll         | General ledger, bank reconciliation, statutory accounts, tax and payroll                                          | Connect to specialist systems; no replacement claim          |
| Contacts and relationships     | Organizations, people, households, multiple roles, deduplication, preferences and interaction history             | Evaluate CiviCRM integration before a new CRM                |
| Giving and fundraising         | Campaigns, pledges, recurring gifts, acknowledgments, restricted gifts and reconciliation                         | Connect to fundraising/payment systems                       |
| Memberships                    | Types, renewal windows, dues, chapters, offline members and member directories by explicit choice                 | Evaluate CiviCRM or association tooling                      |
| Volunteers                     | Interests, skills, onboarding, training, availability, capacity, shift exchanges and hours                        | Dedicated pilot after shared core                            |
| Events and learning            | Sessions, capacity, registration, access needs, calendar export, attendance and follow-up                         | Connect or build a narrow scheduling module                  |
| Communications                 | Consent by purpose, templates, approvals, suppression, double opt-in, delivery events and unsubscribe             | Use established mail delivery                                |
| Forms and intake               | Validated forms, versions, consent, accessible alternatives and optional offline capture                          | Evaluate KoboToolbox for field collection                    |
| Service delivery and casework  | Referrals, requests, restricted notes, approvals, appointments and service records                                | Separate specialist integration and review gate              |
| Evidence and outcomes          | Indicator definitions, periods, units, denominators, sources, missing data, harms and interpretation              | Charitology learning layer                                   |
| Community feedback             | Accessible feedback routes, consent, anonymous options, response ownership and published changes                  | Co-design before launch                                      |
| Evaluation and learning        | Review questions, evidence grades, counterfactual assumptions, experiment protocols and decision follow-up        | Connect existing Charitology instruments                     |
| Reporting                      | Funder templates, board packs, reporting periods, frozen outputs and source-to-cell traceability                  | Reusable reports before visual polish                        |
| Governance                     | Board meetings, decisions, conflicts, approval policies, delegation and public transparency exports               | Restricted governance workspace                              |
| Documents and knowledge        | Versioned files, retention classes, program handbooks, search and handover guides                                 | Integrate document storage; no public uploads by default     |
| People and safeguarding        | Training and screening completion references, responsibility and escalation routes                                | Restricted status records; specialist systems retain reports |
| Assets and supplies            | Equipment, stock, in-kind contributions, procurement and program use                                              | Later connector or module                                    |
| Resource discovery             | Tools, nonprofit benefits, eligibility review dates and renewal reminders                                         | Connect existing Charitology directories                     |
| Data and integrations          | Mapping, import previews, exports, API scopes, signed webhooks, deduplication and synchronization jobs            | Required from the first shared release                       |
| Administration and reliability | Audit events, support, backup/restore, incident response, accessibility, localization and cost limits             | Release requirements, not optional extras                    |

## Build, reuse and connect

The research matrix is the inventory for the decision. A broad marketing feature list is not enough to select a foundation. Test exact import, permission, export and restore scenarios in a supported version.

Run two bounded architecture spikes before committing to a platform:

- **Integration spike:** CiviCRM owns contact and contribution records; Charitology owns program assumptions, evidence and review decisions. Use a documented API boundary with explicit field ownership. Test how an organization leaves and how contact deletion propagates. Do not share a database or copy AGPL code into the MIT project.
- **Workspace spike:** A minimal independent Charitology organization workspace owns programs, grants, tasks and evidence. Import synthetic contacts as references, then connect to an external source. Compare the ongoing maintenance burden with the integration spike.

Evaluate KoboToolbox as a field-data source and OpenProject as a project source. Evaluate a specialized case system only when a pilot actually needs casework and can meet its operating requirements. Association tools and existing donation platforms may remain the system of record in their domains.

The spike comparison uses the same records, roles and report. Record installation steps, supported versions, hosting needs, export completeness, duplicate handling, permission behavior, administrator time and an upgrade rehearsal. Select a foundation only after the comparison. License compatibility requires repository- and file-level review; a product appearing in the matrix is not permission to copy it.

## Proposed shared architecture

This is a proposal rather than a deployed service. Keep the public Astro site on its current static host. Put the shared application and API behind a separate deployment so private data cannot enter the public build, search index, feeds or static API.

Use a relational store for relationships and transactions, a private object store for files and a durable job queue for notifications and connectors. Exact providers remain undecided pending the spikes and operating budget. Use managed identity rather than building password security. Enforce organization scope on the server and database, not only through hidden buttons.

### Data model

Every private record has an organization identifier, stable opaque ID, creation/update metadata and a revision. Proposed entities are Organization, Membership, RoleGrant, Program, Task, GrantOpportunity, ApplicationVersion, GrantAgreement, Restriction, BudgetLine, Commitment, MetricDefinition, Observation, EvidenceSource, Decision, FeedbackCase, DocumentVersion, Consent, Connector, SyncRun, Notification and AuditEvent. Contact and FinancialTransaction are references when another system owns them.

Store money in integer minor units with an explicit currency and supported currency precision. Do not sum unlike currencies. Store dates as dates and actual instants with time zones. A grant's deadline has a named time zone. Unknown measurements stay null; zero is a measured value. Observations retain value, unit, denominator, period, geography, source, collection method, evidence status and known limitations. A source-linked observation is not proof of causation.

Track who owns each field in a connector. An external update must not overwrite a locally reviewed value silently. Conflicts go into a queue with a source and proposed resolution. Repeat deliveries are idempotent. Imports have a preview, row-level failures, duplicate choices and reconciliation totals before commit. Keep an export and an import journal so rollback is possible.

### Access and accountability

Proposed roles are owner, administrator, program lead, grants lead, finance reviewer, contributor, board reader and external reviewer. Permissions are further scoped by program and data category. A volunteer should see their own assignments without receiving the donor database. A board reader receives approved reports rather than unrestricted case access. Export and public publication require distinct permissions.

Keep audit history for invitations, role changes, record changes, approvals, exports, integration activity and deletion actions. Store the minimum information needed to explain an event; do not place secret tokens or sensitive case text in logs. Corrections append a reason and preserve the prior approved version. Retention and deletion rules must account for both privacy needs and an organization's actual obligations, with human review where necessary.

## Phases and acceptance gates

Phases are ordered by dependency, not promised dates. Each ships a complete workflow with a way to leave. Detailed implementation estimates follow the spikes.

### Phase 0: validate and choose

- Recruit and consent three pilot organizations; map their roles, current systems, reporting cycle and data boundaries.
- Measure current completion time and error/rework examples for one grant-to-report workflow.
- Complete the two architecture spikes with synthetic records and documented operating costs.
- Agree ownership, support, data location, incident response, retention and budget. Choose the first workflow with users.
- **Exit:** the owner and pilot teams approve a scoped design and a comparison report. No real sensitive service data enters a prototype.

### Phase 1: a safe shared workspace

- Organization creation, managed sign-in, invitations, roles and membership revocation.
- Programs, tasks and evidence records from the existing local format, with revision checks and visible synchronization errors.
- Validated migration preview, readable exports and an independently exercised restore procedure.
- Tenant isolation, audit events, accessible keyboard flows and an operating cost limit.
- **Exit:** two synthetic organizations cannot read or change each other's records through the UI, API, file paths or background jobs. Revocation works for existing sessions. A second administrator restores an export into a clean environment.

### Phase 2: grant to report

- Prospect → approved application snapshot → recorded award/agreement → tasks → report → renewal.
- Deadline notifications with a named time zone, delivery status and retry handling; reminders are not grant submission.
- Reusable text and document versions, restriction-aware planning, one frozen board/funder report with source links.
- **Exit:** a pilot team completes its chosen reporting cycle with reconciled totals, traceable inputs and less re-entry. Log baseline and follow-up time; report inconvenience and null results as well as improvements.

### Phase 3: people and participation

- CRM connector with contact role mapping and consent purposes.
- Volunteer self-service, partial/overnight shifts, capacity and screening-completion status where needed.
- Membership or event workflow chosen by a pilot, with offline alternatives and accessible reminders.
- **Exit:** schedule exceptions, duplicate contacts, unsubscribe, invalid addresses and an offline member all have tested paths. The pilot can disable a connector without losing its local program records.

### Phase 4: finance and evidence connections

- Accountant-reviewed budget/actual mapping and restricted-grant planning, without replacing the ledger.
- Field-data import with versioned forms, metric definitions and explicit missingness.
- Feedback-to-decision tracking; report periods and source coverage remain visible.
- **Exit:** every report total reconciles to dated sources or is labeled as an assumption. Units and currencies cannot be combined incorrectly. A dispute or correction produces an inspectable change.

### Phase 5: specialist modules and public operation

- Consider casework, assets, payroll, advanced governance and grantmaking only when pilot evidence supports them.
- Sensitive casework needs a distinct review, operating agreements and access model before real records.
- Publish the supported integration/version matrix, upgrade policy, support responsibilities and actual running costs.
- **Exit:** independent security/accessibility review, recovery rehearsal, support handover and an organization-level exit drill pass before broad onboarding.

## A test scenario for every candidate

Create two synthetic organizations. Invite a lead, finance reviewer, contributor and board reader. Add a program with an optional depth hypothesis. Import a spreadsheet containing a duplicate, a malformed date and an unknown measurement. Resolve the duplicate and reject invalid rows without losing accepted records.

Create a grant with two deadlines in a named time zone, an application approval and a submitted snapshot. Record an award separately from its receipt. Link a restricted budget and proposed allocation. Correct an observation with a reason. Produce a report showing the value, denominator, period, source and unmeasured fields. Verify the board reader cannot open restricted files.

Schedule a partial volunteer shift crossing midnight, cancel it and reassign it without double-counting attendance. Revoke a user and test the old session. Repeat a notification webhook and an import to confirm no duplicate effect. Simulate a provider outage and recover the job. Export the organization, restore it in a fresh environment and reconcile record counts, relationships, attachments and money. Verify no private data appeared in the public site or logs.

## Measures of success

Agree the target with pilots after measuring a baseline. Track time per grant/report cycle, repeated data entry, missed handoffs, corrections needed, restore success, access incidents, adoption by role and total operating cost. Ask staff whether workload shifted to an unpaid administrator. Ask community advisers whether they can challenge a decision and see a response. Publish only consented aggregate findings. A favorable software metric is not evidence of improved social outcomes.

## Operating cost and support

Budget for hosting, identity, database, files, backups, mail, monitoring, connector limits and specialist support. Also budget for migration, training, accessibility, security review and upgrades. Current provider prices in the research matrix are snapshots; calculate a pilot's actual users, contacts, records, files and mail volumes before approving spending. Set usage alerts and a ceiling where supported. Do not call self-hosted software cost-free merely because its license has no fee.

Before a shared pilot, name a technical maintainer and an organization administrator, document an incident contact route, set recovery targets and rehearse backup restoration. Review whether a second person can upgrade or restore the system. A system that only one volunteer understands has not finished its handover.

## Decisions still open

1. Which three organizations will co-design the first workflow, and who can commit time to support them?
2. Does the comparison favor CiviCRM integration or an independent shared workspace?
3. What are the hosting region, support model and approved recurring budget?
4. Which record classes are allowed in the first pilot, and what are their retention rules?
5. Which integrations are genuinely required for the first report, with whose API access?
6. Who conducts independent source, security, accessibility and domain review?

The next OS build should follow the approved Phase 0 scope. This plan preserves the larger feature universe while making the first implementation testable.
