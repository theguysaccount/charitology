import test from "node:test";
import assert from "node:assert/strict";
import {
  configured,
  withIncubatorFixture,
} from "./fixtures/incubator-bridge.mjs";
import { currentIncubatorMember } from "../lib/incubator-bridge-access.mjs";
import { commitIncubatorCopy } from "../lib/incubator-bridge-commands.mjs";
import {
  checkWorkspaceExportCapacity,
  assembleWorkspaceBackup,
} from "../lib/workspace-backup.mjs";
import { measureLearningRestoreCapacity } from "../lib/learning-capacity.mjs";
import { validateBackup, makeBackup } from "../lib/backup.mjs";
import { mapping } from "../test/incubator-fixtures.mjs";
import { sourcePin } from "../lib/incubator-native.mjs";
import { modulePermissions } from "../lib/modules.mjs";
import { withIntervalFixture } from "./fixtures/participation-intervals.mjs";
import { buildLearningFixture } from "../test/learning-fixtures.mjs";
import { createHandler } from "../lib/handler.mjs";
import { canRetainIncubatorExportAudit } from "../lib/workspace-backup.mjs";
import { canRetainParticipationSafetyAudit } from "../lib/participation-capacity.mjs";
import { logicalBackupBytes } from "../lib/database.mjs";

const options = {
  skip: configured
    ? false
    : "Supply explicit owned local/CI owner and constrained URLs.",
  timeout: 900000,
};
const counts = (f) =>
  f.tx(
    async (c) =>
      (
        await c.query(
          "SELECT (SELECT count(*) FROM os_records WHERE org_id=$1) AS records,(SELECT count(*) FROM os_events WHERE org_id=$1) AS audits,(SELECT count(*) FROM os_incubator_history WHERE org_id=$1) AS history",
          [f.org],
        )
      ).rows[0],
  );
const preview = async (f, record, options = {}) => {
  const inspected = await f.inspect(record, options);
  return f.post(
    "incubator-bridge/copy/preview",
    {
      mode: options.target?.kind === "refresh" ? "refresh-copy" : "copy",
      inspectionId: inspected.inspectionId,
      mapping,
    },
    options,
  );
};

test(
  "Incubator PG: recovered-source and current-destination scopes are independently required for adoption",
  options,
  () =>
    withIncubatorFixture(async (f) => {
      const old = await f.program();
      await f.copy(old);
      const backup = await f.call("export");
      const restore = await f.post(
        "import/preview",
        { backup },
        { organization: f.destination },
      );
      await f.post(
        "import/commit",
        { previewId: restore.previewId },
        { organization: f.destination },
      );
      const recovered = (
        await f.call("incubator-bridge/recovered", {
          organization: f.destination,
        })
      ).bindings[0];
      const destination = await f.program({ organization: f.destination }),
        user = "fictional-admin";
      const setScope = (ids) =>
        f.tx(
          (c) =>
            c.query(
              "UPDATE os_members SET program_ids=$3::jsonb,revision=revision+1 WHERE org_id=$1 AND user_id=$2",
              [f.destination, user, JSON.stringify(ids)],
            ),
          { organization: f.destination },
        );
      const state = () =>
        f.tx(
          async (c) =>
            (
              await c.query(
                "SELECT (SELECT count(*) FROM os_records WHERE org_id=$1) AS records,(SELECT count(*) FROM os_events WHERE org_id=$1) AS audits,(SELECT count(*) FROM os_incubator_history WHERE org_id=$1) AS history,(SELECT count(*) FROM os_previews WHERE org_id=$1 AND committed_at IS NULL) AS pending",
                [f.destination],
              )
            ).rows[0],
          { organization: f.destination },
        );
      const input = {
        recoveredHead: recovered.head,
        source: recovered.source,
        program: f.programPin(destination),
        mapping,
      };
      await setScope([destination.id]);
      const before = await state();
      assert.deepEqual(
        (
          await f.call("incubator-bridge/recovered", {
            organization: f.destination,
            user,
          })
        ).bindings,
        [],
      );
      await f.call(`incubator-bridge/recovered/${recovered.head.sha256}`, {
        organization: f.destination,
        user,
        expect: 404,
      });
      await f.post("incubator-bridge/adopt/preview", input, {
        organization: f.destination,
        user,
        expect: 404,
      });
      assert.deepEqual(await state(), before);
      await setScope([old.id, destination.id]);
      const allowed = await f.post("incubator-bridge/adopt/preview", input, {
        organization: f.destination,
        user,
      });
      assert.equal(allowed.plan.source.sha256, input.source.sha256);
      await setScope([destination.id]);
      const beforeCommit = await state();
      await f.post("incubator-bridge/commit", f.intent(allowed), {
        organization: f.destination,
        user,
        expect: 409,
      });
      assert.deepEqual(await state(), beforeCommit);
      await setScope([old.id, destination.id]);
      const reviewed = await f.post("incubator-bridge/adopt/preview", input, {
        organization: f.destination,
        user,
      });
      assert.equal(
        (
          await f.post("incubator-bridge/commit", f.intent(reviewed), {
            organization: f.destination,
            user,
          })
        ).kind,
        "created",
      );
    }),
);

