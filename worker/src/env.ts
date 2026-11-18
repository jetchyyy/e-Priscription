// Bindings for the e-prescription Worker.
// Public values are `vars` in wrangler.jsonc. Secrets are set with `wrangler secret put <NAME>`
// (locally they go in .dev.vars, which git ignores). Never give a secret a VITE_ name: those ship to browsers.
export interface Env {
  ASSETS: Fetcher;

  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  APP_URL?: string;

  // Secrets
  SUPABASE_SERVICE_ROLE_KEY: string;
  PAYMONGO_SECRET_KEY?: string;
  PAYMONGO_WEBHOOK_SECRET?: string;
  PAYMONGO_SOURCE_ACCOUNT_NUMBER?: string;
  PAYMONGO_SOURCE_ACCOUNT_NAME?: string;
  PAYMONGO_SOURCE_ACCOUNT_BIC?: string;
}
