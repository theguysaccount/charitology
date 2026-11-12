import type { APIRoute } from 'astro';
import data from '../../../../data/heal-nepal-trace.json';
import { toCsv } from '../../../../lib/client/files';

export const GET: APIRoute = () => {
  const rows = Object.values(data.captures).flatMap(capture => capture.transactions.map(row => ({
    publisher: capture.publisher, activityId: capture.activityId, source: capture.url,
    row: row.row, ref: row.ref, type: row.type, date: row.date, valueDate: row.valueDate,
    amount: row.amount, currency: row.currency, currencyAttribute: row.currencyAttribute,
    providerOrg: row.provider?.organizationRef, providerActivity: row.provider?.activityRef,
    receiverOrg: row.receiver?.organizationRef, receiverActivity: row.receiver?.activityRef,
  })));
  return new Response('\uFEFF' + toCsv(rows) + '\n', { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
};
