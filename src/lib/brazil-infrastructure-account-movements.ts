import movementEdition from '../data/funding-flows/brazil-infrastructure-account-movements.json';

export { movementEdition };
export const accountMovementsRoute = '/record/funding-flows/brazil-infrastructure-account-movements/';
export type MovementPeriod = (typeof movementEdition.periods)[number];
export const movementPeriodsByAgreement = Map.groupBy(movementEdition.periods, period => period.agreement);

export const movementArchives = {
  siconv_pagamento: 'Transferegov payments and account movements archive',
  siconv_obtv_convenente: 'Transferegov onward records for transfers to agreement holders',
} as const;
