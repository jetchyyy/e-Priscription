// POST /api/payment-webhook   (registered in the PayMongo dashboard)
//
// The only path that marks online payments paid, and that finishes payouts and refunds.
// 1. Verifies the Paymongo-Signature header against the raw body, before parsing anything.
// 2. Ignores events from the other mode (test events when running live keys, and the other way round).
// 3. Turns payment.paid (embedded payments, Payment Intents) into the checkout shape the database already handles.
// 4. Hands the event to gateway_handle_event(), which handles each event id once, in one transaction.
//    If that fails we answer 500 and PayMongo retries (up to 12 times).
import type { Env } from '../env';
import { json } from '../http';
import { isLiveKey } from '../paymongo';
import { verifyPaymongoSignature } from '../signature';
import { serviceClient } from '../supabase';

export async function paymentWebhook(req: Request, env: Env): Promise<Response> {
  const secret = env.PAYMONGO_WEBHOOK_SECRET;
  if (!secret || !env.PAYMONGO_SECRET_KEY) return json({ error: 'server_not_configured' }, 500);

  const raw = await req.text();
  const mode = await verifyPaymongoSignature(secret, raw, req.headers.get('paymongo-signature') ?? '');
  if (!mode) return json({ error: 'invalid_signature' }, 401);
  if ((mode === 'live') !== isLiveKey(env)) return json({ ok: true, ignored: 'other_mode' });

  let event: unknown;
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ ok: true, ignored: 'invalid_json' });
  }

  const { data, error } = await serviceClient(env).rpc('gateway_handle_event', { p_event: asCheckoutEvent(event) });
  if (error) {
    console.error('gateway_handle_event failed:', error.code, error.message); // never log payloads (patient data)
    return json({ error: 'internal_error' }, 500);
  }
  return json({ ok: true, result: data?.result ?? null, duplicate: data?.duplicate ?? false });
}

/**
 * payment.paid carries one payment of a Payment Intent. gateway_handle_event() settles checkout_session.payment.paid,
 * matching the payment by its checkout id, where the Worker stores the intent id. So it is passed on in that shape,
 * with the same event id (each event is still handled once). Other events pass through unchanged.
 */
export function asCheckoutEvent(event: any): unknown {
  const attrs = event?.data?.attributes;
  const payment = attrs?.data;
  const intentId = payment?.attributes?.payment_intent_id;
  if (attrs?.type !== 'payment.paid' || !intentId) return event;
  return {
    ...event,
    data: {
      ...event.data,
      attributes: {
        ...attrs,
        type: 'checkout_session.payment.paid',
        data: {
          id: intentId,
          attributes: { reference_number: payment.attributes?.metadata?.reference ?? null, payments: [payment] },
        },
      },
    },
  };
}
