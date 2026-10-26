// Public IRS EO BMF identity snapshot. No organization scoring or private OS data.
export const IRS_SOURCE = 'https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf';
export const IRS_CODES = 'https://www.irs.gov/pub/foia/ig/tege/eo-info.pdf';
export const IRS_FIELDS = ['ein', 'name', 'city', 'state', 'subsection', 'status', 'deductibility', 'region'];
export const MAX_SHARD_BYTES = 10 * 1024 * 1024;
export const MAX_DECODED_BYTES = 50 * 1024 * 1024;
export const COVERAGE = 'IRS EO BMF snapshot, including all four regional files. This is a US federal tax-exemption registry, including some non-domestic addresses, not a worldwide charity census. Filing addresses do not show service geography. Some self-declared organizations and churches are absent. A missing match does not establish ineligibility. No impact, quality or depth rating is inferred.';
export function normalizeRegistryName(value) {
  return String(value).normalize('NFKD').replace(/\p{M}/gu, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}
export function registryBucket(name) { return normalizeRegistryName(name)[0] ?? '_'; }
export function normalizeEin(value) {
  const text = String(value ?? '').trim();
  if (!/^(?:\d{9}|\d{2}-\d{7})$/.test(text)) throw new RangeError('Use nine EIN digits, with an optional hyphen after the first two.');
  return text.replace('-', '');
}
export function registryQuery({ q = '', ein = '', state = '', limit = 100 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError('Result limit must be from 1 to 100.');
  const raw = String(q).trim();
  if (raw.length > 120 || String(ein).length > 10) throw new RangeError('Search is too long.');
  const filingState = String(state).trim().toUpperCase();
  if (filingState && !/^[A-Z]{2}$/.test(filingState)) throw new RangeError('Use a two-letter filing-state code.');
  if (ein && raw) throw new RangeError('Search by EIN or by name, not both.');
  if (ein || /^(?:\d{9}|\d{2}-\d{7})$/.test(raw)) return { kind: 'ein', ein: normalizeEin(ein || raw), state: filingState, limit };
  const name = normalizeRegistryName(raw);
  if (name.length < 3 || !/[A-Z]/.test(name)) throw new RangeError('Type at least three letters or characters from the beginning of the IRS primary name, or a complete EIN.');
  return { kind: 'name', name, bucket: registryBucket(name), state: filingState, limit };
}
export function normalizeRegistryRow(row, region) {
  const ein = normalizeEin(row.EIN);
  const text = key => String(row[key] ?? '').trim() || null;
  const name = text('NAME');
  if (!name || name.length > 250 || !Number.isInteger(region) || region < 1 || region > 4) throw new Error('Invalid IRS identity row.');
  return [ein, name, text('CITY'), text('STATE'), text('SUBSECTION'), text('STATUS'), text('DEDUCTIBILITY'), region];
}
export function validateRegistryManifest(value) {
  if (!value || value.format !== 'charitology-irs-eobmf' || value.version !== 1 || value.source?.url !== IRS_SOURCE || !/^\d{4}-\d{2}-\d{2}$/.test(value.dataDate) || !Number.isSafeInteger(value.recordCount) || value.recordCount < 1 || JSON.stringify(value.fields) !== JSON.stringify(IRS_FIELDS)) throw new Error('Invalid registry manifest.');
  if (!Array.isArray(value.sources) || value.sources.length !== 4 || value.sources.some((s, i) => s.region !== i + 1 || s.url !== `https://www.irs.gov/pub/irs-soi/eo${i + 1}.csv` || !/^[a-f0-9]{64}$/.test(s.sha256) || !Number.isSafeInteger(s.bytes) || s.bytes < 1 || !Number.isSafeInteger(s.rows) || s.rows < 0 || !Number.isFinite(Date.parse(s.retrievedAt))) || value.sources.reduce((sum, s) => sum + s.rows, 0) !== value.recordCount) throw new Error('Invalid registry provenance.');
  let bytes = 0, names = 0, eins = 0;
  for (const [kind, pattern] of [['names', /^[A-Z0-9_]$/], ['eins', /^\d{2}$/]]) {
    if (!value.shards?.[kind] || typeof value.shards[kind] !== 'object') throw new Error('Missing registry shards.');
    for (const [key, s] of Object.entries(value.shards[kind])) {
      const expected = `${kind}/${key}.${kind === 'names' ? 'json' : 'txt'}.gz`;
      if (!pattern.test(key) || s.path !== expected || !/^[a-f0-9]{64}$/.test(s.sha256) || !/^[a-f0-9]{64}$/.test(s.decodedSha256) || !Number.isSafeInteger(s.bytes) || s.bytes < 1 || s.bytes > MAX_SHARD_BYTES || !Number.isSafeInteger(s.decodedBytes) || s.decodedBytes < 1 || s.decodedBytes > MAX_DECODED_BYTES || !Number.isSafeInteger(s.rows) || s.rows < 1) throw new Error('Invalid registry shard.');
      bytes += s.bytes;
      if (kind === 'names') names += s.rows; else eins += s.rows;
    }
  }
  if (names !== value.recordCount || eins !== value.recordCount || bytes > 50 * 1024 * 1024 || value.compressedBytes !== bytes) throw new Error('Registry totals do not agree.');
  return value;
}
export function validateIdentityRows(rows, descriptor, bucket) {
  if (!Array.isArray(rows) || rows.length !== descriptor.rows) throw new Error('Registry row count does not agree.');
  const seen = new Set();
  for (const r of rows) {
    if (!Array.isArray(r) || r.length !== 8 || typeof r[0] !== 'string' || !/^\d{9}$/.test(r[0]) || typeof r[1] !== 'string' || !r[1] || r[1].length > 250 || r.slice(2, 7).some(x => x !== null && (typeof x !== 'string' || x.length > 250)) || !Number.isInteger(r[7]) || r[7] < 1 || r[7] > 4 || registryBucket(r[1]) !== bucket || seen.has(r[0])) throw new Error('Invalid registry identity data.');
    seen.add(r[0]);
  }
  return rows;
}
export function identityRecord(row, manifest) {
  const [ein, name, city, state, subsection, status, deductibility, region] = row;
  const raw = manifest.sources[region - 1];
  return { ein, name, city, state, country: null, registryJurisdiction: 'US', subsection, status, deductibility, sourceRegion: region, sourceUrl: raw.url, sourceSha256: raw.sha256, sourceRetrievedAt: raw.retrievedAt, sourceRecordCount: raw.rows, dataDate: manifest.dataDate };
}
export function statusLabel(code) {
  return ({ '01': 'Unconditional exemption', '02': 'Conditional exemption', '12': 'Trust under section 4947(a)(2)', '25': 'Terminating private-foundation status under section 507(b)(1)(B)' })[code] ?? (code ? `Unmapped IRS status ${code}` : 'Not supplied');
}
export function deductibilityLabel(code) {
  return ({ '1': 'IRS extract code: contributions deductible', '2': 'IRS extract code: contributions not deductible', '4': 'IRS extract code: deductible by treaty' })[code] ?? (code ? `Unmapped IRS deductibility code ${code}` : 'Not supplied');
}
async function boundedBytes(stream, max) {
  if (!stream) throw new Error('Registry response has no body.');
  const reader = stream.getReader(); let total = 0; const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total > max) throw new Error('Registry data exceeded its size bound.');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(total); let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength; }
  return bytes;
}
export async function decodeGzip(bytes, max) {
  if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot open the compressed registry. Use the IRS download links below.');
  return boundedBytes(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')), max);
}
// Same-origin assets by default. An operator may inject a fixed trusted asset base/decoder.
// User input is never used as a URL, origin, arbitrary path or regular expression.
export function createRegistry({ base, fetcher = fetch, decode = decodeGzip, digest = async bytes => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), cacheSize = 2 } = {}) {
  if (typeof base !== 'string' || !base) throw new Error('Registry asset base is required.');
  const root = new URL(base, globalThis.location?.href ?? 'https://charitology.org/');
  if (!/^https?:$/.test(root.protocol) || root.search || root.hash || root.username || root.password) throw new Error('Invalid registry asset base.');
  if (!root.pathname.endsWith('/')) root.pathname += '/';
  let manifestPromise; const cache = new Map();
  const hex = bytes => Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
  async function manifest() {
    if (!manifestPromise) manifestPromise = (async () => {
      const res = await fetcher(new URL('manifest.json', root).href, { signal: AbortSignal.timeout(20_000), credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
      if (!res.ok) throw new Error('Registry manifest is unavailable.');
      return validateRegistryManifest(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await boundedBytes(res.body, 200_000))));
    })().catch(error => { manifestPromise = undefined; throw error; });
    return manifestPromise;
  }
  async function shard(kind, key, m) {
    const spec = m.shards[kind][key]; if (!spec) return kind === 'names' ? [] : '';
    const cacheKey = `${m.dataDate}:${spec.sha256}`;
    if (cache.has(cacheKey)) { const found = cache.get(cacheKey); cache.delete(cacheKey); cache.set(cacheKey, found); return found; }
    const promise = (async () => {
      const res = await fetcher(new URL(spec.path, root).href, { signal: AbortSignal.timeout(30_000), credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
      if (!res.ok) throw new Error('Registry shard is unavailable.');
      // A .gz asset may be delivered as a gzip file or as HTTP gzip content.
      // Fetch transparently decodes the latter (including on Pages/CDNs), so
      // Content-Length and compressed bytes do not describe the exposed body.
      // Verify decoded bytes too; never weaken integrity to accommodate transport.
      const raw = await boundedBytes(res.body, Math.max(spec.bytes, spec.decodedBytes));
      let decoded;
      if (raw[0] === 0x1f && raw[1] === 0x8b && raw[2] === 0x08) {
        if (raw.byteLength !== spec.bytes || hex(await digest(raw)) !== spec.sha256) throw new Error('Registry integrity check failed. Reload after a data update.');
        decoded = await decode(raw, spec.decodedBytes);
      } else decoded = raw;
      if (decoded.byteLength !== spec.decodedBytes) throw new Error('Registry decoded size does not agree.');
      if (hex(await digest(decoded)) !== spec.decodedSha256) throw new Error('Registry decoded integrity check failed. Reload after a data update.');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(decoded);
      if (kind === 'names') return validateIdentityRows(JSON.parse(text), spec, key);
      const lines = text.split('\n');
      if (lines.length !== spec.rows || lines.some((line, i) => !/^\d{7}[A-Z0-9_]$/.test(line) || (i && lines[i - 1].slice(0, 7) >= line.slice(0, 7)))) throw new Error('Invalid EIN directory.');
      return lines;
    })().catch(error => { cache.delete(cacheKey); throw error; });
    cache.set(cacheKey, promise);
    while (cache.size > Math.max(1, Math.min(cacheSize, 5))) cache.delete(cache.keys().next().value);
    return promise;
  }
  async function search(input) {
    const query = registryQuery(input), m = await manifest(); let rows = [];
    if (query.kind === 'ein') {
      const directory = await shard('eins', query.ein.slice(0, 2), m);
      let lo = 0, hi = directory.length - 1, bucket;
      while (lo <= hi) { const mid = (lo + hi) >> 1, tail = directory[mid].slice(0, 7); if (tail === query.ein.slice(2)) { bucket = directory[mid][7]; break; } if (tail < query.ein.slice(2)) lo = mid + 1; else hi = mid - 1; }
      if (bucket) rows = (await shard('names', bucket, m)).filter(r => r[0] === query.ein);
    } else rows = (await shard('names', query.bucket, m)).filter(r => normalizeRegistryName(r[1]).startsWith(query.name));
    if (query.state) rows = rows.filter(r => r[3] === query.state);
    return { ok: true, organizations: rows.slice(0, query.limit).map(r => identityRecord(r, m)), total: rows.length, truncated: rows.length > query.limit, query, coverage: m.coverage, source: m.source, dataDate: m.dataDate, queriedAt: new Date().toISOString() };
  }
  return { manifest, search, clearCache: () => cache.clear() };
}
