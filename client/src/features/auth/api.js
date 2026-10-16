import { useAuthStore } from '../../store/authStore';

/** Turns Supabase auth errors into plain language. */
export function friendlyAuthError(err) {
  const msg = err?.message ?? '';
  if (/invalid login credentials/i.test(msg)) return 'Incorrect email or password.';
  if (/email not confirmed/i.test(msg)) return 'Please confirm your email first. Check your inbox.';
  if (/rate limit|too many/i.test(msg)) return 'Too many attempts. Please wait a minute and try again.';
  if (/failed to fetch|network/i.test(msg)) return 'Network problem. Check your connection and try again.';
  return msg || 'Something went wrong. Please try again.';
}

export const signIn = (email, password) => useAuthStore.getState().signIn(email, password);
