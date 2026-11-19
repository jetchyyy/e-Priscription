import { db, supabase } from '../../lib/supabase';
import { callApi } from '../../lib/api';

// ---------------------------------------------------------------------------------------------------------
// Online payments through PayMongo, embedded in our pages (Payment Intents). The browser only ever holds the
// PUBLIC key (pk_), which PayMongo made for exactly this: sending card details straight to PayMongo and checking
// a payment's status. The Worker (/api/*, worker/src) holds the secret key and starts each payment from the database's
// amount, and only PayMongo's signed webhook marks anything paid.
// ---------------------------------------------------------------------------------------------------------

const PAYMONGO = 'https://api.paymongo.com/v1';

/**
 * Starts a payment for a prescription, plan, seats or pack.
 * Resolves to { intent_id, client_key, public_key, status, next_action }, or { checkout_url } for a hosted
 * checkout opened before the switch to embedded payments.
 */
export const startPayment = (body) => callApi('paymongo-checkout', body);

async function publicCall(start, path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`${PAYMONGO}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${btoa(`${start.public_key}:`)}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify({ data: { attributes: body } }) : undefined,
    });
  } catch {
    throw new Error('Could not reach PayMongo. Check your connection and try again.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const first = data?.errors?.[0];
    throw new Error(first?.detail || 'PayMongo could not process this. Please check the details and try again.');
  }
  return data?.data;
}

/** Asks the server to check the payment with PayMongo now, so a late webhook does not keep the payer waiting. */
export const confirmPayment = (start) => callApi('paymongo-confirm', { intent_id: start.intent_id }).catch(() => null);

/** Asks the server to check this prescription's open payments with PayMongo (a patient who paid, then left). */
export const confirmRxPayments = (rxId) => callApi('paymongo-confirm', { rx_id: rxId }).catch(() => null);

/** The payment's current state: { status, next_action, last_payment_error }. */
export async function fetchIntent(start) {
  const intent = await publicCall(start, `/payment_intents/${start.intent_id}?client_key=${encodeURIComponent(start.client_key)}`);
  return intent?.attributes ?? {};
}

/** Sends the card straight to PayMongo and attaches it to the payment. Our server never sees the card number. */
export async function payWithCard(start, card, returnUrl) {
  const pmethod = await publicCall(start, '/payment_methods', {
    method: 'POST',
    body: {
      type: 'card',
      details: { card_number: card.number, exp_month: card.expMonth, exp_year: card.expYear, cvc: card.cvc },
      billing: { name: card.name },
    },
  });
  const intent = await publicCall(start, `/payment_intents/${start.intent_id}/attach`, {
    method: 'POST',
    body: { payment_method: pmethod.id, client_key: start.client_key, return_url: returnUrl },
  });
  return intent?.attributes ?? {};
}

/** Where PayMongo sends a finished card check or wallet pop-up: it tells this page, or goes on to `next`. */
export const payDoneUrl = (next) => `${window.location.origin}/pay-done.html?next=${encodeURIComponent(next)}`;

export const paymongoOps = (body) => callApi('paymongo-ops', body);

/** Whether online payments are on, and the fee for each method. */
export async function fetchGatewayConfig() {
  if (!supabase) return { enabled: false, manual_fallback: true, methods: [] };
  const { data, error } = await db().rpc('gateway_public_config');
  if (error) {
    // Before migration 0010 the function does not exist: behave as before (receipts).
    if (error.code === 'PGRST202' || error.code === '42883') return { enabled: false, manual_fallback: true, methods: [] };
    throw error;
  }
  return data;
}

export const gatewayConfigQuery = { queryKey: ['gateway-config'], queryFn: fetchGatewayConfig, staleTime: 60_000 };

/** Online options for one prescription, with exact amounts. Null when the doctor does not take online payments. */
export async function fetchRxOnlineOptions(rxId) {
  const { data, error } = await db().rpc('rx_online_options', { p_id: rxId });
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') return null;
    throw error;
  }
  return data;
}

/** ODYSSEY's fee for a price, the same sum the database does. */
export function feeFor(method, price) {
  if (!method) return 0;
  const raw = Math.round((Number(price) * Number(method.fee_pct) / 100 + Number(method.fee_fixed)) * 100) / 100;
  return Math.max(raw, Number(method.fee_min));
}

/** "3.8%", "5.5% + ₱15", "3% or ₱20, whichever is higher" */
export function rateText(m) {
  const pct = `${Number(m.fee_pct).toLocaleString('en-PH', { maximumFractionDigits: 3 })}%`;
  const fixed = Number(m.fee_fixed) > 0 ? ` + ₱${Number(m.fee_fixed).toLocaleString('en-PH')}` : '';
  const min = Number(m.fee_min) > 0 ? ` (at least ₱${Number(m.fee_min).toLocaleString('en-PH')})` : '';
  return `${pct}${fixed}${min}`;
}

export const METHOD_HINT = {
  qrph: 'Scan with GCash, Maya or any bank app',
  gcash: 'Pay in the GCash app',
  paymaya: 'Pay in the Maya app',
  card: 'Philippine-issued Visa or Mastercard',
};

/** True when the page was opened by PayMongo's return link after paying (a full-page wallet payment). */
export const cameBackFromCheckout = () => {
  try {
    return new URLSearchParams(window.location.search).get('paid') === '1';
  } catch {
    return false;
  }
};

export function clearCheckoutFlag() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('paid');
    window.history.replaceState(window.history.state, '', url.toString());
  } catch (_) { /* nothing to clear */ }
}
