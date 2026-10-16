const origin = typeof window !== 'undefined' ? window.location.origin : '';

export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  appUrl: (import.meta.env.VITE_APP_URL || origin).replace(/\/$/, ''),
  mockGateway: (import.meta.env.VITE_PAYMENT_MODE ?? 'mock') !== 'live',
  defaultFee: Number(import.meta.env.VITE_DEFAULT_RX_FEE ?? 50) || 50,
};

export const isConfigured = Boolean(
  env.supabaseUrl && env.supabaseAnonKey && !env.supabaseUrl.includes('YOUR-PROJECT-REF'),
);
