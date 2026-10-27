import type { APIRoute } from "astro";
import { loadObservations } from "../../../lib/observations";

export function getStaticPaths() {
  const archive = loadObservations();
  return [
    "registry.json",
    ...archive.input.registry.files.map((f) => f.path),
  ].map((path) => ({ params: { file: path }, props: { path } }));
}
export const GET: APIRoute = ({ props }) => {
  const path: string = props.path;
  const bytes = loadObservations().file(path);
  return new Response(Uint8Array.from(bytes).buffer, {
    headers: {
      "Content-Type": path.endsWith(".json")
        ? "application/json; charset=utf-8"
        : "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
};
