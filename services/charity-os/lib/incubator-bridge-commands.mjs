import { id, fail } from "./security.mjs";
import {
  allRecords,
  saveRecord,
  audit,
  noteParticipationReceiptReplay,
} from "./database.mjs";
import { checkWorkspaceExportCapacity } from "./workspace-backup.mjs";
import {
  checkParticipationExportCapacity,
  checkCombinedParticipationCapacity,
} from "./participation-capacity.mjs";
import {
  incubatorHash as H,
  incubatorSame as same,
  incubatorObject as object,
  incubatorEnum as choice,
  incubatorId,
} from "./incubator-bridge-json.mjs";
import {
  inspectIncubatorNative,
  makeIncubatorSourceCapture,
  sourcePin,
  validateIncubatorSourcePin,
} from "./incubator-native.mjs";
import {
  compileIncubatorCandidates,
  makeIncubatorEvent,
  makeIncubatorReceipt,
  validateIncubatorMapping,
  validateIncubatorProgramPin,
  validateIncubatorHeadPin,
  headPin,
} from "./incubator-bridge-model.mjs";
import {
  currentIncubatorProgram,
  requireIncubatorScope,
  requireIncubatorMember,
  incubatorRestoreEpoch,
  incubatorAuthority,
  requireIncubatorAuthority,
  incubatorActorHash,
  incubatorStale,
} from "./incubator-bridge-access.mjs";
import {
  loadIncubatorInventory,
  incubatorBinding,
  incubatorSource,
  duplicateIncubatorBindings,
  insertIncubatorHistory,
  acceptedIncubatorCommand,
  clearIncubatorPending,
  storeIncubatorPending,
  readIncubatorPending,
  currentIncubatorDisposition,
  INCUBATOR_INSPECTION,
  INCUBATOR_PREVIEW,
} from "./incubator-bridge-store.mjs";

const now = async (c) =>
  (
    await c.query("SELECT clock_timestamp() AS instant")
  ).rows[0].instant.toISOString();
const duplicatePins = (bindings) =>
  bindings
    .map((value) => value.head)
    .sort((a, b) => a.sha256.localeCompare(b.sha256));
const recordsForEpoch = (plan) => [
  plan.program.recordId,
  ...(plan.candidates ?? []).map((value) => value.id),
];
async function combinedCapacity(c, org) {
  const whole = await checkWorkspaceExportCapacity(c, org);
  const present = (
    await c.query(
      "SELECT EXISTS(SELECT 1 FROM os_participation_targets WHERE org_id=$1) AS present",
      [org],
    )
  ).rows[0].present;
  if (present)
    checkCombinedParticipationCapacity(
      whole,
      await checkParticipationExportCapacity(c, org),
    );
  return whole;
}
function publicPlan(plan) {
  return {
    operation: plan.operation,
    source: plan.source,
    program: { pin: plan.program, record: plan.programRecord },
    head: plan.head,
    recoveredHead: plan.recoveredHead,
    mapping: plan.mapping,
    candidates: plan.candidates,
    duplicatePolicy: plan.duplicatePolicy,
    duplicates: plan.duplicates,
    historicalSource: plan.operation === "adopt",
    warning:
      plan.operation === "adopt"
        ? "Historical retained selection; original full file not present."
        : "Two new editable planned records will be created. Later ordinary approval can make their authored fields visible to ordinary readers.",
  };
}

