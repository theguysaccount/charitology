// Explicitly fictional source/capture fixtures. Never a public seed or retrieval.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OBSERVATION_BASELINE_PATHS } from "../../src/lib/observation-baseline.mjs";
import {
  observationObjectHash,
  observationRawHash,
  observationPrettyJson,
  observationClone,
} from "../../src/lib/observation-canonical.mjs";
import { makeObservationCaptureRequest } from "../../src/lib/observation-capture.mjs";

const DEFAULT_REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const TIME = "2000-01-01T00:00:00.000Z";
const bytes = (value) => Buffer.from(JSON.stringify(value, null, 2) + "\n");
function inputsFromDefinitions(definitions) {
  const files = new Map(),
    items = [];
  for (const spec of definitions.sources) {
    let raw;
    const id = spec.input.name;
    if (id === "wb-country-metadata")
      raw = bytes([
        { page: 1, pages: 1, per_page: "20000", total: 1 },
        [
          {
            id: "AAA",
            iso2Code: "AA",
            name: "Fictional economy",
            region: { id: "TST", value: "Fictional region" },
          },
        ],
      ]);
    else if (id.startsWith("wb-metadata-")) {
      const code = id.slice(12).replaceAll("-", ".").toUpperCase();
      raw = bytes([
        { page: 1, pages: 1, per_page: 20000, total: 1 },
        [
          {
            id: code,
            name: "Fictional indicator",
            unit: "",
            sourceNote: "Fictional fixture definition for " + code,
            sourceOrganization: "Fictional statistical producer",
          },
        ],
      ]);
    } else if (id.startsWith("wb-values-")) {
      const code = id.slice(10).replaceAll("-", ".").toUpperCase();
      const value =
        code === "SP.POP.TOTL"
          ? 12345
          : code === "SP.DYN.LE00.IN"
            ? 70
            : code === "SH.DYN.MORT"
              ? 5
              : code === "EG.ELC.ACCS.ZS"
                ? 95
                : 85.25;
      const rows = Array.from({ length: 6 }, (_, i) => ({
        indicator: { id: code, value: "Fictional indicator" },
        country: { id: "AA", value: "Fictional economy" },
        countryiso3code: "AAA",
        date: String(2025 - i),
        value: i === 0 ? value : null,
        unit: "",
        obs_status: "",
        decimal: 0,
        footnote:
          code === "SH.DYN.MORT" && i === 0 ? "Uncertainty bound is 4 - 7" : "",
      }));
      raw = bytes([
        {
          page: 1,
          pages: 1,
          per_page: 20000,
          total: 6,
          sourceid: "2",
          lastupdated: "2000-01-01",
        },
        rows,
      ]);
    } else {
      const text =
        "FICTIONAL private fixture for " +
        id +
        "\n" +
        (spec.publicEvidence?.text ?? "");
      raw =
        spec.input.mediaType === "application/pdf"
          ? Buffer.concat([
              Buffer.from("%PDF-1.7\nFICTIONAL original " + id + "\n"),
              Buffer.from([0xff, 0x00]),
            ])
          : Buffer.from("<!doctype html>\n" + text);
    }
    files.set(id, raw);
    items.push({
      name: id,
      url: spec.input.url,
      retrievedAt: TIME,
      mediaType: spec.input.mediaType,
      sha256: observationRawHash(raw),
      bytes: raw.length,
      publicDisposition: spec.input.publicDisposition,
    });
  }
  return { files, items };
}

