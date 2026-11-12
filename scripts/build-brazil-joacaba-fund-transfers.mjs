import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [directory, output] = process.argv.slice(2);
if (!directory || !output) throw new Error('Pass the capture directory and a new output JSON path.');
const endpoint = 'https://consultafns.saude.gov.br/recursos/consulta-detalhada/';
const fundCnpj = '10594533000100';
const municipalityCode = '420900';
const actionId = 61659;
const actionName = 'ATENÇÃO À SAÚDE DA POPULAÇÃO PARA PROCEDIMENTOS NO MAC';
const entityPin = [401, '54f4e5111cd0ef022dcbb201afa664223fc060bf255047a5804ac52dba38d6cd'];
const years = [
  [2024, [16843, '9c0d210d37737334a51d090238fd24f1e0233383da62acf6b3b132341ad7fbbb'],
    [13506, '0364370ace95d5d43ad23bffe539be883ee0977dcb837c6a720b2898200a07d9']],
  [2025, [16440, '26437029c4feb023b726d61cdb82265297129fcb919bb89e14cf35dde19ec952'],
    [14650, 'c18fccd3eb125739df9805c7c680b09ae3c73091375e0d4df4f56e344227ca56']],
  [2026, [14283, '793ad36aa97c3e1e3d7556a72dcefb3e45178f839a2ea54255883eb543eaab6e'],
    [13492, 'f07c44497531d6fc1f7a174d20e7a963682a3ef1d9067d0a9251a043fdbc7709']],
];

function capture(name, pin, path, year, filters = '') {
  const bytes = readFileSync(join(directory, name));
  assert.deepEqual([bytes.length, createHash('sha256').update(bytes).digest('hex')], pin, name);
  const { resultado: { total, dados } } = JSON.parse(bytes);
  assert.equal(total, dados.length, name + ' must be a complete response');
  return {
    rows: dados,
    source: {
      url: `${endpoint}${path}?ano=${year}&estado=SC&municipio=${municipalityCode}&cpfCnpjUg=${fundCnpj}&tipoConsulta=2${filters}&page=1&count=${path === 'entidades' ? 10 : 100}`,
      bytes: pin[0], sha256: pin[1],
    },
  };
}

function cents(value) {
  const decimal = String(value);
  assert.match(decimal, /^\d+(?:\.\d{1,2})?$/);
  const [whole, fraction = ''] = decimal.split('.');
  const result = Number(whole + fraction.padEnd(2, '0'));
  assert.ok(Number.isSafeInteger(result));
  return result;
}

function orderDate(day) {
  assert.match(day, /^\d{2}\/\d{2}\/\d{4}$/);
  return day.split('/').reverse().join('-');
}

function orderReference(row, sourceRow) {
  return { sourceRow, siafiOrderNumber: row.numeroDocumentoSiafi, recordedOn: orderDate(row.dataCriacaoSiafi) };
}

const ordinanceRows = [];
let equalAmountOrders;
const yearly = years.map(([year, actionPin, detailPin]) => {
  const suffix = String(year).slice(2);
  const entity = capture(`fns-entity-${suffix}.json`, entityPin, 'entidades', year);
  const action = capture(`fns-actions-${suffix}.json`, actionPin, 'detalhe-acao', year);
  const detail = capture(`fns-MAC-${suffix}.json`, detailPin, 'detalhe-pagamento', year, `&acoes=${actionId}`);
  assert.equal(entity.rows.length, 1);
  const [fund] = entity.rows;
  assert.deepEqual([fund.cpfCnpj, fund.codigoMunicipioIBGE, fund.uf, fund.esferaAdministrativa],
    [fundCnpj, municipalityCode, 'SC', 'MUNICIPAL']);
  const matches = action.rows.filter(row => row.id === actionId && row.descricao === actionName && row.grupoAcao.id === 14);
  assert.equal(matches.length, 1);
  const [summary] = matches;
  const orderKeys = new Set();
  for (const [index, row] of detail.rows.entries()) {
    assert.deepEqual([row.uf, row.id.esferaAdministrativa, row.id.programaFundo.id, Number(row.anoPagamento), row.tipoDocumentoPagamento],
      ['SC', 'MUNICIPAL', actionId, year, 'OB']);
    assert.match(row.numeroDocumentoSiafi, /^\d+$/);
    orderKeys.add(row.numeroDocumentoSiafi + ':' + orderDate(row.dataCriacaoSiafi));
    if (row.nuPortaria === '05402') {
      ordinanceRows.push({ year, ...orderReference(row, index + 1), ordinancePrinted: row.nuPortaria,
        competence: row.competencia, fnsProcess: row.id.processoFormatado,
        grossCentsBRL: cents(row.valorTotal), netCentsBRL: cents(row.valorLiquido) });
    }
  }
  assert.equal(orderKeys.size, detail.rows.length, 'Each listed SIAFI order must have a distinct number and date.');
  const summaryNetCentsBRL = cents(summary.valorLiquido);
  const detailNetCentsBRL = detail.rows.reduce((total, row) => total + cents(row.valorLiquido), 0);
  assert.ok(detail.rows.every(row => cents(row.valorLiquidoGeral) === detailNetCentsBRL));
  const differenceCentsBRL = detailNetCentsBRL - summaryNetCentsBRL;
  if (year === 2025) {
    equalAmountOrders = detail.rows.flatMap((row, index) =>
      cents(row.valorLiquido) === differenceCentsBRL ? [orderReference(row, index + 1)] : []);
    assert.equal(equalAmountOrders.length, 2);
  }
  return {
    year, latestListedMonth: Math.max(...detail.rows.map(row => Number(row.mesPagamento))),
    summarySourceRow: action.rows.indexOf(summary) + 1, detailOrders: orderKeys.size,
    summaryNetCentsBRL, detailNetCentsBRL, differenceCentsBRL,
    sources: { entity: entity.source, summary: action.source, detail: detail.source },
  };
});

const filtered = capture('fns-05402-24.json', [1097, 'f4d94550f68c296a6a640d89a1c9f538b40164d1c7268e8de5dff287254e96c0'],
  'detalhe-pagamento', 2024, `&acoes=${actionId}&portaria=05402`);
assert.equal(ordinanceRows.length, 1);
assert.equal(filtered.rows.length, 1);
const [linkedOrder] = ordinanceRows;
const [direct] = filtered.rows;
assert.deepEqual(
  [linkedOrder.year, linkedOrder.siafiOrderNumber, linkedOrder.recordedOn, linkedOrder.ordinancePrinted, linkedOrder.netCentsBRL],
  [Number(direct.anoPagamento), direct.numeroDocumentoSiafi, orderDate(direct.dataCriacaoSiafi), direct.nuPortaria, cents(direct.valorLiquido)],
);

const projection = {
  format: 'charitology-joacaba-fund-transfers-v1', capturedOn: '2026-11-11',
  fundCnpj, municipalityCodeSixDigit: municipalityCode, actionId, actionName,
  yearly,
  exactOrdinanceOrder: { ...linkedOrder, filteredSource: filtered.source },
  reconciliationExample: { year: 2025, eachNetCentsBRL: 1137303, orders: equalAmountOrders },
};
writeFileSync(output, JSON.stringify(projection, null, 2) + '\n', { flag: 'wx' });
