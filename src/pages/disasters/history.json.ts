import type { APIRoute } from "astro";
import { loadDisasters, disasterArtifactResponse } from "../../lib/disaster-incidents/public.mjs";
export const GET: APIRoute = () => {
  const data=loadDisasters();
  return data ? disasterArtifactResponse(data.history,"disaster-history.json") : new Response(null,{status:404});
};
