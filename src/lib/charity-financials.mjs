export const AU_FINANCIAL_ASSET = 'au-ais-2023-2024.json.gz';
export const AU_FINANCIAL_FORMAT = 'charitology-acnc-ais-v1';
export const AU_FINANCIAL_FIELDS = [
  'total revenue', 'total expenses', 'revenue from government',
  'grants and donations made for use in Australia', 'grants and donations made for use outside Australia',
];

export function isReportingDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

function normalizeName(value) {
  return value.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function financialQuery(input) {
  const query = String(input).trim();
  if (query.length > 120) throw new RangeError('Enter a shorter charity name or a complete ABN.');
  if (/^[\d\s-]+$/.test(query)) {
    const abn = query.replace(/[\s-]/g, '');
    if (!/^\d{11}$/.test(abn)) throw new RangeError('Enter all 11 digits of the ABN.');
    return { abn };
  }
  const name = normalizeName(query);
  if (name.length < 3) throw new RangeError('Enter at least three characters of the charity name.');
  return { name };
}

export function searchFinancials(rows, query) {
  const matches = rows.filter(([abn, name]) => query.abn ? query.abn === abn : normalizeName(name).includes(query.name));
  return { total: matches.length, matches: matches.slice(0, 25) };
}

export function validateFinancialRows(rows, manifest) {
  if (!Array.isArray(rows) || rows.length !== manifest.organizations) throw new Error('Financial snapshot organization count does not match.');
  const seen = new Set();
  const periods = new Map(manifest.sources.map(source => [source.year, new Set()]));
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== 3) throw new Error('Invalid financial organization row.');
    const [abn, name, history] = row;
    if (typeof abn !== 'string' || !/^\d{11}$/.test(abn) || seen.has(abn) || typeof name !== 'string' || !name.trim() || name.length > 250
      || !Array.isArray(history) || !history.length || history.length > manifest.sources.length) throw new Error('Invalid financial organization identity or history.');
    seen.add(abn);
    let lastYear = Infinity;
    for (const row of history) {
      if (!Array.isArray(row) || row.length !== 11) throw new Error('Invalid financial period row.');
      const [year, from, to, consolidation, basis, sourceRecord, ...amounts] = row;
      const source = manifest.sources.find(entry => entry.year === year);
      const sourceRows = periods.get(year);
      if (!source || year >= lastYear || !isReportingDate(from) || !isReportingDate(to) || from > to
        || ![null, 'y', 'n'].includes(consolidation) || ![null, 'Cash', 'Accrual'].includes(basis)
        || !Number.isSafeInteger(sourceRecord) || sourceRecord < 1 || sourceRecord > source.inputRows || sourceRows.has(sourceRecord)
        || amounts.some(amount => amount !== null && !Number.isSafeInteger(amount))) throw new Error('Invalid reporting period, scope or amount.');
      sourceRows.add(sourceRecord);
      lastYear = year;
    }
  }
  if (manifest.sources.some(source => periods.get(source.year).size !== source.includedPeriods)) throw new Error('Financial snapshot period counts do not match.');
  return rows;
}