test(
  "Incubator PG: an ordinary target moved out of current scope exposes no current revision on history or accepted Retry",
  options,
  () =>
    withIncubatorFixture(async (f) => {
      const a = await f.program(),
        b = await f.program(),
        user = "fictional-admin";
      await f.tx((c) =>
        c.query(
          "UPDATE os_members SET program_ids=$3::jsonb,revision=revision+1 WHERE org_id=$1 AND user_id=$2",
          [f.org, user, JSON.stringify([a.id])],
        ),
      );
      const copied = await f.copy(a, { user }),
        milestone = copied.result.result.created[1].id;
      const parent = (
        await f.post("modules/projects/records", {
          data: {
            title: "Ordinary destination project",
            kind: "project",
            programId: b.id,
          },
        })
      ).record;
      const original = (await f.call(`modules/projects/records/${milestone}`))
        .record;
      await f.call(`modules/projects/records/${milestone}`, {
        method: "PATCH",
        body: {
          revision: original.revision,
          data: { ...original.data, programId: b.id, projectId: parent.id },
        },
      });
      await f.call(`modules/projects/records/${milestone}`, {
        user,
        expect: 404,
      });
      const before = await counts(f),
        detail = await f.call(
          `incubator-bridge/bindings/${copied.result.result.head.bindingId}`,
          { user },
        );
      const hidden = detail.binding.currentDisposition.find(
        (value) => value.id === milestone,
      );
      assert.deepEqual(hidden, {
        id: milestone,
        moduleId: "projects",
        disposition: "unavailable",
      });
      const list = (await f.call("incubator-bridge/bindings", { user }))
        .bindings[0];
      assert.deepEqual(
        list.currentDisposition.find((value) => value.id === milestone),
        hidden,
      );
      const retried = await f.post("incubator-bridge/commit", copied.input, {
        user,
      });
      assert.equal(retried.kind, "already-committed");
      assert.deepEqual(retried.result, copied.result.result);
      assert.deepEqual(
        retried.currentDisposition.find((value) => value.id === milestone),
        hidden,
      );
      assert.deepEqual(await counts(f), before);
      const global = await f.call(
        `incubator-bridge/bindings/${copied.result.result.head.bindingId}`,
      );
      assert.equal(
        global.binding.currentDisposition.find(
          (value) => value.id === milestone,
        ).revision,
        2,
      );
      await f.call(`modules/projects/records/${milestone}`, {
        method: "DELETE",
        body: { revision: 2 },
      });
      const trash = await f.call(
        `incubator-bridge/bindings/${copied.result.result.head.bindingId}`,
        { user },
      );
      assert.deepEqual(
        trash.binding.currentDisposition.find(
          (value) => value.id === milestone,
        ),
        hidden,
      );
    }),
);

