import { supabase } from './supabase';

/** Raised for a failed /api call. `status` is the HTTP status, or 0 when the server could not be reached. */
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Calls the Worker's server code at /api/<name> (worker/src). Sends the signed-in user's access token
 * when there is one; the Worker and the database decide what that user may do.
 */
export async function callApi(name, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`/api/${name}`, { method: 'POST', headers, body: JSON.stringify(body ?? {}) });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.error) {
    throw new ApiError(data?.error || 'Something went wrong. Please try again.', res.status);
  }
  return data;
}
