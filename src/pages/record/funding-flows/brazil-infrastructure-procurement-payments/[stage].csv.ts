import type { APIRoute } from 'astro';
import { procurementPaymentEdition } from '../../../../lib/brazil-infrastructure-procurement-payments';

const stages = ['procurements', 'contracts'] as const;
type Stage = typeof stages[number];

export const getStaticPaths = () => stages.map(stage => ({ params: { stage }, props: { stage } }));

export const GET: APIRoute<{ stage: Stage }> = ({ props: { stage } }) => {
  const contracts = stage === 'contracts';
  const header = ['agreement', 'proposal', 'project', 'procurementId', 'procurementSourceRow',
    'documents', 'paymentRows', 'reportedPaymentCentsBRL', 'firstPaymentYear', 'lastPaymentYear',
    ...(contracts ? ['contractId', 'contractSourceRow', 'alsoInCipiContractEdition'] :
      ['verifiedContractDocuments', 'noContractReferenceDocuments', 'unresolvedContractDocuments'])];
  const rows = procurementPaymentEdition[stage].map(row => [
    row.agreement, row.proposal, row.project, row.procurementId, row.procurementSourceRow,
    row.documents, row.paymentRows, row.reportedPaymentCentsBRL, row.firstPaymentYear, row.lastPaymentYear,
    ...('contractId' in row ? [row.contractId, row.contractSourceRow, row.alsoInCipiContractEdition] :
      [row.contractStates.verified, row.contractStates.noReference, row.contractStates.unresolved]),
  ]);
  return new Response([header, ...rows].map(row => row.join(',')).join('\n') + '\n', {
    headers: { 'Content-Type': 'text/csv; charset=utf-8' },
  });
};