test(
  "Incubator PG: optional export journal preserves a near-wire-cap exit under a closed SQL exporter witness, with real audit/headroom controls",
  options,
  async (t) =>
    withIncubatorFixture(async (f) => {
      const program = await f.program();
      await f.inspect(program);
      await f.tx((c) =>
        c.query(
          "INSERT INTO os_comments(org_id,id,record_id,actor_id,body) VALUES($1,'fictional-export-comment',$2,$3,'Short actual fictional comment')",
          [f.org, program.id, f.author],
        ),
      );
      let padding = "",
        client = null,
        originalQuery = null;
      // Only one closed SELECT is projected. The same actual pg client and real
      // database.tx retain lock/classification/rollback/final-capacity behavior.
      // This is deliberately NOT a naturally authored/stored 64 MiB comment or a
      // claim that a natural <60 MiB Incubator-only database reaches this wire cap.
      const projected = {
        ...f.db,
        async tx(user, org, fn, opts) {
          try {
            return await f.db.tx(
              user,
              org,
              async (c) => {
                assert.equal(client, null);
                client = c;
                originalQuery = c.query;
                c.query = function (...args) {
                  if (args[0] === "SELECT * FROM os_comments WHERE org_id=$1") {
                    assert.equal(args[1][0], f.org);
                    return Reflect.apply(originalQuery, c, args).then(
                      (result) => ({
                        ...result,
                        rows: result.rows.map((row) => ({
                          ...row,
                          body: padding,
                        })),
                      }),
                    );
                  }
                  return Reflect.apply(originalQuery, c, args);
                };
                return fn(c);
              },
              opts,
            );
          } finally {
            if (client) {
              client.query = originalQuery;
              client = null;
              originalQuery = null;
            }
          }
        },
      };
      const settings = {
        origin: "https://os.example.invalid",
        secret: "fictional-export-witness-secret-over-thirty-two-characters",
        production: false,
        encryptionKey: "fictional-unused-key",
      };
      const handler = createHandler({
        settings,
        db: projected,
        auth: { api: { getSession: async () => f.sessions.get(f.author) } },
        send: async () => {
          throw Error("No mail/provider is allowed.");
        },
      });
      const request = () =>
        handler(new Request(settings.origin + `/api/orgs/${f.org}/export`));
      const auditCount = () =>
        f.tx(async (c) =>
          Number(
            (
              await c.query(
                "SELECT count(*) AS count FROM os_events WHERE org_id=$1 AND action='backup.exported'",
                [f.org],
              )
            ).rows[0].count,
          ),
        );
      const observations = [];
      for (const mode of ["pending", "durable"]) {
        if (mode === "durable") await f.copy(program);
        const beforeHeadroom = await auditCount();
        padding = "";
        let response = await request();
        assert.equal(response.status, 200);
        await response.arrayBuffer();
        const before = await auditCount();
        assert.equal(
          before,
          beforeHeadroom + 1,
          "A sufficient-headroom export retains its actual optional PG audit.",
        );
        const base = await projected.tx(
            f.author,
            f.org,
            (c) => assembleWorkspaceBackup(c, f.org),
            { readOnly: true },
          ),
          cap = 64 * 1024 * 1024;
        const naturalUsage = await f.tx((c) => logicalBackupBytes(c, f.org));
        assert(naturalUsage < 60 * 1024 * 1024);
        padding = "x".repeat(cap - 1 - Buffer.byteLength(JSON.stringify(base)));
        const event = {
          org_id: f.org,
          actor_id: f.author,
          action: "backup.exported",
          record_id: null,
          module_id: null,
          detail: { count: base.records.length, checksum: base.checksum },
        };
        const decisions = await projected.tx(
          f.author,
          f.org,
          async (c) => ({
            oldParticipationOnlyGate: await canRetainParticipationSafetyAudit(
              c,
              f.org,
              event,
            ),
            incubatorGate: await canRetainIncubatorExportAudit(c, f.org, event),
            wireBytes: Buffer.byteLength(
              JSON.stringify(await assembleWorkspaceBackup(c, f.org)),
            ),
          }),
          { readOnly: true },
        );
        assert.equal(decisions.oldParticipationOnlyGate, true);
        assert.equal(decisions.incubatorGate, false);
        assert.equal(decisions.wireBytes, cap - 1);
        response = await request();
        assert.equal(response.status, 200);
        const output = await response.arrayBuffer();
        assert.equal(output.byteLength, cap - 1);
        assert.equal(await auditCount(), before);
        observations.push({
          mode,
          naturalDatabaseLogicalBytes: naturalUsage,
          closedExporterWitness: true,
          naturallyAuthoredNearCapClaim: false,
          wireBytes: output.byteLength,
          optionalJournalOmitted: true,
          oldGateWouldPermit: true,
        });
        padding = "";
      }
      t.diagnostic(
        JSON.stringify({
          fictionalOnly: true,
          witness:
            "actual handler/pg client and final hard checks; only comment export body projected",
          observations,
        }),
      );
    }),
);

