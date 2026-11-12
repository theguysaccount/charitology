import data from '../data/kenya-nutrition-trace.json' with { type: 'json' };

type Publisher = keyof typeof data.captures;

function getRow(publisher: Publisher, row: number) {
  const record = data.captures[publisher].transactions.find(transaction => transaction.row === row);
  if (!record) throw new Error(`Missing ${publisher} transaction ${row}`);
  return record;
}

export const stages = [
  {
    id: 'manager-to-uk',
    left: 'manager',
    right: 'uk',
    rows: data.managerToUkPairs.map(pair => ({
      left: getRow('manager', pair.managerRow), right: getRow('uk', pair.ukRow),
      quarter: null, difference: '0.00', sameDate: pair.sameDate,
    })),
  },
  {
    id: 'uk-to-kenya',
    left: 'uk',
    right: 'kenya',
    rows: data.ukToKenyaPairs.map(pair => ({
      left: getRow('uk', pair.ukRow), right: getRow('kenya', pair.kenyaRow),
      quarter: pair.quarter, difference: pair.ukLessKenyaGbp, sameDate: true,
    })),
  },
] as const;

export const expenditurePublishers = ['uk', 'kenya'] as const;
export const expenditure = expenditurePublishers.flatMap(publisher => {
  const capture = data.captures[publisher];
  return capture.transactions.filter(row => row.type === '4').map(row => ({
    publisher: capture.publisher, activityId: capture.activityId,
    sourceUrl: capture.url, sourceSha256: capture.sha256, transactionRow: row.row,
    reference: row.ref, reportedDate: row.date, valueDate: row.valueDate,
    originalTypeCode: row.type, amount: row.amount, currency: row.currency,
  }));
});

export function exportPairs() {
  return stages.flatMap(stage => stage.rows.map(row => ({
    stage: stage.id, currency: row.left.currency, reportedQuarter: row.quarter,
    leftPublisher: data.captures[stage.left].publisher, leftActivity: data.captures[stage.left].activityId,
    leftSourceUrl: data.captures[stage.left].url, leftRow: row.left.row, leftReference: row.left.ref,
    leftDate: row.left.date, leftValueDate: row.left.valueDate, leftTypeCode: row.left.type, leftAmount: row.left.amount,
    grantManagerReference: 'grantRef' in row.left ? row.left.grantRef : null,
    rightPublisher: data.captures[stage.right].publisher, rightActivity: data.captures[stage.right].activityId,
    rightSourceUrl: data.captures[stage.right].url, rightRow: row.right.row, rightReference: row.right.ref,
    rightDate: row.right.date, rightValueDate: row.right.valueDate, rightTypeCode: row.right.type, rightAmount: row.right.amount,
    leftLessRightGbp: row.difference,
  })));
}
