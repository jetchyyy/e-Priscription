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

// ---------------------------------------------------------------------------------------------------------
// Manual payment verification: the patient sends the reference number and a receipt screenshot,
// the doctor confirms it. Nothing here can mark a prescription paid.
// ---------------------------------------------------------------------------------------------------------
const PROOF_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const PROOF_TYPES = Object.keys(PROOF_EXT);
export const PROOF_MAX_BYTES = 5 * 1024 * 1024;

export async function uploadPaymentProof(rxId, file) {
  const path = `${rxId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${PROOF_EXT[file.type] ?? 'jpg'}`;
  const { error } = await db().storage.from('payment-proofs').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message?.includes('row-level security')
    ? 'This prescription can no longer receive receipts. Please contact your doctor.'
    : 'Could not upload your screenshot. Check your connection and try again.');
  return path;
}

export async function submitPaymentProof({ rxId, reference, path, methodId, amountRead }) {
  const { data, error } = await db().rpc('submit_payment_proof', {
    p_rx_id: rxId,
    p_reference: reference,
    p_screenshot_path: path,
    p_method_id: methodId ?? null,
    p_amount_read: amountRead ?? null,
  });
  if (error) throw error;
  return data;
}
