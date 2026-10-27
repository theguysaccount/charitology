import type { APIRoute } from "astro";
import { loadObservations } from "../../lib/observations";
import { observationHistoryExport } from "../../lib/observation-model.mjs";

export const GET: APIRoute = () => {
  const artifact = observationHistoryExport(loadObservations().input);
  return new Response(artifact.body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${artifact.filename}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
};