export async function inspectIncubatorSource(
  c,
  { org, member, session, metadata, native },
) {
  const program = await currentIncubatorProgram(
      c,
      org,
      metadata.target.program,
      member,
    ),
    inventory = await loadIncubatorInventory(c, org);
  let binding = null,
    previous = null,
    bindingId = id(),
    version = 1;
  if (metadata.target.kind === "refresh") {
    binding = incubatorBinding(inventory, org, metadata.target.head);
    requireIncubatorScope(member, binding.programId);
    if (
      binding.programId !== program.id ||
      !same(binding.selection, metadata.selection)
    )
      incubatorStale();
    bindingId = binding.bindingId;
    previous = binding.nativeSources.at(-1) ?? null;
    version = binding.nativeSources.length + 1;
  }
  const inspected = inspectIncubatorNative(native, {
    adapter: metadata.adapter,
    selection: metadata.selection,
  });
  const priorIdentical = binding?.nativeSources.find(
    (value) => value.originalSha256 === inspected.originalSha256,
  );
  if (!priorIdentical && version > 8)
    fail(
      422,
      "incubator_quota",
      "This binding already retains eight native versions. Existing history remains readable and exportable.",
    );
  // An unchanged inspection is a read of the existing capture, not version9.
  const source =
    priorIdentical ??
    makeIncubatorSourceCapture(inspected, {
      originOrgId: org,
      bindingId,
      sourceVersion: version,
      previousNativeSource: previous ? sourcePin(previous) : null,
      preparedAt: await now(c),
    });
  const unchanged = Boolean(priorIdentical);
  const duplicates = duplicatePins(
    duplicateIncubatorBindings(inventory, {
      org,
      programId: program.id,
      source,
    }).filter((value) => value.bindingId !== bindingId),
  );
  const inspectionId = id(),
    epoch = await incubatorRestoreEpoch(c, org, [program.id]);
  const payload = {
    ...incubatorAuthority(member, session, epoch),
    inspectionId,
    source,
    target: metadata.target,
    program: metadata.target.program,
    programRecord: program,
    state: unchanged ? "unchanged" : "changed",
    duplicates,
  };
  const reviewSha256 = H("inspection", payload);
  await clearIncubatorPending(c, org, member, session);
  const stored = await storeIncubatorPending(
    c,
    org,
    member,
    INCUBATOR_INSPECTION,
    payload,
    { id: inspectionId, reviewSha256 },
  );
  await combinedCapacity(c, org);
  return {
    inspectionId,
    expiresAt: stored.expiresAt,
    source,
    target: metadata.target,
    program: { pin: metadata.target.program, record: program },
    state: payload.state,
    duplicates,
    canPreview:
      !unchanged &&
      (!duplicates.length ||
        metadata.target.kind === "refresh" ||
        metadata.target.duplicatePolicy === "create-separate-copy"),
  };
}

