import data from '../data/funding-flows/brazil-project-execution.json';

export { data };
export type InfrastructureProject = (typeof data.projects)[number];
export const infrastructureRoute = '/record/funding-flows/brazil-project-execution/';
export const projectPath = (agreement: string) => infrastructureRoute + agreement + '/';
export const transferRoute = '/record/funding-flows/brazil-transferegov/';
export const workPlanRoute = '/record/funding-flows/brazil-planned-geography/';
export const fiscalGuide = 'https://portaldatransparencia.gov.br/entenda-a-gestao-publica/execucao-despesa-publica';
export const worksGuide = 'https://www.gov.br/transferegov/pt-br/obrasgov/doc/manualdousuarioobrasgovbr2023_v1.8.pdf';

export const statusLabels: Record<string, string> = {
  'Cadastrada': 'Registered', 'Em execução': 'In progress', 'Concluída': 'Completed', 'Inacabada': 'Unfinished',
};
export const geographyLabels: Record<string, string> = {
  same: 'Same municipalities', partial: 'Some municipalities overlap', different: 'Different municipalities',
  'unknown-plan': 'No linked planned municipality', 'unknown-register': 'No registered municipality',
};

export const cases: Record<string, { label: string; municipality: string; document: string; description: string; qualification?: string }> = {
  '895978': {
    label: 'Specialized health unit renovation in São José dos Campos',
    municipality: '3549904',
    document: 'https://pesquisa.in.gov.br/imprensa/servlet/INPDFViewer?captchafield=firstAccess&data=06%2F01%2F2020&jornal=530&pagina=43',
    description: 'The federal contract notice identifies agreement 895978 and a renovation of a specialized health unit in São José dos Campos.',
  },
  '953157': {
    label: 'Outpatient clinic renovation in Joaçaba',
    municipality: '4209003',
    document: 'https://www.unoesc.edu.br/wp-content/uploads/2024/12/1-Publicacao-DOU-aviso-de-licitacao.pdf',
    description: 'The tender identifies agreement 953157 and the university outpatient clinic renovation in Joaçaba.',
    qualification: 'https://joacaba.sc.gov.br/uploads/sites/89/2024/10/4.-Portaria-GM_ms-N-5.402-DE-20-DE-setembro-DE-2024-Portaria-GM_ms-N-5.402-DE-20-DE-setembro-DE-2024-DOU-Imprensa-Nacional.pdf',
  },
};

const brl = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'BRL', currencyDisplay: 'code' });
export const money = (cents: number | null) => cents === null ? 'Unknown' : brl.format(cents / 100);
export const count = (value: number) => value.toLocaleString('en-US');
export const percent = (value: string | null | undefined) => value == null ? 'Unknown' : Number(value).toLocaleString('en-US', { maximumFractionDigits: 8 }) + '%';

export function municipalities(project: InfrastructureProject) {
  return [...new Map(project.api.geometria.rows.map(row => [row.cod_ibge, row])).values()];
}
