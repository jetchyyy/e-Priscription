// Run: npm run test:worker
import { describe, expect, it } from 'vitest';
import { sendWeeklyPayouts, syncPayoutDeductions } from './cron';
import { payoutDetails } from './payouts';

const env = { PAYMONGO_SECRET_KEY: 'sk_test_x' } as any;

function fakeDb(answers: Record<string, unknown> = {}) {
  const calls: { name: string; args: any }[] = [];
  return {
    calls,
    rpc: async (name: string, args: any = {}) => {
      calls.push({ name, args });
      const a = answers[name];
      return { data: typeof a === 'function' ? (a as any)(args) : a ?? true, error: null };
    },
  } as any;
}

describe('payoutDetails', () => {
  // A real ODC Courts payout: gross ₱120.00, fees ₱1.80, digital tax ₱0.59, net ₱117.61.
  it('kept = the digital tax when fees are on the payout', () => {
    const p = payoutDetails({ id: 'po_1', attributes: { amount: 12000, fee: 180, adjustment_amount: -59, digital_tax: 59, tax_amount: 59, net_amount: 11761, status: 'in_transit', created_at: 1794356760 } });
    expect(p.keptCentavos).toBe(59);
    expect(p.createdAtMs).toBe(1794356760000);
  });
  it('kept = the digital tax when the amount is already net of fees', () => {
    expect(payoutDetails({ id: 'po_1', attributes: { amount: 11820, fee: 0, net_amount: 11761 } }).keptCentavos).toBe(59);
  });
  it('refunds and disputes are not deductions', () => {
    expect(payoutDetails({ id: 'po_2', attributes: { amount: 20000, fee: 300, refund_amount: 4000, dispute_amount: 1000, net_amount: 14600 } }).keptCentavos).toBe(100);
  });
});

describe('syncPayoutDeductions', () => {
  it('records settled payouts only, and not amounts too big to be the tax', async () => {
    const db = fakeDb();
    const list = async () => [
      payoutDetails({ id: 'po_ok', attributes: { amount: 12000, fee: 180, net_amount: 11761, status: 'in_transit', livemode: true } }),
      payoutDetails({ id: 'po_failed', attributes: { amount: 12000, fee: 180, net_amount: 11761, status: 'failed' } }),
      payoutDetails({ id: 'po_pending', attributes: { amount: 12000, fee: 180, net_amount: 11761, status: 'pending' } }),
      payoutDetails({ id: 'po_none', attributes: { amount: 12000, fee: 180, net_amount: 11820, status: 'paid' } }),
      payoutDetails({ id: 'po_big', attributes: { amount: 12000, fee: 0, net_amount: 11761, status: 'paid' } }),
    ];
    const err = console.error; console.error = () => {};
    try { expect(await syncPayoutDeductions(env, db, list)).toEqual({ recorded: 1 }); } finally { console.error = err; }
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0].args).toMatchObject({ p_payout_id: 'po_ok', p_amount: 0.59, p_livemode: true });
  });
});

describe('sendWeeklyPayouts', () => {
  it('sends nothing when the wallet balance cannot be read', async () => {
    const db = fakeDb({ cron_payouts_to_send: [{ id: 'a', net_amount: 100 }] });
    const err = console.error; console.error = () => {};
    try { expect(await sendWeeklyPayouts(env, db, async () => null)).toEqual({ sent: 0, postponed: 1 }); } finally { console.error = err; }
    expect(db.calls.map((c: any) => c.name)).toEqual(['cron_payouts_to_send']);
  });
  it('only claims payouts the wallet covers', async () => {
    const db = fakeDb({ cron_payouts_to_send: [{ id: 'big', net_amount: 900 }, { id: 'small', net_amount: 100 }], cron_begin_payout: null });
    const err = console.error; console.error = () => {};
    try { await sendWeeklyPayouts(env, db, async () => 50_000); } finally { console.error = err; } // ₱500 in the wallet
    expect(db.calls.filter((c: any) => c.name === 'cron_begin_payout').map((c: any) => c.args.p_id)).toEqual(['small']);
  });
});
