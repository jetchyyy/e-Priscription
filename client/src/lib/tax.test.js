import { describe, expect, it } from 'vitest';
import { graduatedTax, taxOptions } from './tax';

describe('graduatedTax', () => {
  it('is zero up to 250,000', () => expect(graduatedTax(250_000)).toBe(0));
  it('matches the bracket starts', () => {
    expect(graduatedTax(400_000)).toBe(22_500);
    expect(graduatedTax(800_000)).toBe(102_500);
    expect(graduatedTax(2_000_000)).toBe(402_500);
    expect(graduatedTax(8_000_000)).toBe(2_202_500);
  });
});

describe('taxOptions', () => {
  it('matches the worked example for ₱1,000,000 gross', () => {
    const at = (expenses) => Object.fromEntries(taxOptions({ gross: 1_000_000, expenses }).options.map((o) => [o.key, o.tax]));
    expect(at(300_000)).toEqual({ eight: 60_000, osd: 92_500, itemized: 112_500 });
    expect(at(500_000)).toEqual({ eight: 60_000, osd: 92_500, itemized: 72_500 });
    expect(at(700_000)).toEqual({ eight: 60_000, osd: 92_500, itemized: 37_500 });
  });
  it('picks the cheapest available option', () => {
    expect(taxOptions({ gross: 1_000_000, expenses: 300_000 }).cheapest).toBe('eight');
    expect(taxOptions({ gross: 1_000_000, expenses: 700_000 }).cheapest).toBe('itemized');
  });
  it('8% is not available above ₱3,000,000', () => {
    const r = taxOptions({ gross: 3_500_000, expenses: 0 });
    expect(r.options.find((o) => o.key === 'eight').available).toBe(false);
    expect(r.cheapest).not.toBe('eight');
  });
});
