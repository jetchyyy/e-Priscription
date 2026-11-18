// The e-prescription Worker: serves the Vite build and runs the server code under /api/*.
// Static files never reach this code: wrangler.jsonc sends only /api/* here (assets.run_worker_first).
//
//   POST /api/register-doctor     doctor sign-up (Auth admin API)
//   POST /api/paymongo-checkout   opens a PayMongo hosted checkout
//   POST /api/paymongo-ops        banks list, payouts, refunds, wallet balance (signed-in; the database checks roles)
//   POST /api/payment-webhook     PayMongo's signed webhook
import type { Env } from './env';
import { json } from './http';
import { paymentWebhook } from './routes/payment-webhook';
import { paymongoCheckout } from './routes/paymongo-checkout';
import { paymongoOps } from './routes/paymongo-ops';
import { registerDoctor } from './routes/register-doctor';

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
} satisfies ExportedHandler<Env>;
