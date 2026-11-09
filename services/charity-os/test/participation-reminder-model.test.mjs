/** Fictional values, pure proposed contract only. Source authored; not run yet. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  REMINDER_METHOD, REMINDER_CONSENT_VERSION, ParticipationReminderError,
  validateReminderCommitment, reminderCommitmentSha256, reminderActorSha256,
  validateReminderPreference, reminderWindow, validateReminderReviewRequest,
  validateReminderScheduleRequest, reminderCommandPins, makeReminderIntentMarker,
  validateReminderIntentMarker, makeReminderPreviewPacket, validateReminderPreviewPacket,
  reminderPreviewResponse, validateReminderPreviewResponse, makeReminderReceipt,
  validateReminderReceipt, reminderAcceptedResponse, validateReminderAcceptedResponse,
} from "../lib/participation-reminder-model.mjs";
import {
  renderParticipationReminderTemplate, validateParticipationReminderTemplate,
  participationReminderTemplateSha256, PARTICIPATION_REMINDER_SUBJECT,
} from "../lib/participation-reminder-template.mjs";

const H = "a".repeat(64), OTHER = "b".repeat(64);
const NOW = "2026-11-08T09:00:00.000001Z", DUE = "2026-11-09T09:00:00.000000Z";
const copy = v => JSON.parse(JSON.stringify(v));
const refused = fn => assert.throws(fn, e => e instanceof ParticipationReminderError);
function commitment(participationId = "p00") {
  return { format: "charitology-participation-reminder-commitment", version: 1, method: REMINDER_METHOD,
    orgId: "fictional-org", moduleId: "events", targetId: "session", participationId,
    bookingRecordId: "booking-" + participationId, intakeId: "intake-" + participationId,
    contactId: "contact-" + participationId, confirmedAtExact: "2026-11-07T09:00:00.000001Z",
    frozenSourceRevision: 3, frozenSha256: H, frozenTermsSha256: OTHER,
    range: { startAt: "2026-11-10T09:00:00Z", endAt: "2026-11-10T10:00:00Z", timeZone: "UTC" } };
}
function item(participationId = "p00") {
  const c = commitment(participationId);
  return { participationId, participationRevision: 4, intakeRevision: 2,
    participationSha256: H, intakeSha256: H, deliveryConsentSha256: H,
    reminderConsentSha256: H, recipientBindingSha256: H, linkBindingSha256: H,
    commitment: c, commitmentSha256: reminderCommitmentSha256(c), dueAtExact: DUE };
}
function previewInput(count = 1) {
  return { previewId: "preview", orgId: "fictional-org", actorId: "fictional-admin",
    authority: { actorSha256: reminderActorSha256("fictional-admin"), sessionSha256: H,
      membershipSha256: H, memberCreatedAtExact: "2026-01-01T00:00:00.000001Z", restoreEpochSha256: H },
    target: { moduleId: "events", targetId: "session", targetRevision: 1, sourceRevision: 3, sourceSha256: H },
    policy: { epoch: "fictional-policy-epoch", revision: 2 },
    template: renderParticipationReminderTemplate("https://fixture.invalid/participant"),
    items: Array.from({ length: count }, (_, n) => item("p" + String(n).padStart(2, "0"))), issuedAtExact: NOW };
}
const request = () => ({ previewId: "preview", commandKey: "fictional-command-key-0001" });
function receiptInput() {
  const packet = makeReminderPreviewPacket(previewInput());
  return { packet, request: request(), acceptedAtExact: "2026-11-08T09:00:01.000001Z",
    scheduled: [{ participationId: "p00", outboxId: "fictional-outbox", commitmentSha256: packet.items[0].commitmentSha256, dueAtExact: DUE }] };
}

test("original confirmation is detached/frozen and exact SQL submilliseconds affect identity", () => {
  const raw = commitment(), a = validateReminderCommitment(raw), sha = reminderCommitmentSha256(a);
  raw.range.startAt = "2026-11-11T09:00:00Z"; assert.equal(a.range.startAt, "2026-11-10T09:00:00Z"); assert.ok(Object.isFrozen(a.range));
  const b = commitment(); b.confirmedAtExact = "2026-11-07T09:00:00.000002Z";
  assert.notEqual(reminderCommitmentSha256(b), sha); refused(() => validateReminderCommitment({ ...commitment(), reportId: "minted-id" }));
});
test("commitment validates original typed frozen range and source fields", () => {
  for (const mutate of [v => v.moduleId = "contacts", v => v.frozenSourceRevision = 0,
    v => v.range.endAt = v.range.startAt, v => v.range.timeZone = "Unknown/Zone",
    v => v.range.startAt = "2026-02-30T09:00:00Z", v => v.range.timeZone = "America/New_York"]) {
    const v = commitment(); mutate(v); refused(() => validateReminderCommitment(v));
  }
});
test("new scheduling is strictly before due and accepts exactly366elapsed days", () => {
  assert.equal(reminderWindow(commitment(), "2026-11-09T08:59:59.999999Z", "schedule").eligible, true);
  assert.equal(reminderWindow(commitment(), DUE, "schedule").reason, "too-late-to-schedule");
  assert.equal(reminderWindow(commitment(), "2025-11-09T09:00:00.000000Z", "schedule").eligible, true);
  assert.equal(reminderWindow(commitment(), "2025-11-09T08:59:59.999999Z", "schedule").reason, "beyond-horizon");
});
test("dispatch is due-inclusive/start-exclusive with microsecond comparisons", () => {
  assert.equal(reminderWindow(commitment(), "2026-11-09T08:59:59.999999Z", "dispatch").reason, "not-due");
  assert.equal(reminderWindow(commitment(), DUE, "dispatch").eligible, true);
  assert.equal(reminderWindow(commitment(), "2026-11-10T08:59:59.999999Z", "dispatch").eligible, true);
  assert.equal(reminderWindow(commitment(), "2026-11-10T09:00:00.000000Z", "dispatch").reason, "window-closed");
});
test("explicit SQL6clock is mandatory and no operation/default broadens it", () => {
  for (const now of [undefined, null, "2026-11-08T09:00:00.000Z", "2026-11-08T09:00:00.000001+00:00"])
    refused(() => reminderWindow(commitment(), now, "schedule"));
  refused(() => reminderWindow(commitment(), NOW, "send-now"));
});
test("frozen offset interval keeps its literal fields and exact elapsed lead", () => {
  const c = commitment(); c.range = { startAt: "2026-11-10T04:00:00-05:00", endAt: "2026-11-10T05:00:00-05:00", timeZone: "America/New_York" };
  assert.equal(reminderWindow(c, NOW, "schedule").dueAtExact, DUE);
  assert.equal(validateReminderCommitment(c).range.startAt, c.range.startAt);
});
test("null/off are distinct authority-free preferences; enabled choice pins original commitment", () => {
  assert.equal(validateReminderPreference(null), null);
  const off = { version: REMINDER_CONSENT_VERSION, enabled: false, revision: 1, atExact: NOW };
  assert.deepEqual(validateReminderPreference(off), off); refused(() => validateReminderPreference({ ...off, userId: "inferred" }));
  const on = { ...off, enabled: true, userId: "own-user", linkId: "c".repeat(32), linkRevision: 2,
    recipientSha256: H, commitmentSha256: reminderCommitmentSha256(commitment()) };
  assert.deepEqual(validateReminderPreference(on), on); refused(() => validateReminderPreference({ ...on, enabled: "yes" }));
});
test("fixed template permits only a canonical clean HTTPS portal and literal copy", () => {
  const value = renderParticipationReminderTemplate("https://fixture.invalid/participant");
  assert.equal(value.subject, PARTICIPATION_REMINDER_SUBJECT); assert.match(value.text, /best-effort/); assert.ok(value.text.includes("You asked for a reminder about your participation. Sign in to check the current details. This best-effort reminder does not confirm a place or record attendance.")); assert.doesNotMatch(value.text, /Your confirmed participation is approaching/);
  assert.equal(validateParticipationReminderTemplate(value).url, value.url); assert.equal(participationReminderTemplateSha256(value).length, 64);
  for (const url of ["http://fixture.invalid/participant", "https://user@fixture.invalid/participant", "https://fixture.invalid/participant?x=1", "https://fixture.invalid/participant#x", "https://fixture.invalid:444/participant", "https://fixture.invalid/participant/"])
    assert.throws(() => renderParticipationReminderTemplate(url));
  assert.throws(() => validateParticipationReminderTemplate({ ...value, text: "caller-controlled narrative" }));
});
test("owned admission rejects getter, proxy and proxy-in-prototype with zero hooks", () => {
  let hooks = 0; const v = commitment(); Object.defineProperty(v, "secret", { enumerable: true, get() { hooks++; throw new Error("read"); } });
  refused(() => validateReminderCommitment(v));
  const proxy = new Proxy({}, { ownKeys() { hooks++; throw new Error("ownKeys"); }, getPrototypeOf() { hooks++; throw new Error("prototype"); } });
  refused(() => validateReminderCommitment(proxy)); refused(() => validateReminderCommitment(Object.create(proxy)));
  const pins = {}; Object.defineProperty(pins, "orgId", { enumerable: true, get() { hooks++; throw new Error("destructure"); } });
  refused(() => reminderCommandPins(pins)); assert.equal(hooks, 0);
});
test("compensated sparse/noncanonical arrays never become a selected audience", () => {
  for (const key of ["4294967295", "999999999999999999999999999999", "01", "-0", "1e0"]) {
    const list = Array(1); Object.defineProperty(list, key, { value: { participationId: "p00", revision: 1, intakeRevision: 1 }, enumerable: true });
    refused(() => validateReminderReviewRequest({ version: 1, target: { moduleId: "events", targetId: "session", targetRevision: 1, sourceRevision: 1 }, participations: list }));
  }
});
test("cycles/symbols/foreign prototypes and extra command fields are refused", () => {
  const v = commitment(); v.loop = v; refused(() => validateReminderCommitment(v));
  const s = commitment(); s[Symbol("private")] = "x"; refused(() => validateReminderCommitment(s));
  refused(() => validateReminderCommitment(Object.assign(Object.create(null), commitment())));
  refused(() => validateReminderScheduleRequest({ ...request(), retryAnyway: true }));
});
test("review selects1–20 unique exact revision pins and never defaults an audience", () => {
  const r = { version: 1, target: { moduleId: "events", targetId: "session", targetRevision: 1, sourceRevision: 3 },
    participations: Array.from({ length: 20 }, (_, i) => ({ participationId: "p" + i, revision: 4, intakeRevision: 2 })) };
  assert.equal(validateReminderReviewRequest(r).participations.length, 20);
  refused(() => validateReminderReviewRequest({ ...r, participations: [] }));
  refused(() => validateReminderReviewRequest({ ...r, participations: [...r.participations, r.participations[0]] }));
  refused(() => validateReminderReviewRequest({ ...r, participations: [r.participations[0], r.participations[0]] }));
});
test("same key has stable command identity but changed valid preview changes exact request pin", () => {
  const context = { orgId: "fictional-org", actorId: "fictional-admin", request: request() };
  const a = reminderCommandPins(context), b = reminderCommandPins({ ...context, request: { ...request(), previewId: "other-preview" } });
  assert.equal(a.commandSha256, b.commandSha256); assert.notEqual(a.requestSha256, b.requestSha256);
  assert.notEqual(a.commandSha256, reminderCommandPins({ ...context, actorId: "other-admin" }).commandSha256);
});
test("marker is closed and derived from frozen time not a new row identity", () => {
  const m = makeReminderIntentMarker({ commitment: commitment(), sourceSha256: H, templateSha256: OTHER });
  assert.equal(m.dueAtExact, DUE); assert.deepEqual(validateReminderIntentMarker(m), m);
  refused(() => validateReminderIntentMarker({ ...m, dueAtExact: "2026-11-09T09:00:00.000001Z" }));
  refused(() => validateReminderIntentMarker({ ...m, relayKey: "not-history-authority" }));
});
test("complete20item preview is detached/frozen with actual-derived due and ten-minute lifetime", () => {
  const raw = previewInput(20), p = makeReminderPreviewPacket(raw); assert.equal(p.items.length, 20);
  assert.equal(p.expiresAtExact, "2026-11-08T09:10:00.000001Z"); assert.ok(Object.isFrozen(p.items[0].commitment));
  raw.items[0].participationRevision = 9; assert.equal(p.items[0].participationRevision, 4);
  assert.deepEqual(validateReminderPreviewPacket(p), p);
});
test("preview refuses changed source/selection/review/template pins and duplicate or reordered identities", () => {
  const p = makeReminderPreviewPacket(previewInput(2));
  for (const mutate of [v => v.selectionSha256 = OTHER, v => v.reviewSha256 = OTHER, v => v.template.subject = "new text",
    v => v.items.reverse(), v => v.items[1] = v.items[0], v => v.items[0].commitment.targetId = "elsewhere"]) {
    const v = copy(p); mutate(v); refused(() => validateReminderPreviewPacket(v));
  }
});
test("packet refuses wrong actor, impossible confirmation, malformed or due-issued candidate", () => {
  for (const mutate of [v => v.authority.actorSha256 = OTHER, v => v.items = null,
    v => v.items[0].commitment.confirmedAtExact = "2026-11-08T09:00:00.000002Z",
    v => v.issuedAtExact = DUE]) {
    const v = previewInput(); mutate(v); refused(() => makeReminderPreviewPacket(v));
  }
});
test("public review DTO has only literal content/range/selected references, no private authority pins", () => {
  const dto = reminderPreviewResponse(makeReminderPreviewPacket(previewInput()));
  assert.deepEqual(validateReminderPreviewResponse(dto), dto); assert.equal(dto.review.bestEffort, true);
  assert.deepEqual(Object.keys(dto.review.items[0]), ["participationId", "range", "dueAtExact"]);
  refused(() => validateReminderPreviewResponse({ ...dto, authority: H }));
  const v = copy(dto); v.review.items[0].dueAtExact = "2026-11-09T09:00:00.000001Z"; refused(() => validateReminderPreviewResponse(v));
});
test("receipt retains exact original result without current clock/eligibility parameters", () => {
  const r = makeReminderReceipt(receiptInput()); assert.deepEqual(validateReminderReceipt(r), r);
  const first = reminderAcceptedResponse(r, false), retry = reminderAcceptedResponse(r, true);
  assert.deepEqual({ ...first, replayed: true }, retry); assert.deepEqual(validateReminderAcceptedResponse(retry), retry);
  assert.equal(retry.scheduledCount, 1); assert.equal(retry.scheduled[0].outboxId, "fictional-outbox");
});
test("receipt refuses expired preview, changed exact preview reference and nonmatching scheduled result", () => {
  for (const mutate of [v => v.acceptedAtExact = v.packet.expiresAtExact,
    v => v.request.previewId = "other-preview", v => v.scheduled[0].participationId = "other-person",
    v => v.scheduled = [], v => v.scheduled[0].dueAtExact = "2026-11-09T09:00:00.000001Z"]) {
    const v = copy(receiptInput()); mutate(v); refused(() => makeReminderReceipt(v));
  }
});
test("receipt and success DTO refuse partial, duplicate, malformed or current-disposition fields", () => {
  const r = makeReminderReceipt(receiptInput()), dto = reminderAcceptedResponse(r, false);
  refused(() => validateReminderReceipt({ ...r, currentDisposition: "delivered" }));
  refused(() => validateReminderAcceptedResponse({ ...dto, scheduledCount: 2 }));
  refused(() => validateReminderAcceptedResponse({ ...dto, replayed: "yes" }));
  const v = copy(dto); v.scheduledCount = 2; v.scheduled.push(v.scheduled[0]); refused(() => validateReminderAcceptedResponse(v));
});
test("property ordering changes no fixed template/hash while extra payload never normalizes away", () => {
  const t = renderParticipationReminderTemplate("https://fixture.invalid/participant"), reversed = Object.fromEntries(Object.entries(t).reverse());
  assert.equal(participationReminderTemplateSha256(t), participationReminderTemplateSha256(reversed));
  assert.throws(() => validateParticipationReminderTemplate({ ...t, to: "not-a-recipient-authority@example.invalid" }));
});


// V2 source-only regressions. Both empty delimiters are meaningful against the
// exact V1 renderer/validator/hash; these tests have not been executed.
const barePortalValues = ["https://fixture.invalid/participant?", "https://fixture.invalid/participant#"];
function templateWithBareDelimiter(url) {
  const clean = "https://fixture.invalid/participant", value = renderParticipationReminderTemplate(clean);
  return { ...value, url, text: value.text.replace(clean, url), html: value.html.replace(clean, url) };
}
test("bare query/fragment delimiters are refused by fixed template renderer", () => {
  assert.equal(renderParticipationReminderTemplate("https://fixture.invalid/participant").url, "https://fixture.invalid/participant");
  for (const value of barePortalValues) assert.throws(() => renderParticipationReminderTemplate(value));
});
test("complete templates with bare delimiters are refused before accepting fixed copy", () => {
  for (const value of barePortalValues) assert.throws(() => validateParticipationReminderTemplate(templateWithBareDelimiter(value)));
});
test("bare-delimiter templates cannot acquire a fixed-template checksum", () => {
  for (const value of barePortalValues) assert.throws(() => participationReminderTemplateSha256(templateWithBareDelimiter(value)));
});


test("unexpired review still refuses receipt exactly at due after last-microsecond admission", () => {
  const raw = previewInput(); raw.issuedAtExact = "2026-11-09T08:59:59.999999Z";
  const packet = makeReminderPreviewPacket(raw);
  assert.equal(packet.expiresAtExact, "2026-11-09T09:09:59.999999Z");
  const input = { packet, request: request(), acceptedAtExact: raw.issuedAtExact,
    scheduled: [{ participationId: "p00", outboxId: "fictional-last-microsecond-outbox", commitmentSha256: packet.items[0].commitmentSha256, dueAtExact: DUE }] };
  assert.equal(makeReminderReceipt(input).acceptedAtExact, raw.issuedAtExact);
  assert.throws(() => makeReminderReceipt({ ...input, acceptedAtExact: DUE }),
    e => e instanceof ParticipationReminderError && e.code === "participation_reminder_time");
});
