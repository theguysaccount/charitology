import worksEdition from '../data/funding-flows/brazil-works-measurements.json';

export { worksEdition };
export const worksRoute = '/record/funding-flows/brazil-works-measurements/';
export type MonitoringRecord = (typeof worksEdition.monitoring)[number];
export type MeasurementItem = (typeof worksEdition.items)[number];
export const monitoringByAgreement = Map.groupBy(worksEdition.monitoring, record => record.agreement);
export const measurementItemsByAgreement = Map.groupBy(worksEdition.items, record => record.agreement);

export const measurementStatusLabels: Record<string, string> = {
  Aceita: 'Accepted measurement',
  Atestada: 'Attested measurement',
  'Em Ateste pelo Convenente': 'With the recipient for attestation',
  'Em Análise pelo Concedente/Mandatária': 'Under review by the grantor or its agent',
  'Enviada para Complementação do Convenente': 'Returned to the recipient for more information',
  'Enviada para o Convenente': 'Sent to the recipient',
  unknown: 'Unknown measurement status',
};

export const worksArchives = {
  siconv_acomp_obras_contratos_medicoes_modulo_empresas: 'Transferegov works monitoring archive',
  siconv_acomp_obras_valores_itens_medicao_modulo_empresas: 'Transferegov accumulated work-item amounts archive',
} as const;
