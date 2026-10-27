import type { APIRoute } from "astro";
import { loadResearchLedger } from "../../../../lib/research-ledger";
import { researchLedgerExport } from "../../../../lib/research-ledger-model.mjs";
export async function getStaticPaths() {
  const { editions } = await loadResearchLedger();
  return editions.map((edition: any) => ({
    params: { id: edition.edition.id },
    props: { editionId: edition.edition.id },
  }));
}
export const GET: APIRoute = async ({ props }) => {
  const { editions } = await loadResearchLedger();
  const projection = editions.find(
    (edition: any) => edition.edition.id === props.editionId,
  );
  if (!projection) throw new Error("Unknown pinned edition.");
  const output = researchLedgerExport(projection, {
    format: "json",
    eventIds: null,
  });
  return new Response(output.text, {
    headers: {
      "Content-Type": output.mime,
      "Content-Disposition": `attachment; filename="${output.fileName}"`,
    },
  });
};
