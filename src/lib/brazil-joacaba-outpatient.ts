import edition from '../data/funding-flows/brazil-joacaba-outpatient.json';
import { procurementLotsRoute } from './brazil-infrastructure-procurement-lots';

export const joacabaOutpatientRoute = procurementLotsRoute + 'joacaba-outpatient/';
export const joacabaOutpatient = edition;
export const hearingGroups = {
  aasi: 'Hearing aids',
  reposicao_aasi: 'Hearing-aid replacements',
  diagnostico_auditivo: 'Diagnostic procedures',
  audiometria: 'Audiometry',
  selecao_adaptacao_aasi: 'Hearing-aid selection and benefit checks',
  molde_auricular: 'Ear molds',
  manutencao_aasi: 'Hearing-aid maintenance',
  sistema_fm: 'Personal FM systems',
} as const satisfies Record<keyof typeof edition.hearing.totals, string>;

export const hearingGroupKeys = Object.keys(hearingGroups) as (keyof typeof hearingGroups)[];
