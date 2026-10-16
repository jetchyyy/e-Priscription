export const encoder = new TextEncoder();

export async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
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

/** Header format: `t=<unix-seconds>,v1=<hex hmac of "<t>.<rawBody>">` */
export async function signBody(secret: string, rawBody: string): Promise<string> {
  const t = Math.floor(Date.now() / 1000);
  const v1 = await hmacHex(secret, `${t}.${rawBody}`);
  return `t=${t},v1=${v1}`;
}

export async function verifySignature(
  secret: string,
  rawBody: string,
  header: string,
  toleranceSeconds = 300,
): Promise<boolean> {
  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const i = kv.indexOf('=');
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  if (!t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - t) > toleranceSeconds) return false; // replay protection
  const expected = await hmacHex(secret, `${t}.${rawBody}`);
  return timingSafeEqual(parts.v1, expected);
}
