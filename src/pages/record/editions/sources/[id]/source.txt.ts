import type { APIRoute } from "astro";
import { loadPublicationEditions } from "../../../../../lib/publication-editions";
export function getStaticPaths() {
  return loadPublicationEditions().input.sources.map((source) => ({
    params: { id: source.id },
    props: { sourceId: source.id },
  }));
}
export const GET: APIRoute = ({ props }) => {
  const source = loadPublicationEditions().input.sources.find(
    (s) => s.id === props.sourceId,
  );
  if (!source) throw Error("Unknown fixed publication source.");
  return new Response(source.rawUtf8, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
};
