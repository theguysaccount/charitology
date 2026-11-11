import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const hash = data => createHash('sha256').update(data).digest('hex');
const editions = [
  {
    directory: 'us', form: '990', format: 'charitology-us-form990-v1', fieldCount: 7,
    archives: { 2023: '23eoextract990.zip', 2024: '24eoextract990.zip' },
    organizations: 277047, registryMatches: 270063, multiPeriod: 230060, includedPeriods: 516109,
  },
  {
    directory: 'us-990-ez', form: '990-EZ', format: 'charitology-us-form990-ez-v1', fieldCount: 6,
    archives: { 2023: '23eoextractez.zip', 2024: '24eoextract990EZ.zip' },
    organizations: 179043, registryMatches: 170754, multiPeriod: 116613, includedPeriods: 300694,
  },
  {
    directory: 'us-990-pf', form: '990-PF', format: 'charitology-us-form990-pf-v1', fieldCount: 8,
    archives: { 2023: '23eoextract990pf.zip', 2024: '24eoextract990pf.zip' },
    organizations: 116530, registryMatches: 109914, multiPeriod: 101299, includedPeriods: 219660,
  },
];

for (const { directory, form, format, fieldCount, archives, ...expectedCounts } of editions) {
  const root = new URL(`../public/data/charity-financials/${directory}/`, import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', root)));
  const counts = manifest.counts;
  assert.equal(manifest.format, format);
  assert.equal(manifest.form, form);
  assert.equal(manifest.currency, 'USD');
  assert.equal(manifest.registry.date, '2026-10-13');
  assert.match(manifest.registry.manifestSha256, /^[a-f0-9]{64}$/);
  assert.equal(manifest.periodFields.length, fieldCount);
  assert.equal(new Set(manifest.periodFields).size, fieldCount);
  assert.equal(manifest.periodFields[0], 'taxPeriodEndMonth');
  assert.equal(manifest.periodFields.at(-1), 'sourceRecords');
  assert.deepEqual(counts, {
    ...expectedCounts, identicalRecordsCollapsed: 0, conflictingPeriods: 0, conflictingRecords: 0,
  });
  assert.deepEqual(readdirSync(root).sort(), [...Object.keys(manifest.shards).map(key => key + '.json.gz'), 'manifest.json'].sort());

  const references = new Map();
  for (const [year, source] of Object.entries(manifest.sources)) {
    assert.match(year, /^202[34]$/);
    assert.equal(source.archive, `https://www.irs.gov/pub/irs-soi/${archives[year]}`);
    assert.equal(source.documentation, `https://www.irs.gov/pub/irs-soi/${year.slice(2)}eofinextractdoc.xlsx`);
    assert.match(source.sha256, /^[a-f0-9]{64}$/);
    assert.match(source.documentationSha256, /^[a-f0-9]{64}$/);
    const { input, selected, otherSubsection, outsidePeriod } = source.counts;
    assert.equal(input, selected + otherSubsection + outsidePeriod);
    references.set(Number(year), new Set());
  }
  assert.equal(references.size, 2);

  let organizations = 0;
  let registryMatches = 0;
  let multiPeriod = 0;
  let periods = 0;
  for (const [prefix, asset] of Object.entries(manifest.shards)) {
    assert.match(prefix, /^\d{2}$/);
    assert.equal(asset.path, `${prefix}.json.gz`);
    const packed = readFileSync(new URL(asset.path, root));
    assert.equal(packed.length, asset.bytes);
    assert.equal(hash(packed), asset.sha256);
    assert.ok(asset.decodedBytes > 0 && asset.decodedBytes <= 16_000_000);
    const raw = gunzipSync(packed, { maxOutputLength: asset.decodedBytes });
    assert.equal(raw.length, asset.decodedBytes);
    assert.equal(hash(raw), asset.decodedSha256);
    const rows = JSON.parse(raw);
    assert.equal(rows.length, asset.rows);
    let previousEin = '';
    for (const row of rows) {
      assert.equal(row.length, 3);
      const [ein, match, history] = row;
      assert.ok(typeof ein === 'string' && /^\d{9}$/.test(ein) && ein.startsWith(prefix) && previousEin < ein);
      previousEin = ein;
      assert.equal(typeof match, 'boolean');
      assert.ok(Array.isArray(history) && history.length);
      organizations++;
      registryMatches += Number(match);
      multiPeriod += Number(history.length > 1);
      let previousMonth = '';
      for (const item of history) {
        assert.equal(item.length, fieldCount);
        const [month, ...values] = item;
        const keys = values.pop();
        assert.match(month, /^202[234]-(0[1-9]|1[0-2])$/);
        assert.ok(!previousMonth || month < previousMonth);
        previousMonth = month;
        for (const value of values) assert.ok(value === null || (typeof value === 'string' && /^-?[0-9]{1,15}(?:\.[0-9]{1,2})?$/.test(value)));
        assert.ok(Array.isArray(keys) && keys.length);
        for (const pair of keys) {
          assert.equal(pair.length, 2);
          const [year, record] = pair;
          const seen = references.get(year);
          assert.ok(seen && Number.isSafeInteger(record) && record >= 1 && record <= manifest.sources[year].counts.input && !seen.has(record));
          seen.add(record);
        }
        periods++;
      }
    }
  }
  assert.equal(organizations, counts.organizations);
  assert.equal(registryMatches, counts.registryMatches);
  assert.equal(multiPeriod, counts.multiPeriod);
  assert.equal(periods, counts.includedPeriods);
  for (const [year, records] of references) assert.equal(records.size, manifest.sources[year].counts.selected);
  console.log(`IRS Form ${form} financial snapshot verified across all shards: ${periods} periods.`);
}
