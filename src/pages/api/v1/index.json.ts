import type { APIRoute } from "astro";
import { API_LICENSE_SUMMARY, ENDPOINTS } from "../../../lib/api";
import { absolute } from "../../../lib/site";

export const GET: APIRoute = async ({ site }) => {
  const body = {
    name: "Charitology Public API",
    version: 1,
    license: API_LICENSE_SUMMARY,
    docs: absolute("/tools/public-api/", site),
    endpoints: ENDPOINTS.map((e) => ({
      name: e.name,
      description: e.description,
      url: absolute(`/api/v1/${e.name}.json`, site),
    })),
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
