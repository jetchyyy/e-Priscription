// PayMongo webhook signatures.
// Header: Paymongo-Signature: t=<unix seconds>,te=<test signature>,li=<live signature>
// Each signature is HMAC-SHA256 of "<t>.<raw body>" with the webhook's secret key, as lowercase hex.
export const encoder = new TextEncoder();

export async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time string comparison (avoids timing attacks on the signature). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function parseSignatureHeader(header: string): { t: string; te: string; li: string } {
  const parts: Record<string, string> = {};
  for (const kv of header.split(',')) {
    const i = kv.indexOf('=');
    if (i > 0) parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  }
  return { t: parts.t ?? '', te: parts.te ?? '', li: parts.li ?? '' };
}

/**
 * Verifies the raw body before anything parses it. Returns which mode signed it ('test' or 'live'), or null.
 * Replays are harmless: every event is handled once by its id in the database.
 */
export async function verifyPaymongoSignature(secret: string, rawBody: string, header: string): Promise<'test' | 'live' | null> {
  const { t, te, li } = parseSignatureHeader(header);
  if (!/^\d+$/.test(t)) return null;
  const expected = await hmacHex(secret, `${t}.${rawBody}`);
  if (li && timingSafeEqual(li, expected)) return 'live';
  if (te && timingSafeEqual(te, expected)) return 'test';
  return null;
}