test(
  "Incubator PG: a fresh reviewed preview renews only its owned near-expiry inspection, while its own expiry still refuses",
  options,
  () =>
    withIncubatorFixture(async (f) => {
      const program = await f.program(),
        inspection = await f.inspect(program);
      await f.tx((c) =>
        c.query(
          "UPDATE os_previews SET expires_at=clock_timestamp()+interval '1 minute' WHERE org_id=$1 AND id=$2",
          [f.org, inspection.inspectionId],
        ),
      );
      const reviewed = await f.post("incubator-bridge/copy/preview", {
        mode: "copy",
        inspectionId: inspection.inspectionId,
        mapping,
      });
      const proof = await f.tx(
        async (c) =>
          (
            await c.query(
              "SELECT i.expires_at=p.expires_at AS equal,extract(epoch FROM (p.expires_at-clock_timestamp())) AS seconds FROM os_previews i JOIN os_previews p ON p.org_id=i.org_id WHERE i.org_id=$1 AND i.id=$2 AND p.id=$3",
              [f.org, inspection.inspectionId, reviewed.previewId],
            )
          ).rows[0],
      );
      assert.equal(proof.equal, true);
      assert(Number(proof.seconds) > 590 && Number(proof.seconds) <= 600);
      await f.tx((c) =>
        c.query(
          "UPDATE os_previews SET expires_at=clock_timestamp()-interval '1 second' WHERE org_id=$1 AND id=$2",
          [f.org, reviewed.previewId],
        ),
      );
      assert.equal(
        (
          await f.post("incubator-bridge/commit", f.intent(reviewed), {
            expect: 409,
          })
        ).code,
        "incubator_preview",
      );
      assert.equal((await counts(f)).history, "0");
    }),
);

test(
  "Incubator PG: actual whole native inspection, two ordinary drafts, privacy and rollback after complete graph writes",
  options,
  () =>
    withIncubatorFixture(async (f) => {
      const program = await f.program(),
        native = f.nativeFixture();
      native.records.projects.push({
        ...structuredClone(native.records.projects[0]),
        id: "unselected-secret",
        values: {
          ...native.records.projects[0].values,
          model: "PLANTED UNSELECTED",
        },
      });
      const inspected = await f.inspect(program, { native });
      assert.equal((await counts(f)).history, "0");
      const pendingCapacity = await f.tx((c) =>
        checkWorkspaceExportCapacity(c, f.org),
      );
      assert(pendingCapacity.operational);
      assert.equal(
        pendingCapacity.restore.categories.os_incubator_history.count,
        0,
        "An actual pending inspection triggers shared inactive projection without inventing durable history or an unwritten target pair.",
      );
      assert.equal(pendingCapacity.restore.categories.os_records.count, 1);
      assert.equal(
        await f.tx(
          async (c) =>
            (
              await c.query(
                "SELECT count(*) AS n FROM os_uploads WHERE org_id=$1",
                [f.org],
              )
            ).rows[0].n,
        ),
        "0",
      );
      const p = await f.post("incubator-bridge/copy/preview", {
          mode: "copy",
          inspectionId: inspected.inspectionId,
          mapping,
        }),
        input = f.intent(p),
        before = await counts(f);
      assert.equal(p.plan.candidates.length, 2);
      assert(
        p.plan.candidates.every(
          (r) =>
            r.status === "planned" &&
            r.approval === null &&
            r.snapshot === null,
        ),
      );
      await assert.rejects(
        f.tx(async (c) => {
          const result = await commitIncubatorCopy(c, {
            org: f.org,
            member: await currentIncubatorMember(
              c,
              f.org,
              f.sessions.get(f.author),
            ),
            session: f.sessions.get(f.author),
            input,
          });
          assert.equal(result.kind, "created");
          throw Error(
            "Fictional failure after all graph writes, before commit.",
          );
        }),
        /Fictional failure/,
      );
      assert.deepEqual(await counts(f), before);
      const saved = await f.post("incubator-bridge/commit", input);
      assert.equal(saved.kind, "created");
      assert.equal(saved.result.created.length, 2);
      const ordinary = [];
      for (const descriptor of saved.result.created) {
        const r = (await f.call(`modules/projects/records/${descriptor.id}`))
          .record;
        ordinary.push(r);
        assert.equal(r.ownerId, f.author);
        assert.equal(r.revision, 1);
        assert.equal(r.status, "planned");
        assert.equal(r.approval, null);
        assert.equal(r.snapshot, null);
        assert.equal(r.source, null);
      }
      assert.equal(ordinary[1].data.projectId, ordinary[0].id);
      assert.equal(ordinary[0].data.dueAt, null);
      assert.equal(ordinary[0].data.effortMinutes, null);
      const backup = await f.call("export");
      assert.equal(backup.incubatorBridge.sources.length, 1);
      assert.equal(backup.incubatorBridge.events.length, 1);
      assert(
        !JSON.stringify(backup.incubatorBridge).includes("PLANTED UNSELECTED"),
      );
      assert.equal(
        backup.incubatorBridge.sources[0].selected.milestone.values.project,
        native.records.milestones[0].values.project,
      );
      validateBackup(backup, f.destination, f.author);
      const measured = await f.tx((c) =>
        measureLearningRestoreCapacity(c, backup),
      );
      assert.equal(measured.categories.os_incubator_history.count, 2);
    }),
);

