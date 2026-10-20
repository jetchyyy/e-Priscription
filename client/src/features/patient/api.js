import { db } from '../../lib/supabase';
import { env } from '../../config/env';

/** Masked while unpaid/locked, full content once paid and PIN entered (if required). */
export async function fetchRx(id, pin = null) {
  const { data, error } = await db().rpc('get_public_rx', {
    p_id: id,
    p_pin: pin ? String(pin).trim() : null,
  });
  if (error) throw error;
  return data; // null => not found
}

export async function verifyRxPin(id, pin) {
  const { data, error } = await db().rpc('verify_rx_pin', {
    p_id: id,
    p_pin: String(pin).trim(),
  });
  if (error) throw error;
  return Boolean(data);
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
