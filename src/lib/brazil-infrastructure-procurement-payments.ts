import edition from '../data/funding-flows/brazil-infrastructure-procurement-payments.json';

export const procurementPaymentsRoute = '/record/funding-flows/brazil-infrastructure-procurement-payments/';
export const procurementPaymentEdition = edition;
export type ProcurementPayment = (typeof edition.procurements)[number];
export type ContractPayment = (typeof edition.contracts)[number];
export const procurementPaymentsByAgreement = Map.groupBy(edition.procurements, row => row.agreement);
export const contractPaymentsByAgreement = Map.groupBy(edition.contracts, row => row.agreement);
