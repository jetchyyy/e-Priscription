// PayMongo helpers. The secret key never leaves the server.
import type { Env } from './env';

export const API = 'https://api.paymongo.com';
export const QRPH_REFUNDS_API = 'https://refunds-api.paymongo.com';

export function secretKey(env: Env): string {
  if (!env.PAYMONGO_SECRET_KEY) throw new Error('PAYMONGO_SECRET_KEY is not set');
  return env.PAYMONGO_SECRET_KEY;
}

/** True when the configured key is a live key. Test events are ignored in live mode and the other way round. */
export const isLiveKey = (env: Env) => secretKey(env).startsWith('sk_live_');

export type PmResult = { ok: boolean; status: number; data: any; error: string | null; code: string | null };

/** Calls the PayMongo API with Basic auth. Never throws on HTTP errors; network errors come back as status 0. */
export async function pm(
  env: Env,
  path: string,
  { method = 'GET', body, idempotencyKey, base = API }: { method?: string; body?: unknown; idempotencyKey?: string; base?: string } = {},
): Promise<PmResult> {
  const headers: Record<string, string> = {
    Authorization: `Basic ${btoa(`${secretKey(env)}:`)}`,
    Accept: 'application/json',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  try {
    const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const data: any = await res.json().catch(() => null);
    const first = data?.errors?.[0];
    return {
      ok: res.ok,
      status: res.status,
      data,
      error: res.ok ? null : (first?.detail ?? first?.message ?? `PayMongo answered ${res.status}`),
      code: res.ok ? null : (first?.code ?? null),
    };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: `Could not reach PayMongo: ${(e as Error).message}`, code: 'network' };
  }
}

/** The public site address used for return links after checkout. */
export const appUrl = (env: Env) => (env.APP_URL || 'https://e-prescription.odysseyph.com').replace(/\/$/, '');

/** Errors raised by our database functions are written for people; anything else is reported generically. */
export function friendly(err: { message?: string; code?: string } | null, fallback = 'Something went wrong. Please try again.') {
  if (!err?.message) return fallback;
  const userCodes = ['22023', 'P0002', '42501', '23505', '54000'];
  return err.code && userCodes.includes(err.code) ? err.message : fallback;
}

export const centavos = (pesos: number | string) => Math.round(Number(pesos) * 100);
