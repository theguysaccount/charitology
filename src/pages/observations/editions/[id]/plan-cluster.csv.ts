import type { APIRoute } from 'astro';
import { loadObservations } from '../../../../lib/observations';
import { planClusterObservationExport } from '../../../../lib/humanitarian-plan-cluster/public.mjs';
export function getStaticPaths() {
  const { input } = loadObservations();
  return input.registry.editions.flatMap(edition => planClusterObservationExport(input, edition.id, 'csv')
    ? [{ params: { id: edition.id }, props: { editionId: edition.id } }] : []);
}
export const GET: APIRoute = ({ props }) => {
  const artifact = planClusterObservationExport(loadObservations().input, props.editionId, 'csv');
  if (!artifact) return new Response('No captured plan-cluster selection.', { status: 404 });
  return new Response(artifact.body, { headers: {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${artifact.filename}"`,
    'X-Content-Type-Options': 'nosniff',
  }});
};
