export const WEBSITE_PILOT_VERSION='0.1';
const intro=`Practice draft 0.1 · Untested editorial proposal · Hypothesis

Charitology studies the signals, channels, work, outcomes and feedback around generosity. Relief, repair, prevention, structure and source describe mechanisms; every level may be needed. A website review is not a charity rating.

Use roles, public sources and fictional examples. Keep donor, staff and beneficiary records out of this document. Unknown stays unknown. No website publication, recurring email, OS account, migration, endorsement or partnership is authorized by downloading a template.
`;
const footer=`
## Attribution and corrections

Charitology-authored text is CC BY 4.0: credit Charitology, link the source and identify changes. Cited websites, marks and third-party materials retain their own rights.

Source: https://charitology.org/for-charities/website-pilots/
License: https://github.com/theguysaccount/charitology/blob/main/CONTENT-LICENSE.md
Corrections: https://github.com/theguysaccount/charitology/issues/new
`;
export const websitePilotMaterials=Object.freeze([
 {id:'website-preview-brief',title:'Website preview and change-review brief',body:`# One website change: preview and review brief

${intro}
## 1. Choose the visitor and task

Organization/public website: Unknown — add the official URL.
Visitor task: Unknown — choose one, such as finding a volunteer role.
Charity contact/decision-maker role: Unknown — confirm who can approve this work.
Current method that must be preserved: Unknown.

## 2. Record what is actually observed

- [ ] Retain the exact official source URLs and the dates read.
- [ ] Walk through the selected task on desktop and a narrow screen.
- [ ] Try keyboard navigation and inspect the actual contact or application destination.
- [ ] Record a specific observation separately from an assumption about its effect.
- [ ] Treat an inaccessible page as an access limit; do not call it broken for every visitor.
- [ ] Preserve current service information and the charity’s existing donation/application routes.

Observation and source: Unknown.
Proposed change: Unknown.
Why it might help: Hypothesis — not a measured benefit.

## 3. Prepare an inspectable private concept

- [ ] Label it as an uncommissioned or charity-requested proposal, as actually applicable.
- [ ] Write original draft copy. Use photos, logos and other material only with appropriate rights.
- [ ] Keep forms, payments and personal records out of an early concept; link actual actions to the official site.
- [ ] State what is functional, illustrative, untested and out of scope.
- [ ] Keep preview access private to agreed reviewers. A preview is not the charity’s production website.

Version/source identity: Unknown.
Exact preview reviewed: Unknown.
Known limitations: Unknown.

## 4. Ask for a separate publication decision

Charity authority to approve: Unknown.
Approved exact version and changes: Unknown.
Hosting/domain/editorial owner: Unknown.
Donation/application route verification: Unknown.
Accessibility/security/rights checks still needed: Unknown.
Backup and rollback method: Unknown.
Publication permission and evidence: Unknown — leave unpublished until agreed.

## 5. Choose any recurring updates separately

Recipient role or private consent-record reference and requested purpose: Unknown.
Approved channel/cadence: Unknown.
Exact permission and evidence/reference: Unknown.
How a recipient can stop updates: Unknown.

A public contact address, volunteer invitation or past reply does not automatically request recurring updates. Automated preparation can continue privately; recurring messages need their own recorded agreement and a permitted sender. Do not use a provider that prohibits the proposed outreach.

## 6. Keep website help separate from an OS pilot

Website-only, OS-only or both: Unknown — the charity chooses.
Declining the OS should not change an agreed website contribution.
Do not add a charity logo, testimonial or case study without a distinct publication decision.

## 7. Review after use

Actual publication date: Unknown.
What visitors or staff actually observed: Unknown.
What remains unmeasured: Unknown.
Unexpected difficulties and next decision: Unknown.

Task completion, favorable comments and a cleaner layout do not establish additional donations or mission impact.
${footer}`},
 {id:'os-pilot-brief',title:'One-workflow Charity OS pilot brief',body:`# One workflow: a proposed Charity OS pilot

${intro}
## Purpose and independent choices

The charity can choose a website review, an OS pilot, both or neither. This proposed two-week sequence is editable and has not been validated as an optimal trial length. An agreed participant, scope and stop decision come before a real pilot. Start with fictional records.

Organization/authorized owner role: Unknown.
Workflow: Unknown — choose one, such as a volunteer handover or grant-review task.
Specific question: Unknown.
Hypothesis to test: Unknown.
Current process that works and must be preserved: Unknown.
Agreed dates and time budget: Unknown.

## Before starting

- [ ] Agree the charity’s decision-maker, participant roles, purpose and limits.
- [ ] Choose one fictional example and a comparable task in the current process.
- [ ] Check the actual OS permissions, independent approval and export/recovery flow needed for the task.
- [ ] Agree what minimal observations may be recorded, who can see them and when to erase them.
- [ ] Record a pause/stop route and an accessible way to disagree.
- [ ] Keep real donor, staff or beneficiary data out of the first example.
- [ ] Treat any later real-data work, account invitation, migration or integration as a distinct decision.

Baseline observation: Unknown.
Baseline task/version: Unknown.
Proposed comparison and its limits: Unknown.

## First week: try the selected task

Create only the agreed fictional example in an appropriate organization. Deliberately exercise the relevant review/approval and export path. A link to a module creates no record and grants no access.

- Projects/tasks: https://os.charitology.org/#module/projects
- Resources: https://os.charitology.org/#module/resources
- OS scope and implementation plan: https://charitology.org/for-charities/os-plan/

Record observations without inventing results:

| Observation | Actual value | Source/time | Limitation |
| --- | --- | --- | --- |
| Task completed as defined | Unknown | Unknown | Not yet observed |
| Time spent, including setup/help | Unknown | Unknown | Not yet observed |
| Errors, missing fields or blocked steps | Unknown | Unknown | Not yet observed |
| Questions or disagreements raised | Unknown | Unknown | Not yet observed |
| Export/recovery actually exercised | Unknown | Unknown | Not yet observed |

## Midpoint: change or pause deliberately

Separate a reproducible bug, a missing capability, unclear wording and a training question. Stop the example if permissions, privacy, data loss or an unclear approval boundary makes it unsuitable. Record an unfavorable finding rather than trying to make the trial look successful.

Issue and reproduction with fictional data: Unknown.
Proposed change/version: Unknown.
Decision-maker and next check: Unknown.

## Second week: review the exact changed version

Repeat only the agreed relevant task and inspect exports. Retain the denominator and observation window. One team’s descriptive before/after comparison cannot establish a causal saving or sector-wide benefit.

What changed: Unknown.
What still failed or felt unnecessary: Unknown.
Whose perspective is missing: Unknown.
Evidence supporting the next decision: Unknown.
Decision: Unknown — continue, revise, pause, stop or keep the current tool.

## Closing and permissions

Export/cleanup owner and confirmation: Unknown.
Access that should end: Unknown.
Private notes retention decision: Unknown.
Any requested recurring update recipient role or private consent-record reference/channel/cadence/evidence: Unknown.
Separate permission for name, quote, logo or public case study: Unknown.

Opening a module, completing this brief or receiving website help supplies no consent, accreditation or institutional partnership. Publish generic reproducible lessons only after checking what can be shared. Do not turn trial comments into claims of improved charitable outcomes.
${footer}`}
].map(m=>Object.freeze(m)));
const ids=new Set();for(const m of websitePilotMaterials){if(!/^[a-z-]+$/.test(m.id)||ids.has(m.id)||!m.body.includes('Unknown')||!m.body.includes('Hypothesis')||!m.body.includes('CC BY 4.0'))throw Error('Invalid website pilot material');ids.add(m.id);}
