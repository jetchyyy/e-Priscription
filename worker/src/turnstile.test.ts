import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkTurnstile } from './turnstile';
import type { Env } from './env';

const env = (secret?: string) => ({ TURNSTILE_SECRET_KEY: secret } as unknown as Env);
const req = new Request('https://x.test/api', { headers: { 'CF-Connecting-IP': '1.2.3.4' } });
const answer = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body)));

afterEach(() => vi.unstubAllGlobals());

describe('checkTurnstile', () => {
  it('is skipped without a secret key', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await checkTurnstile(env(), req, undefined)).toBeNull();
  });

  it('refuses a missing token without calling Cloudflare', async () => {
    const f = answer({ success: true });
    vi.stubGlobal('fetch', f);
    const res = await checkTurnstile(env('s'), req, '');
    expect(res?.status).toBe(403);
    expect(f).not.toHaveBeenCalled();
  });

  it('passes a token Cloudflare accepts, sending the secret and IP', async () => {
    const f = answer({ success: true });
    vi.stubGlobal('fetch', f);
    expect(await checkTurnstile(env('s'), req, 'tok')).toBeNull();
    const form = (f.mock.calls[0] as unknown as [string, { body: FormData }])[1].body;
    expect(form.get('secret')).toBe('s');
    expect(form.get('response')).toBe('tok');
    expect(form.get('remoteip')).toBe('1.2.3.4');
  });

  it('refuses a token Cloudflare rejects, or when Cloudflare cannot be reached', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', answer({ success: false, 'error-codes': ['timeout-or-duplicate'] }));
    const res = await checkTurnstile(env('s'), req, 'used');
    expect(res?.status).toBe(403);
    expect(await res?.json()).toMatchObject({ code: 'turnstile' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    expect((await checkTurnstile(env('s'), req, 'tok'))?.status).toBe(403);
  });
});
