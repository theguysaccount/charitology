import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  observationClone,
  observationObjectHash,
  observationPrettyJson,
  observationRawHash,
  strictObservationJson,
} from "../src/lib/observation-canonical.mjs";
import {
  copyObservationBytes,
  copyPreparedObservationInputs,
  assertInitialWorldBankObservations,
  validateObservationSourceRoles,
} from "../src/lib/observation-sources.mjs";
import {
  buildObservationCandidate,
  observationCandidateFiles,
  observationCandidateReport,
  makeObservationCaptureRequest,
} from "../src/lib/observation-capture.mjs";
import {
  readPreparedObservationRoot,
  previewObservationCapture,
  writeReviewedObservationCapture,
  prepareObservationInputs,
  readObservationWorkingFiles,
  readBoundedObservationFile,
} from "../src/lib/observation-capture-io.mjs";
import { checkObservationAppendOnly } from "../src/lib/observation-git.mjs";
import {
  fixtureBaselineFiles,
  makeObservationCaptureFixture,
  changedObservationCaptureFixture,
} from "../test-fixtures/observations/capture-factory.mjs";

let groups = 0;
async function group(label, fn) {
  await fn();
  groups++;
  console.log("PASS " + label);
}
const fixture = () =>
  makeObservationCaptureFixture({ sourceCommit: "1".repeat(40) });
function rebuildPrepared(f, mutate) {
  const files = new Map(
      [...f.prepared.files].map(([k, v]) => [k, Buffer.from(v)]),
    ),
    inputs = observationClone(f.prepared.manifest.inputs);
  mutate(files, inputs);
  for (const item of inputs) {
    const raw = files.get(item.name);
    if (raw) {
      item.sha256 = observationRawHash(raw);
      item.bytes = raw.byteLength;
    }
  }
  const core = {
    format: "charitology-observation-prepared-inputs",
    version: 1,
    inputs,
  };
  const prepared = {
    manifest: { ...core, hash: observationObjectHash(core) },
    files,
  };
  const request = makeObservationCaptureRequest({
    ...f.request,
    preparedInputManifestHash: prepared.manifest.hash,
  });
  return { ...f, prepared, request };
}
function jsonEdit(f, name, edit) {
  return rebuildPrepared(f, (files) => {
    const value = JSON.parse(files.get(name).toString());
    edit(value);
    files.set(name, Buffer.from(JSON.stringify(value)));
  });
}
const capture = (f) =>
  buildObservationCandidate(null, f.prepared, f.baseline, f.request);
const writePrepared = (root, prepared) => {
  fs.mkdirSync(path.join(root, "inputs"), { recursive: true, mode: 0o700 });
  for (const [name, raw] of prepared.files)
    fs.writeFileSync(path.join(root, "inputs", name), raw, { mode: 0o600 });
  fs.writeFileSync(
    path.join(root, "manifest.json"),
    observationPrettyJson(prepared.manifest),
    { mode: 0o600 },
  );
};

