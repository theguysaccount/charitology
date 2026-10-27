import type { APIRoute } from "astro";
import { loadResearchLedger } from "../../../../lib/research-ledger";
export async function getStaticPaths() {
  const { input } = await loadResearchLedger();
  return input.sources.map((source: any) => ({
    params: { id: source.id },
    props: { sourceId: source.id },
  }));
}
export const GET: APIRoute = async ({ props }) => {
  const { input } = await loadResearchLedger();
  const source = input.sources.find(
    (source: any) => source.id === props.sourceId,
  );
  if (!source) throw new Error("Unknown inert source snapshot.");
  return new Response(source.text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
};
