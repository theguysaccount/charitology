import type { APIRoute, GetStaticPaths } from 'astro';
import data from '../../../../data/funding-flows/brazil-cisterns.json';
import { toCsv } from '../../../../lib/client/files';

const { agreement, currency, edition, sources } = data;
const { archives } = sources.transferegov;
const identities = new Map(data.institutions.map(item => [item.cnpj, item]));
const orderSource = archives.desembolso;
const paymentSource = archives.pagamento;
const onwardSource = archives.obtv_convenente;

const stages = {
  'bank-orders': data.bankOrders.map(order => ({
    agreementId: agreement.id, currency, edition, ...order,
    sourceUrl: orderSource.url, sourceSha256: orderSource.sha256,
  })),
  'account-payments': data.accountYears.map(period => ({
    agreementId: agreement.id, currency, edition,
    calendarYear: period.calendarYear, partialCalendarYear: period.partialCalendarYear,
    otherPaymentRows: period.otherPayments.rows, otherPaymentsCents: period.otherPayments.amountCents,
    otherPaymentsZeroAmountRows: period.otherPayments.zeroAmountRows,
    internalTransferRows: period.internalTransfers.rows,
    internalTransfersCents: period.internalTransfers.rows ? period.internalTransfers.amountCents : null,
    onwardRows: period.onward.rows, matchedInternalIds: period.onward.matchedInternalIds,
    internalIdsMissingAnyOnwardAmount: period.onward.internalIdsMissingAnyAmount,
    paymentSourceUrl: paymentSource.url, paymentSourceSha256: paymentSource.sha256,
    onwardSourceUrl: onwardSource.url, onwardSourceSha256: onwardSource.sha256,
  })),
  'institutional-payees': data.accountYears.flatMap(period => Object.entries(period.institutionalPayees).map(([cnpj, amounts]) => {
    const institution = identities.get(cnpj)!;
    return {
      agreementId: agreement.id, currency, edition,
      calendarYear: period.calendarYear, partialCalendarYear: period.partialCalendarYear,
      cnpj, payee: institution.name, ...amounts, subsetOf: 'other account payments',
      sourceUrl: paymentSource.url, sourceSha256: paymentSource.sha256,
      identitySourceUrl: sources.documents[institution.identitySource as keyof typeof sources.documents].url,
    };
  })),
  'water-access': data.census.flatMap(series => {
    const source = sources.sidra.tables[series.table as keyof typeof sources.sidra.tables];
    return series.rows.map(row => ({
      sidraTable: series.table, calendarYear: series.calendarYear, ...row,
      measure: source.measure, population: source.population,
      sourceUrl: source.url, sourceSha256: source.sha256,
    }));
  }),
};

export const getStaticPaths = (() => Object.entries(stages).map(([stage, rows]) => ({
  params: { stage }, props: { rows },
}))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => new Response('\uFEFF' + toCsv(props.rows) + '\n', {
  headers: { 'Content-Type': 'text/csv; charset=utf-8' },
});
