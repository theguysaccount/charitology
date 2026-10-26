// Explicit public-data refresh, never run by a normal site build.
// node scripts/update-irs-registry.mjs --download --input-dir ../irs-registry/raw
// Cached rebuild: node scripts/update-irs-registry.mjs --input-dir ../irs-registry/raw
// No API key, general URL proxy, source financials or contact/street details.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { IRS_SOURCE, IRS_CODES, IRS_FIELDS, COVERAGE, MAX_SHARD_BYTES, MAX_DECODED_BYTES, normalizeRegistryRow, registryBucket, normalizeRegistryName, validateRegistryManifest } from '../src/lib/irs-registry.mjs';

export function* csvRows(text) {
  let row = [], field = '', quoted = false, afterQuote = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; afterQuote = true; } }
      else field += ch;
    } else if (ch === ',' || ch === '\n' || ch === '\r') {
      row.push(field); field = ''; afterQuote = false;
      if (ch !== ',') { if (ch === '\r' && text[i + 1] === '\n') i++; if (row.some(x => x !== '')) yield row; row = []; }
    } else if (ch === '"' && !field && !afterQuote) quoted = true;
    else { if (afterQuote || ch === '"') throw new Error('Malformed CSV quoting.'); field += ch; }
    if (field.length > 10_000 || row.length > 100) throw new Error('CSV field or row exceeded its bound.');
  }
  if (quoted) throw new Error('Unterminated CSV field.');
  if (field || row.length) { row.push(field); if (row.some(x => x !== '')) yield row; }
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function posting(text) {
  const date = text.match(/Updated data posting date:[\s\S]{0,60}?<strong>(\d{2})\/(\d{2})\/(\d{4})<\/strong>/);
  const count = text.match(/Record count:[\s\S]{0,60}?<strong>([\d,]+)<\/strong>/);
  if (!date || !count) throw new Error('IRS posting metadata changed; inspect the official page before refreshing.');
  return { dataDate: `${date[3]}-${date[1]}-${date[2]}`, recordCount: Number(count[1].replaceAll(',', '')) };
}
export async function buildRegistry({ inputDir, outputDir, download = false }) {
  await fs.mkdir(inputDir, { recursive: true });
  const pageFile = path.join(inputDir, 'source-page.html');
  if (download || !(await fs.stat(pageFile).catch(() => null))) {
    const r = await fetch(IRS_SOURCE, { signal: AbortSignal.timeout(60_000), redirect: 'error' });
    if (!r.ok) throw new Error('IRS posting page unavailable.');
    await fs.writeFile(pageFile, await r.text());
  }
  const sourcePage = await fs.readFile(pageFile), posted = posting(sourcePage.toString('utf8'));
  const sources = [], buckets = new Map(), directory = new Map(), seen = new Set();
  for (let region = 1; region <= 4; region++) {
    const url = `https://www.irs.gov/pub/irs-soi/eo${region}.csv`, input = path.join(inputDir, `eo${region}.csv`), metaFile = path.join(inputDir, `eo${region}.metadata.json`);
    if (download) {
      const r = await fetch(url, { signal: AbortSignal.timeout(180_000), redirect: 'error' });
      if (!r.ok) throw new Error(`IRS region ${region} unavailable.`);
      const bytes = new Uint8Array(await r.arrayBuffer());
      if (bytes.byteLength > 220 * 1024 * 1024) throw new Error('IRS raw file exceeded its bound.');
      await fs.writeFile(input, bytes);
      await fs.writeFile(metaFile, JSON.stringify({ url, retrievedAt: new Date().toISOString(), lastModified: r.headers.get('last-modified'), bytes: bytes.byteLength, sha256: sha(bytes) }, null, 2) + '\n');
    }
    const bytes = await fs.readFile(input), meta = JSON.parse(await fs.readFile(metaFile, 'utf8'));
    if (meta.url !== url || meta.bytes !== bytes.byteLength || meta.sha256 !== sha(bytes) || !Number.isFinite(Date.parse(meta.retrievedAt))) throw new Error(`Cached region ${region} provenance does not agree; download again.`);
    if (!Number.isFinite(Date.parse(meta.lastModified)) || new Date(meta.lastModified).toISOString().slice(0, 10) !== posted.dataDate) throw new Error(`Region ${region} file date differs from the posting date; inspect for a mixed IRS release.`);
    const rows = csvRows(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), header = rows.next().value;
    if (!header || ['EIN', 'NAME', 'CITY', 'STATE', 'SUBSECTION', 'STATUS', 'DEDUCTIBILITY'].some(k => !header.includes(k)) || new Set(header).size !== header.length) throw new Error('IRS CSV headers changed.');
    let count = 0;
    for (const cells of rows) {
      if (cells.length !== header.length) throw new Error('IRS CSV row width does not agree.');
      const record = normalizeRegistryRow(Object.fromEntries(header.map((k, i) => [k, cells[i]])), region), ein = record[0], bucket = registryBucket(record[1]);
      if (seen.has(ein)) throw new Error('Duplicate EIN across IRS regions; inspect before publishing.');
      seen.add(ein); count++;
      if (!buckets.has(bucket)) buckets.set(bucket, []); buckets.get(bucket).push(record);
      if (!directory.has(ein.slice(0, 2))) directory.set(ein.slice(0, 2), []); directory.get(ein.slice(0, 2)).push(ein.slice(2) + bucket);
    }
    sources.push({ region, ...meta, rows: count });
    console.log(`IRS region ${region}: ${count.toLocaleString('en-US')} rows verified.`);
  }
  if (seen.size !== posted.recordCount) throw new Error('IRS posted count differs from the four-file union; inspect the source release before publishing.');
  const temporary = `${outputDir}.building-${process.pid}`;
  await fs.mkdir(path.join(temporary, 'names'), { recursive: true }); await fs.mkdir(path.join(temporary, 'eins'), { recursive: true });
  const shards = { names: {}, eins: {} }; let total = 0;
  async function write(kind, key, text, rows) {
    const raw = Buffer.from(text), compressed = gzipSync(raw, { level: 9 });
    if (raw.length > MAX_DECODED_BYTES || compressed.length > MAX_SHARD_BYTES) throw new Error('A registry shard exceeds its bound; change sharding before publishing.');
    const relative = `${kind}/${key}.${kind === 'names' ? 'json' : 'txt'}.gz`;
    await fs.writeFile(path.join(temporary, relative), compressed);
    shards[kind][key] = { path: relative, rows, bytes: compressed.length, decodedBytes: raw.length, sha256: sha(compressed), decodedSha256: sha(raw) }; total += compressed.length;
  }
  for (const [key, rows] of [...buckets.entries()].sort()) {
    // Group repeated name prefixes for compression; preserve source spelling in records.
    const names = new Map(rows.map(r => [r[0], normalizeRegistryName(r[1])]));
    rows.sort((a, b) => names.get(a[0]) < names.get(b[0]) ? -1 : names.get(a[0]) > names.get(b[0]) ? 1 : a[0].localeCompare(b[0]));
    await write('names', key, JSON.stringify(rows), rows.length);
  }
  for (const [key, rows] of [...directory.entries()].sort()) await write('eins', key, rows.sort().join('\n'), rows.length);
  if (total > 50 * 1024 * 1024) throw new Error(`Generated assets exceed 50 MiB (${total} bytes); no public output was replaced.`);
  const manifest = {
    format: 'charitology-irs-eobmf', version: 1, dataDate: posted.dataDate, recordCount: seen.size,
    generatedAt: new Date().toISOString(), source: { name: 'Internal Revenue Service, EO Business Master File extract', url: IRS_SOURCE },
    sourcePageSha256: sha(sourcePage), codeDefinitions: IRS_CODES, coverage: COVERAGE,
    reuse: { basis: 'Public IRS records and United States Government compilation; no IRS endorsement. 17 USC 105(a).', source: 'https://www.copyright.gov/title17/92chap1.html#105' },
    fields: IRS_FIELDS, omitted: ['ICO/person contact', 'street', 'ZIP', 'financial amounts', 'activity codes', 'secondary name', 'ruling dates', 'NTEE'],
    search: 'Name begins with the normalized IRS primary name, or exact nine-digit EIN. Optional filing-state filter. No aliases, fuzzy matching or worldwide coverage.',
    country: 'Not inferred: IRS registry jurisdiction is US, but mailing addresses include non-domestic locations.',
    compressedBytes: total, sources, shards,
  };
  validateRegistryManifest(manifest);
  await fs.writeFile(path.join(temporary, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await fs.writeFile(path.join(temporary, 'README.txt'), `IRS EO BMF public identity snapshot\nData posting date: ${manifest.dataDate}\nRecords: ${seen.size}\nSource: ${IRS_SOURCE}\nCodes: ${IRS_CODES}\n${COVERAGE}\n\nRefresh explicitly: node scripts/update-irs-registry.mjs --download --input-dir ../irs-registry/raw\nGenerated JSON gzip name shards and compact EIN directories are described in manifest.json. Preserve EINs as text. Null means not supplied; no missing value is converted to zero. Search normalization changes matching only, not source spelling. Financials and contact/street details are omitted.\n\nPublic IRS records / US Government compilation; 17 USC 105(a), https://www.copyright.gov/title17/92chap1.html#105 . No IRS endorsement. The site's CC BY notice does not relicense the underlying government records.\n`);
  await fs.mkdir(path.dirname(outputDir), { recursive: true });
  const previous = `${outputDir}.previous-${process.pid}`;
  const exists = await fs.stat(outputDir).catch(() => null);
  if (exists) await fs.rename(outputDir, previous);
  try { await fs.rename(temporary, outputDir); } catch (error) { if (exists) await fs.rename(previous, outputDir); throw error; }
  if (exists) await fs.rm(previous, { recursive: true });
  console.log(`Published ${seen.size.toLocaleString('en-US')} records, ${(total / 1024 ** 2).toFixed(2)} MiB compressed; manifest totals verified.`);
  return manifest;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const arg = key => { const i = process.argv.indexOf(key); return i >= 0 ? process.argv[i + 1] : undefined; };
  await buildRegistry({ inputDir: path.resolve(arg('--input-dir') ?? '../irs-registry/raw'), outputDir: path.resolve(arg('--output-dir') ?? 'public/data/irs-registry'), download: process.argv.includes('--download') });
}
