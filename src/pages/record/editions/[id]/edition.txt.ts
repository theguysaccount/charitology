import type { APIRoute } from "astro";
import { loadPublicationEditions } from "../../../../lib/publication-editions";
export function getStaticPaths() {
  return loadPublicationEditions().input.editions.map((e) => ({
    params: { id: e.core.id },
    props: { editionId: e.core.id },
  }));
}
export const GET: APIRoute = ({ props }) => {
  const artifact = loadPublicationEditions().input.artifacts.find(
    (a) => a.editionId === props.editionId && a.fileName === "edition.txt",
  );
  if (!artifact) throw Error("The admitted plain-text artifact is missing.");
  return new Response(artifact.text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${props.editionId}.txt"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
};
