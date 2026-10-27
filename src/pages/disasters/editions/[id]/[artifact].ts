import type { APIRoute } from "astro";
import { loadDisasters, requireDisasters, disasterArtifactResponse } from "../../../../lib/disaster-incidents/public.mjs";
export function getStaticPaths() { return (loadDisasters()?.editions ?? []).flatMap(e=>Object.keys(e.artifacts).map(artifact=>({params:{id:e.pin.id,artifact}}))); }
export const GET: APIRoute = ({params}) => {
  const e=requireDisasters().editions.find(e=>e.pin.id===params.id);
  if(!e || !Object.hasOwn(e.artifacts,params.artifact!)) throw new Error("Unknown exact disaster artifact.");
  return disasterArtifactResponse(e.artifacts[params.artifact!],params.artifact!);
};
