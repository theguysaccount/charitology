import type { APIRoute, GetStaticPaths } from 'astro';
import { toCsv } from '../../../../lib/client/files';
import { worksEdition } from '../../../../lib/brazil-works-measurements';

const { capturedOn, currency, monitoring, items, sources } = worksEdition;
const {
  siconv_acomp_obras_contratos_medicoes_modulo_empresas: monitoringSource,
  siconv_acomp_obras_valores_itens_medicao_modulo_empresas: itemSource,
} = sources.archives;
const stages = {
  monitoring: monitoring.map(record => ({
    ...record, capturedOn, sourceUrl: monitoringSource.url, sourceSha256: monitoringSource.sha256,
  })),
  'work-items': items.map(({ amountCentsBRL: amount, ...row }) => ({
    ...row, capturedOn, currency, totalCents: amount.total, grantorCents: amount.grantor,
    recipientCents: amount.recipient, companyCents: amount.company,
    sourceUrl: itemSource.url, sourceSha256: itemSource.sha256,
  })),
};
export const getStaticPaths = (() => Object.entries(stages).map(([stage, rows]) => ({
  params: { stage }, props: { rows },
}))) satisfies GetStaticPaths;
export const GET: APIRoute = ({ props }) => new Response('\uFEFF' + toCsv(props.rows) + '\n', {
  headers: { 'Content-Type': 'text/csv; charset=utf-8' },
});
