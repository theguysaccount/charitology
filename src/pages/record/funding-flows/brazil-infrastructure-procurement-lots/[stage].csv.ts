import type { APIRoute } from 'astro';
import { toCsv } from '../../../../lib/client/files';
import { procurementLotsEdition } from '../../../../lib/brazil-infrastructure-procurement-lots';

const { procurements } = procurementLotsEdition;
const stages = {
  procurements: {
    rows: procurements.map(({ lots, contractStates, ...row }) => ({
      ...row, lotReferences: lots.length, documentsWithoutContractId: contractStates.noReference,
      documentsWithVerifiedContract: contractStates.verified, documentsWithUnresolvedContract: contractStates.unresolved,
    })),
    columns: ['agreement', 'proposal', 'project', 'procurementId', 'procurementSourceRow', 'documents', 'paymentRows',
      'firstPaymentYear', 'lastPaymentYear', 'reportedPaymentCentsBRL', 'lotReferences', 'documentsWithoutContractId',
      'documentsWithVerifiedContract', 'documentsWithUnresolvedContract'],
  },
  'lot-references': {
    rows: procurements.flatMap(({ agreement, proposal, project, procurementId, lots }) =>
      lots.map(lot => ({ agreement, proposal, project, procurementId, ...lot }))),
    columns: ['agreement', 'proposal', 'project', 'procurementId', 'worksInstrumentId', 'worksContractId',
      'lotId', 'lotNumber', 'lotSourceRow'],
  },
} as const;

type Stage = keyof typeof stages;
export const getStaticPaths = () => Object.keys(stages).map(stage => ({ params: { stage }, props: { stage } }));

export const GET: APIRoute<{ stage: Stage }> = ({ props: { stage } }) => {
  const { rows, columns } = stages[stage];
  return new Response(toCsv(rows, [...columns]) + '\n', {
    headers: { 'Content-Type': 'text/csv; charset=utf-8' },
  });
};
