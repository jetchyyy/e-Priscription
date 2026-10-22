import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import DoctorEarnings from './features/doctor/pages/DoctorEarnings';
import AdminMoney from './features/admin/pages/AdminMoney';
import { OnlinePay } from './features/patient/components/OnlinePay';

const methods = [{ method: 'qrph', label: 'QR Ph', fee_pct: 3, fee_fixed: 0, fee_min: 20 }, { method: 'card', label: 'Visa / Mastercard', fee_pct: 5.5, fee_fixed: 15, fee_min: 0 }];
const wrap = (el, seed) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  seed(qc);
  return renderToString(<QueryClientProvider client={qc}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>);
};
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, ' ');

describe('new screens render with sample data', () => {
  it('doctor earnings', () => {
    const html = wrap(<DoctorEarnings />, (qc) => {
      qc.setQueryData(['gateway-config'], { enabled: true, manual_fallback: false, methods });
      qc.setQueryData(['doctor', 'earnings'], {
        settings: { online_enabled: true, fee_mode: 'pass', terms_accepted_at: '2026-10-01', payout_account: { provider: 'instapay', bank_code: 'BNORPHMM', bank_name: 'BDO Unibank', account_name: 'Juan Cruz', account_number: '001234567890' } },
        rules: { enabled: true, hold_days: 7, min_payout: 500, payout_fee: 11.2 },
        balance: { on_hold: 500, available: 970, requested: 0, paid_out: 970, received: 958.8, transfer_fees: 11.2, refunded: 0, earned: 1470, fees_absorbed: 30, fees_passed: 20, balance: 1470, next_release: { at: '2026-10-29T02:00:00Z', amount: 500 } },
        payments: [{ id: '1', prescription_id: 'abcdefghijklmnopqrstu', patient: 'Maria Santos', method: 'qrph', method_label: 'QR Ph', fee_mode: 'pass', price: 500, fee: 20, total: 520, doctor_share: 500, status: 'paid', paid_at: '2026-10-22T02:00:00Z', available_at: '2099-10-29T02:00:00Z', refund: null }],
        payouts: [{ id: 'p1', amount: 970, fee: 11.2, net_amount: 958.8, status: 'sent', bank_name: 'BDO Unibank', account_end: '7890', provider: 'instapay', provider_reference: 'IP123', created_at: '2026-10-20T02:00:00Z', sent_at: '2026-10-20T03:00:00Z' }],
      });
    });
    const t = text(html);
    expect(t).toContain('Earnings and payouts');
    expect(t).toContain('₱970.00');
    expect(t).toContain('₱958.80');
    expect(t).toContain('On hold until');
    expect(t).toContain('₱520.00'); // example: patient pays 500 + 20
    expect(t).toContain('BDO Unibank');
  });

  it('admin overview', () => {
    const html = wrap(<AdminMoney />, (qc) => {
      qc.setQueryData(['admin', 'money', 'overview'], {
        collected: 2340, payments_count: 4, paymongo_cost: 30.5, odyssey_fees: 80, odyssey_sales: 499, payout_fee_diff: 3.2,
        suspense: 420, owed_to_doctors: 1470, doctors_on_hold: 500, doctors_available: 970, doctors_owing: 0,
        payouts_requested: 0, payouts_waiting: 1, paid_out: 970, refunded: 500, needs_review: 3, ledger_total: 1000,
        settled_to_bank: 100, odyssey_earned: 551.7, expected_with_paymongo: 900,
      });
    });
    const t = text(html);
    expect(t).toContain('ODYSSEY earned');
    expect(t).toContain('₱551.70');
    expect(t).toContain('Should be with PayMongo');
    expect(t).toContain('payout waiting');
  });

  it('patient online pay', () => {
    const t = text(renderToString(
      <QueryClientProvider client={new QueryClient()}>
        <OnlinePay rx={{ id: 'x', requires_pin: false }} options={{ fee_mode: 'pass', price: 500, methods: [{ method: 'qrph', label: 'QR Ph', fee: 20, total: 520 }] }} />
      </QueryClientProvider>));
    expect(t).toContain('Convenience fee, QR Ph');
    expect(t).toContain('Pay ₱520.00 with QR Ph');
    expect(t).toContain('not refundable');
  });
});
