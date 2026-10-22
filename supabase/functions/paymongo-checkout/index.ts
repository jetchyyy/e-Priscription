// POST /functions/v1/paymongo-checkout
//
// Opens a PayMongo hosted checkout and returns its URL. The amount always comes from the database, never the browser.
//   Patient:  { "type": "rx", "rx_id": "<21 chars>", "method": "qrph" }                       (no login needed)
//   Doctor:   { "type": "plan", "plan_id": "solo", "period": "monthly", "seats": 0, "method": "qrph" }
//             { "type": "seats", "seats": 2, "method": "qrph" }
//             { "type": "pack", "pack_id": "pack-25", "quantity": 1, "method": "qrph" }   (doctor's login required)
// Nothing is marked paid here. That happens only when PayMongo's signed webhook arrives.
import { corsHeaders, json } from '../_shared/http.ts';
import { appUrl, centavos, friendly, pm, serviceClient, userClient } from '../_shared/paymongo.ts';

const METHODS = ['qrph', 'gcash', 'paymaya', 'card'];

type Body = {
  type?: string; method?: string; rx_id?: string; plan_id?: string; period?: string;
  seats?: number; pack_id?: string; quantity?: number;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!Deno.env.get('PAYMONGO_SECRET_KEY')) return json({ error: 'Online payment is not set up yet' }, 503);

  const body: Body | null = await req.json().catch(() => null);
  if (!body?.type || !body.method || !METHODS.includes(body.method)) {
    return json({ error: 'Choose a payment method' }, 400);
  }

  const admin = serviceClient();
  let payment: { id: string; reference: string };
  let lineItems: { name: string; amount: number; currency: 'PHP'; quantity: 1; description?: string }[];
  let description: string;
  let successUrl: string;
  let cancelUrl: string;

  if (body.type === 'rx') {
    if (!/^[A-Za-z0-9_-]{21}$/.test(body.rx_id ?? '')) return json({ error: 'Prescription not found' }, 404);
    const { data, error } = await admin.rpc('gateway_prepare_rx', { p_id: body.rx_id, p_method: body.method });
    if (error) return json({ error: friendly(error) }, error.code === 'P0002' ? 404 : 400);
    if (data.reused) return json({ checkout_url: data.checkout_url });

    payment = data;
    const doctor = data.doctor_name ? `Dr. ${String(data.doctor_name).replace(/^dr\.?\s*/i, '')}` : 'your doctor';
    lineItems = [{ name: `Prescription from ${doctor}`, amount: centavos(data.price), currency: 'PHP', quantity: 1 }];
    if (data.fee_mode === 'pass' && Number(data.fee) > 0) {
      lineItems.push({ name: 'Convenience fee', amount: centavos(data.fee), currency: 'PHP', quantity: 1,
                       description: 'Online payment fee. Not refundable.' });
    }
    description = `Prescription ${data.prescription_id}`;
    successUrl = `${appUrl()}/rx/${body.rx_id}?paid=1`;
    cancelUrl = `${appUrl()}/rx/${body.rx_id}`;
  } else if (['plan', 'seats', 'pack'].includes(body.type)) {
    const user = userClient(req);
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
    successUrl = `${appUrl()}/doctor/plan?paid=1`;
    cancelUrl = `${appUrl()}/doctor/plan`;
  } else {
    return json({ error: 'Choose what to pay for' }, 400);
  }

  const res = await pm('/v1/checkout_sessions', {
    method: 'POST',
    body: {
      data: {
        attributes: {
          line_items: lineItems,
          payment_method_types: [body.method],
          reference_number: payment.reference,
          description,
          success_url: successUrl,
          cancel_url: cancelUrl,
          send_email_receipt: false,
          show_line_items: true,
          metadata: { gateway_payment_id: payment.id, kind: body.type },
        },
      },
    },
  });
  if (!res.ok) {
    console.error('checkout_sessions failed:', res.status, res.code, res.error);
    return json({ error: 'Could not open the payment page. Please try again in a moment.' }, 502);
  }

  const session = res.data?.data;
  const url = session?.attributes?.checkout_url;
  if (!url) return json({ error: 'Could not open the payment page. Please try again in a moment.' }, 502);
  const { error: attachError } = await admin.rpc('gateway_attach_session', {
    p_id: payment.id, p_session: session.id, p_url: url, p_livemode: Boolean(session.attributes?.livemode),
  });
  if (attachError) console.error('gateway_attach_session failed:', attachError.message); // the webhook still finds it by reference

  return json({ checkout_url: url });
});
