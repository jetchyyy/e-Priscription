// Rough Philippine income tax estimate for a sole proprietor (TRAIN law rates from 2023).
// It is an estimate to compare options, not tax advice. The accountant confirms the real figures.

/** Graduated income tax on taxable income for a year. */
export function graduatedTax(taxable) {
  const t = Math.max(Number(taxable) || 0, 0);
  if (t <= 250_000) return 0;
  if (t <= 400_000) return (t - 250_000) * 0.15;
  if (t <= 800_000) return 22_500 + (t - 400_000) * 0.2;
  if (t <= 2_000_000) return 102_500 + (t - 800_000) * 0.25;
  if (t <= 8_000_000) return 402_500 + (t - 2_000_000) * 0.3;
  return 2_202_500 + (t - 8_000_000) * 0.35;
}

export const EIGHT_PCT_LIMIT = 3_000_000;
export const EXEMPT = 250_000;
export const PERCENTAGE_TAX = 0.03;

/**
 * The three ways a non-VAT sole proprietor can pay, for a year's gross receipts and deductible expenses.
 * The graduated options include the 3% percentage tax; the 8% option replaces both.
 */
export function taxOptions({ gross, expenses }) {
  const g = Math.max(Number(gross) || 0, 0);
  const e = Math.max(Number(expenses) || 0, 0);
  const pct = g * PERCENTAGE_TAX;
  const options = [
    {
      key: 'eight',
      label: '8% on gross receipts',
      available: g <= EIGHT_PCT_LIMIT,
      tax: Math.max(g - EXEMPT, 0) * 0.08,
      how: '8% of gross receipts above ₱250,000. No expenses deducted. Replaces income tax and percentage tax.',
    },
    {
      key: 'osd',
      label: 'Graduated, 40% standard deduction',
      available: true,
      tax: graduatedTax(g * 0.6) + pct,
      how: 'Income tax on 60% of gross receipts, plus 3% percentage tax. No receipts needed for expenses.',
    },
    {
      key: 'itemized',
      label: 'Graduated, actual expenses',
      available: true,
      tax: graduatedTax(g - e) + pct,
      how: 'Income tax on gross receipts minus recorded expenses, plus 3% percentage tax. Needs official receipts.',
    },
  ].map((o) => ({ ...o, tax: Math.round(o.tax * 100) / 100 }));
  const cheapest = options.filter((o) => o.available).reduce((a, b) => (b.tax < a.tax ? b : a));
  return { options, cheapest: cheapest.key };
}
