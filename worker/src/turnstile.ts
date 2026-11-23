// Cloudflare Turnstile: checks the one-use token a public form sends, before the route does any work.
// Without TURNSTILE_SECRET_KEY the check is skipped (local development). Set it in production.
import type { Env } from './env';
import { json } from './http';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const TURNSTILE_FAILED = 'The security check did not pass. Please try again.';

/** null when the token is good (or the check is off); otherwise the 403 answer to send back. */
export async function checkTurnstile(env: Env, req: Request, token: unknown): Promise<Response | null> {
  if (!env.TURNSTILE_SECRET_KEY) {
    console.warn('TURNSTILE_SECRET_KEY is not set: the bot check is skipped.');
    return null;
  }
  if (typeof token !== 'string' || !token || token.length > 2048) {
    return json({ error: TURNSTILE_FAILED, code: 'turnstile' }, 403);
  }

  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET_KEY);
  form.append('response', token);
  const ip = req.headers.get('CF-Connecting-IP');
  if (ip) form.append('remoteip', ip);

  try {
    const res = await fetch(VERIFY_URL, { method: 'POST', body: form });
    const out = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (out.success) return null;
    console.warn('Turnstile refused:', (out['error-codes'] ?? []).join(','));
  } catch (err) {
    console.error('Turnstile check failed:', (err as Error)?.message);
  }
  return json({ error: TURNSTILE_FAILED, code: 'turnstile' }, 403);
}
