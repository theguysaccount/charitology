// Browser storage that never throws. Private windows, blocked storage and
// full quotas all fall back to in-memory behavior, so every tool still works.

const PREFIX = 'charitology.';

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* storage unavailable */
  }
}

/** Encode small state into a URL-safe string for share links (no server involved). */
export function encodeState(value: unknown): string {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeState<T>(text: string): T | undefined {
  try {
    const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return undefined;
  }
}

/** Read a named value from the URL hash, e.g. #c=... */
export function readHash(name: string): string | undefined {
  const params = new URLSearchParams(location.hash.slice(1));
  return params.get(name) ?? undefined;
}

export function writeHash(name: string, value: string | undefined): void {
  const params = new URLSearchParams(location.hash.slice(1));
  if (value === undefined) params.delete(name);
  else params.set(name, value);
  const next = params.toString();
  history.replaceState(null, '', next ? `#${next}` : location.pathname + location.search);
}
