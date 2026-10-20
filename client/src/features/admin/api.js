import { db } from '../../lib/supabase';

export async function fetchDoctors() {
  const { data, error } = await db()
    .from('profiles')
    .select('*')
    .eq('role', 'doctor')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function reviewDoctor({ id, status, reason }) {
  const { error } = await db().rpc('review_doctor', {
    p_doctor_id: id,
    p_status: status,
    p_reason: reason ?? null,
  });
  if (error) throw error;
}

/** Short-lived signed URL for the private license file (admin only, enforced by storage RLS). */
export async function getLicenseUrl(path) {
  const { data, error } = await db().storage.from('licenses').createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}

/** Change requests for verified doctor details, with the doctor's current record. */
export async function fetchChangeRequests() {
  const { data, error } = await db()
    .from('profile_change_requests')
    .select('*, doctor:profiles!profile_change_requests_doctor_id_fkey(full_name, email, prc_no, specialty, s2_no, clinic_name)')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data;
}

export async function reviewChangeRequest({ id, approve, note }) {
  const { error } = await db().rpc('review_profile_change', {
    p_id: id,
    p_approve: approve,
    p_note: note || null,
  });
  if (error) throw error;
}
