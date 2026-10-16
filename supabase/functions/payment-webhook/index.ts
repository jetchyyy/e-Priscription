// POST /functions/v1/payment-webhook
// The ONLY path that can flip a prescription to PAID.
//
// 1. Verifies the gateway signature (HMAC-SHA256, timestamped).
// 2. Calls mark_payment_paid() with the service-role key (amount is re-checked in SQL).
//
// To plug in a real gateway (PayMongo / Xendit / Stripe) replace
// `verifySignature` + `parseEvent` with that gateway's scheme - see docs/payment-flow.md.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/http.ts';
import { verifySignature } from '../_shared/signature.ts';

type PaidEvent = { type: string; data?: { reference?: string; amount?: number } };

function parseEvent(raw: string): PaidEvent | null {
  try {
    return JSON.parse(raw) as PaidEvent;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const secret = Deno.env.get('PAYMENT_WEBHOOK_SECRET');
  if (!secret) return json({ error: 'server_not_configured' }, 500);

  const raw = await req.text();
  const header = req.headers.get('x-signature') ?? '';
  if (!(await verifySignature(secret, raw, header))) {
    return json({ error: 'invalid_signature' }, 401);
  }

  const event = parseEvent(raw);
  if (!event) return json({ error: 'invalid_payload' }, 400);
  if (event.type !== 'payment.paid') return json({ ok: true, ignored: true });

  const reference = event.data?.reference;
  const amount = event.data?.amount;
  if (!reference || typeof amount !== 'number') return json({ error: 'invalid_payload' }, 400);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const { data, error } = await admin.rpc('mark_payment_paid', {
    p_reference: reference,
    p_amount: amount,
  });
  if (error) {
    console.error('mark_payment_paid failed', error.message); // never log prescription content
    return json({ error: 'internal_error' }, 500);
  }
  if (!data?.ok) return json({ error: data?.error ?? 'rejected' }, 422);

  return json({ ok: true });
});
