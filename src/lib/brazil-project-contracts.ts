import contractEdition from '../data/funding-flows/brazil-project-contracts.json';

export { contractEdition };
export type PairedContract = (typeof contractEdition.contracts)[number];
export const contractRoute = '/record/funding-flows/brazil-project-contracts/';
export const contractsByAgreement = Map.groupBy(contractEdition.contracts, record => record.agreement);
export const sharedPortalReference = (record: PairedContract) => record.cipiRows.some(row => row.sharedPortalReference);

export const archiveTitles = {
  siconv_contrato_cipi: 'CIPI project contract archive',
  siconv_licitacao: 'SICONV procurement archive',
  siconv_contrato: 'SICONV contract archive',
} as const;