test(
  "Incubator PG: exact accepted Retry survives expiry, ordinary edits and later copies without recreating the old pair",
  options,
  () =>
    withIncubatorFixture(async (f) => {
      const program = await f.program(),
        first = await f.copy(program),
        id = first.result.result.created[0].id;
      let record = (await f.call(`modules/projects/records/${id}`)).record;
      record = (
        await f.call(`modules/projects/records/${id}`, {
          method: "PATCH",
          body: {
            revision: record.revision,
            data: { ...record.data, title: "Ordinarily edited after copy" },
          },
        })
      ).record;
      const source = f.nativeFixture();
      source.context.privacy = "Changed source context";
      const second = await f.copy(program, {
        native: source,
        target: {
          kind: "refresh",
          program: f.programPin(program),
          head: first.result.result.head,
        },
      });
      assert.equal(second.result.result.head.sequence, 2);
      const before = await counts(f),
        replayed = await f.post("incubator-bridge/commit", first.input);
      assert.equal(replayed.kind, "already-committed");
      assert.deepEqual(replayed.result, first.result.result);
      assert.equal(replayed.currentDisposition[0].disposition, "modified");
      assert.deepEqual(await counts(f), before);
      const conflict = await f.post(
        "incubator-bridge/commit",
        { ...first.input, reviewSha256: "a".repeat(64) },
        { expect: 409 },
      );
      assert.equal(conflict.code, "incubator_command_conflict");
      await f.tx((c) =>
        c.query(
          "UPDATE os_members SET revision=revision+1 WHERE org_id=$1 AND user_id=$2",
          [f.org, f.author],
        ),
      );
      const stale = await f.post("incubator-bridge/commit", first.input, {
        expect: 409,
      });
      assert.equal(stale.code, "incubator_stale");
      assert.deepEqual(await counts(f), before);
    }),
);

test(
  "Incubator PG: new inspections revoke old authority, duplicates require acknowledgment and unchanged files create no refresh",
  options,
  () =>
    withIncubatorFixture(async (f) => {
      const program = await f.program(),
        p1 = await preview(f, program),
        newNative = f.nativeFixture();
      newNative.context.name = "Newer source";
      await f.inspect(program, { native: newNative });
      const stale = await f.post("incubator-bridge/commit", f.intent(p1), {
        expect: 409,
      });
      assert.equal(stale.code, "incubator_preview");
      assert.equal((await counts(f)).history, "0");
      const first = await f.copy(program),
        duplicate = await f.inspect(program);
      assert.equal(duplicate.duplicates.length, 1);
      assert.equal(duplicate.canPreview, false);
      assert.equal(
        (
          await f.post(
            "incubator-bridge/copy/preview",
            { mode: "copy", inspectionId: duplicate.inspectionId, mapping },
            { expect: 409 },
          )
        ).code,
        "incubator_duplicate",
      );
      const separate = await f.copy(program, {
        target: {
          kind: "new",
          program: f.programPin(program),
          duplicatePolicy: "create-separate-copy",
        },
      });
      assert.notEqual(
        separate.result.result.head.bindingId,
        first.result.result.head.bindingId,
      );
      const before = await counts(f),
        same = await f.inspect(program, {
          target: {
            kind: "refresh",
            program: f.programPin(program),
            head: first.result.result.head,
          },
        });
      assert.equal(same.state, "unchanged");
      assert.equal(same.canPreview, false);
      assert.equal(
        (
          await f.post(
            "incubator-bridge/copy/preview",
            { mode: "refresh-copy", inspectionId: same.inspectionId, mapping },
            { expect: 409 },
          )
        ).code,
        "incubator_unchanged",
      );
      assert.deepEqual(await counts(f), before);
    }),
);

