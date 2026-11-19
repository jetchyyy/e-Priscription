// POST /api/paymongo-checkout
//
// Starts an embedded PayMongo payment (Payment Intent) and returns what the page needs to finish it on our site.
// The amount always comes from the database, never the browser.
//   Patient:  { "type": "rx", "rx_id": "<21 chars>", "method": "qrph" }                       (no login needed)
//   Doctor:   { "type": "plan", "plan_id": "solo", "period": "monthly", "seats": 0, "method": "qrph" }
//             { "type": "seats", "seats": 2, "method": "qrph" }
//             { "type": "pack", "pack_id": "pack-25", "quantity": 1, "method": "qrph" }   (doctor's login required)
// Answer: { intent_id, client_key, public_key, status, next_action }
//   qrph:           next_action.code.image_url is the QR to show
//   gcash/paymaya:  next_action.redirect.url is the wallet's approval page (opened in a pop-up)
//   card:           nothing attached yet; the browser sends the card straight to PayMongo with the public key
//                   (card numbers never reach this server), then attaches it with client_key.
// Nothing is marked paid here. That happens only when PayMongo's signed webhook (payment.paid) arrives.
import type { Env } from '../env';
import { json, readJson } from '../http';
import { appUrl, centavos, friendly, pm } from '../paymongo';
import { serviceClient, userClient } from '../supabase';

const METHODS = ['qrph', 'gcash', 'paymaya', 'card'];
const FAILED = 'Could not start the payment. Please try again in a moment.';

/** PayMongo's test-mode simulation link (a `test_url` field somewhere in the answer). Only https links are passed on. */
function findTestUrl(node: unknown, depth = 0): string | null {
  if (!node || typeof node !== 'object' || depth > 6) return null;
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (typeof v === 'string' && /test_?url/i.test(k) && /^https:\/\//.test(v)) return v;
    const found = findTestUrl(v, depth + 1);
    if (found) return found;
  }
  return null;
}

/** public/pay-done.html tells our page the step is done, or sends a full-page visitor on to `next`. */
const doneUrl = (env: Env, next: string) => `${appUrl(env)}/pay-done.html?next=${encodeURIComponent(next)}`;

type Body = {
  type?: string; method?: string; rx_id?: string; plan_id?: string; period?: string;
  seats?: number; pack_id?: string; quantity?: number;
};