await group(
  "native binary copy and hash never decode or call decorated accessors",
  () => {
    let calls = 0;
    const raw = Uint8Array.from([255, 0, 128]);
    Object.defineProperty(raw, "buffer", {
      get() {
        calls++;
        throw Error("caller getter");
      },
    });
    Object.defineProperty(raw, Symbol.iterator, {
      get() {
        calls++;
        throw Error("caller iterator");
      },
    });
    assert.deepEqual([...copyObservationBytes(raw, 3)], [255, 0, 128]);
    assert.equal(calls, 0);
    assert.throws(() => copyObservationBytes(new SharedArrayBuffer(8), 8));
    assert.throws(() => copyObservationBytes(new Proxy(raw, {}), 3));
  },
);
await group(
  "prepared input snapshot owns bytes and rejects Map subclasses/proxies",
  () => {
    const f = fixture(),
      owned = copyPreparedObservationInputs(f.prepared),
      name = f.prepared.manifest.inputs[0].name;
    f.prepared.files.get(name)[0] ^= 1;
    assert.notEqual(f.prepared.files.get(name)[0], owned.files.get(name)[0]);
    class M extends Map {}
    assert.throws(() =>
      copyPreparedObservationInputs({ ...owned, files: new M(owned.files) }),
    );
    assert.throws(() =>
      copyPreparedObservationInputs({
        ...owned,
        files: new Proxy(owned.files, {}),
      }),
    );
  },
);
await group(
  "exact tiny complete candidate passes actual admission and all exports",
  () => {
    const f = fixture(),
      p = capture(f),
      r = observationCandidateReport(p);
    assert.equal(r.economies, 1);
    assert.equal(r.cells, 5);
    assert.equal(r.present, 5);
    assert.equal(p.files.length, 84);
    assert(
      p.editionCsvBytes > 0 && p.editionJsonBytes > 0 && p.historyJsonBytes > 0,
    );
    assert.throws(() => assertInitialWorldBankObservations(r));
  },
);
await group(
  "closed/duplicate/incomplete preparation refuses before candidate",
  () => {
    const f = fixture();
    const extra = observationClone(f.prepared.manifest);
    extra.extra = true;
    extra.hash = observationObjectHash(extra);
    assert.throws(() =>
      copyPreparedObservationInputs({ ...f.prepared, manifest: extra }),
    );
    const duplicate = observationClone(f.prepared.manifest);
    duplicate.inputs[1] = duplicate.inputs[0];
    duplicate.hash = observationObjectHash(duplicate);
    assert.throws(() =>
      copyPreparedObservationInputs({ ...f.prepared, manifest: duplicate }),
    );
    const missing = rebuildPrepared(f, (_, inputs) => inputs.pop());
    assert.throws(() => capture(missing));
  },
);
await group(
  "catalog disposition/media/payload mismatch cannot publish a private original",
  () => {
    for (const change of [
      (spec) => {
        spec.input.publicDisposition = "private-original";
      },
      (spec) => {
        spec.input.mediaType = "text/html";
      },
      (spec) => {
        spec.record.payload.kind = "external-document";
      },
    ]) {
      const f = fixture();
      const baseline = {
        ...f.baseline,
        files: f.baseline.files.map((item) => ({
          ...item,
          bytes: Buffer.from(item.bytes),
        })),
      };
      const file = baseline.files.find(
        (item) => item.path === "src/data/observation-source-inputs.json",
      );
      const catalog = JSON.parse(file.bytes.toString());
      const spec = catalog.sources.find(
        (item) => item.input.name === "wb-country-metadata",
      );
      change(spec);
      assert.throws(
        () => validateObservationSourceRoles(catalog),
        /disposition, media and payload disagree/,
      );
      file.bytes = Buffer.from(observationPrettyJson(catalog));
      file.sha256 = observationRawHash(file.bytes);
      const changed = rebuildPrepared(f, (_, inputs) => {
        const item = inputs.find((item) => item.name === spec.input.name);
        item.publicDisposition = spec.input.publicDisposition;
        item.mediaType = spec.input.mediaType;
      });
      assert.throws(() => capture({ ...changed, baseline }));
    }
  },
);
await group(
  "wrong exact source bytes, external original or source URL never repaired",
  () => {
    const f = fixture(),
      bad = fixture();
    bad.prepared.files.get(bad.prepared.manifest.inputs[0].name)[0] ^= 1;
    assert.throws(() => capture(bad));
    assert.throws(() =>
      capture(
        rebuildPrepared(f, (files) =>
          files.set("gw-audit", Buffer.from("changed original")),
        ),
      ),
    );
    assert.throws(() =>
      capture(
        rebuildPrepared(f, (_, inputs) => {
          inputs[0].url = "https://u:p@example.invalid/";
        }),
      ),
    );
    assert.throws(() =>
      capture(
        rebuildPrepared(f, (_, inputs) => {
          inputs[0].url = "https://example.invalid\\@other.invalid/";
        }),
      ),
    );
  },
);
await group("complete source pages and exact role rows are mandatory", () => {
  const f = fixture(),
    name = "wb-values-sp-pop-totl";
  assert.throws(() =>
    capture(
      jsonEdit(f, name, (value) => {
        value[0].pages = 2;
      }),
    ),
  );
  assert.throws(() =>
    capture(
      jsonEdit(f, name, (value) => {
        delete value[0].per_page;
      }),
    ),
  );
  assert.throws(() =>
    capture(
      jsonEdit(f, name, (value) => {
        value[1][1] = value[1][0];
      }),
    ),
  );
  assert.throws(() =>
    capture(
      jsonEdit(f, name, (value) => {
        value[1][0].country.id = "ZZ";
      }),
    ),
  );
});
await group("finite country denominator rejects duplicate identities", () => {
  assert.throws(() =>
    capture(
      jsonEdit(fixture(), "wb-country-metadata", (value) => {
        value[1].push(value[1][0]);
        value[0].total = 2;
      }),
    ),
  );
});
await group(
  "returned empty strings remain empty and bounds stay own source evidence",
  () => {
    const p = capture(fixture()),
      records = observationCandidateReport(p).records;
    const pop = records.find(
      (r) => r.kind === "observation" && r.id.endsWith("population"),
    );
    assert.equal(pop.producerStatus, "");
    assert.equal(pop.producerUnit, "");
    assert.equal(pop.precision.kind, "unknown");
    const mortality = records.find(
      (r) => r.kind === "observation" && r.id.endsWith("under-five-mortality"),
    );
    assert.equal(mortality.uncertainty.confidence, null);
    assert.throws(() =>
      capture(
        jsonEdit(fixture(), "wb-values-sh-dyn-mort", (v) => {
          v[1][0].footnote = "Uncertainty bound is 6 - 7";
        }),
      ),
    );
  },
);
await group(
  "source numeric lexeme is retained before binary-number interpretation",
  () => {
    const f = rebuildPrepared(fixture(), (files) => {
      const name = "wb-values-sh-h2o-basw-zs";
      files.set(
        name,
        Buffer.from(
          files.get(name).toString().replace("85.25", "83.0512195121951"),
        ),
      );
    });
    const records = observationCandidateReport(capture(f)).records;
    const o = records.find(
      (r) => r.kind === "observation" && r.id.endsWith("basic-water-access"),
    );
    assert.equal(o.reported.token, "83.0512195121951");
    assert.deepEqual(o.value, {
      coefficient: "830512195121951",
      exponent: -13,
    });
  },
);
await group(
  "malformed or ambiguous JSON is never normalized into a source",
  () => {
    for (const raw of [
      Buffer.from('{"a":1,"a":2}'),
      Buffer.from([0xef, 0xbb, 0xbf, 123, 125]),
      Buffer.from([255]),
    ]) {
      const f = rebuildPrepared(fixture(), (files) =>
        files.set("wb-country-metadata", raw),
      );
      assert.throws(() => capture(f));
    }
  },
);
await group(
  "per-source exact caps accept complete private body and refuse +1",
  () => {
    const f = fixture(),
      name = "gw-identity";
    for (const extra of [0, 1]) {
      const changed = rebuildPrepared(f, (files) =>
        files.set(name, Buffer.alloc(4194304 + extra, 255)),
      );
      if (extra)
        assert.throws(() => copyPreparedObservationInputs(changed.prepared));
      else
        assert.equal(
          copyPreparedObservationInputs(changed.prepared).files.get(name)
            .byteLength,
          4194304,
        );
    }
    const oversized = rebuildPrepared(f, (files) =>
      files.set("wb-country-metadata", Buffer.alloc(1048577, 32)),
    );
    assert.throws(() => copyPreparedObservationInputs(oversized.prepared));
  },
);
await group(
  "request, prepared and baseline hashes independently bind the preview",
  () => {
    const f = fixture();
    assert.throws(() =>
      buildObservationCandidate(null, f.prepared, f.baseline, {
        ...f.request,
        capturedAt: "2000-01-04T00:00:00.000Z",
      }),
    );
    const baseline = {
      ...f.baseline,
      files: f.baseline.files.map((r) => ({
        ...r,
        bytes: new Uint8Array(r.bytes),
      })),
    };
    baseline.files[0].bytes[0] ^= 1;
    assert.throws(() =>
      buildObservationCandidate(null, f.prepared, baseline, f.request),
    );
  },
);
await group(
  "the complete prepared inventory accepts32MiB exactly and refuses one extra byte",
  () => {
    const raw = Buffer.alloc(4194304, 255),
      sha256 = observationRawHash(raw),
      inputs = [],
      files = new Map();
    for (let i = 0; i < 8; i++) {
      const name = "boundary-" + i;
      files.set(name, raw);
      inputs.push({
        name,
        url: "https://example.invalid/" + name,
        retrievedAt: "2000-01-01T00:00:00.000Z",
        mediaType: "application/pdf",
        sha256,
        bytes: raw.length,
        publicDisposition: "private-original",
      });
    }
    const core = {
      format: "charitology-observation-prepared-inputs",
      version: 1,
      inputs,
    };
    assert.equal(
      copyPreparedObservationInputs({
        manifest: { ...core, hash: observationObjectHash(core) },
        files,
      }).files.size,
      8,
    );
    const extra = Buffer.from([255]);
    files.set("boundary-extra", extra);
    inputs.push({
      name: "boundary-extra",
      url: "https://example.invalid/extra",
      retrievedAt: "2000-01-01T00:00:00.000Z",
      mediaType: "application/pdf",
      sha256: observationRawHash(extra),
      bytes: 1,
      publicDisposition: "private-original",
    });
    assert.throws(() =>
      copyPreparedObservationInputs({
        manifest: { ...core, hash: observationObjectHash(core) },
        files,
      }),
    );
  },
);
await group(
  "source-baseline legacy pins and capture/retrieval ordering are checked before admission",
  () => {
    const f = fixture(),
      baseline = {
        ...f.baseline,
        files: f.baseline.files.map((r) => ({
          ...r,
          bytes: new Uint8Array(r.bytes),
        })),
      };
    const file = baseline.files.find(
        (f) => f.path === "src/data/countries.json",
      ),
      legacy = JSON.parse(Buffer.from(file.bytes));
    legacy.retrieved = "1999-01-01";
    file.bytes = Buffer.from(JSON.stringify(legacy, null, 2) + "\n");
    file.sha256 = observationRawHash(file.bytes);
    assert.throws(
      () => buildObservationCandidate(null, f.prepared, baseline, f.request),
      /legacy comparison/,
    );
    const early = makeObservationCaptureRequest({
      ...f.request,
      capturedAt: "1999-01-01T00:00:00.000Z",
    });
    assert.throws(
      () => buildObservationCandidate(null, f.prepared, f.baseline, early),
      /prece?de/,
    );
  },
);
await group("owned immutable result and forged preview refusal", () => {
  const p = capture(fixture()),
    files = observationCandidateFiles(p);
  assert(
    Object.isFrozen(p) && Object.isFrozen(p.diff) && Object.isFrozen(files),
  );
  assert.throws(() => {
    files["registry.json"] = "changed";
  });
  assert.throws(() => observationCandidateFiles(JSON.parse(JSON.stringify(p))));
});
await group(
  "all changed country values append versions and preserve every prior byte",
  () => {
    const first = fixture(),
      p = capture(first),
      old = observationCandidateFiles(p),
      registry = JSON.parse(old["registry.json"]),
      next = changedObservationCaptureFixture(first, {
        previousRegistry: registry,
      });
    const second = buildObservationCandidate(
        old,
        next.prepared,
        next.baseline,
        next.request,
      ),
      files = observationCandidateFiles(second);
    for (const [name, text] of Object.entries(old))
      if (name !== "registry.json") assert.equal(files[name], text);
    assert.equal(
      second.diff.changed.filter((r) => r.after.kind === "observation").length,
      5,
    );
    assert.equal(JSON.parse(files["registry.json"]).editions.length, 2);
    assert.throws(() =>
      buildObservationCandidate(
        files,
        next.prepared,
        next.baseline,
        next.request,
      ),
    );
  },
);

