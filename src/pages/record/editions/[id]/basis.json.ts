import type { APIRoute } from "astro";
import { loadPublicationEditions } from "../../../../lib/publication-editions";
import { makeProposalBasisBundle } from "../../../../lib/publication-editions-model.mjs";
export function getStaticPaths() {
  return loadPublicationEditions().input.editions.map((e) => ({
    params: { id: e.core.id },
    props: { editionId: e.core.id },
  }));
}
export const GET: APIRoute = ({ props }) =>
  new Response(
    makeProposalBasisBundle(loadPublicationEditions().input, props.editionId),
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