export async function paymongoCheckout(req: Request, env: Env): Promise<Response> {
  if (!env.PAYMONGO_SECRET_KEY || !env.PAYMONGO_PUBLIC_KEY) return json({ error: 'Online payment is not set up yet' }, 503);

  const body: Body | null = await readJson<any>(req);
  if (!body?.type || !body.method || !METHODS.includes(body.method)) {
    return json({ error: 'Choose a payment method' }, 400);
  }

  const admin = serviceClient(env);
  let payment: { id: string; reference: string };
  let lineItems: { name: string; amount: number; currency: 'PHP'; quantity: 1; description?: string }[];
  let description: string;
  let returnUrl: string; // where PayMongo sends the wallet pop-up or card check when it is done

  if (body.type === 'rx') {
    if (!/^[A-Za-z0-9_-]{21}$/.test(body.rx_id ?? '')) return json({ error: 'Prescription not found' }, 404);
    const { data, error } = await admin.rpc('gateway_prepare_rx', { p_id: body.rx_id, p_method: body.method });
    if (error) return json({ error: friendly(error) }, error.code === 'P0002' ? 404 : 400);
    // A hosted checkout opened before the switch to embedded payments: send the patient there.
    if (data.reused) return json({ checkout_url: data.checkout_url });

    payment = data;
    const doctor = data.doctor_name ? `Dr. ${String(data.doctor_name).replace(/^dr\.?\s*/i, '')}` : 'your doctor';
    lineItems = [{ name: `Prescription from ${doctor}`, amount: centavos(data.price), currency: 'PHP', quantity: 1 }];
    if (data.fee_mode === 'pass' && Number(data.fee) > 0) {
      lineItems.push({ name: 'Convenience fee', amount: centavos(data.fee), currency: 'PHP', quantity: 1,
                       description: 'Online payment fee. Not refundable.' });
    }
    description = `Prescription ${data.prescription_id}`;
    returnUrl = doneUrl(env, `/rx/${body.rx_id}?paid=1`);
  } else if (['plan', 'seats', 'pack'].includes(body.type)) {
    const user = userClient(env, req);
    if (!user) return json({ error: 'Sign in again to continue' }, 401);
    const { data, error } = await user.rpc('start_gateway_purchase', {
      p_kind: body.type,
      p_method: body.method,
      p_plan_id: body.plan_id ?? null,
      p_period: body.period ?? 'monthly',
      p_seats: Number.isFinite(body.seats) ? body.seats : 0,
      p_pack_id: body.pack_id ?? null,
      p_quantity: Number.isFinite(body.quantity) ? body.quantity : 1,
    });
    if (error) return json({ error: friendly(error) }, error.code === '42501' ? 403 : 400);
    payment = data;
    lineItems = [{ name: data.title, amount: centavos(data.total), currency: 'PHP', quantity: 1 }];
    description = `ODYSSEY E-Prescription: ${data.title}`;
    returnUrl = doneUrl(env, '/doctor/plan?paid=1');
  } else {
    return json({ error: 'Choose what to pay for' }, 400);
  }

  const amount = lineItems.reduce((sum, li) => sum + li.amount, 0);
  const created = await pm(env, '/v1/payment_intents', {
    method: 'POST',
    idempotencyKey: `pi-${payment.id}`,
    body: {
      data: {
        attributes: {
          amount,
          currency: 'PHP',
          capture_type: 'automatic',
          payment_method_allowed: [body.method],
          ...(body.method === 'card' ? { payment_method_options: { card: { request_three_d_secure: 'any' } } } : {}),
          description: `${description} (${payment.reference})`,
          metadata: { gateway_payment_id: payment.id, reference: payment.reference, kind: body.type },
        },
      },
    },
  });
  const intent = created.data?.data;
  if (!created.ok || !intent?.id) {
    console.error('payment_intents failed:', created.status, created.code, created.error);
    return json({ error: FAILED }, 502);
  }

  // The webhook finds the payment by this intent id (stored where the hosted checkout id used to go).
  const { error: attachError } = await admin.rpc('gateway_attach_session', {
    p_id: payment.id, p_session: intent.id, p_url: null, p_livemode: Boolean(intent.attributes?.livemode),
  });
  if (attachError) {
    console.error('gateway_attach_session failed:', attachError.message);
    return json({ error: FAILED }, 502); // without it the webhook could not match the payment
  }

  const answer = {
    intent_id: intent.id,
    client_key: intent.attributes?.client_key,
    public_key: env.PAYMONGO_PUBLIC_KEY,
    status: intent.attributes?.status,
    next_action: null as unknown,
    livemode: Boolean(intent.attributes?.livemode),
    test_url: null as string | null, // test keys only: PayMongo's link that simulates paying the QR
  };
  if (body.method === 'card') return json(answer);

  // QR Ph and e-wallets carry no card data, so the server creates and attaches the method itself.
  const method = await pm(env, '/v1/payment_methods', { method: 'POST', body: { data: { attributes: { type: body.method } } } });
  const methodId = method.data?.data?.id;
  if (!method.ok || !methodId) {
    console.error('payment_methods failed:', method.status, method.code, method.error);
    return json({ error: FAILED }, 502);
  }
  const attached = await pm(env, `/v1/payment_intents/${intent.id}/attach`, {
    method: 'POST',
    body: { data: { attributes: { payment_method: methodId, return_url: returnUrl } } },
  });
  if (!attached.ok) {
    console.error('payment_intents attach failed:', attached.status, attached.code, attached.error);
    return json({ error: FAILED }, 502);
  }
  answer.status = attached.data?.data?.attributes?.status;
  answer.next_action = attached.data?.data?.attributes?.next_action ?? null;
  if (!answer.livemode) answer.test_url = findTestUrl(attached.data);
  return json(answer);
}
