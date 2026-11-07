// Client consistency checks. Permission, native admission and ordinary approval
// remain server decisions; no pin is reconstructed from an audit description.
export const LEARNING_ROLES = new Set(["owner", "admin", "program_lead", "grants_lead", "finance_reviewer", "contributor"]);
export const LEARNING_NOTICE = "Learning sources and reports are private to authorized staff. Authored ordinary indicator, protocol, observation and decision blocks retain the existing approved-record visibility rules, including eligible board and external readers. Account approval does not establish causal impact or independently reviewed empirical evidence.";
const hex = /^[a-f0-9]{64}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const ordinaryModules = new Set(["programs", "outcomes", "evaluation", "reporting"]);
export function learningRecordFromFragment(fragment) {
  if (typeof fragment !== "string") throw new Error("Use the exact organization-pinned ordinary record link.");
  const parts = fragment.split("/");
  if (parts.length !== 4 || parts[0] !== "#learning-record" || !ordinaryModules.has(parts[2]) || ![parts[1], parts[3]].every((part) => /^[A-Za-z0-9_-]{1,100}$/.test(part) && encodeURIComponent(part) === part)) throw new Error("This ordinary record link is malformed. Use its exact organization, module and record ID; encoded alternatives and extra fields are not accepted.");
  return Object.freeze({ orgId: parts[1], moduleId: parts[2], recordId: parts[3] });
}
export function learningRecordFragment(orgId, moduleId, recordId) {
  if (![orgId, moduleId, recordId].every((value) => typeof value === "string")) throw new Error("Use exact string identities for ordinary record navigation.");
  const fragment = `#learning-record/${orgId}/${moduleId}/${recordId}`;
  learningRecordFromFragment(fragment);
  return fragment;
}
export function learningRecordMatches(fragment, orgId, moduleId, recordId) {
  try { const target = learningRecordFromFragment(fragment); return target.orgId === orgId && target.moduleId === moduleId && target.recordId === recordId; }
  catch { return false; }
}
export async function resolveLearningRecordRoute({ fragment, api, isCurrent, canRead, signal }) {
  const target = learningRecordFromFragment(fragment);
  const assert = () => { if (!isCurrent()) throw Object.assign(new Error("This record navigation is no longer current."), { name: "AbortError" }); };
  assert();
  const session = await api.session({ signal }); assert();
  if (!session?.user) throw Object.assign(new Error("Sign in before opening this organization-pinned record."), { status: 401 });
  // Reread actual current memberships. Do not trust a remembered/default org,
  // copied tab state, old role, ordinary record title or a supplied approval pin.
  // The actual GET /api/session response rereads memberships under RLS. There
  // is no GET /api/orgs route; never substitute remembered/default memberships.
  if (!Array.isArray(session.orgs)) throw new Error("Current organization memberships could not be verified.");
  const memberships = session.orgs.filter((org) => org.id === target.orgId);
  if (memberships.length !== 1 || !canRead(target.moduleId, memberships[0].role)) throw Object.assign(new Error("This exact organization record is unavailable to your current membership and role. No default organization was substituted."), { status: 403 });
  return { target, session, orgs: session.orgs, org: memberships[0] };
}
export function stableLearning(value) {
  if (Array.isArray(value)) return `[${value.map(stableLearning).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableLearning(value[key])}`).join(",")}}`;
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("A finite number is required.");
  if (value === undefined) throw new Error("Missing learning field.");
  return JSON.stringify(value);
}
export async function learningHash(kind, value) {
  const bytes = new TextEncoder().encode(`charitology-learning/v1/${kind}\n${stableLearning(value)}\n`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export function sameHead(a, b) {
  return !!a && !!b && stableLearning(a) === stableLearning(b);
}
export function sourcePin(source) {
  if (!source || !hex.test(source.sha256 || "")) throw new Error("No exact retained source is available.");
  return { originOrgId: source.originOrgId, bindingId: source.bindingId, version: source.sourceVersion, sha256: source.sha256 };
}
export function numericLiteral(value, label, nullable = true) {
  if (value === "" && nullable) return null;
  if (!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(value)) throw new Error(`${label}: enter an explicit finite number, or leave it empty for unknown.`);
  const result = Number(value);
  if (!Number.isFinite(result) || Math.abs(result) > 1e12) throw new Error(`${label}: the supported range is −1,000,000,000,000 through 1,000,000,000,000.`);
  return result;
}
export function closedPeriod(startDate, endDate) {
  for (const value of [startDate, endDate]) {
    if (!/^(19|20|21|22)[0-9]{2}-[0-9]{2}-[0-9]{2}$/.test(value) || value > "2200-12-31" || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) throw new Error("Choose real period dates from 1900 through 2200.");
  }
  if (startDate > endDate) throw new Error("The period end must be on or after its start.");
  return { kind: "closed-days", startDate, endDate };
}
export function requirePin(resolution) {
  const pin = resolution?.pin, record = resolution?.record;
  if (!resolution?.eligibility?.eligible || resolution.eligibility.code !== "eligible" || !pin || !resolution.evidence || pin.recordId !== record?.id || resolution.recordId !== record.id || pin.moduleId !== record.moduleId || pin.originOrgId !== record.orgId || pin.revision !== record.revision || !hex.test(pin.snapshotSha256 || "") || !hex.test(pin.approvalSha256 || "") || !/^[1-9][0-9]{0,18}$/.test(pin.approvalEventId || "") || BigInt(pin.approvalEventId) > 9223372036854775807n || stableLearning(resolution.evidence.pin) !== stableLearning(pin)) throw new Error(resolution?.eligibility?.message || "This record needs an eligible final-state approval. Open its ordinary workflow, then explicitly reload this context.");
  return resolution.pin;
}
export function learningCommitIntent(makeKey = () => crypto.randomUUID()) {
  let pending = null;
  return {
    prepare(preview) {
      const body = { previewId: preview.previewId, reviewSha256: preview.reviewSha256 };
      if (!hex.test(body.reviewSha256 || "") || !body.previewId) throw new Error("The preview is incomplete. Prepare it again.");
      if (pending && stableLearning(body) !== stableLearning({ previewId: pending.previewId, reviewSha256: pending.reviewSha256 })) throw new Error("Retry the unresolved command before changing its preview.");
      if (!pending) {
        const commandKey = makeKey();
        if (!uuid.test(commandKey)) throw new Error("A lowercase UUIDv4 command key is required.");
        pending = Object.freeze({ ...body, commandKey });
      }
      return { ...pending };
    },
    get pending() { return pending && { ...pending }; },
    // A rate refusal occurs before receipt lookup and cannot reconcile an earlier
    // interrupted attempt. Keep that key along with network/unreadable/5xx errors.
    rejected(error) {
      if (error?.code !== "invalid_response" && [400, 401, 403, 404, 409, 410, 413, 422].includes(error?.status)) pending = null;
    },
    clear() { pending = null; },
  };
}
export async function loadLearningContext(api, org, bindingId, signal, assertCurrent) {
  const records = [], events = [], cursors = new Set();
  let first, cursor = null;
  do {
    const page = await api.learningContext(org, bindingId, cursor, { signal });
    assertCurrent();
    if (!page?.binding?.head || !page.mapping?.payload?.mapping || !page.source || !Array.isArray(page.records) || page.records.length > 20) throw new Error("The learning context response is incomplete.");
    if (page.binding.bindingId !== bindingId || page.binding.originOrgId !== org || page.binding.head.bindingId !== bindingId || page.binding.head.originOrgId !== org || page.binding.originMode !== "live") throw new Error("The learning context identity is outside this live workspace.");
    if (new TextEncoder().encode(JSON.stringify(page)).length > 4 * 1024 * 1024) throw new Error("The learning context exceeds its 4 MiB reading bound.");
    if (first && !sameHead(first.binding.head, page.binding.head)) throw new Error("The binding changed during paging. Reload its context; your form is kept.");
    if (first && (first.mapping.sha256 !== page.mapping.sha256 || first.source.sha256 !== page.source.sha256 || stableLearning(first.program) !== stableLearning(page.program))) throw new Error("The mapping, source or program approval changed during paging. Reload explicitly; your form is kept.");
    first ||= page;
    for (const resolution of page.records) {
      if (!resolution?.recordId || records.some((row) => row.recordId === resolution.recordId)) throw new Error("Repeated or incomplete context record. Reload explicitly.");
      if (resolution.record && (resolution.record.id !== resolution.recordId || resolution.record.orgId !== org)) throw new Error("The current record is outside this workspace.");
      records.push(resolution);
    }
    cursor = page.nextCursor;
    if (cursor && (cursors.has(cursor) || cursor.length > 2048)) throw new Error("Repeated or invalid context cursor.");
    if (cursor) cursors.add(cursor);
    if (records.length > 400 || cursors.size > 400) throw new Error("The learning context exceeds its finite record bound.");
  } while (cursor);
  cursor = null; cursors.clear();
  do {
    const page = await api.learningBinding(org, bindingId, cursor, { signal });
    assertCurrent();
    if (!sameHead(first.binding.head, page?.binding?.head) || !Array.isArray(page.events) || page.events.length > 20) throw new Error("The binding changed or its event page is incomplete. Reload explicitly.");
    events.push(...page.events);
    cursor = page.nextCursor;
    if (cursor && (cursors.has(cursor) || cursor.length > 2048)) throw new Error("Repeated or invalid event cursor.");
    if (cursor) cursors.add(cursor);
    if (events.length > 1000 || cursors.size > 50) throw new Error("The binding exceeds its 1,000-event reading bound.");
  } while (cursor);
  if (new Set(events.map((event) => event.sha256)).size !== events.length) throw new Error("Repeated learning event.");
  return { ...first, records, events: events.sort((a, b) => a.sequence - b.sequence) };
}
export function learningSeries(context) {
  const mapped = context.mapping.payload.records;
  const resolutions = new Map(context.records.map((resolution) => [resolution.recordId, resolution]));
  // Compiler order is exact: contiguous indicator slots, then the protocol.
  // Keep slot identity even when a current historical target is unavailable.
  const definitionSlots = new Map(mapped.slice(0, context.mapping.payload.mapping.indicators.length).map((row, index) => [row.recordId, index]));
  const definitions = mapped.map((row) => resolutions.get(row.recordId)).filter((row) => row?.record?.data.kind === "indicator");
  const protocol = mapped.map((row) => resolutions.get(row.recordId)).find((row) => row?.record?.data.kind === "protocol");
  const pending = new Map(), replaced = new Set(), abandoned = new Set();
  const points = [], decisions = [];
  for (const event of context.events) {
    const p = event.payload;
    if (["measured", "corrected"].includes(p.kind)) {
      const input = p.kind === "corrected" ? p.input.measurement : p.input;
      // A remap does not abandon an older pending attempt. Keep its deliberate
      // closure available while limiting current measurements to this mapping.
      if (p.kind === "corrected") pending.set(event.sha256, event);
      if (input.mappingEventSha256 !== context.mapping.sha256) continue;
      points.push({ event, input, resolution: resolutions.get(p.record.recordId), recordId: p.record.recordId });
    } else if (p.kind === "correction-applied") {
      pending.delete(p.correctionEventSha256);
      replaced.add(p.replaces.recordId);
    } else if (p.kind === "correction-abandoned") {
      pending.delete(p.correctionEventSha256);
      abandoned.add(p.candidateRecordId);
    } else if (p.kind === "decided" && p.input.mappingEventSha256 === context.mapping.sha256) decisions.push({ event, resolution: resolutions.get(p.record.recordId) });
  }
  const reserved = new Set([...pending.values()].flatMap((event) => [event.payload.input.replaces.recordId, event.payload.record.recordId]));
  const candidates = new Set(context.events.filter((event) => event.payload.kind === "corrected").map((event) => event.payload.record.recordId));
  const applied = new Set(context.events.filter((event) => event.payload.kind === "correction-applied").map((event) => event.payload.replacement.recordId));
  return { definitions, definitionSlots, protocol, points, decisions, pending: [...pending.values()], replaced, abandoned,
    selectable: points.filter((point) => point.resolution?.eligibility?.eligible && !replaced.has(point.recordId) && !reserved.has(point.recordId) && !abandoned.has(point.recordId) && (!candidates.has(point.recordId) || applied.has(point.recordId))) };
}
export async function checkedLearningReport(report) {
  const keys = ["format", "kind", "version", "methodVersion", "id", "orgId", "title", "createdBy", "createdAt", "audience", "selection", "manifest", "basis", "assessment", "feedback", "sources", "approvedEvidence", "events", "exclusions", "boundaries", "supersedes", "checksum"];
  if (!report || Object.keys(report).sort().join() !== keys.sort().join() || report.format !== "charitology-os-report" || report.kind !== "learning-review" || report.version !== 1 || report.methodVersion !== "learning-review-v1" || report.audience !== "private-staff" || !hex.test(report.checksum || "") || !Array.isArray(report.sources) || report.sources.length !== 1 || !Array.isArray(report.approvedEvidence) || report.approvedEvidence.length > 600 || !Array.isArray(report.events) || report.events.length > 1000 || !Array.isArray(report.boundaries) || report.boundaries.length > 64 || !Array.isArray(report.exclusions) || !report.selection?.selection || !report.manifest || !report.basis || !report.assessment || !report.feedback) throw new Error("The private learning report response could not be verified.");
  if (new TextEncoder().encode(JSON.stringify(report)).length > 4 * 1024 * 1024) throw new Error("The private learning report exceeds 4 MiB.");
  const { checksum, ...body } = report;
  if (await learningHash("report", body) !== checksum) throw new Error("The private learning report checksum does not match. Nothing was downloaded or printed.");
  return report;
}
