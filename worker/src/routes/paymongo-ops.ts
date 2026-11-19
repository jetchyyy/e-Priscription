// POST /api/paymongo-ops   (signed-in users only; the database checks who may do what)
//
//   { "action": "banks", "provider": "instapay" }         any signed-in doctor: banks and e-wallets for payouts
//   { "action": "send_payout", "payout_id": "<uuid>" }    admin: sends an approved payout through PayMongo
//   { "action": "refund", "payment_id": "<uuid>", "reason": "others", "notes": "..." }   admin
//   { "action": "wallet" }                                admin: PayMongo wallet balance, for the balance check
import type { Env } from '../env';
import { json, readJson } from '../http';
import { QRPH_REFUNDS_API, centavos, friendly, pm } from '../paymongo';
import { sendClaimedPayout } from '../payouts';
import { getUser, serviceClient, userClient } from '../supabase';

const bankCache = new Map<string, { at: number; list: { code: string; name: string }[] }>();

async function receivingInstitutions(env: Env, provider: string) {
  const hit = bankCache.get(provider);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.list;
  let res = await pm(env, `/v2/transfers/receiving_institutions?provider=${provider}`);
  if (!res.ok) res = await pm(env, `/v1/wallets/receiving_institutions?provider=${provider}`);
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

export async function paymongoOps(req: Request, env: Env): Promise<Response> {
  if (!env.PAYMONGO_SECRET_KEY) return json({ error: 'Online payment is not set up yet' }, 503);

  const user = userClient(env, req);
  if (!user) return json({ error: 'Sign in again to continue' }, 401);
  const me = await getUser(env, user.token);
  if (!me) return json({ error: 'Sign in again to continue' }, 401);

  const body = await readJson<any>(req);
  const action = body?.action;

  if (action === 'banks') {
    const provider = body.provider === 'pesonet' ? 'pesonet' : 'instapay';
    const list = await receivingInstitutions(env, provider);
    if (!list) return json({ error: 'Could not load the list of banks. Please try again.' }, 502);
    return json({ banks: list });
  }

  if (action === 'wallet') {
    const { error } = await user.rpc('admin_gateway_config');
    if (error) return json({ error: 'Not authorized' }, 403);
    const res = await pm(env, '/v2/wallets');
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

    const { outcome, detail } = await sendClaimedPayout(env, serviceClient(env), po);
    if (outcome === 'rejected') return json({ error: `PayMongo did not accept the transfer: ${detail ?? 'unknown reason'}. The money is back in the doctor’s balance.` }, 400);
    if (outcome === 'unknown') return json({ error: 'PayMongo did not give a clear answer. Check the transfer in the PayMongo dashboard before trying again.' }, 502);
    return json({ ok: true, status: outcome });
  }

  if (action === 'refund') {
    const { data: rf, error } = await user.rpc('admin_begin_refund', {
      p_payment: body.payment_id, p_reason: body.reason ?? 'others', p_notes: body.notes ?? null,
    });
    if (error) return json({ error: friendly(error) }, error.code === '42501' ? 403 : 400);

    const res = await pm(env, '/v1/refunds', {
      method: 'POST',
      base: rf.method === 'qrph' ? QRPH_REFUNDS_API : undefined,
      idempotencyKey: `refund-${rf.id}`,
      body: { data: { attributes: { amount: centavos(rf.amount), payment_id: rf.payment_id, reason: rf.reason, notes: rf.notes ?? undefined } } },
    });

    const svc = serviceClient(env);
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
}
