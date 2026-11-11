export type BrazilOrder = [id: string, date: string, centsBRL: number, sourceRecord: number];
export type BrazilAgreement = [
  agreementId: string, proposalId: string, cnpj: string, name: string, state: string | null,
  proposalRecord: number, agreementRecord: number, signed: string | null,
  contributionCentsBRL: number | null, orders: BrazilOrder[],
];

export function normalizeBrazilName(value: string) {
  return value.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function formatCnpj(value: string) {
  return value.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5');
}

export function readCnpj(value: string) {
  const compact = value.trim().replace(/[./-]/g, '').toUpperCase();
  if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(compact) || new Set(compact).size === 1) return null;
  const valid = [12, 13].every(position => {
    const remainder = [...compact.slice(0, position)].reverse()
      .reduce((sum, char, index) => sum + (char.charCodeAt(0) - 48) * (2 + index % 8), 0) % 11;
    return Number(compact[position]) === (remainder < 2 ? 0 : 11 - remainder);
  });
  return valid ? compact : null;
}
