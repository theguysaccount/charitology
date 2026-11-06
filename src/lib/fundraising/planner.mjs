const encoder = new TextEncoder();
export const FUNDRAISING_LIMITS = Object.freeze({ inputBytes: 16384, outputBytes: 65536, money: '1000000000000', hours: '1000000', donors: 1000000000, offsetDays: 3650 });
export const FUNDRAISING_TASKS = Object.freeze([
  Object.freeze({ id: 'acknowledgment', title: 'Plan acknowledgment', defaultDays: '0', detail: 'Review any promised acknowledgment and the donor’s communication preferences before acting.' }),
  Object.freeze({ id: 'welcome', title: 'Plan a welcome', defaultDays: '3', detail: 'Decide whether a welcome is appropriate. Check consent and avoid duplicate messages.' }),
  Object.freeze({ id: 'progress', title: 'Review a progress update', defaultDays: '30', detail: 'Check what is actually known about progress, costs and limitations before sharing an update.' }),
  Object.freeze({ id: 'review', title: 'Review the campaign', defaultDays: '90', detail: 'Compare the plan with recorded costs and donor counts. Record missing information and what to change.' }),
]);
const BUDGET_FIELDS = ['grossReceived', 'refunds', 'cashCosts', 'staffHours', 'staffHourValue', 'volunteerHours', 'volunteerHourValue', 'newDonors', 'priorYearDonors', 'returningDonors'];
const RAW_FIELDS = ['campaignTitle', 'campaignDate', 'ownerRole', 'currency', ...BUDGET_FIELDS, 'offsets'];
const metricLabels = Object.freeze({ netCash: 'Net cash', staffTimeCost: 'Staff time value', volunteerTimeCost: 'Volunteer time value', fullCost: 'Cash costs plus time value', netWithTime: 'Net after cash costs and time value', cashCostPerNewDonor: 'Cash cost per new donor (rounded)', fullCostPerNewDonor: 'Full cost per new donor (rounded)', retentionPercent: 'Prior-year donors returning (%) (rounded)' });
const controllers = new WeakMap();
export class FundraisingPlannerError extends Error {
  constructor(field, message) { super(message); this.name = 'FundraisingPlannerError'; this.field = field; }
}
function bad(field, message) { throw new FundraisingPlannerError(field, message); }
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) bad(null, 'Use the complete planner fields.');
  const actual = Reflect.ownKeys(value);
  if (actual.length !== keys.length || actual.some(key => typeof key !== 'string' || !keys.includes(key))) bad(null, 'Use the complete planner fields.');
  for (const key of actual) { const d = Object.getOwnPropertyDescriptor(value, key); if (!d || !('value' in d) || !d.enumerable) bad(null, 'Use ordinary planner values.'); }
}
function string(value, field, max, required = false) {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) bad(field, 'Use a single line within the field’s length limit.');
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i); if (c >= 0xd800 && c <= 0xdbff) { const next = value.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) bad(field, 'Use valid Unicode text.'); }
    else if (c >= 0xdc00 && c <= 0xdfff) bad(field, 'Use valid Unicode text.');
  }
  if (required && !value.trim()) bad(field, 'Complete this field before generating a plan.'); return value;
}
function bounded(value, cap = FUNDRAISING_LIMITS.outputBytes) {
  if (encoder.encode(value).byteLength > cap) bad(null, 'The plan is too large to export. Shorten its title or owner role.'); return value;
}
function decimal(value, field, max, places = 2) {
  string(value, field, 32); const raw = value.trim(); if (raw === '') return null;
  if (!(places === 0 ? /^\d+$/ : /^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/).test(raw)) bad(field, places === 0 ? 'Use a whole number, or leave it blank for unknown.' : 'Use a nonnegative number with at most two decimal places, or leave it blank for unknown.');
  const [whole = '0', fraction = ''] = raw.split('.'), scale = 10n ** BigInt(places);
  const units = BigInt(whole || '0') * scale + BigInt(fraction.padEnd(places, '0') || '0');
  if (units > BigInt(max) * scale) bad(field, places === 0 ? 'The count exceeds the planner’s one-billion limit.' : 'The number exceeds this planner’s limit.'); return units;
}
const unknown = () => Object.freeze({ kind: 'unknown' });
const undefinedRatio = () => Object.freeze({ kind: 'undefined', reason: 'zero-denominator' });
const known = value => Object.freeze({ kind: 'known', value });
function fixed(units, places = 4, minimumPlaces = 2) {
  const sign = units < 0n ? '-' : '', positive = units < 0n ? -units : units, scale = 10n ** BigInt(places);
  let fraction = (positive % scale).toString().padStart(places, '0');
  while (fraction.length > minimumPlaces && fraction.endsWith('0')) fraction = fraction.slice(0, -1);
  return sign + (positive / scale).toString() + (fraction ? '.' + fraction : '');
}
const money = units => units === null ? unknown() : known(fixed(units));
const combine = (values, operation) => values.some(v => v === null) ? null : operation(...values);
const roundedDivision = (n, d) => (n + d / 2n) / d;
function perDonor(costUnits, donors) {
  if (donors === 0n) return undefinedRatio(); if (donors === null || costUnits === null) return unknown();
  return known(fixed(roundedDivision(costUnits, donors * 100n), 2, 2));
}
/** Exact budget arithmetic. Blanks remain unknown; no currency conversion or impact inference. */
export function calculateFundraisingBudget(value) {
  exact(value, ['currency', ...BUDGET_FIELDS]);
  if (!['USD', 'GBP', 'EUR'].includes(value.currency)) bad('currency', 'Choose USD, GBP or EUR for every amount.');
  const n = {};
  for (const field of BUDGET_FIELDS) n[field] = decimal(value[field], field,
    field.endsWith('Donors') ? FUNDRAISING_LIMITS.donors : field.endsWith('Hours') ? FUNDRAISING_LIMITS.hours : FUNDRAISING_LIMITS.money,
    field.endsWith('Donors') ? 0 : 2);
  if (n.priorYearDonors !== null && n.returningDonors !== null && n.returningDonors > n.priorYearDonors) bad('returningDonors', 'Returning prior-year donors cannot exceed the prior-year donor count.');
  const staff = combine([n.staffHours, n.staffHourValue], (h, r) => h * r), volunteer = combine([n.volunteerHours, n.volunteerHourValue], (h, r) => h * r);
  const net = combine([n.grossReceived, n.refunds, n.cashCosts], (g, r, c) => (g - r - c) * 100n);
  const full = combine([n.cashCosts, staff, volunteer], (c, s, v) => c * 100n + s + v);
  const withTime = combine([net, staff, volunteer], (cash, s, v) => cash - s - v);
  const retention = n.priorYearDonors === 0n ? undefinedRatio() : n.priorYearDonors === null || n.returningDonors === null ? unknown()
    : known(fixed(roundedDivision(n.returningDonors * 10000n, n.priorYearDonors), 2, 2));
  const metrics = Object.freeze({ netCash: money(net), staffTimeCost: money(staff), volunteerTimeCost: money(volunteer), fullCost: money(full), netWithTime: money(withTime),
    cashCostPerNewDonor: perDonor(n.cashCosts === null ? null : n.cashCosts * 100n, n.newDonors), fullCostPerNewDonor: perDonor(full, n.newDonors), retentionPercent: retention });
  const inputs = Object.freeze(Object.fromEntries(BUDGET_FIELDS.map(key => [key, n[key] === null ? null : fixed(n[key], key.endsWith('Donors') ? 0 : 2, key.endsWith('Donors') ? 0 : 2)])));
  return Object.freeze({ currency: value.currency, inputs, metrics });
}
function date(value, field) {
  if (typeof value !== 'string' || !/^(?:19\d\d|[2-9]\d{3})-\d\d-\d\d$/.test(value)) bad(field, 'Use a real campaign date from 1900 through 9999.');
  const ms = Date.parse(value + 'T00:00:00.000Z'); if (!Number.isSafeInteger(ms) || new Date(ms).toISOString().slice(0, 10) !== value) bad(field, 'Use a real calendar date.'); return ms;
}
export function addFundraisingDays(value, days) {
  if (!Number.isSafeInteger(days) || days < 0 || days > FUNDRAISING_LIMITS.offsetDays + 1) bad('offsets', 'Use a whole day offset from 0 through 3650.');
  const ms = date(value, 'campaignDate') + days * 86400000, result = new Date(ms).toISOString();
  if (!/^\d{4}-/.test(result)) bad('offsets', 'A task or its next-day calendar end exceeds year 9999. Choose an earlier date or a smaller offset.'); return result.slice(0, 10);
}
export function escapeFundraisingCalendarText(value) { return value.replaceAll('\\', '\\\\').replace(/\r\n|\r|\n/g, '\\n').replaceAll(';', '\\;').replaceAll(',', '\\,'); }
/** RFC5545 octets, including the continuation space; never split a Unicode code point. */
export function foldFundraisingCalendarLine(value) {
  let line = '', size = 0; const lines = [];
  for (const point of value) { const octets = encoder.encode(point).byteLength; if (size + octets > 75) { lines.push(line); line = ' '; size = 1; } line += point; size += octets; }
  lines.push(line); return lines.join('\r\n');
}
const md = value => value.replace(/[\\`*_{}\[\]()<>#+.!|\-]/g, '\\$&');
export function fundraisingMetricText(key, metric, currency) {
  if (metric.kind === 'unknown') return 'Unknown — complete the relevant inputs.';
  if (metric.kind === 'undefined') return key === 'retentionPercent' ? 'Not defined — prior-year donor count is zero.' : 'Not defined — new donor count is zero.';
  return key === 'retentionPercent' ? metric.value + '%' : currency + ' ' + metric.value;
}
function readBudget(raw) { return Object.fromEntries(['currency', ...BUDGET_FIELDS].map(key => [key, raw[key]])); }
/** Captured device time is export metadata only, never evidence of campaign activity. */
export async function prepareFundraisingPlan(value, generatedAt) {
  exact(value, RAW_FIELDS); exact(value.offsets, FUNDRAISING_TASKS.map(t => t.id));
  const raw = { ...value, offsets: { ...value.offsets } };
  string(raw.campaignTitle, 'campaignTitle', 160, true); string(raw.ownerRole, 'ownerRole', 120, true); date(raw.campaignDate, 'campaignDate');
  const budget = calculateFundraisingBudget(readBudget(raw)); bounded(JSON.stringify(raw), FUNDRAISING_LIMITS.inputBytes);
  const stampMs = typeof generatedAt === 'string' ? Date.parse(generatedAt) : NaN;
  if (typeof generatedAt !== 'string' || !/^(?:19\d\d|[2-9]\d{3})-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(generatedAt) || !Number.isSafeInteger(stampMs) || new Date(stampMs).toISOString() !== generatedAt) bad(null, 'A valid device timestamp from 1900 through 9999 is needed to prepare calendar metadata.');
  const tasks = FUNDRAISING_TASKS.map(task => {
    const field = 'offsets.' + task.id, offset = decimal(raw.offsets[task.id], field, FUNDRAISING_LIMITS.offsetDays, 0);
    if (offset === null) bad(field, 'Give every task an explicit day offset, including zero.');
    const day = addFundraisingDays(raw.campaignDate, Number(offset)), endDay = addFundraisingDays(day, 1);
    return { id: task.id, title: task.title, detail: task.detail, offsetDays: Number(offset), date: day, endDate: endDay, ownerRole: raw.ownerRole };
  });
  let identity;
  try { identity = globalThis.crypto.randomUUID(); if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(identity)) throw Error('UUID unavailable'); }
  catch { bad(null, 'Calendar preparation is unavailable in this browser. Your fields are unchanged.'); }
  const stamp = generatedAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Charitology//Fundraising planner v1//EN', 'CALSCALE:GREGORIAN'];
  for (const task of tasks) {
    task.uid = `charitology-fundraising-v1-${identity}-${task.id}@charitology.org`;
    lines.push('BEGIN:VEVENT', 'UID:' + task.uid, 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + task.date.replaceAll('-', ''), 'DTEND;VALUE=DATE:' + task.endDate.replaceAll('-', ''),
      'SUMMARY:' + escapeFundraisingCalendarText(`${task.title} · ${raw.campaignTitle}`),
      'DESCRIPTION:' + escapeFundraisingCalendarText(`Owner role: ${raw.ownerRole}\n${task.detail}\nIllustrative planning schedule, not an evidence-based contact recommendation. Review consent and your actual commitments. No message or OS record has been created.`),
      'STATUS:TENTATIVE', 'TRANSP:TRANSPARENT', 'END:VEVENT'); Object.freeze(task);
  }
  lines.push('END:VCALENDAR'); const calendar = bounded(lines.map(foldFundraisingCalendarLine).join('\r\n') + '\r\n');
  const inputLabels = { grossReceived: 'Gross received', refunds: 'Refunds', cashCosts: 'Cash costs', staffHours: 'Staff hours', staffHourValue: 'Staff value per hour', volunteerHours: 'Volunteer hours', volunteerHourValue: 'Volunteer value per hour', newDonors: 'New donors', priorYearDonors: 'Prior-year donors', returningDonors: 'Prior-year donors returning' };
  const markdown = bounded([`# Fundraising plan: ${md(raw.campaignTitle)}`, '', `Campaign date: ${raw.campaignDate}`, `Assigned owner role: ${md(raw.ownerRole)}`, `Currency for all amounts: ${raw.currency}`, `Generated on this device: ${generatedAt} (metadata, not evidence of activity)`, '',
    '## Budget inputs', '', ...BUDGET_FIELDS.map(key => `- ${inputLabels[key]}: ${budget.inputs[key] ?? 'Unknown (blank)'}`), '', '## Budget calculations', '',
    ...Object.entries(budget.metrics).map(([key, metric]) => `- ${metricLabels[key]}: ${fundraisingMetricText(key, metric, raw.currency)}`), '',
    'Time values are estimates. Include only time costs not already counted in cash costs. Missing hours or hourly values remain unknown, even when the other field is zero.',
    'Cost per new donor divides whole-campaign cost by new donors. It is not incremental acquisition cost and may include work for retained donors.',
    'Ratios describe fundraising costs and donor counts. They do not measure impact or establish causation. Retention compares returning prior-year donors with the prior-year donor count.', '',
    '## Follow-up tasks to review', '', ...tasks.map(task => `- ${task.date} · ${task.title} · Owner role: ${md(task.ownerRole)}\n  ${task.detail}`), '',
    'Offsets are illustrative and editable; they are not a claim about the best time to contact people. Check consent, preferences and actual obligations before acting.',
    'No message, calendar import or Charity OS record has been created. The calendar contains tentative all-day events with no invitees or automatic updates. Generating another plan creates new calendar identifiers. Reimports may create duplicates in calendar software.',
    'Keep donor names, email addresses and other personal details out of this plan.', ''].join('\n'));
  return Object.freeze({ campaignTitle: raw.campaignTitle, campaignDate: raw.campaignDate, ownerRole: raw.ownerRole, generatedAt, budget, tasks: Object.freeze(tasks), markdown, calendar });
}

