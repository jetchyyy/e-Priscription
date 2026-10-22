// POST /functions/v1/paymongo-ops   (signed-in users only; the database checks who may do what)
//
//   { "action": "banks", "provider": "instapay" }         any signed-in doctor: banks and e-wallets for payouts
//   { "action": "send_payout", "payout_id": "<uuid>" }    admin: sends an approved payout through PayMongo
//   { "action": "refund", "payment_id": "<uuid>", "reason": "others", "notes": "..." }   admin
//   { "action": "wallet" }                                admin: PayMongo wallet balance, for the balance check
import { corsHeaders, json } from '../_shared/http.ts';
import { QRPH_REFUNDS_API, centavos, friendly, pm, serviceClient, userClient } from '../_shared/paymongo.ts';

const bankCache = new Map<string, { at: number; list: { code: string; name: string }[] }>();

async function receivingInstitutions(provider: string) {
  const hit = bankCache.get(provider);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.list;
  let res = await pm(`/v2/transfers/receiving_institutions?provider=${provider}`);
  if (!res.ok) res = await pm(`/v1/wallets/receiving_institutions?provider=${provider}`);
  if (!res.ok) return null;
  const list = (res.data?.data ?? [])
    .map((r: any) => ({ code: r.attributes?.provider_code ?? r.provider_code, name: r.attributes?.name ?? r.name,
                        provider: r.attributes?.provider ?? r.provider }))
    .filter((r: any) => r.code && r.name && (!r.provider || r.provider === provider))
    .map(({ code, name }: any) => ({ code, name }))
    .sort((a: any, b: any) => a.name.localeCompare(b.name));
  bankCache.set(provider, { at: Date.now(), list });
  return list;
}

/** ODYSSEY's wallet account that payouts are sent from. Set PAYMONGO_SOURCE_ACCOUNT_* to skip the lookup. */
async function sourceAccount() {
  const number = Deno.env.get('PAYMONGO_SOURCE_ACCOUNT_NUMBER');
  const name = Deno.env.get('PAYMONGO_SOURCE_ACCOUNT_NAME');
  const bic = Deno.env.get('PAYMONGO_SOURCE_ACCOUNT_BIC');
  if (number && name && bic) return { number, name, bic };
  const res = await pm('/v2/wallets');
  if (!res.ok) return null;
  const wallet = (res.data?.data ?? [])[0];
  const src = wallet?.source_account ?? wallet?.attributes?.source_account;
  if (!src?.number) return null;
  return { number: String(src.number), name: String(src.name ?? ''), bic: String(src.bic ?? 'PAEYPHM2XXX') };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!Deno.env.get('PAYMONGO_SECRET_KEY')) return json({ error: 'Online payment is not set up yet' }, 503);

  const user = userClient(req);
  if (!user) return json({ error: 'Sign in again to continue' }, 401);
  const { data: me } = await user.auth.getUser();
  if (!me?.user) return json({ error: 'Sign in again to continue' }, 401);

  const body = await req.json().catch(() => null);
  const action = body?.action;

  if (action === 'banks') {
    const provider = body.provider === 'pesonet' ? 'pesonet' : 'instapay';
    const list = await receivingInstitutions(provider);
    if (!list) return json({ error: 'Could not load the list of banks. Please try again.' }, 502);
    return json({ banks: list });
  }

  if (action === 'wallet') {
    const { error } = await user.rpc('admin_gateway_config');
    if (error) return json({ error: 'Not authorized' }, 403);
    const res = await pm('/v2/wallets');
    if (!res.ok) return json({ error: res.error ?? 'Could not read the wallet' }, 502);
    const wallets = (res.data?.data ?? []).map((w: any) => {
      const a = w.attributes ?? w;
      return { id: w.id, name: a.name ?? a.source_account?.name ?? 'Wallet', currency: a.currency ?? 'PHP',
               available: a.available_balance ?? a.balance?.available ?? null, pending: a.pending_balance ?? a.balance?.pending ?? null };
    });
    return json({ wallets });
  }

  if (action === 'send_payout') {
    const { data: po, error } = await user.rpc('admin_begin_payout', { p_id: body.payout_id });
    if (error) return json({ error: friendly(error) }, error.code === '42501' ? 403 : 400);

    const svc = serviceClient();
    const src = await sourceAccount();
    if (!src) {
      await svc.rpc('gateway_payout_result', { p_id: po.id, p_outcome: 'rejected', p_transfer_id: null, p_fee: null,
                                               p_detail: 'ODYSSEY wallet account not found. Check that the PayMongo Wallet is active.' });
      return json({ error: 'Could not find ODYSSEY’s PayMongo wallet. Nothing was sent, and the money is back in the doctor’s balance.' }, 502);
    }

    const res = await pm('/v2/batch_transfers', {
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
    let outcome: 'accepted' | 'succeeded' | 'rejected' | 'unknown';
    if (res.ok && tr) outcome = tr.status === 'succeeded' ? 'succeeded' : tr.status === 'failed' ? 'rejected' : 'accepted';
    else if (res.status >= 400 && res.status < 500 && res.status !== 409) outcome = 'rejected';
    else outcome = 'unknown';

    const detail = tr?.provider_error || res.error || null;
    const { data: result, error: e2 } = await svc.rpc('gateway_payout_result', {
      p_id: po.id, p_outcome: outcome, p_transfer_id: tr?.id ?? null,
      p_fee: tr?.fee != null ? Number(tr.fee) / 100 : null, p_detail: detail,
    });
    if (e2) console.error('gateway_payout_result failed:', e2.message);

    if (outcome === 'rejected') return json({ error: `PayMongo did not accept the transfer: ${detail ?? 'unknown reason'}. The money is back in the doctor’s balance.` }, 400);
    if (outcome === 'unknown') return json({ error: 'PayMongo did not give a clear answer. Check the transfer in the PayMongo dashboard before trying again.' }, 502);
    return json({ ok: true, status: result });
  }

  if (action === 'refund') {
    const { data: rf, error } = await user.rpc('admin_begin_refund', {
      p_payment: body.payment_id, p_reason: body.reason ?? 'others', p_notes: body.notes ?? null,
    });
    if (error) return json({ error: friendly(error) }, error.code === '42501' ? 403 : 400);

    const res = await pm('/v1/refunds', {
      method: 'POST',
      base: rf.method === 'qrph' ? QRPH_REFUNDS_API : undefined,
      idempotencyKey: `refund-${rf.id}`,
      body: { data: { attributes: { amount: centavos(rf.amount), payment_id: rf.payment_id, reason: rf.reason, notes: rf.notes ?? undefined } } },
    });

    const svc = serviceClient();
    const r = res.data?.data;
    const definitelyFailed = !res.ok && res.status >= 400 && res.status < 500 && res.status !== 409;
    if (res.ok || definitelyFailed) {
      const { error: e2 } = await svc.rpc('gateway_refund_result', {
        p_id: rf.id, p_ok: res.ok, p_refund_id: r?.id ?? null, p_status: r?.attributes?.status ?? null,
        p_link: r?.attributes?.transfer_link ?? r?.attributes?.refund_link ?? null, p_detail: res.error,
      });
      if (e2) console.error('gateway_refund_result failed:', e2.message);
    }
    if (definitelyFailed) return json({ error: `PayMongo did not accept the refund: ${res.error}` }, 400);
    if (!res.ok) return json({ error: 'PayMongo did not give a clear answer. Check the payment in the PayMongo dashboard.' }, 502);
    return json({ ok: true, transfer_link: r?.attributes?.transfer_link ?? null });
  }

  return json({ error: 'Unknown action' }, 400);
});
