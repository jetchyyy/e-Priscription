// Run: npm run test:worker
import { afterEach, describe, expect, it, vi } from 'vitest';
import { confirmIntent } from './confirm';

const env = { PAYMONGO_SECRET_KEY: 'sk_test_x' } as any;
const intent = (status: string, payments: any[] = []) => ({
  data: { id: 'pi_abcdefghijklmnop', attributes: { status, livemode: false, metadata: { reference: 'REF1' }, payments } },
});
const stubPayMongo = (body: unknown, status = 200) =>
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));
const db = () => {
  const calls: any[] = [];
  return { calls, rpc: async (name: string, args: any) => { calls.push({ name, args }); return { data: { ok: true, result: 'rx_paid' }, error: null }; } } as any;
};

afterEach(() => vi.unstubAllGlobals());

describe('confirmIntent', () => {
  it('settles a paid intent in the webhook shape, with its own event id', async () => {
    stubPayMongo(intent('succeeded', [{ id: 'pay_1', attributes: { status: 'paid', amount: 52500 } }]));
    const d = db();
    expect(await confirmIntent(env, d, 'pi_abcdefghijklmnop')).toBe('rx_paid');
    const ev = d.calls[0].args.p_event.data;
    expect(ev.id).toBe('confirm:pay_1');
    expect(ev.attributes.type).toBe('checkout_session.payment.paid');
    expect(ev.attributes.data).toMatchObject({ id: 'pi_abcdefghijklmnop', attributes: { reference_number: 'REF1' } });
  });
  it('does nothing while it is not paid', async () => {
    stubPayMongo(intent('awaiting_next_action'));
    const d = db();
    expect(await confirmIntent(env, d, 'pi_abcdefghijklmnop')).toBe('not_paid:awaiting_next_action');
    expect(d.calls).toHaveLength(0);
  });
  it('refuses anything that is not an intent id, without calling PayMongo', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await confirmIntent(env, db(), '../v1/refunds')).toBe('invalid_intent');
    expect(f).not.toHaveBeenCalled();
  });
});
