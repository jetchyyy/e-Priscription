// The e-prescription Worker: serves the Vite build and runs the server code under /api/*.
// Static files never reach this code: wrangler.jsonc sends only /api/* here (assets.run_worker_first).
//
//   POST /api/register-doctor     doctor sign-up (Auth admin API)
//   POST /api/paymongo-checkout   starts an embedded PayMongo payment (Payment Intent)
//   POST /api/paymongo-ops        banks list, payouts, refunds, wallet balance (signed-in; the database checks roles)
//   POST /api/payment-webhook     PayMongo's signed webhook
//   cron  Saturday 08:00 Manila   prepares the week's doctor payouts for an admin to check and send
import type { Env } from './env';
import { json } from './http';
import { paymentWebhook } from './routes/payment-webhook';
import { paymongoCheckout } from './routes/paymongo-checkout';
import { paymongoOps } from './routes/paymongo-ops';
import { registerDoctor } from './routes/register-doctor';
import { serviceClient } from './supabase';

const ROUTES: Record<string, (req: Request, env: Env) => Promise<Response>> = {
  '/api/register-doctor': registerDoctor,
  '/api/paymongo-checkout': paymongoCheckout,
  '/api/paymongo-ops': paymongoOps,
  '/api/payment-webhook': paymentWebhook,
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    const route = ROUTES[pathname.replace(/\/$/, '')];

    if (!route) {
      if (pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
      return env.ASSETS.fetch(req);
    }
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    try {
      return await route(req, env);
    } catch (err) {
      // Messages only: request bodies can hold patient data.
      console.error(`${pathname} failed:`, (err as Error)?.message);
      return json({ error: 'Something went wrong. Please try again.' }, 500);
    }
  },

  // wrangler.jsonc triggers.crons: "0 0 * * SAT" (UTC) is Saturday 08:00 in Manila. PayMongo settled on Thursday.
  // Nothing is sent here: the payouts wait in Admin -> Money -> Payouts for an admin to check the accounts and send.
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const { data, error } = await serviceClient(env).rpc('cron_prepare_weekly_payouts');
    if (error) throw new Error(`cron_prepare_weekly_payouts failed: ${error.message}`); // shows as a failed cron run
    console.log('weekly payouts prepared:', JSON.stringify(data));
  },
} satisfies ExportedHandler<Env>;
