import type { APIRoute } from "astro";
import { loadObservations } from "../../../../lib/observations";
import { observationExport } from "../../../../lib/observation-model.mjs";

export function getStaticPaths() {
  return loadObservations().input.registry.editions.map((edition) => ({
    params: { id: edition.id },
    props: { editionId: edition.id },
  }));
}
export const GET: APIRoute = ({ props }) => {
  const artifact = observationExport(loadObservations().input, {
    editionId: props.editionId,
    filter: { entityIds: [], measureIds: [], state: "all" },
    format: "json",
  });
  return new Response(artifact.body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${artifact.filename}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
};
