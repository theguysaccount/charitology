import type { APIRoute, GetStaticPaths } from 'astro';
import { contractEdition, sharedPortalReference } from '../../../../lib/brazil-project-contracts';
import { toCsv } from '../../../../lib/client/files';

const { capturedOn, currency, contracts, sources } = contractEdition;
const { siconv_contrato: contractArchive, siconv_licitacao: procurementArchive, siconv_contrato_cipi: cipiArchive } = sources.archives;

const stages = {
  contracts: contracts.map(record => ({
    agreement: record.agreement, project: record.project, capturedOn, currency, contractNumber: record.contractNumber,
    signedOn: record.signedOn, globalAmountCents: record.globalAmountCentsBRL,
    contractId: record.procurementContract.contractId, procurementId: record.procurementContract.procurementId,
    contractPublishedOn: record.procurementContract.publishedOn, contractStartsOn: record.procurementContract.startsOn,
    contractEndsOn: record.procurementContract.endsOn, contractSourceRow: record.procurementContract.sourceRow,
    procurementSourceRow: record.procurementContract.procurementSourceRow,
    cipiOccurrences: record.cipiRows.length, sharedPortalReference: sharedPortalReference(record),
    contractSourceUrl: contractArchive.url, contractSourceSha256: contractArchive.sha256,
    procurementSourceUrl: procurementArchive.url, procurementSourceSha256: procurementArchive.sha256,
  })),
  'cipi-rows': contracts.flatMap(record => record.cipiRows.map(row => ({
    agreement: record.agreement, project: record.project, capturedOn, contractId: record.procurementContract.contractId,
    procurementId: record.procurementContract.procurementId, ...row, sourceUrl: cipiArchive.url, sourceSha256: cipiArchive.sha256,
  }))),
};
export const getStaticPaths = (() => Object.entries(stages).map(([stage, rows]) => ({
  params: { stage }, props: { rows },
}))) satisfies GetStaticPaths;
export const GET: APIRoute = ({ props }) => new Response('\uFEFF' + toCsv(props.rows) + '\n', {
  headers: { 'Content-Type': 'text/csv; charset=utf-8' },
});
