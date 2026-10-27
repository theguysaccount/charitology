import type { APIRoute } from "astro";
import { loadDisasters, requireDisasters, disasterArtifactResponse } from "../../../../../../lib/disaster-incidents/public.mjs";
export function getStaticPaths() { return (loadDisasters()?.editions ?? []).flatMap(e=>e.projection.incidents.flatMap(({incident})=>["edition.json","edition.csv"].map(artifact=>({params:{id:e.pin.id,incidentId:incident.id,artifact}})))); }
export const GET: APIRoute = ({params}) => {
  const selected=requireDisasters().selectedIncident(params.id!,params.incidentId!);
  if(!Object.hasOwn(selected.artifacts,params.artifact!)) throw new Error("Unknown exact selected disaster artifact.");
  return disasterArtifactResponse(selected.artifacts[params.artifact!],params.artifact!);
};
