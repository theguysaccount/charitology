import data from '../data/ripple-effect-kenya-accounts.json' with { type: 'json' };

export function accountsSource(id: string) {
  const found = data.sources.find(source => source.id === id);
  if (!found) throw new Error(`Missing financial statement ${id}`);
  return found;
}

export const rows = data.rows.map(row => ({
  ...row,
  grantMadeLessReceivableGbp: row.grantMadeGbp - row.grantReceivableGbp,
}));

export function accountsCsvRows() {
  return rows.map(({ yearEndBalance, ...row }) => {
    const source = accountsSource(row.source);
    const entity = data.entities.find(entity => entity.id === row.entity);
    if (!entity) throw new Error(`Missing legal entity ${row.entity}`);
    return {
      entity: entity.name, kenyaRegistration: entity.localRegistration,
      ukCharityRegistration: data.parent.charityRegistration,
      periodStart: row.periodStart, periodEnd: row.periodEnd, periodScope: row.periodScope, currency: data.currency,
      grantMadeGbp: row.grantMadeGbp, grantReceivableGbp: row.grantReceivableGbp,
      grantMadeLessReceivableGbp: row.grantMadeLessReceivableGbp, parentReimbursementGbp: row.parentReimbursementGbp,
      subsidiaryRechargeGbp: row.subsidiaryRechargeGbp, balanceDirection: yearEndBalance.direction,
      balanceGbp: yearEndBalance.amountGbp, otherGrantIncomeGbp: row.otherGrantIncomeGbp,
      investmentIncomeGbp: row.investmentIncomeGbp, grantOnTransferGbp: row.grantOnTransferGbp,
      totalIncomeGbp: row.totalIncomeGbp, expenditureAsPrintedGbp: row.expenditureAsPrintedGbp,
      subsidiaryRechargeBlank: row.blankPresentation.subsidiaryRechargeGbp,
      otherGrantIncomeBlank: row.blankPresentation.otherGrantIncomeGbp,
      investmentIncomeBlank: row.blankPresentation.investmentIncomeGbp,
      grantOnTransferBlank: row.blankPresentation.grantOnTransferGbp,
      sourceColumn: row.sourceColumn, statementUrl: source.url, statementSha256: source.sha256,
      parentNote: source.parentNote.number, parentPdfPage: source.parentNote.pdfPage,
      subsidiaryNote: source.entityNote.number, subsidiaryPdfPage: source.entityNote.pdfPage,
    };
  });
}
