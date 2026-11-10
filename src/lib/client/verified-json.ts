export interface VerifiedJsonAsset {
  bytes: number;
  decodedBytes: number;
  sha256: string;
  decodedSha256: string;
}

async function readBytes(stream: ReadableStream<Uint8Array>, limit: number) {
  const buffer = new Uint8Array(limit);
  const reader = stream.getReader();
  let offset = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return buffer.slice(0, offset);
      if (offset + value.length > limit) throw new Error('The data exceeds its expected size.');
      buffer.set(value, offset);
      offset += value.length;
    }
  } finally { await reader.cancel(); }
}

async function sha256(bytes: Uint8Array<ArrayBuffer>) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function loadVerifiedJson(assetUrl: string, asset: VerifiedJsonAsset): Promise<unknown> {
  if (!globalThis.crypto?.subtle) throw new Error('Use HTTPS to verify this snapshot, or open the official source downloads.');
  const maxSize = Math.max(asset.bytes, asset.decodedBytes);
  if (!Number.isSafeInteger(maxSize) || maxSize < 1 || maxSize > 16_000_000) throw new Error('Unexpected snapshot size.');
  const response = await fetch(assetUrl, { credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !response.body) throw new Error('The financial snapshot could not be downloaded.');
  const raw = await readBytes(response.body, maxSize);
  let decoded = raw;
  if (raw.length === asset.bytes && await sha256(raw) === asset.sha256) {
    if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot open the snapshot. Use the official source downloads.');
    decoded = await readBytes(new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip')), asset.decodedBytes);
  }
  if (decoded.length !== asset.decodedBytes || await sha256(decoded) !== asset.decodedSha256) throw new Error('The financial snapshot did not match its published fingerprint.');
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decoded));
}
