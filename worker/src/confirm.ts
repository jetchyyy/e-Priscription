// Confirming a payment by asking PayMongo directly, for when its webhook is late or never arrives
// (no webhook set up yet, a wrong PAYMONGO_WEBHOOK_SECRET, an outage). Same idea as the ODC Courts cron.
// Safe to repeat and to race the webhook: PayMongo's own answer is used, never the browser's, and the database
// settles a payment once (a second confirmation returns 'already').
import type { Env } from './env';
import { json, readJson } from './http';
import { isLiveKey, pm } from './paymongo';
import { serviceClient, type Db } from './supabase';

const INTENT_ID = /^pi_[A-Za-z0-9]{10,60}$/;

/** Reads the intent from PayMongo and, when it has a paid payment, settles it like the webhook would. */
export async function confirmIntent(env: Env, db: Db, intentId: string): Promise<string> {
  if (!INTENT_ID.test(intentId)) return 'invalid_intent';
  const res = await pm(env, `/v1/payment_intents/${intentId}`);
  if (!res.ok) return res.status === 404 ? 'unknown_intent' : 'paymongo_unavailable';
  const intent = res.data?.data;
  const a = intent?.attributes ?? {};
  if (Boolean(a.livemode) !== isLiveKey(env)) return 'other_mode';
  const paid = (a.payments ?? []).find((p: any) => (p?.attributes?.status ?? p?.status) === 'paid');
  if (a.status !== 'succeeded' || !paid) return `not_paid:${a.status ?? 'unknown'}`;

  // The same shape the webhook hands over. The event id is our own, so it never clashes with PayMongo's.
  const event = {
    data: {
      id: `confirm:${paid.id}`,
      attributes: {
        type: 'checkout_session.payment.paid',
        livemode: Boolean(a.livemode),
        data: { id: intent.id, attributes: { reference_number: a.metadata?.reference ?? null, payments: [paid] } },
      },
    },
  };
  const { data, error } = await db.rpc('gateway_handle_event', { p_event: event });
  if (error) throw new Error(`gateway_handle_event failed: ${error.message}`);
  return data?.duplicate ? 'duplicate' : String(data?.result ?? 'ignored');
}

// POST /api/paymongo-confirm   (no login: the answer always comes from PayMongo, never the browser)
//   { "intent_id": "pi_..." }   the page saw this payment succeed
//   { "rx_id": "<21 chars>" }   the prescription page opened while unpaid: check its open payments (newest 3, 2 hours)
export async function paymongoConfirm(req: Request, env: Env): Promise<Response> {
  if (!env.PAYMONGO_SECRET_KEY) return json({ error: 'Online payment is not set up yet' }, 503);
  const body = await readJson<{ intent_id?: string; rx_id?: string }>(req);
  const db = serviceClient(env);
  if (body?.rx_id !== undefined) {
    if (!/^[A-Za-z0-9_-]{21}$/.test(String(body.rx_id))) return json({ result: 'invalid_rx' });
    const { data, error } = await db.rpc<string[]>('cron_open_intents_for_rx', { p_rx: body.rx_id });
    if (error) return json({ result: 'unavailable' }); // e.g. migration 0021 not applied yet
    const results = [];
    for (const id of data ?? []) results.push(await confirmIntent(env, db, id));
    return json({ results });
  }
  return json({ result: await confirmIntent(env, db, String(body?.intent_id ?? '')) });
}

/** Cron: open embedded payments from the last 2 hours, checked with PayMongo. */
export async function confirmOpenPayments(env: Env, db: Db) {
  const { data, error } = await db.rpc<string[]>('cron_open_intents');
  if (error) throw new Error(`cron_open_intents failed: ${error.message}`);
  let confirmed = 0;
  for (const id of data ?? []) {
    const r = await confirmIntent(env, db, id);
    if (!r.startsWith('not_paid') && r !== 'duplicate' && r !== 'already') confirmed += 1;
  }
  return { confirmed };
}
