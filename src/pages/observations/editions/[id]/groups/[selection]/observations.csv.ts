import type { APIRoute } from "astro";
import {
  loadObservations,
  observationGroupSelections,
} from "../../../../../../lib/observations";
import {
  observationExport,
  observationProjection,
} from "../../../../../../lib/observation-model.mjs";

export function getStaticPaths() {
  const { input } = loadObservations();
  return input.registry.editions.flatMap((edition) =>
    observationGroupSelections(observationProjection(input, edition.id)).map(
      (selection) => ({
        params: { id: edition.id, selection: selection.id },
        props: { editionId: edition.id, entityIds: selection.entityIds },
      }),
    ),
  );
}
export const GET: APIRoute = ({ props }) => {
  const artifact = observationExport(loadObservations().input, {
    editionId: props.editionId,
    filter: { entityIds: props.entityIds, measureIds: [], state: "all" },
    format: "csv",
  });
  return new Response(artifact.body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${artifact.filename}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
};