test(
  "Incubator PG: full restore is inactive, edited targets stay edited, explicit adoption has no phantom native capture",
  options,
  () =>
    withIncubatorFixture(async (f) => {
      const program = await f.program(),
        saved = await f.copy(program),
        created = saved.result.result.created[0].id;
      let current = (await f.call(`modules/projects/records/${created}`))
        .record;
      await f.call(`modules/projects/records/${created}`, {
        method: "PATCH",
        body: {
          revision: current.revision,
          data: { ...current.data, title: "Preserve ordinary editing" },
        },
      });
      const backup = await f.call("export"),
        restore = await f.post(
          "import/preview",
          { backup },
          { organization: f.destination },
        );
      assert.equal(restore.summary.rejected, 0);
      assert.equal(restore.summary.incubatorSourcesRecovered, backup.incubatorBridge.sources.length);
      assert.equal(restore.summary.incubatorEventsRetained, backup.incubatorBridge.events.length);
      assert(restore.summary.incubatorSourcesRecovered > 0);
      assert(restore.summary.incubatorEventsRetained > 0);
      await f.post(
        "import/commit",
        { previewId: restore.previewId, confirmation: "RESTORE" },
        { organization: f.destination },
      );
      const exported = await f.call("export", { organization: f.destination });
      const restoredAudit = exported.events.find(event => event.action === "backup.restored");
      assert.equal(restoredAudit.detail.incubatorSourcesRecovered, backup.incubatorBridge.sources.length);
      assert.equal(restoredAudit.detail.incubatorEventsRetained, backup.incubatorBridge.events.length);
      assert(
        exported.incubatorBridge.events.every(
          (e) => e.originMode === "recovered",
        ),
      );
      assert.deepEqual(
        exported.incubatorBridge.events[0].acceptedReceipt,
        backup.incubatorBridge.events[0].acceptedReceipt,
      );
      assert.equal(
        (
          await f.call(`modules/projects/records/${created}`, {
            organization: f.destination,
          })
        ).record.data.title,
        "Preserve ordinary editing",
      );
      await f.post("incubator-bridge/commit", saved.input, {
        organization: f.destination,
        expect: 409,
      });
      const recovered = (
          await f.call("incubator-bridge/recovered", {
            organization: f.destination,
          })
        ).bindings[0],
        target = await f.program({ organization: f.destination });
      const adopted = await f.post(
        "incubator-bridge/adopt/preview",
        {
          recoveredHead: recovered.head,
          source: recovered.source,
          program: f.programPin(target),
          mapping,
        },
        { organization: f.destination },
      );
      const accepted = await f.post(
        "incubator-bridge/commit",
        f.intent(adopted),
        { organization: f.destination },
      );
      const detail = await f.call(
        `incubator-bridge/bindings/${accepted.result.head.bindingId}`,
        { organization: f.destination },
      );
      assert.equal(detail.nativeSources.length, 0);
      assert.equal(detail.events[0].event.operation, "adopt");
      const revalidated = await f.copy(target, {
        organization: f.destination,
        target: {
          kind: "refresh",
          program: f.programPin(target),
          head: accepted.result.head,
        },
      });
      assert.equal(revalidated.inspected.state, "changed");
      assert.equal(revalidated.inspected.source.sourceVersion, 1);
      assert.equal(revalidated.inspected.source.previousNativeSource, null);
      assert.equal(revalidated.result.result.head.sequence, 2);
    }),
);

test(
  "Incubator PG: real role/scope/session/CSRF and forced tenant/append-only guards apply before source disclosure",
  options,
  () =>
    withIncubatorFixture(async (f) => {
      const program = await f.program(),
        saved = await f.copy(program);
      for (const role of [
        "owner",
        "admin",
        "program_lead",
        "grants_lead",
        "finance_reviewer",
        "contributor",
        "board_reader",
        "external_reviewer",
      ]) {
        const allowed =
          !["board_reader", "external_reviewer"].includes(role) &&
          modulePermissions("projects", role).write &&
          modulePermissions("programs", role).read;
        await f.call("incubator-bridge/bindings", {
          user: "fictional-" + role,
          expect: allowed ? 200 : 403,
        });
      }
      await f.post("incubator-bridge/commit", saved.input, {
        omitCsrf: true,
        expect: 403,
      });
      const contributor = "fictional-contributor";
      await f.tx((c) =>
        c.query(
          "UPDATE os_members SET program_ids=$3::jsonb,revision=revision+1 WHERE org_id=$1 AND user_id=$2",
          [f.org, contributor, JSON.stringify(["other-program"])],
        ),
      );
      assert.equal(
        (await f.call("incubator-bridge/bindings", { user: contributor }))
          .bindings.length,
        0,
      );
      await f.call(
        `incubator-bridge/bindings/${saved.result.result.head.bindingId}`,
        { user: contributor, expect: 404 },
      );
      assert.equal(
        (
          await f.db.pool.query(
            "SELECT count(*) AS count FROM os_incubator_history",
          )
        ).rows[0].count,
        "0",
      );
      await f.tx(async (c) =>
        assert.equal(
          (
            await c.query(
              "SELECT count(*) AS count FROM os_incubator_history WHERE org_id=$1",
              [f.destination],
            )
          ).rows[0].count,
          "0",
        ),
      );
      await assert.rejects(
        f.tx((c) =>
          c.query(
            "UPDATE os_incubator_history SET origin_mode='recovered' WHERE org_id=$1",
            [f.org],
          ),
        ),
        (e) => e.code === "42501" || e.code === "P0001",
      );
      await f.migration.pool.query(
        'UPDATE "session" SET "expiresAt"=now()-interval \'1 minute\' WHERE id=$1',
        [f.sessions.get(f.author).session.id],
      );
      await f.call("incubator-bridge/bindings", { expect: 401 });
    }),
);

