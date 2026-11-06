/** Untested editorial workflows. A checked step is a viewer's mark, not independently verified work. */
export const CHARITY_START_VERSION = '0.1';
export const CHARITY_START_LIMITS = Object.freeze({ ownerRole: 120, outputBytes: 16384 });
const definitions = [
  {
    id: 'donor-follow-up', title: 'Keep a donor follow-up promise',
    question: 'Which acknowledgment or update needs a clear owner?',
    output: 'A role-based follow-up checklist with a deliberate review point.',
    steps: [
      'Choose one acknowledgment or update your team has actually promised. Keep recipient details in your existing authorized system.',
      'Check the message purpose, the donor’s preferences and who can approve the wording. Leave uncertain permission unresolved.',
      'Assign an owner role and a separate reviewer where needed. Distinguish preparing, sending, provider acceptance and observed delivery.',
      'Review whether the promise was kept and what the team should change. Keep unexpected replies and preferences in the proper private system.'
    ],
    questions: ['Was the intended promise kept?', 'What is observed, and what remains unknown?', 'Which handover or message should change next?'],
    links: [{label:'Donor follow-up guide',path:'/for-charities/fundraising/donor-follow-up/'},{label:'Fundraising cost and follow-up planner',path:'/for-charities/fundraising/#planner'}],
    os: [{id:'communications',label:'Communications'},{id:'projects',label:'Projects and tasks'}],
    limit: 'This plan prepares no message and sends no donor email. A reviewed template is not evidence of consent or delivery.'
  },
  {
    id: 'fundraising-costs', title: 'Count the full cost of a fundraiser',
    question: 'What would one proposed appeal or event require?',
    output: 'A cash-and-time budget with unknown values and one decision to review.',
    steps: [
      'Choose one proposed activity and a consistent currency and observation period. Write down what decision the budget should inform.',
      'Separate funds actually received, refunds, cash costs and staff or volunteer time. Leave unknown inputs blank; use zero only for an observed or intended zero.',
      'Check whether time costs are already included in cash costs. Record attribution limits instead of treating money raised as charitable impact.',
      'Give the next decision an owner role and a review date if one is known. Decide what would make the team pause, revise or stop.'
    ],
    questions: ['Which costs or refunds are still missing?', 'Did the activity support the mission and its commitments?', 'What would justify another attempt?'],
    links: [{label:'Fundraising cost and follow-up planner',path:'/for-charities/fundraising/#planner'},{label:'Explore fundraising methods',path:'/for-charities/fundraising/#methods'}],
    os: [{id:'fundraising',label:'Giving and fundraising'},{id:'projects',label:'Projects and tasks'}],
    limit: 'A budget is a planning assumption. Revenue, a ratio or a completed checklist does not establish additional charitable benefit.'
  },
  {
    id: 'grant-deadlines', title: 'Make one grant deadline visible',
    question: 'What needs to be checked before an application can progress?',
    output: 'A draft opportunity checklist with the actual issuer deadline kept distinct from an internal review date.',
    steps: [
      'Choose one published grant opportunity and retain its official call or terms in your own authorized records.',
      'Check the issuer’s current eligibility, deadline, time zone, required documents and submission route. Mark missing or ambiguous conditions unknown.',
      'Separate the issuer’s deadline from the next internal review date. Assign an owner role for the next task and identify the required approval.',
      'Review the actual application version before any submission. Record submitted status only after separately checking a submission reference.'
    ],
    questions: ['Which eligibility or deadline condition needs confirmation?', 'Has the required person reviewed the actual version?', 'What evidence would establish submission?'],
    links: [{label:'Grant-seeking playbook',path:'/for-charities/fundraising/grants/'},{label:'Local Charity OS',path:'/tools/charity-os/'}],
    os: [{id:'grant-seeking',label:'Grant seeking'},{id:'projects',label:'Projects and tasks'}],
    limit: 'The planner does not find funding, decide eligibility, submit an application or create a calendar reminder. Your review date is not the funder’s deadline.'
  },
  {
    id: 'team-handovers', title: 'Clarify a team or volunteer handover',
    question: 'Where does a recurring job lose its next owner?',
    output: 'A role-based handover checklist that says what needs to happen next.',
    steps: [
      'Choose one recurring job and describe its handover using roles and a fictional or nonpersonal example.',
      'Write what counts as ready for the next role, what information is needed and which permissions apply. Keep real staff and participant records in the proper private system.',
      'Identify who can accept, decline or return the task for clarification. Keep an unavailable owner or an unresolved dependency visible.',
      'Review one deliberately chosen example with the team. Ask what was duplicated, missing or difficult to understand before changing the process.'
    ],
    questions: ['Did the next role know what was expected?', 'Could someone decline or raise a concern?', 'What should the next handover preserve or change?'],
    links: [{label:'Local Charity OS',path:'/tools/charity-os/'},{label:'Time Charitology planning workspace',path:'/programs/time-charitology/'}],
    os: [{id:'projects',label:'Projects and tasks'},{id:'volunteers',label:'Volunteers'}],
    limit: 'This creates no task assignment, shift, booking, consent or notification. A volunteer place needs its own current confirmation.'
  },
  {
    id: 'evidence-feedback', title: 'Connect evidence to a decision',
    question: 'What would help the team understand whether its work is helping?',
    output: 'One evidence question, a feedback route and a decision that could change.',
    steps: [
      'Choose one decision and describe the activity, intended outcome and people whose perspective could change it.',
      'Separate observed work, measured outcomes, assumptions and what would have happened otherwise. Mark missing measures or comparisons unknown.',
      'Propose an accessible way for people to disagree and identify the role that could respond. Decide what permissions any later evidence collection would need.',
      'Set a review question and a rule for revising the work. Record limitations and disappointing findings alongside favorable ones.'
    ],
    questions: ['What is observed, rather than assumed?', 'Whose feedback could change the decision?', 'What evidence would make us revise the explanation?'],
    links: [{label:'Impact measurement toolkit',path:'/tools/impact-measurement-toolkit/'},{label:'The Charitology Method',path:'/method/'}],
    os: [{id:'evaluation',label:'Evaluation and learning'},{id:'projects',label:'Projects and tasks'}],
    limit: 'A worksheet is not an evaluation, a causal result or permission to collect personal data. Any later research or feedback activity needs its own appropriate review.'
  },
  {
    id: 'resources-benefits', title: 'Choose a resource around the job',
    question: 'What does the team need, and what will it take to maintain?',
    output: 'A comparison note with costs, source dates and unconfirmed eligibility kept visible.',
    steps: [
      'Describe one job and its requirements: access, exports, maintenance, budget and who will use the resource.',
      'Compare a small set of options using their current official terms. Keep a source date and distinguish free software, discounts, credits and transaction fees.',
      'Check country and organization eligibility, renewal conditions, migration costs and what happens if an offer ends. Leave an unconfirmed condition unresolved.',
      'Try an appropriate fictional example before moving real records or committing money. Let the team decide whether to proceed, change the shortlist or stop.'
    ],
    questions: ['Does this still fit the job and the team’s capacity?', 'Which cost, condition or source needs a fresh check?', 'Can the team export and maintain its work?'],
    links: [{label:'External tools for charities',path:'/for-charities/tools/'},{label:'Nonprofit benefits',path:'/for-charities/benefits/'},{label:'Networks and peers',path:'/for-charities/networks/'}],
    os: [{id:'resources',label:'Resources'}],
    limit: 'A listing is not an endorsement, provider approval, guaranteed saving or enrollment. This planner does not apply, buy or copy a resource into Charity OS.'
  }
];
export const charityStartJobs = Object.freeze(definitions.map(job => Object.freeze({ ...job, review:'draft', steps:Object.freeze(job.steps), questions:Object.freeze(job.questions), links:Object.freeze(job.links.map(Object.freeze)), os:Object.freeze(job.os.map(Object.freeze)) })));
const ids = new Set();
for (const job of charityStartJobs) {
  if (ids.has(job.id) || !/^[a-z][a-z-]+$/.test(job.id) || job.steps.length !== 4 || job.questions.length !== 3) throw new Error('Invalid charity starting-point definition');
  ids.add(job.id);
  for (const link of job.links) if (!link.path.startsWith('/') || link.path.startsWith('//')) throw new Error('Unsafe charity guide path');
  for (const module of job.os) if (!/^[a-z][a-z-]+$/.test(module.id)) throw new Error('Unsafe Charity OS module');
}
export class CharityStartError extends Error {
  constructor(message, field) { super(message); this.name = 'CharityStartError'; this.field = field; }
}
export function findCharityStartJob(id) { return charityStartJobs.find(job => job.id === id); }
const fail = (message, field) => { throw new CharityStartError(message, field); };
function text(value, field, limit) {
  if (typeof value !== 'string' || value.length > limit || /[\u0000-\u001f\u007f]/u.test(value)) fail(field === 'ownerRole' ? 'Use a single owner role of at most 120 characters, without control characters.' : 'Use a calendar date in YYYY-MM-DD format, or leave it blank.', field);
  return value.trim();
}
function calendarDate(value) {
  const date = text(value, 'reviewDate', 10);
  if (!date) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) fail('Use a calendar date in YYYY-MM-DD format, or leave it blank.', 'reviewDate');
  const [year, month, day] = match.slice(1).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) fail('That review date is not a valid calendar day. Correct it or leave it blank.', 'reviewDate');
  return date;
}
function markdownText(value) { return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replace(/[\\`*_{}[\]()#+.!|~-]/g, '\\$&'); }
export function prepareCharityStartPlan(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('Choose one job before reviewing a plan.', 'jobId');
  if (Object.keys(raw).some(key => !['jobId','ownerRole','reviewDate','completed'].includes(key))) fail('The plan contains an unsupported field. Review the current page again.', 'jobId');
  const job = findCharityStartJob(raw.jobId);
  if (!job) fail('Choose one job before reviewing a plan.', 'jobId');
  const ownerRole = text(raw.ownerRole, 'ownerRole', CHARITY_START_LIMITS.ownerRole) || null;
  const reviewDate = calendarDate(raw.reviewDate);
  if (!Array.isArray(raw.completed) || raw.completed.length !== job.steps.length || raw.completed.some(mark => typeof mark !== 'boolean')) fail('Review the four step marks for the selected job.', 'completed');
  const completed = Object.freeze([...raw.completed]);
  const signature = JSON.stringify({jobId:raw.jobId,ownerRole:raw.ownerRole,reviewDate:raw.reviewDate,completed});
  const lines = [
    '# Charitology: one job to start with', '',
    `Practice draft ${CHARITY_START_VERSION} · Untested editorial proposal · Hypothesis`, '',
    `Selected job: ${job.title}`, `Owner role: ${ownerRole ? markdownText(ownerRole) : 'Unknown — not assigned in this plan'}`,
    `Next internal review date: ${reviewDate || 'Unknown — no date supplied'}`, '',
    '## Purpose', '', job.question, '', `Proposed output: ${job.output}`, '',
    '## Proposed first-week checklist', '',
    'Marks are your own reports. An unchecked step is not marked complete; it is not evidence of failure. Completion has not been independently verified.', '',
    ...job.steps.map((step, index) => `- [${completed[index] ? 'x' : ' '}] ${completed[index] ? 'Marked complete' : 'Not marked complete'}: ${step}`), '',
    '## Questions at the next review', '', ...job.questions.map(question => `- ${question}`), '',
    '## Read and use', '', ...job.links.map(link => `- [${link.label}](https://charitology.org${link.path})`), '',
    '## Optional manual shared workspace', '',
    ...job.os.map(module => `- [${module.label}](https://os.charitology.org/#module/${module.id})`), '',
    'These links require sign-in and organization choice. They navigate only; no field, task, message or record is transferred by this plan.', '',
    '## Scope and assumptions', '', job.limit, '',
    'This is a proposed workflow, not measured evidence of savings, fundraising success or charitable impact. Study the signals, channels, work, outcomes and feedback around the job. Relief, repair, prevention, structure and source describe where work acts; every level may be needed. No charity is rated or ranked.', '',
    'The plan stays on the current page until you choose a download. It sends no email, creates no account and supplies no approval, consent or institutional partnership. Use roles and nonpersonal examples; keep private staff, donor and participant records out of this file.', '',
    `[Starting guide and corrections](https://charitology.org/for-charities/start/#${job.id})`, '',
    'Review here means your inspection of this local plan, not independent source or professional review.', ''
  ];
  const markdown = lines.join('\n');
  if (new TextEncoder().encode(markdown).length > CHARITY_START_LIMITS.outputBytes) fail('The plan exceeds its download limit. Shorten the role and review again.', 'ownerRole');
  return Object.freeze({jobId:job.id,ownerRole,reviewDate,completed,signature,filename:`charitology-start-${job.id}.md`,markdown});
}
