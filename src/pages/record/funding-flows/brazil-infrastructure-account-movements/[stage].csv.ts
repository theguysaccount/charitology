import type { APIRoute, GetStaticPaths } from 'astro';
import { movementEdition, type MovementPeriod } from '../../../../lib/brazil-infrastructure-account-movements';
import { toCsv } from '../../../../lib/client/files';

const { capturedOn, currency, periods, sources } = movementEdition;
const { siconv_pagamento: paymentSource, siconv_obtv_convenente: onwardSource } = sources.archives;
const scope = ({ agreement, proposal, project, calendarYear, partialYear }: MovementPeriod) =>
  ({ agreement, proposal, project, calendarYear, partialYear, capturedOn });

const stages = {
  'agreement-years': periods.map(period => ({
    ...scope(period), currency, movementRows: period.movementRows,
    institutionalPaymentRows: period.institutionalPayments.rows,
    institutionalPaymentAmountCents: period.institutionalPayments.amountCentsBRL,
    otherNonHolderRowsWithoutAmounts: period.otherNonHolderRowsWithoutAmounts,
    holderTransferRows: period.holderTransfers.rows, holderIdMatchedRows: period.holderTransfers.holderIdMatchedRows,
    holderTransferAmountCents: period.holderTransfers.amountCentsBRL,
    sameYearBankOrderRows: period.sameYearBankOrders?.rows,
    sameYearBankOrderAmountCents: period.sameYearBankOrders?.amountCentsBRL,
    projectEditionSha256: sources.projectEditionSha256,
    paymentSourceUrl: paymentSource.url, paymentSourceSha256: paymentSource.sha256,
  })),
  'onward-coverage': periods.filter(period => period.holderTransfers.rows > 0).map(period => ({
    ...scope(period), holderTransferRows: period.holderTransfers.rows,
    onwardRows: period.onward.rows, equalAmountParents: period.onward.equalAmountParents,
    unknownAmountParents: period.onward.unknownAmountParents, differentAmountParents: period.onward.differentAmountParents,
    noOnwardRecordParents: period.onward.noOnwardRecordParents,
    paymentSourceSha256: paymentSource.sha256, onwardSourceUrl: onwardSource.url, onwardSourceSha256: onwardSource.sha256,
  })),
};
export const getStaticPaths = (() => Object.entries(stages).map(([stage, rows]) => ({
  params: { stage }, props: { rows },
}))) satisfies GetStaticPaths;
export const GET: APIRoute = ({ props }) => new Response('\uFEFF' + toCsv(props.rows) + '\n', {
  headers: { 'Content-Type': 'text/csv; charset=utf-8' },
});
