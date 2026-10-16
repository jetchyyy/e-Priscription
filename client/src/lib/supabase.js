import { createClient } from '@supabase/supabase-js';
import { env, isConfigured } from '../config/env';

export const supabase = isConfigured
  ? createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

/** Throws a readable error when Supabase env vars are missing. */
export function db() {
  if (!supabase) throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  return supabase;
}
