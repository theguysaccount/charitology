export interface RegistryOrganization { ein: string; name: string; city: string | null; state: string | null; country: null; registryJurisdiction: 'US'; subsection: string | null; status: string | null; deductibility: string | null; sourceRegion: number; sourceUrl: string; sourceSha256: string; sourceRetrievedAt: string; sourceRecordCount: number; dataDate: string; }
export interface RegistryResult { ok: true; organizations: RegistryOrganization[]; total: number; truncated: boolean; query: { kind: string; ein?: string; name?: string; state: string; limit: number }; coverage: string; source: { name: string; url: string }; dataDate: string; queriedAt: string; }
export interface RegistryManifest { recordCount: number; dataDate: string; coverage: string; compressedBytes: number; sources: { region: number; url: string; sha256: string; bytes: number; rows: number; }[]; }
export function createRegistry(options: { base: string; fetcher?: typeof fetch; decode?: (bytes: Uint8Array, max: number) => Promise<Uint8Array>; digest?: (bytes: Uint8Array) => Promise<Uint8Array>; cacheSize?: number }): { manifest(): Promise<RegistryManifest>; search(input: { q?: string; ein?: string; state?: string; limit?: number }): Promise<RegistryResult>; clearCache(): void };
export function statusLabel(code: string | null): string;
export function deductibilityLabel(code: string | null): string;
export const IRS_SOURCE: string;
export const IRS_CODES: string;
