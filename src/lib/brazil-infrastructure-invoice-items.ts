import edition from '../data/funding-flows/brazil-infrastructure-invoice-items.json';

export const invoiceItemsRoute = '/record/funding-flows/brazil-infrastructure-invoice-items/';
export const invoiceStatuses = ['equal', 'grossHigher', 'paymentHigher', 'paymentScopeUnresolved', 'noItems',
  'itemIdentityUnresolved', 'unknownItemAmount'] as const;
type InvoiceStatuses = Record<typeof invoiceStatuses[number], number>;

export interface InvoiceCohort {
  agreement: string;
  proposal: string;
  project: string;
  issueYear: number | null;
  partialYear: boolean;
  documents: number;
  paymentRows: number;
  lineRows: number;
  comparedUniqueItems: number;
  comparablePaymentRows: number;
  multiYearDocuments: number;
  earliestIncludedPaymentYear: number | null;
  latestIncludedPaymentYear: number | null;
  grossItemCentsBRL: number | null;
  reportedPaymentCentsBRL: number | null;
  statuses: InvoiceStatuses;
}

export const invoiceEdition = edition;
const cohorts: readonly InvoiceCohort[] = edition.periods;
export const invoicesByAgreement = Map.groupBy(cohorts, row => row.agreement);

export function comparedDocuments(states: InvoiceStatuses) {
  return states.equal + states.grossHigher + states.paymentHigher;
}

export function paymentYears(cohort: InvoiceCohort) {
  const first = cohort.earliestIncludedPaymentYear;
  const last = cohort.latestIncludedPaymentYear;
  if (first === null || last === null) return 'No compared payments';
  return first === last ? String(first) : `${first}–${last}`;
}
