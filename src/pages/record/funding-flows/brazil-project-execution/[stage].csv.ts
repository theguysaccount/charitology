import type { APIRoute, GetStaticPaths } from 'astro';
import { data, type InfrastructureProject } from '../../../../lib/brazil-project-execution';
import { toCsv } from '../../../../lib/client/files';
import transfer from '../../../../../public/data/funding-flows/brazil-transferegov/manifest.json';

const { siconv_empenho: agreementArchive, siconv_empenho_cipi: projectArchive,
  siconv_execucao_fisica_cipi: physicalArchive } = data.sources.archives;
const orderArchive = transfer.source.archives.desembolso;
const identifiers = (project: InfrastructureProject) => ({
  agreement: project.agreement,
  proposal: project.proposal,
  cnpj: project.cnpj,
  project: project.project,
  capturedOn: data.capturedOn,
});

const stages = {
  projects: data.projects.map(project => {
    const registry = project.api['projeto-investimento'];
    const physical = project.api['execucao-fisica'];
    const row = physical.rows[0];
    return {
      ...identifiers(project), organization: project.organization,
      status: registry.rows[0].situacao,
      registryActualStart: registry.rows[0].dt_inicial_efetiva,
      registryActualEnd: registry.rows[0].dt_final_efetiva,
      registryUrl: registry.source.url, registrySha256: registry.source.sha256,
      physicalRecordReturned: Boolean(row), physicalPercent: row?.percentual_execucao_fisica,
      physicalRecordUpdated: row?.dt_atualizacao_execucao,
      physicalReportStart: row?.dt_inicial_execucao, physicalReportEnd: row?.dt_final_execucao,
      currentPhysicalUrl: physical.source.url, currentPhysicalSha256: physical.source.sha256,
      geographyComparison: project.geographyComparison,
      plannedMunicipalities: project.plannedMunicipalities.map(place => place.code).join('|'),
      workPlanGoals: project.goals, workPlanGoalsWithoutLinkedMunicipality: project.unresolvedGoals,
    };
  }),
  commitments: data.projects.flatMap(project => project.commitments.map(pair => ({
    ...identifiers(project), issuingUnit: pair.issuingUnit, commitmentNumber: pair.commitmentNumber, currency: data.currency,
    agreementSourceRow: pair.siconv.row, agreementCommitmentId: pair.siconv.id,
    agreementIssueDate: pair.siconv.issueDate, agreementAmountCents: pair.siconv.amountCentsBRL,
    agreementNoteType: pair.siconv.noteType, agreementStatus: pair.siconv.status,
    agreementArchiveUrl: agreementArchive.url, agreementArchiveSha256: agreementArchive.sha256,
    projectSourceRow: pair.cipi.row, projectIssueDate: pair.cipi.issueDate,
    projectAmountCents: pair.cipi.amountCentsBRL, projectSourceSystem: pair.cipi.sourceSystem,
    projectArchiveUrl: projectArchive.url, projectArchiveSha256: projectArchive.sha256,
  }))),
  'bank-orders': data.projects.flatMap(project => project.bankOrders.map(([bankOrder, date, amountCents, sourceRow]) => ({
    ...identifiers(project), bankOrder, date, amountCents, currency: data.currency, sourceRow,
    sourceUrl: orderArchive.url, sourceSha256: orderArchive.sha256,
  }))),
  'registered-municipalities': data.projects.flatMap(project => project.api.geometria.rows.map(place => ({
    ...identifiers(project), geometryId: place.id_geometria, ibgeMunicipality: place.cod_ibge,
    municipality: place.no_municipio, state: place.sg_uf, geometrySourceLabel: place.origem_geometria,
    sourceUrl: project.api.geometria.source.url, sourceSha256: project.api.geometria.source.sha256,
  }))),
  'physical-history': data.projects.flatMap(project => project.physicalHistory.map(row => ({
    ...identifiers(project), sourceRow: row.row, statusDate: row.statusDate,
    rawStatusCode: row.statusCode, physicalPercent: row.percent,
    sourceUrl: physicalArchive.url, sourceSha256: physicalArchive.sha256,
  }))),
};

export const getStaticPaths = (() => Object.entries(stages).map(([stage, rows]) => ({
  params: { stage }, props: { rows },
}))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => {
  const rows = (props.rows as Record<string, unknown>[]).map(row => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key, typeof value === 'string' && /^[\s\u0000-\u001f]*[=+@-]|^[\t\r\n]/u.test(value) ? "'" + value : value,
    ]),
  ));
  return new Response('\uFEFF' + toCsv(rows) + '\n', { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
};
