import type { APIRoute } from "astro";
import { loadPublicationEditions } from "../../../../lib/publication-editions";
import { makePublicationDownload } from "../../../../lib/publication-editions-model.mjs";
export function getStaticPaths() {
  return loadPublicationEditions().input.editions.map((e) => ({
    params: { id: e.core.id },
    props: { editionId: e.core.id },
  }));
}
export const GET: APIRoute = ({ props }) => {
  const bytes = makePublicationDownload(
    loadPublicationEditions().input,
    props.editionId,
    { format: "json" },
  );
  return new Response(new TextDecoder().decode(bytes), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${props.editionId}.json"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
};
