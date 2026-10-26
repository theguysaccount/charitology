// Optional public-data resolver. The public site's primary search runs locally.
// No credentials, private organizations, arbitrary URLs or live provider proxy.
import { createRegistry } from "../../../src/lib/irs-registry.mjs";
export const PUBLIC_REGISTRY_ASSETS =
  "https://charitology.org/data/irs-registry/";
export function publicRegistry({ fetcher = fetch } = {}) {
  const registry = createRegistry({
    base: PUBLIC_REGISTRY_ASSETS,
    fetcher,
    cacheSize: 2,
  });
  return {
    lookup: (input) => registry.search(input),
    manifest: () => registry.manifest(),
  };
}
