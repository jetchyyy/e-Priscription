// POST /functions/v1/mock-gateway   { "reference": "<payment reference>" }
//
// TEST-ONLY stand-in for a real payment gateway. It behaves like one:
// it builds a "payment.paid" event, signs it, and POSTs it to the real
// payment-webhook. Browsers never mark anything paid themselves.
//
// Enabled only when the secret MOCK_GATEWAY_ENABLED=true.
// DELETE this function (and unset the secret) when going live.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/http.ts';
import { signBody } from '../_shared/signature.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (Deno.env.get('MOCK_GATEWAY_ENABLED') !== 'true') return json({ error: 'disabled' }, 403);

  const secret = Deno.env.get('PAYMENT_WEBHOOK_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  if (!secret) return json({ error: 'server_not_configured' }, 500);

  const body = await req.json().catch(() => null);
  const reference = typeof body?.reference === 'string' ? body.reference : '';
  if (!/^[A-Za-z0-9_-]{21}$/.test(reference)) return json({ error: 'invalid_reference' }, 400);

  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data: pay } = await admin
    .from('payments')
    .select('reference, amount, status')
    .eq('reference', reference)
    .maybeSingle();
  if (!pay) return json({ error: 'not_found' }, 404);

  const raw = JSON.stringify({
    type: 'payment.paid',
    data: { reference: pay.reference, amount: Number(pay.amount), gateway: 'mock' },
  });

  const res = await fetch(`${supabaseUrl}/functions/v1/payment-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-signature': await signBody(secret, raw) },
    body: raw,
  });

  return json({ ok: res.ok, status: res.status }, res.ok ? 200 : 502);
});
