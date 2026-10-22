import { db, supabase } from '../../lib/supabase';

// ---------------------------------------------------------------------------------------------------------
// Online payments through PayMongo. The browser never sees a PayMongo key: Edge Functions open checkouts,
// send payouts and refunds, and only PayMongo's signed webhook marks anything paid.
// ---------------------------------------------------------------------------------------------------------

/** Calls an Edge Function and turns its { error } answer into a readable Error. */
async function invoke(name, body) {
  const { data, error } = await db().functions.invoke(name, { body });
  if (error) {
    let msg = 'Something went wrong. Please try again.';
    try {
      const b = await error.context?.json?.();
      if (b?.error) msg = b.error;
    } catch (_) { /* keep the generic message */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

/** Opens PayMongo's payment page for a prescription, plan, seats or pack. Resolves only if it fails. */
export async function startCheckout(body) {
  const { checkout_url: url } = await invoke('paymongo-checkout', body);
  if (!url) throw new Error('Could not open the payment page. Please try again.');
  window.location.assign(url);
  return new Promise(() => {}); // the page is leaving
}

export const paymongoOps = (body) => invoke('paymongo-ops', body);

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

/** True when the page was opened by PayMongo's return link after paying. */
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
