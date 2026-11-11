import { comparedDocuments, invoiceEdition, invoiceStatuses, type InvoiceCohort } from '../../../../lib/brazil-infrastructure-invoice-items';

export function GET() {
  const header = ['agreement', 'proposal', 'project', 'documentIssueYear', 'partialIssueYear', 'documents',
    'paymentRows', 'sourceItemRows', 'comparedDocuments', 'comparedUniqueItems', 'comparablePaymentRows', 'multiYearDocuments',
    'earliestIncludedPaymentYear', 'latestIncludedPaymentYear', 'grossItemCentsBRL', 'reportedPaymentCentsBRL', ...invoiceStatuses];
  const rows = invoiceEdition.periods.map((row: InvoiceCohort) => [
    row.agreement, row.proposal, row.project, row.issueYear, row.partialYear, row.documents, row.paymentRows,
    row.lineRows, comparedDocuments(row.statuses), row.comparedUniqueItems, row.comparablePaymentRows, row.multiYearDocuments,
    row.earliestIncludedPaymentYear, row.latestIncludedPaymentYear, row.grossItemCentsBRL, row.reportedPaymentCentsBRL,
    ...invoiceStatuses.map(status => row.statuses[status]),
  ]);
  return new Response([header, ...rows].map(row => row.join(',')).join('\n') + '\n', {
    headers: { 'Content-Type': 'text/csv; charset=utf-8' },
  });
}
