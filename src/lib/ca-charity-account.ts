export const charityAccountPattern = /^[0-9]{9}RR[0-9]{4}$/;

export function normalizeCharityAccount(value: string) {
  return value.toUpperCase().replace(/[\s-]/g, '');
}

export function formatCad(value: string | null) {
  if (value === null) return 'Not supplied';
  const [whole, fraction] = value.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `CAD ${grouped}${fraction ? '.' + fraction : ''}`;
}
