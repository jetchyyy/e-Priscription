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

// ---------------------------------------------------------------------------------------------------------
// Plans and billing
// ---------------------------------------------------------------------------------------------------------

/** Plan payments doctors sent, oldest waiting first. */
export async function fetchPlanRequests(status = 'pending') {
  let q = db()
    .from('plan_requests')
    .select('*, doctor:profiles!plan_requests_doctor_id_fkey(full_name, email, clinic_name)')
    .order('created_at', { ascending: status === 'pending' })
    .limit(100);
  if (status !== 'all') q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function getPlanProofUrl(path) {
  const { data, error } = await db().storage.from('plan-payment-proofs').createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}

export async function reviewPlanRequest({ id, approve, note }) {
  const { error } = await db().rpc('review_plan_request', { p_id: id, p_approve: approve, p_note: note || null });
  if (error) throw error;
}

/** Approved doctors with their plan and this month's usage. */
export async function fetchDoctorPlans() {
  const { data, error } = await db().rpc('admin_doctor_plans');
  if (error) throw error;
  return data ?? [];
}

export async function setDoctorPlan({ doctorId, planId, periodEnd, rxLimitOverride, billingPeriod, note }) {
  const { error } = await db().rpc('admin_set_doctor_plan', {
    p_doctor_id: doctorId,
    p_plan_id: planId,
    p_period_end: periodEnd || null,
    p_rx_limit_override: rxLimitOverride === '' || rxLimitOverride == null ? null : Number(rxLimitOverride),
    p_billing_period: billingPeriod || 'monthly',
    p_note: note || null,
  });
  if (error) throw error;
}

/** Saves a plan's prices, limits and pricing-page text. `id` is fixed once a plan exists. */
export async function savePlan(plan, { isNew = false } = {}) {
  const row = {
    name: plan.name.trim(),
    description: plan.who?.trim() || null,
    monthly_price: Number(plan.monthly),
    yearly_price: plan.yearly === '' || plan.yearly == null ? null : Number(plan.yearly),
    rx_limit: Number(plan.rxLimit),
    qr_limit: Number(plan.qrLimit),
    max_doctors: Number(plan.doctors) || 1,
    extra_doctor_price: plan.extraDoctor === '' || plan.extraDoctor == null ? null : Number(plan.extraDoctor),
    features: plan.lines.map((l) => l.trim()).filter(Boolean),
    cta: plan.cta?.trim() || null,
    sort_order: Number(plan.sortOrder) || 0,
    is_public: Boolean(plan.isPublic),
  };
  const q = isNew
    ? db().from('subscription_plans').insert({ id: plan.id.trim().toLowerCase(), ...row })
    : db().from('subscription_plans').update(row).eq('id', plan.id);
  const { data, error } = await q.select().single();
  if (error) throw error;
  return data;
}

export async function fetchPlatformMethods() {
  const { data, error } = await db().from('platform_payment_methods').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function createPlatformMethod({ provider, accountName, accountNumber, file }) {
  const supabase = db();
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) throw new Error('Session expired. Please sign in again.');

  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const path = `${userId}/platform-${Date.now()}-${provider.toLowerCase().replace(/[^a-z0-9]/g, '')}.${ext}`;
  const { error: upErr } = await supabase.storage.from('qr-codes').upload(path, file, { contentType: file.type || 'image/png', upsert: false });
  if (upErr) throw upErr;
  const { data: pub } = supabase.storage.from('qr-codes').getPublicUrl(path);

  const { error } = await supabase.from('platform_payment_methods').insert({
    provider: provider.trim(),
    account_name: accountName.trim(),
    account_number: accountNumber?.trim() || null,
    qr_image_url: pub.publicUrl,
  });
  if (error) throw error;
}

export async function togglePlatformMethod(id, isActive) {
  const { error } = await db().from('platform_payment_methods').update({ is_active: isActive }).eq('id', id);
  if (error) throw error;
}

export async function deletePlatformMethod(id) {
  const { error } = await db().from('platform_payment_methods').delete().eq('id', id);
  if (error) throw error;
}

// Clinics
export async function fetchClinics() {
  const { data, error } = await db().rpc('admin_clinics');
  if (error) throw error;
  return data ?? [];
}

export async function setClinic({ id, planId, periodEnd, extraSeats, rxLimitOverride, billingPeriod, note }) {
  const { error } = await db().rpc('admin_set_clinic', {
    p_id: id,
    p_plan_id: planId,
    p_period_end: periodEnd || null,
    p_extra_seats: Number(extraSeats) || 0,
    p_rx_limit_override: rxLimitOverride === '' || rxLimitOverride == null ? null : Number(rxLimitOverride),
    p_billing_period: billingPeriod || 'monthly',
    p_note: note || null,
  });
  if (error) throw error;
}

export async function endClinicAsAdmin(id) {
  const { error } = await db().rpc('admin_end_clinic', { p_id: id });
  if (error) throw error;
}
