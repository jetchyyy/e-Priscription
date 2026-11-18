// A small Supabase client over fetch: PostgREST RPCs and the Auth endpoints the Worker needs.
// No SDK, so the Worker stays small and has no dependencies.
import type { Env } from './env';

export type DbError = { message: string; code?: string };
export type DbResult<T = any> = { data: T | null; error: DbError | null };

export type Db = {
  rpc<T = any>(fn: string, args?: Record<string, unknown>): Promise<DbResult<T>>;
};

async function call<T>(url: string, init: RequestInit): Promise<DbResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    return { data: null, error: { message: `Could not reach the database: ${(e as Error).message}`, code: 'network' } };
  }
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const message = body?.message ?? body?.msg ?? body?.error_description ?? body?.error ?? `HTTP ${res.status}`;
    return { data: null, error: { message: String(message), code: body?.code ?? body?.error_code ?? String(res.status) } };
  }
  return { data: body as T, error: null };
}

function client(env: Env, apikey: string, bearer: string): Db {
  return {
    rpc: (fn, args = {}) =>
      call(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { apikey, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(args),
      }),
  };
}

/** Service role: bypasses RLS. Only use it for the functions granted to service_role. */
export const serviceClient = (env: Env): Db => client(env, env.SUPABASE_SERVICE_ROLE_KEY, env.SUPABASE_SERVICE_ROLE_KEY);

/** Acts as the signed-in caller, so the database's own permission checks apply. Null without a token. */
export function userClient(env: Env, req: Request): (Db & { token: string }) | null {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;
  return { ...client(env, env.SUPABASE_ANON_KEY, token), token };
}

/** The user behind an access token, or null when it is missing, expired or forged. */
export async function getUser(env: Env, token: string): Promise<{ id: string; email?: string } | null> {
  const { data, error } = await call<{ id: string; email?: string }>(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  return error || !data?.id ? null : data;
}

/** Auth admin: create a confirmed user (GoTrue fills in identities and metadata properly). */
export function adminCreateUser(
  env: Env,
  user: { email: string; password: string; email_confirm: boolean; user_metadata: Record<string, string> },
) {
  return call<{ id: string; email: string }>(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(user),
  });
}
