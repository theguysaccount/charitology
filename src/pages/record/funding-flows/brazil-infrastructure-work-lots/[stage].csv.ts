import type { APIRoute } from 'astro';
import { workLotEdition } from '../../../../lib/brazil-infrastructure-work-lots';
import { toCsv } from '../../../../lib/client/files';

const stages = {
  contracts: {
    rows: workLotEdition.contractCoverage,
    header: ['cohort', 'agreement', 'proposal', 'project', 'procurementId', 'contractId',
      'contractNumber', 'signedOn', 'linkStatus', 'contractSourceRow'],
  },
  lots: {
    rows: workLotEdition.lots,
    header: ['agreement', 'proposal', 'project', 'procurementId', 'contractId', 'contractNumber', 'signedOn',
      'worksInstrumentId', 'worksContractId', 'lotId', 'lotNumber', 'lotSourceRow'],
  },
  subgoals: {
    rows: workLotEdition.subgoals,
    header: ['agreement', 'proposal', 'project', 'worksInstrumentId', 'lotId', 'goalId', 'subgoalId', 'budgetId',
      'reportedSubgoalStatus', 'plannedStartOn', 'budgetReferenceOn', 'sourceLocalityCode',
      'tenderedAmountCentsBRL', 'subgoalSourceRow'],
  },
  authorizations: {
    rows: workLotEdition.authorizations,
    header: ['agreement', 'proposal', 'project', 'worksInstrumentId', 'authorizationId',
      'authorizationStatus', 'issuedOn', 'authorizationSourceRow'],
  },
} as const;

type Stage = keyof typeof stages;
export const getStaticPaths = () => Object.keys(stages).map(stage => ({ params: { stage }, props: { stage } }));

export const GET: APIRoute<{ stage: Stage }> = ({ props: { stage } }) => {
  const { rows, header } = stages[stage];
  return new Response(toCsv(rows, [...header]) + '\n', {
    headers: { 'Content-Type': 'text/csv; charset=utf-8' },
  });
};
