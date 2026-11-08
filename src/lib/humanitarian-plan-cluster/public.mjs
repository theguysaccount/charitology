/** Offline selected view of a fully admitted immutable observation edition. */
import {
  observationProjection, observationFileTexts, observationPrettyJson,
  observationObjectHash, observationRawHash,
} from '../observation-model.mjs';
import { observationClone, observationFreeze } from '../observation-canonical.mjs';
import {
  PLAN_CLUSTER_DEFINITION as D, PLAN_CLUSTER_HEADERS,
  parsePlanClusterCsv, makePlanClusterPureProjection,
} from './model.mjs';

const need = (value, message) => { if (!value) throw new Error(message); };
const key = p => `${p.kind}/${p.id}/${p.version}/${p.hash}`;
function pinned(records, pin) {
  const found = records.filter(r => key(r) === key(pin));
  need(found.length === 1, 'The selected plan reference is absent or ambiguous.');
  return found[0];
}
function literal(source, name) {
  const values = source.producerMetadata.filter(v => v.field === name);
  need(values.length === 1, 'The selected plan metadata is absent or ambiguous.');
  return values[0].literal;
}

/** Null means this admitted edition does not select the fixed plan cluster.
 * A plain or rehydrated imitation of the registry is never an accepted handle.
 * No network, filesystem, build-time clock or current source fallback is used. */
export function planClusterObservationProjection(input, editionId) {
  const projection = observationProjection(input, editionId);
  const matches = projection.coverage.filter(c => c.selection.kind === 'explicit-plan-cluster');
  if (!matches.length) return null;
  need(matches.length === 1, 'The selected plan coverage is ambiguous.');
  const coverage = matches[0], scope = pinned(projection.scopes, coverage.selection.scope);
  const source = pinned(projection.sources, coverage.selection.source);
  need(source.payload.kind === 'public-csv', 'The selected plan source is not CSV.');
  const licenseSource = pinned(projection.sources, source.rights.publicReuse.evidence[0].source);
  const files = observationFileTexts(input);
  const raw = files[source.payload.raw.path];
  need(typeof raw === 'string', 'The selected original CSV is absent.');
  const parsed = parsePlanClusterCsv(new TextEncoder().encode(raw));
  need(parsed.sourceSha256 === source.rawSha256 && parsed.sourceBytes === source.rawBytes,
    'The original plan CSV differs from its source identity.');
  // Reuse the reviewed exact arithmetic. This descriptor is a normalized view
  // of admitted source facts, not a replacement for the linked licensing excerpt.
  const pure = makePlanClusterPureProjection(parsed, {
    ...Object.fromEntries(['datasetId', 'resourceId', 'resourceName', 'resourceUrl'].map(k => [k, D.source[k]])),
    resourceBytes: source.rawBytes,
    resourceModified: literal(source, 'resourceModifiedLiteral'),
    metadataModified: literal(source, 'metadataModifiedLiteral'),
    publisherHashLiteral: literal(source, 'publisherHashLiteral'),
    license: { id: D.rights.metadataLicenseId, title: source.rights.publicReuse.label, url: D.rights.termsUrl },
    attribution: source.rights.attribution,
  });
  const edition = JSON.parse(files[`editions/${projection.edition.id}.json`]);
  const observations = coverage.cells.flatMap(cell => cell.state === 'present'
    ? [pinned(projection.observations, cell.observation)] : []);
  const body = observationClone({
    format: 'charitology-humanitarian-plan-cluster-projection', version: 1,
    edition: projection.edition, capturedAt: projection.capturedAt,
    code: { commit: edition.sourceCommit, method: edition.method },
    selection: pure.selection, causeBinding: pure.causeBinding,
    entity: pinned(projection.entities, scope.entity), scope,
    measures: coverage.selection.measures.map(p => pinned(projection.measures, p)),
    observations, coverage, row: parsed.selected,
    derived: pure.derived, source, licenseSource,
    limitations: [
      ...D.limitations.slice(0, -1),
      'A fixed source snapshot. Client response completion, edition assembly and publisher dates have distinct meanings; this is not a live funding feed.',
      'A source checksum verifies retained bytes. It does not independently establish the truth or completeness of the reported finances.',
    ], review: 'draft',
  });
  return observationFreeze({ ...body, sha256: observationObjectHash(body) });
}

