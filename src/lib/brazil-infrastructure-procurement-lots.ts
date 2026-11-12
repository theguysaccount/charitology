import edition from '../data/funding-flows/brazil-infrastructure-procurement-lots.json';

export const procurementLotsRoute = '/record/funding-flows/brazil-infrastructure-procurement-lots/';
export const procurementLotsEdition = edition;
export const procurementLotsByAgreement = Map.groupBy(edition.procurements, row => row.agreement);