export function fixtureBaselineFiles(repo = DEFAULT_REPO) {
  const result = Object.fromEntries(
    OBSERVATION_BASELINE_PATHS.map((p) => [
      p,
      fs.readFileSync(path.join(repo, p)),
    ]),
  );
  const definition = JSON.parse(
    result["src/data/observation-definitions.json"],
  );
  definition.countryProjection.title = "Fictional fixture indicators";
  definition.limitations = [
    "FICTIONAL test fixture. No source retrieval, publication, audit opinion or scientific result.",
  ];
  const source = JSON.parse(result["src/data/observation-source-inputs.json"]);
  for (const spec of source.sources) {
    spec.record.publisher = "Fictional fixture";
    spec.record.title = "FICTIONAL " + spec.record.title;
    spec.record.url = "https://example.invalid/fixtures/" + spec.input.name;
    spec.input.url = spec.record.url;
    spec.input.retrievedAt = TIME;
    spec.input.originalRetrievalLiteral = TIME;
    spec.record.retrievedAt = TIME;
    spec.record.limitations = [
      "FICTIONAL local test input, never a real source retrieval.",
    ];
  }
  const prepared = inputsFromDefinitions(source);
  for (const spec of source.sources) {
    const item = prepared.items.find((i) => i.name === spec.input.name);
    Object.assign(spec.input, { sha256: item.sha256, bytes: item.bytes });
    spec.record.rawSha256 = item.sha256;
    spec.record.rawBytes = item.bytes;
    if (spec.publicEvidence?.mediaType === "application/json") {
      const packet = JSON.parse(spec.publicEvidence.text);
      packet.documentSha256 = item.sha256;
      spec.publicEvidence.text = observationPrettyJson(packet);
    }
  }
  result["src/data/observation-definitions.json"] = bytes(definition);
  result["src/data/observation-source-inputs.json"] = bytes(source);
  return result;
}

export function makeObservationCaptureFixture({
  sourceCommit,
  baselineFiles = fixtureBaselineFiles(),
  capturedAt = "2000-01-02T00:00:00.000Z",
  editionId = "fictional-one",
  previousRegistry = null,
  previousCommit = sourceCommit,
} = {}) {
  const source = JSON.parse(
    Buffer.from(
      baselineFiles["src/data/observation-source-inputs.json"],
    ).toString(),
  );
  const generated = inputsFromDefinitions(source);
  const items = source.sources.map((spec) => ({
    ...generated.items.find((i) => i.name === spec.input.name),
    sha256: observationRawHash(generated.files.get(spec.input.name)),
    bytes: generated.files.get(spec.input.name).length,
  }));
  const core = {
      format: "charitology-observation-prepared-inputs",
      version: 1,
      inputs: items,
    },
    manifest = { ...core, hash: observationObjectHash(core) };
  const baseline = {
    commit: sourceCommit,
    files: OBSERVATION_BASELINE_PATHS.map((p) => ({
      path: p,
      sha256: observationRawHash(baselineFiles[p]),
      bytes: new Uint8Array(baselineFiles[p]),
    })),
  };
  const request = makeObservationCaptureRequest({
    format: "charitology-observation-capture-request",
    version: 1,
    sourceCommit,
    previousCommit,
    capturedAt,
    editionId,
    expectedPrevious: previousRegistry?.current ?? null,
    previousRegistryHash: previousRegistry?.hash ?? null,
    preparedInputManifestHash: manifest.hash,
  });
  return {
    prepared: { manifest, files: generated.files },
    baseline,
    request,
    baselineFiles,
  };
}

export function changedObservationCaptureFixture(
  first,
  {
    sourceCommit = first.baseline.commit,
    previousCommit = sourceCommit,
    previousRegistry,
    capturedAt = "2000-01-03T00:00:00.000Z",
    editionId = "fictional-two",
  } = {},
) {
  const files = new Map(
    [...first.prepared.files].map(([name, raw]) => [name, new Uint8Array(raw)]),
  );
  for (const [name, raw] of files)
    if (name.startsWith("wb-values-")) {
      const parsed = JSON.parse(Buffer.from(raw).toString());
      for (const row of parsed[1]) if (row.value !== null) row.value += 1;
      files.set(name, bytes(parsed));
    }
  const inputs = observationClone(first.prepared.manifest.inputs).map((i) => ({
      ...i,
      sha256: observationRawHash(files.get(i.name)),
      bytes: files.get(i.name).byteLength,
    })),
    core = {
      format: "charitology-observation-prepared-inputs",
      version: 1,
      inputs,
    },
    manifest = { ...core, hash: observationObjectHash(core) };
  const baseline = { ...first.baseline, commit: sourceCommit };
  const request = makeObservationCaptureRequest({
    format: "charitology-observation-capture-request",
    version: 1,
    sourceCommit,
    previousCommit,
    capturedAt,
    editionId,
    expectedPrevious: previousRegistry.current,
    previousRegistryHash: previousRegistry.hash,
    preparedInputManifestHash: manifest.hash,
  });
  return { ...first, prepared: { manifest, files }, baseline, request };
}