test(
  "Incubator PG: independent exact schema and SQL/backup budgets protect feature-only ordinary changes and inactive restore",
  options,
  () =>
    withIncubatorFixture(async (f) => {
      const program = await f.program(),
        saved = await f.copy(program),
        before = await counts(f);
      const value = await f.tx((c) => checkWorkspaceExportCapacity(c, f.org));
      assert(value.restore.categories.os_incubator_history.bytes > 0);
      assert(value.requiredUsage >= value.usage);
      assert(value.requiredBackupBytes >= value.backupBytes);
      await f.migration.pool.query(
        "ALTER TABLE os_incubator_history ADD COLUMN unreviewed text",
      );
      try {
        const record = (
          await f.call(
            `modules/projects/records/${saved.result.result.created[0].id}`,
          )
        ).record;
        const failed = await f.call(`modules/projects/records/${record.id}`, {
          method: "PATCH",
          body: {
            revision: record.revision,
            data: { ...record.data, title: "Must roll back" },
          },
          expect: 422,
        });
        assert.equal(failed.code, "learning_capacity_schema");
      } finally {
        await f.migration.pool.query(
          "ALTER TABLE os_incubator_history DROP COLUMN unreviewed",
        );
      }
      assert.deepEqual(await counts(f), before);
      const backup = await f.tx((c) => assembleWorkspaceBackup(c, f.org));
      const malformed = structuredClone(backup.incubatorBridge.sources[0]);
      delete malformed.format;
      malformed.sha256 = "f".repeat(64);
      malformed.bindingId = "invalid-metadata";
      await assert.rejects(
        f.tx((c) =>
          c.query(
            "INSERT INTO os_incubator_history(org_id,id,row_kind,origin_mode,origin_org_id,binding_id,source_version,payload,budget_bytes) VALUES($1,$2,'source','live',$3,$4,1,$5::jsonb,octet_length($5::jsonb::text)+4096)",
            [
              f.org,
              malformed.sha256,
              malformed.originOrgId,
              malformed.bindingId,
              JSON.stringify(malformed),
            ],
          ),
        ),
        (e) => e.code === "23514",
      );
      const projected = await f.tx((c) =>
        measureLearningRestoreCapacity(c, backup),
      );
      assert.equal(projected.categories.os_incubator_history.count, 2);
      assert(projected.categories.os_incubator_history.bytes > 0);
    }),
);

test(
  "Incubator PG: independent actors racing an unacknowledged identical new copy accept only one pair",
  options,
  () =>
    withIncubatorFixture(async (f) => {
      const program = await f.program(),
        a = await preview(f, program),
        b = await preview(f, program, { user: "fictional-admin" }),
        before = await counts(f);
      const results = await Promise.allSettled([
        f.post("incubator-bridge/commit", f.intent(a)),
        f.post("incubator-bridge/commit", f.intent(b), {
          user: "fictional-admin",
        }),
      ]);
      assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
      const failed = results.find((x) => x.status === "rejected");
      assert(failed);
      assert.match(failed.reason.message, /incubator_stale/);
      const after = await counts(f);
      assert.equal(Number(after.records) - Number(before.records), 2);
      assert.equal(Number(after.history) - Number(before.history), 2);
    }),
);