async function checkedInspection(
  c,
  { org, member, session, id: inspectionId, inventory },
) {
  const row = await readIncubatorPending(
      c,
      org,
      inspectionId,
      INCUBATOR_INSPECTION,
      member,
      session,
    ),
    inspection = row.payload;
  requireIncubatorAuthority(
    inspection,
    member,
    session,
    await incubatorRestoreEpoch(c, org, [inspection.program.recordId]),
  );
  await currentIncubatorProgram(c, org, inspection.program, member);
  if (inspection.state === "unchanged")
    fail(
      409,
      "incubator_unchanged",
      "This complete file is already a local native capture. No additional pair was prepared.",
    );
  if (inspection.target.kind === "refresh") {
    const binding = incubatorBinding(inventory, org, inspection.target.head);
    if (
      binding.programId !== inspection.program.recordId ||
      !same(binding.selection, inspection.source.selection)
    )
      incubatorStale();
  }
  const duplicates = duplicatePins(
    duplicateIncubatorBindings(inventory, {
      org,
      programId: inspection.program.recordId,
      source: inspection.source,
    }).filter((value) => value.bindingId !== inspection.source.bindingId),
  );
  if (!same(duplicates, inspection.duplicates)) incubatorStale();
  if (
    duplicates.length &&
    inspection.target.kind === "new" &&
    inspection.target.duplicatePolicy !== "create-separate-copy"
  )
    fail(
      409,
      "incubator_duplicate",
      "An existing copy matches this source and program. Review an explicit separate-copy acknowledgment before creating two more records.",
    );
  return inspection;
}
async function freshCandidates(c, org, member, program, mapping) {
  const candidates = compileIncubatorCandidates({
    orgId: org,
    actorId: member.userId,
    programId: program.recordId,
    projectId: id(),
    milestoneId: id(),
    mapping,
    records: await allRecords(c, org),
  });
  return candidates;
}
function eventFor(plan) {
  return makeIncubatorEvent({
    originOrgId: plan.originOrgId,
    bindingId: plan.bindingId,
    sequence: plan.sequence,
    previous: plan.head,
    preparedAt: plan.preparedAt,
    actorId: plan.actorId,
    program: plan.program,
    operation: plan.operation,
    source: sourcePin(plan.source),
    recoveredHead: plan.recoveredHead,
    mapping: plan.mapping,
    candidates: plan.candidates,
  });
}
function receiptFor(plan, event, input, acceptedAt) {
  return makeIncubatorReceipt(
    {
      operation: event.operation,
      commandHash: input.commandHash,
      requestHash: input.requestHash,
      actorBindingHash: plan.actorBindingHash,
      actorId: plan.actorId,
      sessionSha256: plan.sessionSha256,
      membershipSha256: plan.membershipSha256,
      memberCreatedAtExact: plan.memberCreatedAtExact,
      restoreEpochSha256: plan.restoreEpochSha256,
      previewId: input.previewId,
      reviewSha256: input.reviewSha256,
      acceptedAt,
    },
    event,
  );
}
async function applyGraph(c, org, member, plan, event, receipt) {
  const collisions = (
    await c.query(
      "SELECT id FROM os_records WHERE org_id=$1 AND id=ANY($2::text[])",
      [org, plan.candidates.map((value) => value.id)],
    )
  ).rows;
  if (collisions.length) incubatorStale();
  if (plan.operation !== "adopt")
    await insertIncubatorHistory(c, org, "source", plan.source);
  for (const candidate of plan.candidates) {
    const record = { ...candidate, orgId: org };
    await saveRecord(c, record);
    await audit(c, org, member.userId, "record.created", record, { record });
  }
  await insertIncubatorHistory(c, org, "event", event, { receipt });
  await audit(c, org, member.userId, "incubator.copied", null, {
    operation: event.operation,
    eventSha256: event.sha256,
    head: headPin(event),
    created: receipt.result.created,
  });
  await loadIncubatorInventory(c, org);
  await combinedCapacity(c, org);
}
/** Exact SQL/whole-envelope/inactive-restore witness, discarded inside this
 * transaction. It uses the real records/history/audits and no alternate quota. */
