/** SQL parameter transport only. Admission and original canonical wire values stay caller-owned. */
export function participationTimestampParameter(value) {
  if (value == null) return null;
  const text = value instanceof Date ? value.toISOString() : value;
  if (typeof text !== 'string') throw new TypeError('A timestamp parameter needs its admitted string or Date.');
  if (/^\+\d{6}-/.test(text)) return text.slice(1);
  const bc = text.match(/^-(\d{6})(-.+)$/);
  if (bc) return String(Number(bc[1]) + 1).padStart(4, '0') + bc[2] + ' BC';
  if (text.startsWith('0000-')) return '0001' + text.slice(4) + ' BC';
  return text;
}
