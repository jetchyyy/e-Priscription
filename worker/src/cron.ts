// The Worker's 15-minute job (wrangler.jsonc triggers.crons). Each step runs on its own, so one failing does not
// stop the others, and every step is safe to repeat: a missed or doubled tick changes nothing.
//   0. Confirms open payments with PayMongo directly, in case a webhook was missed (confirm.ts).
//   1. Records what PayMongo kept from its recent payouts to ODYSSEY's wallet (the digital tax).
//   2. From Saturday 00:00 Manila, for 72 hours: prepares each doctor's weekly payout (the database does nothing
//      outside that window or for a doctor already paid this week).
//   3. Sends prepared weekly payouts whose account name matches the verified doctor, while the wallet covers them.
//      The rest wait in Admin -> Money -> Payouts.
import { confirmOpenPayments } from './confirm';
import type { Env } from './env';
import { pm } from './paymongo';
import {
  MAX_DEDUCTION_SHARE, SKIPPED_PAYOUT_STATUSES, payoutDetails, sendClaimedPayout, walletAvailableCentavos,
  type ClaimedPayout,
} from './payouts';
import { serviceClient, type Db } from './supabase';

export async function syncPayoutDeductions(env: Env, db: Db, list = listPayouts) {
  const payouts = await list(env);
  let recorded = 0;
  for (const p of payouts) {
    if (!p.id || SKIPPED_PAYOUT_STATUSES.has(p.status.toLowerCase()) || !p.netCentavos || !p.keptCentavos) continue;
    if (p.keptCentavos > p.amountCentavos * MAX_DEDUCTION_SHARE) {
      console.error('NEEDS A PERSON: PayMongo payout', p.id, 'kept', p.keptCentavos, 'of', p.amountCentavos,
                    'centavos, more than a digital tax. Not recorded. Fields:', JSON.stringify(p.details));
      continue;
    }
    const { data, error } = await db.rpc('cron_record_payout_deduction', {
      p_payout_id: p.id,
      p_amount: p.keptCentavos / 100,
      p_occurred_at: Number.isFinite(p.createdAtMs) ? new Date(p.createdAtMs).toISOString() : null,
      p_livemode: p.livemode,
      p_details: p.details,
    });
    if (error) throw new Error(`cron_record_payout_deduction failed: ${error.message}`);
    if (data) recorded += 1;
  }
  return { recorded };
}

async function listPayouts(env: Env) {
  const res = await pm(env, '/v1/payouts?limit=20');
  if (!res.ok) throw new Error(`GET /v1/payouts failed: ${res.error}`);
  return (res.data?.data ?? []).map(payoutDetails);
}

export async function sendWeeklyPayouts(env: Env, db: Db, wallet = walletAvailableCentavos) {
  const { data: due, error } = await db.rpc<{ id: string; net_amount: number }[]>('cron_payouts_to_send');
  if (error) throw new Error(`cron_payouts_to_send failed: ${error.message}`);
  if (!due?.length) return { sent: 0, postponed: 0 };

  let left = await wallet(env);
  if (left == null) {
    console.error('weekly payouts postponed: could not read the PayMongo Wallet balance');
    return { sent: 0, postponed: due.length };
  }
  let sent = 0;
  let postponed = 0;
  for (const p of due) {
    const cents = Math.round(Number(p.net_amount) * 100);
    if (cents > left) {
      postponed += 1; // tried again next tick, once PayMongo has settled more into the wallet
      continue;
    }
    const { data: po, error: e } = await db.rpc<ClaimedPayout | null>('cron_begin_payout', { p_id: p.id });
    if (e) { console.error('cron_begin_payout failed:', e.message); continue; }
    if (!po) continue; // an admin sent or changed it meanwhile
    const { outcome, detail } = await sendClaimedPayout(env, db, po);
    if (outcome === 'accepted' || outcome === 'succeeded') { sent += 1; left -= cents; }
    else console.error('weekly payout', po.id, outcome, detail ?? '');
  }
  if (postponed) console.error(`weekly payouts: ${postponed} postponed, the PayMongo Wallet does not cover them yet`);
  return { sent, postponed };
}

export async function runScheduled(env: Env): Promise<void> {
  if (!env.PAYMONGO_SECRET_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) return;
  const db = serviceClient(env);
  const failures: string[] = [];
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      const r: any = await fn();
      if (r && (r.confirmed || r.recorded || r.created || r.sent || r.postponed)) console.log(name, JSON.stringify(r));
    } catch (e) {
      failures.push(`${name}: ${(e as Error).message}`);
    }
  };

  await step('confirm', () => confirmOpenPayments(env, db));
  await step('deductions', () => syncPayoutDeductions(env, db));
  await step('prepare', async () => {
    const { data, error } = await db.rpc('cron_prepare_weekly_payouts');
    if (error) throw new Error(error.message);
    return data;
  });
  await step('send', () => sendWeeklyPayouts(env, db));

  if (failures.length) throw new Error(failures.join(' | ')); // shows as a failed cron run in Cloudflare
}
