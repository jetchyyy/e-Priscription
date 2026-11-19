// Sending doctor payouts from ODYSSEY's PayMongo Wallet, and reading what PayMongo kept from its own payouts.
// Used by the admin's "Send" button (routes/paymongo-ops.ts) and the Saturday run (cron.ts).
import type { Env } from './env';
import { centavos, pm } from './paymongo';
import type { Db } from './supabase';

/** A payout already claimed for sending (admin_begin_payout or cron_begin_payout). */
export type ClaimedPayout = {
  id: string; net_amount: number; provider: string; bank_code: string;
  account_name: string; account_number: string; reference: string; doctor_id: string;
};

export type SendOutcome = 'accepted' | 'succeeded' | 'rejected' | 'unknown';

/** ODYSSEY's wallet account that payouts are sent from. Set PAYMONGO_SOURCE_ACCOUNT_* to skip the lookup. */
export async function sourceAccount(env: Env) {
  const number = env.PAYMONGO_SOURCE_ACCOUNT_NUMBER;
  const name = env.PAYMONGO_SOURCE_ACCOUNT_NAME;
  const bic = env.PAYMONGO_SOURCE_ACCOUNT_BIC;
  if (number && name && bic) return { number, name, bic };
  const res = await pm(env, '/v2/wallets');
  if (!res.ok) return null;
  const wallet = (res.data?.data ?? [])[0];
  const src = wallet?.source_account ?? wallet?.attributes?.source_account;
  if (!src?.number) return null;
  return { number: String(src.number), name: String(src.name ?? ''), bic: String(src.bic ?? 'PAEYPHM2XXX') };
}

/** The wallet's available balance in centavos, or null when it cannot be read. */
export async function walletAvailableCentavos(env: Env): Promise<number | null> {
  const res = await pm(env, '/v2/wallets');
  if (!res.ok) return null;
  const w = (res.data?.data ?? [])[0];
  const a = w?.attributes ?? w;
  const v = a?.available_balance ?? a?.balance?.available;
  return v == null || !Number.isFinite(Number(v)) ? null : Number(v);
}

/**
 * Sends one claimed payout through PayMongo (Idempotency-Key = the payout id, so a retry never pays twice)
 * and records the answer with gateway_payout_result.
 */
export async function sendClaimedPayout(env: Env, svc: Db, po: ClaimedPayout): Promise<{ outcome: SendOutcome; detail: string | null }> {
  const src = await sourceAccount(env);
  if (!src) {
    await svc.rpc('gateway_payout_result', { p_id: po.id, p_outcome: 'rejected', p_transfer_id: null, p_fee: null,
                                             p_detail: 'ODYSSEY wallet account not found. Check that the PayMongo Wallet is active.' });
    return { outcome: 'rejected', detail: 'ODYSSEY’s PayMongo wallet was not found' };
  }

  const res = await pm(env, '/v2/batch_transfers', {
    method: 'POST',
    idempotencyKey: `payout-${po.id}`,
    body: {
      transfers: [{
        provider: po.provider,
        amount: centavos(po.net_amount),
        currency: 'PHP',
        purpose: 'Doctor payout',
        description: 'ODYSSEY E-Prescription payout',
        reference_number: po.reference,
        source_account: src,
        destination_account: { number: po.account_number, name: po.account_name, bic: po.bank_code },
        metadata: { payout_id: po.id, doctor_id: po.doctor_id },
      }],
    },
  });

  const tr = res.data?.data?.transfers?.[0];
  let outcome: SendOutcome;
  if (res.ok && tr) outcome = tr.status === 'succeeded' ? 'succeeded' : tr.status === 'failed' ? 'rejected' : 'accepted';
  else if (res.status >= 400 && res.status < 500 && res.status !== 409) outcome = 'rejected';
  else outcome = 'unknown';

  const detail = tr?.provider_error || res.error || null;
  const { error } = await svc.rpc('gateway_payout_result', {
    p_id: po.id, p_outcome: outcome, p_transfer_id: tr?.id ?? null,
    p_fee: tr?.fee != null ? Number(tr.fee) / 100 : null, p_detail: detail,
  });
  if (error) console.error('gateway_payout_result failed:', error.message);
  return { outcome, detail };
}

// ---------------------------------------------------------------------------------------------------------
// PayMongo's payouts to ODYSSEY's wallet (GET /v1/payouts) and what it kept from them (the digital tax).
// ---------------------------------------------------------------------------------------------------------
const PAYOUT_FIELDS = ['amount', 'net_amount', 'fee', 'foreign_fee', 'refund_amount', 'dispute_amount',
  'adjustment_amount', 'tax_amount', 'digital_tax', 'digital_withholding_vat_amount', 'currency', 'status'];

/** Skipped: not settled (yet). */
export const SKIPPED_PAYOUT_STATUSES = new Set(['failed', 'cancelled', 'canceled', 'pending']);
/** More than this share of a payout kept is not a 0.5% tax: logged for a person instead of recorded. */
export const MAX_DEDUCTION_SHARE = 0.016;

const toMillis = (v: unknown) => {
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return n < 1e12 ? n * 1000 : n;
  const t = Date.parse(String(v ?? ''));
  return Number.isFinite(t) ? t : NaN;
};

/**
 * One PayMongo payout, amounts in centavos. `keptCentavos` is what PayMongo kept beyond fees, refunds and disputes
 * (the digital tax), worked out from the totals so a deduction listed under several fields is never counted twice.
 */
export function payoutDetails(p: any) {
  const a = p?.attributes ?? p ?? {};
  const c = (v: unknown) => Math.abs(Math.round(Number(v) || 0));
  const amount = c(a.amount);
  const net = c(a.net_amount);
  const kept = amount - net - c(a.fee) - c(a.foreign_fee) - c(a.refund_amount) - c(a.dispute_amount);
  return {
    id: p?.id as string | undefined,
    status: String(a.status ?? ''),
    createdAtMs: toMillis(a.created_at),
    livemode: Boolean(a.livemode),
    amountCentavos: amount,
    netCentavos: net,
    keptCentavos: Math.max(0, kept),
    details: Object.fromEntries(PAYOUT_FIELDS.filter((k) => a[k] !== undefined).map((k) => [k, a[k]])),
  };
}