test(
  "Incubator PG: eight retained native/events remain exportable and unchanged inspection does not invent a ninth version",
  options,
  () =>
    withIncubatorFixture(async (f) => {
      const program = await f.program();
      let saved = await f.copy(program),
        native = f.nativeFixture();
      for (let version = 2; version <= 8; version++) {
        if (version === 7)
          await f.migration.pool.query(
            "UPDATE os_rate_limits SET expires_at=now()-interval '1 second' WHERE key LIKE 'incubator-upload:%'",
          );
        native.context.name = "Explicit source version " + version;
        saved = await f.copy(program, {
          native,
          target: {
            kind: "refresh",
            program: f.programPin(program),
            head: saved.result.result.head,
          },
        });
      }
      assert.equal(saved.result.result.head.sequence, 8);
      const unchanged = await f.inspect(program, {
        native,
        target: {
          kind: "refresh",
          program: f.programPin(program),
          head: saved.result.result.head,
        },
      });
      assert.equal(unchanged.state, "unchanged");
      assert.equal(unchanged.source.sourceVersion, 8);
      const backup = await f.call("export");
      assert.equal(backup.incubatorBridge.sources.length, 8);
      assert.equal(backup.incubatorBridge.events.length, 8);
    }),
);

test(
  "Incubator PG: Learning closure and a real requested interval coexist through ordinary copy/edit and inactive full restore/re-export",
  options,
  () =>
    withIncubatorFixture(async (f) => {
      let packet, interval;
      await withIntervalFixture(
        async (g) => {
          const target = await g.makeTarget(
            "combined-opted-shift",
            "volunteers",
            2,
          );
          await g.adopt(target);
          let p = await g.associate(
            target,
            await g.makeCandidate("combined-booking", target),
          );
          interval = {
            version: 1,
            startAt: "2099-01-02T09:00:00+00:00",
            endAt: "2099-01-02T10:00:00+00:00",
            timeZone: "UTC",
          };
          p = await g.offlineConsent(target, p, {
            requestedInterval: interval,
          });
          await g.command(target, p, "confirm");
          const original = await g.db.tx(
            g.staff,
            g.org,
            (c) => assembleWorkspaceBackup(c, g.org),
            { readOnly: true },
          );
          const learning = buildLearningFixture({
            orgId: g.org,
            actorId: g.staff,
          });
          const {
            format,
            version,
            schemaVersion,
            organization,
            createdAt,
            checksum,
            records,
            ...extras
          } = original;
          packet = makeBackup(
            {
              name: organization.name,
              currency: organization.currency,
              time_zone: organization.timeZone,
            },
            [...records, ...learning.records],
            {
              ...extras,
              learningBridge: learning.backup,
            },
          );
        },
        {
          orgId: "fictional-interval-source",
          staffId: "fictional-interval-staff",
        },
      );
      let imported = await f.post("import/preview", { backup: packet });
      assert.equal(imported.summary.rejected, 0);
      await f.post("import/commit", { previewId: imported.previewId });
      const program = await f.program(),
        copied = await f.copy(program),
        id = copied.result.result.created[0].id;
      const ordinary = (await f.call(`modules/projects/records/${id}`)).record;
      await f.call(`modules/projects/records/${id}`, {
        method: "PATCH",
        body: {
          revision: ordinary.revision,
          data: {
            ...ordinary.data,
            deliverable: "Ordinary editable deliverable after copy",
          },
        },
      });
      const backup = await f.call("export");
      assert(backup.learningBridge);
      assert(backup.incubatorBridge);
      assert.equal(backup.participation.version, 3);
      assert.deepEqual(
        backup.participation.participations[0].requestedInterval,
        interval,
      );
      const capacity = await f.tx((c) =>
        checkWorkspaceExportCapacity(c, f.org),
      );
      assert(capacity.restore.categories.os_incubator_history.bytes > 0);
      assert(capacity.restore.categories.os_learning_history.bytes > 0);
      assert(capacity.restore.categories.os_participations.rawBytes > 0);
      imported = await f.post(
        "import/preview",
        { backup },
        { organization: f.destination },
      );
      assert.equal(imported.summary.rejected, 0);
      await f.post(
        "import/commit",
        { previewId: imported.previewId },
        { organization: f.destination },
      );
      const round = await f.call("export", { organization: f.destination });
      assert.deepEqual(
        round.participation.participations[0].requestedInterval,
        interval,
      );
      assert(
        round.incubatorBridge.events.every(
          (value) => value.originMode === "recovered",
        ),
      );
      assert.deepEqual(
        round.learningBridge.events,
        backup.learningBridge.events,
      );
    }),
);
