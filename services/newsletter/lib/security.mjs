import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
export const newToken = () => randomBytes(32).toString('base64url');
export const hashToken = value => createHash('sha256').update(value).digest('hex');
export const validToken = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
export function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(email)) return null;
  const [local, domain] = email.split('@');
  return local.length <= 64 && !local.startsWith('.') && !local.endsWith('.') && !local.includes('..') && domain.split('.').every(x => x.length <= 63) ? email : null;
}
export function authorized(request, expected) {
  if (expected.length < 32) return false;
  const received = request.headers.get('authorization') || '';
  const a = createHash('sha256').update(received).digest();
  const b = createHash('sha256').update(`Bearer ${expected}`).digest();
  return timingSafeEqual(a, b);
}
export function rateKeys(request, email, secret, now = Date.now()) {
  if (secret.length < 32) throw new Error('Rate secret missing');
  // Vercel overwrites this header at its trusted edge. Never use arbitrary x-forwarded-for.
  const ip = (request.headers.get('x-vercel-forwarded-for') || 'unknown').slice(0, 200);
  const key = value => createHmac('sha256', secret).update(value).digest('hex');
  return [
    { key: `ip:${key(ip)}:${Math.floor(now / 3600000)}`, limit: 8 },
    { key: `email:${key(email)}:${Math.floor(now / 900000)}`, limit: 1 },
    { key: `global:${Math.floor(now / 86400000)}`, limit: 50 },
  ].sort((a, b) => a.key.localeCompare(b.key));
}
export class InputError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
export async function boundedBody(request, maximum = 16384) {
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > maximum) throw new InputError('Request is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new InputError('Request is too large.', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}
export async function fields(request) {
  const body = await boundedBody(request);
  const type = request.headers.get('content-type') || '';
  let entries;
  try {
    if (type.startsWith('application/json')) {
      const value = JSON.parse(body);
      if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error();
      entries = Object.entries(value);
    } else if (type.startsWith('multipart/form-data') || type.startsWith('application/x-www-form-urlencoded')) {
      const data = await new Response(body, { headers: { 'content-type': type } }).formData();
      entries = [...data.entries()];
    } else throw new InputError('Use a form or JSON request.', 415);
  } catch (error) { if (error instanceof InputError) throw error; throw new InputError('The form could not be read.'); }
  const result = Object.create(null);
  if (entries.length > 12) throw new InputError('Too many fields.');
  for (const [key, value] of entries) {
    if (typeof value !== 'string' || value.length > 1000 || Object.hasOwn(result, key)) throw new InputError('Invalid or repeated form field.');
    result[key] = value;
  }
  return result;
}