async function previewCapacity(c, org, member, plan, previewId, reviewSha256) {
  await c.query("SAVEPOINT incubator_capacity");
  try {
    const event = eventFor(plan),
      receipt = receiptFor(
        plan,
        event,
        {
          commandHash: "f".repeat(64),
          requestHash: "f".repeat(64),
          previewId,
          reviewSha256,
        },
        await now(c),
      );
    await applyGraph(c, org, member, plan, event, receipt);
  } finally {
    await c.query("ROLLBACK TO SAVEPOINT incubator_capacity");
    await c.query("RELEASE SAVEPOINT incubator_capacity");
  }
}
async function storePlan(c, { org, member, session, plan }) {
  const previewId = id(),
    reviewSha256 = H("review", plan);
  await previewCapacity(c, org, member, plan, previewId, reviewSha256);
  await clearIncubatorPending(c, org, member, session, { previewsOnly: true });
  const stored = await storeIncubatorPending(
    c,
    org,
    member,
    INCUBATOR_PREVIEW,
    plan,
    { id: previewId, reviewSha256 },
  );
  if (plan.inspectionId !== null) {
    // A fresh explicit review gets its stated ten minutes. Renew only its
    // exact still-current owned inspection, using the new SQL expiry itself;
    // neither host-clock precision nor another preview's expiry is authority.
    const renewed = await c.query(
      "UPDATE os_previews i SET expires_at=p.expires_at FROM os_previews p WHERE i.org_id=$1 AND p.org_id=i.org_id AND i.id=$2 AND p.id=$3 AND i.actor_id=$4 AND i.kind=$5 AND p.kind=$6 AND i.committed_at IS NULL AND p.committed_at IS NULL AND i.expires_at>clock_timestamp() AND i.payload->>'sessionSha256'=$7 AND i.payload->>'membershipSha256'=$8 AND i.payload#>>'{source,sha256}'=$9 RETURNING i.id",
      [
        org,
        plan.inspectionId,
        previewId,
        member.userId,
        INCUBATOR_INSPECTION,
        INCUBATOR_PREVIEW,
        plan.sessionSha256,
        member.membershipSha256,
        plan.source.sha256,
      ],
    );
    if (renewed.rowCount !== 1) incubatorStale();
  }
  await combinedCapacity(c, org);
  return { ...stored, plan: publicPlan(plan) };
}
export async function previewIncubatorCopy(c, { org, member, session, input }) {
  object(input, ["mode", "inspectionId", "mapping"]);
  choice(input.mode, ["copy", "refresh-copy"]);
  incubatorId(input.inspectionId);
  const mapping = validateIncubatorMapping(input.mapping),
    inventory = await loadIncubatorInventory(c, org);
  const inspection = await checkedInspection(c, {
    org,
    member,
    session,
    id: input.inspectionId,
    inventory,
  });
  const operation = inspection.target.kind === "new" ? "copy" : "refresh-copy";
  if (operation !== input.mode) incubatorStale();
  if (
    inspection.target.kind === "refresh" &&
    inspection.target.head.sequence >= 8
  )
    fail(
      422,
      "incubator_quota",
      "This binding already retains eight copy events. Existing history remains readable and exportable.",
    );
  const candidates = await freshCandidates(
    c,
    org,
    member,
    inspection.program,
    mapping,
  );
  const plan = {
    ...incubatorAuthority(
      member,
      session,
      await incubatorRestoreEpoch(c, org, [
        inspection.program.recordId,
        ...candidates.map((value) => value.id),
      ]),
    ),
    operation,
    originOrgId: org,
    bindingId: inspection.source.bindingId,
    sequence:
      inspection.target.kind === "new"
        ? 1
        : inspection.target.head.sequence + 1,
    head: inspection.target.kind === "new" ? null : inspection.target.head,
    recoveredHead: null,
    source: inspection.source,
    program: inspection.program,
    programRecord: inspection.programRecord,
    mapping,
    candidates,
    preparedAt: await now(c),
    inspectionId: input.inspectionId,
    duplicatePolicy:
      inspection.target.kind === "new"
        ? inspection.target.duplicatePolicy
        : "refuse",
    duplicates: inspection.duplicates,
  };
  return storePlan(c, { org, member, session, plan });
}
export async function previewIncubatorAdoption(
  c,
  { org, member, session, input },
) {
  requireIncubatorMember(member, { administrator: true });
  object(input, ["recoveredHead", "source", "program", "mapping"]);
  validateIncubatorHeadPin(input.recoveredHead);
  validateIncubatorSourcePin(input.source);
  validateIncubatorProgramPin(input.program);
  const mapping = validateIncubatorMapping(input.mapping),
    inventory = await loadIncubatorInventory(c, org);
  const binding = incubatorBinding(inventory, org, input.recoveredHead, {
    recovered: true,
  });
  requireIncubatorScope(member, binding.programId);
  if (!same(binding.source, input.source)) incubatorStale();
  const source = incubatorSource(inventory, input.source),
    programRecord = await currentIncubatorProgram(
      c,
      org,
      input.program,
      member,
    );
  const candidates = await freshCandidates(
    c,
    org,
    member,
    input.program,
    mapping,
  );
  const plan = {
    ...incubatorAuthority(
      member,
      session,
      await incubatorRestoreEpoch(c, org, [
        input.program.recordId,
        ...candidates.map((value) => value.id),
      ]),
    ),
    operation: "adopt",
    originOrgId: org,
    bindingId: id(),
    sequence: 1,
    head: null,
    recoveredHead: input.recoveredHead,
    source,
    program: input.program,
    programRecord,
    mapping,
    candidates,
    preparedAt: await now(c),
    inspectionId: null,
    duplicatePolicy: "refuse",
    duplicates: [],
  };
  await clearIncubatorPending(c, org, member, session);
  return storePlan(c, { org, member, session, plan });
}
export async function commitIncubatorCopy(c, { org, member, session, input }) {
  const actorBindingHash = incubatorActorHash(member, session),
    commandHash = H("command", {
      orgId: org,
      actorBindingHash,
      commandKey: input.commandKey,
    }),
    requestHash = H("request", input);
  const accepted = await acceptedIncubatorCommand(c, org, commandHash);
  if (accepted) {
    const { event, receipt } = accepted;
    requireIncubatorScope(member, event.program.recordId);
    if (event.operation === "adopt")
      requireIncubatorMember(member, { administrator: true });
    if (
      receipt.requestHash !== requestHash ||
      receipt.previewId !== input.previewId ||
      receipt.reviewSha256 !== input.reviewSha256
    )
      fail(
        409,
        "incubator_command_conflict",
        "This command key already identifies another exact request. Reconcile through authorized history.",
      );
    requireIncubatorAuthority(
      receipt,
      member,
      session,
      await incubatorRestoreEpoch(c, org, [
        event.program.recordId,
        ...event.candidates.map((value) => value.id),
      ]),
    );
    const currentDisposition = await currentIncubatorDisposition(
      c,
      org,
      event,
      member,
    );
    // This path performs only authorized reads before the server-only marker.
    noteParticipationReceiptReplay(c, org);
    return {
      kind: "already-committed",
      result: receipt.result,
      currentDisposition,
    };
  }
  const row = await readIncubatorPending(
      c,
      org,
      input.previewId,
      INCUBATOR_PREVIEW,
      member,
      session,
    ),
    plan = row.payload;
  if (row.checksum !== input.reviewSha256) incubatorStale();
  requireIncubatorAuthority(
    plan,
    member,
    session,
    await incubatorRestoreEpoch(c, org, recordsForEpoch(plan)),
  );
  const program = await currentIncubatorProgram(c, org, plan.program, member),
    inventory = await loadIncubatorInventory(c, org);
  if (plan.operation === "adopt") {
    requireIncubatorMember(member, { administrator: true });
    const recovered = incubatorBinding(inventory, org, plan.recoveredHead, {
      recovered: true,
    });
    requireIncubatorScope(member, recovered.programId);
    if (!same(recovered.source, sourcePin(plan.source))) incubatorStale();
  } else {
    const inspection = await checkedInspection(c, {
      org,
      member,
      session,
      id: plan.inspectionId,
      inventory,
    });
    if (
      !same(inspection.source, plan.source) ||
      !same(inspection.program, plan.program) ||
      !same(inspection.duplicates, plan.duplicates)
    )
      incubatorStale();
  }
  if (plan.head !== null) incubatorBinding(inventory, org, plan.head);
  const candidates = compileIncubatorCandidates({
    orgId: org,
    actorId: member.userId,
    programId: program.id,
    projectId: plan.candidates[0].id,
    milestoneId: plan.candidates[1].id,
    mapping: plan.mapping,
    records: await allRecords(c, org),
  });
  if (!same(candidates, plan.candidates)) incubatorStale();
  const event = eventFor(plan),
    receipt = receiptFor(
      plan,
      event,
      {
        commandHash,
        requestHash,
        previewId: input.previewId,
        reviewSha256: input.reviewSha256,
      },
      await now(c),
    );
  await applyGraph(c, org, member, plan, event, receipt);
  await clearIncubatorPending(c, org, member, session);
  return {
    kind: "created",
    result: receipt.result,
    currentDisposition: await currentIncubatorDisposition(
      c,
      org,
      event,
      member,
    ),
  };
}
