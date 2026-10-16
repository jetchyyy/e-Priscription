import { db } from '../../lib/supabase';
import { env } from '../../config/env';

/** Masked while unpaid, full content once the webhook has marked it paid (decided server-side). */
export async function fetchRx(id) {
  const { data, error } = await db().rpc('get_public_rx', { p_id: id });
  if (error) throw error;
  return data; // null => not found
}

export async function createPaymentSession(id) {
  const { data, error } = await db().rpc('create_payment_session', { p_id: id });
  if (error) throw error;
  return data;
}

export async function getPaymentSession(reference) {
  const { data, error } = await db().rpc('get_payment_session', { p_reference: reference });
  if (error) throw error;
  return data;
}

/**
 * TEST MODE ONLY. Asks the mock gateway to "pay"; the gateway then calls the
 * signed payment-webhook. The browser never marks anything paid by itself.
 */
export async function mockPay(reference) {
  const { data, error } = await db().rpc('mock_pay', { p_reference: reference });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || 'Payment could not be completed.');
  return data;
}
