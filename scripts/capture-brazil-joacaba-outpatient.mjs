import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { gunzipSync, inflateSync, inflateRawSync, brotliDecompressSync } from 'node:zlib';

const [output] = process.argv.slice(2);
if (!output) throw new Error('Pass a new output file path.');

const dashboard = 'https://elasticnes.saude.gov.br/kibana/app/dashboards#/view/97f47220-c4bf-11ec-9902-89205d8e072b';
const endpoint = 'https://elasticnes.saude.gov.br/kibana/internal/bsearch';
const index = 'cgsi-cnesprod-c1*';
const facility = '2964511';
const dateRange = { format: 'strict_date_optional_time', gte: '2024-01-01T00:00:00Z', lt: '2026-09-01T00:00:00Z' };
const quantityField = 'SIA - QUANTIDADE APROVADA';
const monthlyMetrics = {
  units: { sum: { field: quantityField } },
  observations: { value_count: { field: quantityField } },
  presentedQuantity: { sum: { field: 'SIA - QUANTIDADE APRESENTADA' } },
  presentedQuantityCount: { value_count: { field: 'SIA - QUANTIDADE APRESENTADA' } },
  approvedValue: { sum: { field: 'SIA - VALOR APROVADO' } },
  approvedValueCount: { value_count: { field: 'SIA - VALOR APROVADO' } },
};

function decode(line) {
  try { return JSON.parse(line); } catch { /* The dashboard can compress each result. */ }
  const encoded = Buffer.from(line.trim().replace(/^[0-9]+[: ,]/, ''), 'base64');
  for (const convert of [value => value, gunzipSync, inflateSync, inflateRawSync, brotliDecompressSync]) {
    try { return JSON.parse(convert(encoded).toString()); } catch { /* Try the next representation. */ }
  }
  throw new Error('Unrecognized dashboard response encoding.');
}

async function getBuckets(grouping) {
  const body = {
    size: 0,
    _source: false,
    query: { bool: { filter: [
      { match_phrase: { 'CNES.keyword': facility } },
      { range: { 'COMPETÊNCIA': dateRange } },
    ] } },
    aggs: { periods: grouping },
  };
  for (const delay of [0, 750, 1500]) {
    if (delay) await setTimeout(delay);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'kbn-xsrf': 'true' },
      body: JSON.stringify({ batch: [{ request: { params: { index, body } }, options: { strategy: 'ese' } }] }),
      signal: AbortSignal.timeout(20_000),
    });
    assert.equal(response.status, 200, 'Dashboard returned an unsuccessful status.');
    const { result } = decode((await response.text()).trim().split('\n').at(-1));
    assert.ok(result?.rawResponse, 'Dashboard did not return a search result.');
    const { rawResponse } = result;
    assert.equal(rawResponse.timed_out, false);
    assert.equal(rawResponse._shards.failed, 0);
    assert.equal(rawResponse.hits.hits.length, 0, 'Document records cannot enter the capture.');
    const grouped = rawResponse.aggregations?.periods;
    if (result.isPartial || result.isRunning || !grouped) continue;
    if ('sum_other_doc_count' in grouped) assert.equal(grouped.sum_other_doc_count, 0);
    return { query: body, buckets: grouped.buckets };
  }
  throw new Error('Dashboard did not finish the aggregate query.');
}

function countOf(bucket) {
  const observations = bucket.observations.value;
  const units = bucket.units.value;
  assert.ok(Number.isSafeInteger(observations) && observations >= 0 && observations <= bucket.doc_count);
  assert.ok(Number.isSafeInteger(units) && units >= 0);
  return { institutionalRecords: bucket.doc_count, observations, approvedProcedureUnits: observations === 0 ? null : units };
}

const [monthly, yearly] = await Promise.all([
  getBuckets({ terms: { field: 'index_comp.keyword', order: { _key: 'asc' }, size: 36 }, aggs: monthlyMetrics }),
  getBuckets({ date_histogram: { field: 'COMPETÊNCIA', calendar_interval: 'year', format: 'yyyy', min_doc_count: 1 },
    aggs: { units: monthlyMetrics.units, observations: monthlyMetrics.observations } }),
]);

const months = monthly.buckets.map(bucket => {
  assert.match(bucket.key, /^\d{6}$/);
  return { month: bucket.key.slice(0, 4) + '-' + bucket.key.slice(4), ...countOf(bucket) };
});
const years = yearly.buckets.map(bucket => ({ year: Number(bucket.key_as_string), ...countOf(bucket) }));
const questionableFieldMatches = monthly.buckets.filter(bucket =>
  bucket.presentedQuantityCount.value > 0 && bucket.approvedValueCount.value > 0 &&
  bucket.presentedQuantity.value === bucket.approvedValue.value).length;
assert.ok(months.length && years.length, 'The selected facility must have records.');

await writeFile(output, JSON.stringify({
  dashboard, endpoint, index, facility, quantityField,
  queries: { monthly: monthly.query, yearly: yearly.query },
  months, years, questionableFieldMatches,
}, null, 2) + '\n', { flag: 'wx' });