/** Page-only controller. No storage, URL mutation, network, OS writes or automatic contacts. */
export function mountFundraisingPlanner(root) {
  if (controllers.has(root)) return controllers.get(root);
  const form = root.querySelector('form'); if (!form) throw Error('Planner form missing.');
  const prevent = event => event.preventDefault(); form.addEventListener('submit', prevent, true);
  const find = selector => { const node = root.querySelector(selector); if (!node) throw Error('Planner control missing.'); return node; };
  const fieldset = find('[data-planner-controls]'), status = find('[data-planner-status]'), results = find('[data-planner-budget]'), preview = find('[data-planner-preview]'), calendarPreview = find('[data-planner-calendar-preview]'), printText = find('[data-planner-print-text]'), review = find('[data-planner-review]'),
    reviewed = find('[data-planner-reviewed]'), markdownButton = find('[data-planner-markdown]'), calendarButton = find('[data-planner-calendar]'), printButton = find('[data-planner-print]');
  const view = root.ownerDocument?.defaultView ?? globalThis.window, later = view.setTimeout.bind(view), cancelTimer = view.clearTimeout.bind(view), urls = new Map(); let generation = 0, disposed = false, plan = null;
  const on = (node, name, action, options) => { node.addEventListener(name, action, options); listeners.push(() => node.removeEventListener(name, action, options)); };
  const listeners = [() => form.removeEventListener('submit', prevent, true)];
  const raw = () => Object.fromEntries(RAW_FIELDS.map(key => [key, key === 'offsets' ? Object.fromEntries(FUNDRAISING_TASKS.map(t => [t.id, find(`[data-offset="${t.id}"]`).value])) : find(`[data-field="${key}"]`).value]));
  function buttons() { const ready = !disposed && plan !== null && reviewed.checked; markdownButton.disabled = !ready; calendarButton.disabled = !ready; printButton.disabled = !ready; }
  function invalidate(message) { generation++; plan = null; reviewed.checked = false; reviewed.disabled = true; preview.value = ''; calendarPreview.textContent = ''; printText.textContent = ''; review.hidden = true; buttons(); if (message) status.textContent = message; }
  function budget() {
    try {
      const result = calculateFundraisingBudget(readBudget(raw())), list = root.ownerDocument.createElement('dl');
      for (const [key, metric] of Object.entries(result.metrics)) { const term = root.ownerDocument.createElement('dt'), value = root.ownerDocument.createElement('dd'); term.textContent = metricLabels[key]; value.textContent = fundraisingMetricText(key, metric, result.currency); list.append(term, value); }
      results.replaceChildren(list);
    } catch (error) { results.textContent = error instanceof FundraisingPlannerError ? error.message : 'The budget could not be calculated. Your fields are unchanged.'; }
  }
  const changed = () => { if (disposed) return; invalidate('Inputs changed. Generate and review the plan again before downloading.'); budget(); };
  on(form, 'input', changed); on(form, 'change', changed);
  on(form, 'submit', async event => {
    event.preventDefault(); if (disposed) return; invalidate(); const captured = generation;
    status.textContent = 'Preparing the plan for your review…';
    try {
      const prepared = await prepareFundraisingPlan(raw(), new Date().toISOString());
      if (disposed || generation !== captured) return;
      plan = prepared; preview.value = prepared.markdown; calendarPreview.textContent = prepared.calendar; printText.textContent = prepared.markdown; review.hidden = false; reviewed.disabled = false; reviewed.checked = false; buttons();
      status.textContent = 'Review the budget, owner role and all four dates, then acknowledge the review to enable downloads.';
      preview.focus();
    } catch (error) {
      if (disposed || generation !== captured) return;
      status.textContent = error instanceof FundraisingPlannerError ? error.message : 'The plan could not be prepared. Your fields are unchanged.';
      const field = error instanceof FundraisingPlannerError ? error.field : null;
      const node = field?.startsWith('offsets.') ? root.querySelector(`[data-offset="${field.slice(8)}"]`) : field ? root.querySelector(`[data-field="${field}"]`) : status; (node ?? status).focus();
    }
  });
  on(reviewed, 'change', buttons);
  function releaseURL(url) { const timer = urls.get(url); if (timer === undefined) return; urls.delete(url); cancelTimer(timer); URL.revokeObjectURL(url); }
  function releaseAllURLs() { for (const url of [...urls.keys()]) releaseURL(url); }
  function download(kind) {
    if (disposed || !plan || !reviewed.checked) return;
    if (urls.size >= 8) { status.textContent = 'Eight downloads are still being handed to your browser. Wait ten seconds before requesting another.'; return; }
    const capturedPlan = plan, capturedGeneration = generation;
    const text = kind === 'calendar' ? plan.calendar : plan.markdown, type = kind === 'calendar' ? 'text/calendar;charset=utf-8' : 'text/markdown;charset=utf-8';
    let url = null, anchor = null;
    try {
      url = URL.createObjectURL(new Blob([text], { type })); anchor = root.ownerDocument.createElement('a'); anchor.href = url;
      urls.set(url, later(() => releaseURL(url), 10000));
      anchor.download = kind === 'calendar' ? 'charitology-fundraising-plan.ics' : 'charitology-fundraising-plan.md'; anchor.hidden = true; root.append(anchor); anchor.click();
      if (!disposed && generation === capturedGeneration && plan === capturedPlan) status.textContent = 'Download requested. Check your browser’s downloads; no email or OS record was created.';
    } catch { if (url !== null) { if (urls.has(url)) releaseURL(url); else URL.revokeObjectURL(url); } if (!disposed && generation === capturedGeneration && plan === capturedPlan) status.textContent = 'The download could not be requested. Your reviewed plan and fields are still here.'; }
    finally { anchor?.remove(); }
  }
  on(markdownButton, 'click', () => download('markdown')); on(calendarButton, 'click', () => download('calendar'));
  on(printButton, 'click', () => { if (disposed || !plan || !reviewed.checked) return; try { view.print(); } catch { status.textContent = 'Printing is unavailable here. You can still read or download the reviewed text.'; } });
  function dispose() { if (disposed) return; invalidate(); disposed = true; releaseAllURLs(); for (const stop of listeners) stop(); fieldset.disabled = true; reviewed.disabled = true; buttons(); root.dataset.plannerReady = 'disposed'; }
  on(view, 'pagehide', event => { if (event.persisted) { releaseAllURLs(); invalidate('Fields remain on this page. Generate and review again after returning.'); } else dispose(); });
  on(view, 'pageshow', event => { if (event.persisted && !disposed) status.textContent = 'Your fields remain here. Generate and review again before downloading.'; });
  const controller = Object.freeze({ dispose }); controllers.set(root, controller); fieldset.disabled = false; root.dataset.plannerReady = 'ready'; budget(); buttons(); status.textContent = 'Ready. Blank numbers stay unknown. Generate a plan to review its budget and dates.'; return controller;
}
