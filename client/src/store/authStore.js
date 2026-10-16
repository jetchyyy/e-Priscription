import { create } from 'zustand';
import { supabase } from '../lib/supabase';

let initialized = false;

async function fetchProfile(userId) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) console.error('profile fetch failed', error.message);
  return data ?? null;
}

/** Where a signed-in user should land. */
export function homeFor(profile) {
  if (!profile) return '/login';
  if (profile.role === 'admin') return '/admin';
  return profile.status === 'approved' ? '/doctor' : '/doctor/pending';
}

export const useAuthStore = create((set, get) => ({
  session: null,
  profile: null,
  loading: true,

  async init() {
    if (initialized) return;
    initialized = true;
    if (!supabase) return set({ loading: false });

    const { data } = await supabase.auth.getSession();
    await get().applySession(data.session);

    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;
      // Never await supabase calls directly inside this callback (deadlock risk).
      setTimeout(() => get().applySession(session), 0);
    });
  },

  async applySession(session) {
    if (!session) return set({ session: null, profile: null, loading: false });
    const profile = await fetchProfile(session.user.id);
    set({ session, profile, loading: false });
    return profile;
  },

  async refreshProfile() {
    const { session } = get();
    if (!session) return null;
    const profile = await fetchProfile(session.user.id);
    set({ profile });
    return profile;
  },

  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const profile = await get().applySession(data.session);
    return profile;
  },

  async signOut() {
    await supabase?.auth.signOut();
    set({ session: null, profile: null });
  },
}));