await group("zero stays present and a newly nonnull cell is a new fact", () => {
  const zero = jsonEdit(fixture(), "wb-values-sp-pop-totl", (v) => {
    v[1][0].value = 0;
  });
  const zeroFact = observationCandidateReport(capture(zero)).records.find(
    (r) => r.kind === "observation" && r.id.endsWith("population"),
  );
  assert.deepEqual(zeroFact.value, { coefficient: "0", exponent: 0 });
  const missing = jsonEdit(fixture(), "wb-values-sh-dyn-mort", (v) => {
    for (const r of v[1]) r.value = null;
  });
  const first = capture(missing),
    firstFiles = observationCandidateFiles(first),
    firstReport = observationCandidateReport(first);
  assert.equal(firstReport.present, 4);
  assert.equal(firstReport.missing, 1);
  const coverage = firstReport.records.find(
    (r) => r.kind === "coverage" && r.id.endsWith("under-five-mortality"),
  );
  assert.equal(coverage.cells[0].sourceRefs.length, 6);
  const nextBase = changedObservationCaptureFixture(missing, {
    previousRegistry: JSON.parse(firstFiles["registry.json"]),
  });
  const next = jsonEdit(nextBase, "wb-values-sh-dyn-mort", (v) => {
    v[1][0].value = 5;
  });
  const second = buildObservationCandidate(
    firstFiles,
    next.prepared,
    next.baseline,
    next.request,
  );
  assert.equal(observationCandidateReport(second).present, 5);
  assert.equal(observationCandidateReport(second).missing, 0);
});
await group(
  "a fact reappearing after a missing edition extends its historical chain",
  () => {
    const initial = fixture(),
      first = capture(initial),
      one = observationCandidateFiles(first);
    const nextBase = changedObservationCaptureFixture(initial, {
      previousRegistry: JSON.parse(one["registry.json"]),
    });
    const missing = jsonEdit(nextBase, "wb-values-sh-dyn-mort", (v) => {
      for (const r of v[1]) r.value = null;
    });
    const second = buildObservationCandidate(
        one,
        missing.prepared,
        missing.baseline,
        missing.request,
      ),
      two = observationCandidateFiles(second);
    const thirdBase = changedObservationCaptureFixture(missing, {
      previousRegistry: JSON.parse(two["registry.json"]),
      editionId: "fictional-three",
      capturedAt: "2000-01-04T00:00:00.000Z",
    });
    const reappeared = jsonEdit(thirdBase, "wb-values-sh-dyn-mort", (v) => {
      v[1][0].value = 6;
    });
    const third = buildObservationCandidate(
        two,
        reappeared.prepared,
        reappeared.baseline,
        reappeared.request,
      ),
      files = observationCandidateFiles(third);
    const record = observationCandidateReport(third).records.find(
      (r) => r.kind === "observation" && r.id.endsWith("under-five-mortality"),
    );
    assert.equal(record.version, 2);
    assert.equal(record.previous.version, 1);
    assert.equal(
      files["observations/fact-aaa-under-five-mortality.v1.json"],
      one["observations/fact-aaa-under-five-mortality.v1.json"],
    );
  },
);

