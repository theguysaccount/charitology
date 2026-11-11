import edition from '../data/funding-flows/brazil-infrastructure-work-lots.json';

export const workLotsRoute = '/record/funding-flows/brazil-infrastructure-work-lots/';
export const workLotEdition = edition;
export const workLotsByAgreement = Map.groupBy(edition.lots, row => row.agreement);