export const PLAN_CLUSTER_CSV_TEXT_POLICY = 'For name, code and cluster text and added textual provenance, prefix one apostrophe if the original begins with an apostrophe or its first non-whitespace character is =,+,@,-. Remove exactly that one prefix to recover the original text. Original numeric/date/identifier columns and derived numeric cells are unchanged. JSON and the separately linked raw CSV preserve source strings. This selected CSV adds provenance and derived columns; it is not the original source file.';
const safeText = value => /^\s*[=+@-]/.test(value) || value.startsWith("'") ? "'" + value : value;
const csvCell = value => {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};
/** Static selection export; formula protection never changes numeric tokens. */
export function planClusterObservationExport(input, editionId, format) {
  need(format === 'json' || format === 'csv', 'Choose a selected JSON or CSV export.');
  const p = planClusterObservationProjection(input, editionId);
  if (p === null) return null;
  let body;
  if (format === 'json') body = observationPrettyJson(p);
  else {
    const provenance = {
      record_type: 'selected-source-row-with-provenance',
      source_record: p.row.locator.recordNumber, source_first_line: p.row.locator.firstLine,
      source_last_line: p.row.locator.lastLine, source_byte_start: p.row.locator.byteStart,
      source_byte_end: p.row.locator.byteEnd, source_row_sha256: p.row.locator.rawSha256,
      source_csv_sha256: p.source.rawSha256, source_client_completed_at: p.source.retrievedAt,
      source_http_date: p.source.producerMetadata.find(v => v.field === 'responseHttpDate')?.literal ?? '',
      source_modified_literal: literal(p.source, 'resourceModifiedLiteral'),
      metadata_modified_literal: literal(p.source, 'metadataModifiedLiteral'),
      edition_id: p.edition.id, edition_sha256: p.edition.hash,
      edition_assembled_at: p.capturedAt, code_commit: p.code.commit,
      code_method: p.code.method.id, code_adapter_sha256: p.code.method.adapterSha256,
      derived_status: p.derived.status, derived_ratio_numerator: p.derived.numerator,
      derived_ratio_denominator: p.derived.denominator, derived_percent_2dp: p.derived.displayPercent,
      unfunded_plan_requirements_usd: p.derived.differenceUSD,
      source_url: p.source.url, attribution: p.source.rights.attribution,
      license_url: p.source.rights.publicReuse.termsUrl, review: p.review,
      csv_text_policy: PLAN_CLUSTER_CSV_TEXT_POLICY,
    };
    // Publisher metadata can also be formula-looking text. Apply the same
    // reversible policy to every added textual cell; numbers remain numbers.
    const keys = [...PLAN_CLUSTER_HEADERS, ...Object.keys(provenance)];
    const numeric = new Set(['derived_ratio_numerator', 'derived_ratio_denominator', 'derived_percent_2dp', 'unfunded_plan_requirements_usd']);
    const cells = [
      ...PLAN_CLUSTER_HEADERS.map(h => ['name', 'code', 'cluster'].includes(h) ? safeText(p.row.raw[h]) : p.row.raw[h]),
      ...Object.entries(provenance).map(([k, v]) => typeof v === 'string' && !numeric.has(k) ? safeText(v) : v),
    ];
    body = keys.map(csvCell).join(',') + '\r\n' + cells.map(csvCell).join(',') + '\r\n';
  }
  const bytes = Buffer.byteLength(body);
  need(bytes <= 2 * 1024 * 1024, 'The selected plan export exceeds its bound.');
  return observationFreeze({
    mediaType: format === 'json' ? 'application/json' : 'text/csv',
    filename: `charitology-afg-education-2024-${p.edition.id}.${format}`,
    body, bytes, sha256: observationRawHash(body), edition: p.edition,
  });
}