const temporary = fs.mkdtempSync(
  path.join(os.tmpdir(), "charitology-observation-capture-"),
);
const repo = path.join(temporary, "repo"),
  preparedRoot = path.join(temporary, "prepared");
fs.mkdirSync(repo);
const baselineFiles = fixtureBaselineFiles();
for (const [relative, raw] of Object.entries(baselineFiles)) {
  const file = path.join(repo, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, raw);
}
const git = (...args) =>
  execFileSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
try {
  git("init", "-q");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "user.name", "Fictional observation fixture");
  git("add", ".");
  git("commit", "-qm", "Fictional source A");
  const sourceCommit = git("rev-parse", "HEAD");
  const first = makeObservationCaptureFixture({ sourceCommit, baselineFiles });
  writePrepared(preparedRoot, first.prepared);
  await group(
    "disk preparation loader rejects extra files and symlinks",
    () => {
      assert.equal(
        readPreparedObservationRoot(preparedRoot).manifest.hash,
        first.prepared.manifest.hash,
      );
      fs.writeFileSync(path.join(preparedRoot, "orphan"), "x");
      assert.throws(() => readPreparedObservationRoot(preparedRoot));
      fs.rmSync(path.join(preparedRoot, "orphan"));
      const file = path.join(
          preparedRoot,
          "inputs",
          first.prepared.manifest.inputs[0].name,
        ),
        raw = fs.readFileSync(file);
      fs.rmSync(file);
      fs.symlinkSync("/etc/hosts", file);
      assert.throws(() => readPreparedObservationRoot(preparedRoot));
      fs.rmSync(file);
      fs.writeFileSync(file, raw);
    },
  );
  await group(
    "bounded fd reads refuse growth and symlink swaps without reading a foreign file",
    () => {
      const filename = path.join(temporary, "bounded.json"),
        original = Buffer.from('{"ok":true}\n');
      fs.writeFileSync(filename, original);
      const nativeOpen = fs.openSync,
        nativeRead = fs.readSync,
        nativeStat = fs.fstatSync;
      let fd,
        requested = 0,
        swapped = false;
      fs.openSync = function (file, ...args) {
        const opened = nativeOpen(file, ...args);
        if (file === filename && fd === undefined) fd = opened;
        return opened;
      };
      fs.fstatSync = function (opened, ...args) {
        const stat = nativeStat(opened, ...args);
        if (opened === fd && !swapped) {
          swapped = true;
          fs.appendFileSync(filename, Buffer.alloc(8 * 1024 * 1024, 32));
        }
        return stat;
      };
      fs.readSync = function (opened, buffer, offset, length, ...args) {
        if (opened === fd) {
          requested += length;
          assert(buffer.length <= original.length + 1);
        }
        return nativeRead(opened, buffer, offset, length, ...args);
      };
      try {
        assert.throws(() => readBoundedObservationFile(filename, 1024));
      } finally {
        fs.openSync = nativeOpen;
        fs.readSync = nativeRead;
        fs.fstatSync = nativeStat;
        fs.writeFileSync(filename, original);
      }
      assert(requested <= original.length + 1);
      assert.equal(swapped, true);
      const foreign = path.join(temporary, "foreign.json");
      fs.writeFileSync(foreign, "secret fixture");
      let reads = 0;
      fs.openSync = function (file, ...args) {
        if (file === filename) {
          fs.rmSync(filename);
          fs.symlinkSync(foreign, filename);
        }
        return nativeOpen(file, ...args);
      };
      fs.readSync = function (...args) {
        reads++;
        return nativeRead(...args);
      };
      try {
        assert.throws(() => readBoundedObservationFile(filename, 1024));
      } finally {
        fs.openSync = nativeOpen;
        fs.readSync = nativeRead;
        fs.rmSync(filename);
        fs.writeFileSync(filename, original);
      }
      assert.equal(reads, 0);
      assert.equal(fs.readFileSync(foreign, "utf8"), "secret fixture");
    },
  );
  let preview;
  await group(
    "actual committed A and private prepared snapshot produce an IO preview",
    async () => {
      preview = await previewObservationCapture({
        repo,
        preparedRoot,
        request: first.request,
      });
      assert.equal(preview.proposalHash, capture(first).proposalHash);
    },
  );
  await group(
    "write rejects copied preview JSON and a wrong reviewed hash",
    async () => {
      await assert.rejects(
        writeReviewedObservationCapture(
          JSON.parse(JSON.stringify(preview)),
          preview.proposalHash,
        ),
      );
      await assert.rejects(
        writeReviewedObservationCapture(preview, "0".repeat(64)),
      );
      assert.deepEqual(readObservationWorkingFiles(repo), {});
    },
  );
  await group(
    "a failed stage reservation never deletes a directory this command did not create",
    async () => {
      const original = fs.mkdirSync;
      let foreign;
      fs.mkdirSync = function (directory, ...args) {
        if (String(directory).includes(".observations-stage-")) {
          foreign = String(directory);
          original(directory, ...args);
          fs.writeFileSync(path.join(foreign, "foreign-marker"), "keep");
          const error = new Error("Fictional preexisting stage");
          error.code = "EEXIST";
          throw error;
        }
        return original(directory, ...args);
      };
      try {
        await assert.rejects(
          writeReviewedObservationCapture(preview, preview.proposalHash),
        );
      } finally {
        fs.mkdirSync = original;
      }
      assert.equal(
        fs.readFileSync(path.join(foreign, "foreign-marker"), "utf8"),
        "keep",
      );
      fs.rmSync(foreign, { recursive: true });
      assert.deepEqual(readObservationWorkingFiles(repo), {});
    },
  );
  await group(
    "forced mid-install failure removes only this attempt then permits retry",
    async () => {
      const original = fs.linkSync;
      let calls = 0;
      fs.linkSync = function (...args) {
        if (++calls === 3) throw Error("Fictional disk failure");
        return original(...args);
      };
      try {
        await assert.rejects(
          writeReviewedObservationCapture(preview, preview.proposalHash),
        );
      } finally {
        fs.linkSync = original;
      }
      assert.deepEqual(readObservationWorkingFiles(repo), {});
      assert.equal(
        fs.existsSync(path.join(repo, "src/data/.observations-write.lock")),
        false,
      );
    },
  );
  await group(
    "reviewed write activates registry last and rejects repeated stale write",
    async () => {
      const result = await writeReviewedObservationCapture(
        preview,
        preview.proposalHash,
      );
      assert.equal(result.registryHash, preview.candidateRegistryHash);
      const current = readObservationWorkingFiles(repo);
      assert.equal(Object.keys(current).length, preview.files.length);
      for (const f of preview.files)
        assert.equal(observationRawHash(current[f.path]), f.sha256);
      await assert.rejects(
        writeReviewedObservationCapture(preview, preview.proposalHash),
      );
    },
  );
  git("add", "src/data/observations");
  git("commit", "-qm", "Fictional captured B");
  const secondCommit = git("rev-parse", "HEAD"),
    registry = strictObservationJson(
      readObservationWorkingFiles(repo)["registry.json"],
    );
  const next = changedObservationCaptureFixture(first, {
    sourceCommit: secondCommit,
    previousCommit: secondCommit,
    previousRegistry: registry,
  });
  writePrepared(preparedRoot, next.prepared);
  await group(
    "changed disk input after preview refuses without rewriting old bytes",
    async () => {
      const p = await previewObservationCapture({
          repo,
          preparedRoot,
          request: next.request,
        }),
        before = readObservationWorkingFiles(repo),
        file = path.join(preparedRoot, "inputs", "wb-values-sp-pop-totl"),
        raw = fs.readFileSync(file);
      fs.writeFileSync(file, Buffer.concat([raw, Buffer.from(" ")]));
      await assert.rejects(writeReviewedObservationCapture(p, p.proposalHash));
      fs.writeFileSync(file, raw);
      assert.deepEqual(readObservationWorkingFiles(repo), before);
    },
  );
  await group(
    "dirty interpretation or observation inventory refuses before write",
    async () => {
      const file = path.join(repo, "src/data/observation-definitions.json"),
        raw = fs.readFileSync(file);
      fs.appendFileSync(file, " ");
      await assert.rejects(
        previewObservationCapture({
          repo,
          preparedRoot,
          request: next.request,
        }),
      );
      fs.writeFileSync(file, raw);
      const orphan = path.join(repo, "src/data/observations/orphan.txt");
      fs.writeFileSync(orphan, "x");
      await assert.rejects(
        previewObservationCapture({
          repo,
          preparedRoot,
          request: next.request,
        }),
      );
      fs.rmSync(orphan);
    },
  );
  let oldCommittedFiles;
  await group(
    "second reviewed write preserves committed old immutable history",
    async () => {
      const before = readObservationWorkingFiles(repo),
        p = await previewObservationCapture({
          repo,
          preparedRoot,
          request: next.request,
        });
      oldCommittedFiles = before;
      await writeReviewedObservationCapture(p, p.proposalHash);
      const after = readObservationWorkingFiles(repo);
      for (const [name, raw] of Object.entries(before))
        if (name !== "registry.json")
          assert.equal(
            observationRawHash(after[name]),
            observationRawHash(raw),
          );
      assert.equal(
        strictObservationJson(after["registry.json"]).editions.length,
        2,
      );
    },
  );
  await group(
    "restoring old working bytes cannot drop later committed history",
    async () => {
      git("add", "src/data/observations");
      git("commit", "-qm", "Fictional second captured edition");
      const current = readObservationWorkingFiles(repo),
        root = path.join(repo, "src/data/observations");
      fs.rmSync(root, { recursive: true });
      for (const [relative, raw] of Object.entries(oldCommittedFiles)) {
        const file = path.join(root, relative);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, raw);
      }
      await assert.rejects(
        previewObservationCapture({
          repo,
          preparedRoot,
          request: next.request,
        }),
        /current committed history/,
      );
      fs.rmSync(root, { recursive: true });
      for (const [relative, raw] of Object.entries(current)) {
        const file = path.join(root, relative);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, raw);
      }
    },
  );
  await group(
    "the independent Git gate refuses a valid-looking reset under an old bootstrap base",
    () => {
      const resetSource = git("rev-parse", "HEAD");
      const reset = makeObservationCaptureFixture({
        sourceCommit: resetSource,
        baselineFiles,
        editionId: "fictional-forged-reset",
      });
      const p = capture(reset),
        files = observationCandidateFiles(p),
        root = path.join(repo, "src/data/observations");
      fs.rmSync(root, { recursive: true });
      for (const [relative, text] of Object.entries(files)) {
        const file = path.join(root, relative);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, text);
      }
      git("add", "-A");
      git("commit", "-qm", "Fictional forged history reset");
      assert.throws(() =>
        checkObservationAppendOnly({
          repo,
          exactBase: sourceCommit,
          exactHead: git("rev-parse", "HEAD"),
        }),
      );
    },
  );
  await group(
    "download path captures complete decoded bytes without partial output",
    async () => {
      const source = JSON.parse(
          baselineFiles["src/data/observation-source-inputs.json"],
        ),
        byUrl = new Map(source.sources.map((s) => [s.input.url, s]));
      const fakeFetch = async (url) => {
        const spec = byUrl.get(url),
          raw = first.prepared.files.get(spec.input.name);
        return {
          status: 200,
          redirected: false,
          url,
          headers: new Headers({ "content-type": spec.input.mediaType }),
          body: new ReadableStream({
            start(c) {
              c.enqueue(raw);
              c.close();
            },
          }),
        };
      };
      const out = path.join(temporary, "downloaded");
      const result = await prepareObservationInputs({
        repo,
        outputRoot: out,
        download: true,
        fetchImpl: fakeFetch,
      });
      assert.equal(result.http.length, 24);
      assert.equal(readPreparedObservationRoot(out).manifest.inputs.length, 24);
      const failOut = path.join(temporary, "failed");
      await assert.rejects(
        prepareObservationInputs({
          repo,
          outputRoot: failOut,
          download: true,
          fetchImpl: async (url) => ({
            ...(await fakeFetch(url)),
            redirected: true,
          }),
        }),
      );
      assert.equal(fs.existsSync(failOut), false);
      const partialOut = path.join(temporary, "partial-source");
      await assert.rejects(
        prepareObservationInputs({
          repo,
          outputRoot: partialOut,
          download: true,
          fetchImpl: async (url) => {
            const response = await fakeFetch(url);
            if (byUrl.get(url).input.name === "wb-country-metadata") {
              const data = JSON.parse(
                Buffer.from(first.prepared.files.get("wb-country-metadata")),
              );
              data[0].pages = 2;
              response.body = new ReadableStream({
                start(c) {
                  c.enqueue(Buffer.from(JSON.stringify(data)));
                  c.close();
                },
              });
            }
            return response;
          },
        }),
      );
      assert.equal(fs.existsSync(partialOut), false);
      let cancelled = false;
      const cappedOut = path.join(temporary, "capped-source");
      await assert.rejects(
        prepareObservationInputs({
          repo,
          outputRoot: cappedOut,
          download: true,
          fetchImpl: async (url) => {
            const response = await fakeFetch(url);
            if (byUrl.get(url).input.name === "wb-country-metadata")
              response.body = new ReadableStream({
                start(c) {
                  c.enqueue(new Uint8Array(1048577));
                },
                cancel() {
                  cancelled = true;
                },
              });
            return response;
          },
        }),
      );
      assert.equal(cancelled, true);
      assert.equal(fs.existsSync(cappedOut), false);
    },
  );
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
console.log(`Observation source/capture: ${groups} groups passed.`);
