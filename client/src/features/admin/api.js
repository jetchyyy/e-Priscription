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
    .select('*, doctor:profiles!plan_requests_doctor_id_fkey(full_name, email, clinic_name), pack:rx_packs(name)')
    .order('created_at', { ascending: status === 'pending' })
    .limit(100);
  // Waiting: receipts to check, and online payments that could not be applied by themselves.
  if (status === 'pending') q = q.in('status', ['pending', 'paid_needs_review']);
  else if (status === 'all') q = q.neq('status', 'awaiting_payment');
  else q = q.eq('status', status);
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

// Prescription packs
export async function savePack(pack, { isNew = false } = {}) {
  const row = {
    name: pack.name.trim(),
    rx_count: Number(pack.rx),
    price: Number(pack.price),
    valid_days: pack.validDays === '' || pack.validDays == null ? null : Number(pack.validDays),
    sort_order: Number(pack.sortOrder) || 0,
    is_public: Boolean(pack.isPublic),
  };
  const q = isNew
    ? db().from('rx_packs').insert({ id: pack.id.trim().toLowerCase(), ...row })
    : db().from('rx_packs').update(row).eq('id', pack.id);
  const { data, error } = await q.select().single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------------------------------------
// Online payments, payouts, refunds and taxes (migration 0010)
// ---------------------------------------------------------------------------------------------------------
const rpc = async (name, args) => {
  const { data, error } = await db().rpc(name, args);
  if (error) throw error;
  return data;
};

export const fetchMoneyOverview = () => rpc('admin_money_overview');
export const fetchAppAnalytics = (range = '30d') => rpc('admin_app_analytics', { p_range: range });

export const fetchAuditLogs = ({
  limit = 50,
  cursor = null,
  category = '',
  action = '',
  search = '',
  from = null,
  to = null,
} = {}) =>
  rpc('admin_audit_logs', {
    p_limit: limit,
    p_cursor_at: cursor?.created_at ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_category: category || null,
    p_action: action || null,
    p_search: search || null,
    p_from: from || null,
    p_to: to || null,
  });

export const fetchAuditSummary = ({ category = '', action = '', search = '', from = null, to = null } = {}) =>
  rpc('admin_audit_summary', {
    p_category: category || null,
    p_action: action || null,
    p_search: search || null,
    p_from: from || null,
    p_to: to || null,
  });

/**
 * Parallel-loaded keyset export so >1,000+ audit rows export cleanly without hitting
 * PostgREST's 1,000-row cap or slow OFFSET scans.
 */
export async function exportAllAuditLogs({ category = '', action = '', search = '', from = null, to = null, summary = null } = {}) {
  const s = summary ?? (await fetchAuditSummary({ category, action, search, from, to }));
  const total = Number(s?.total_matching) || 0;
  if (total === 0) return [];

  if (total <= 500 || !s?.min_created_at || !s?.max_created_at || s.min_created_at === s.max_created_at) {
    const all = [];
    let cursor = null;
    while (true) {
      const page = await fetchAuditLogs({ limit: 500, cursor, category, action, search, from, to });
      all.push(...(page?.items ?? []));
      if (!page?.has_more || !page?.next_cursor) break;
      cursor = page.next_cursor;
    }
    return all;
  }

  const minMs = new Date(s.min_created_at).getTime();
  const maxMs = new Date(s.max_created_at).getTime();
  const sliceCount = Math.min(6, Math.max(2, Math.ceil(total / 500)));
  const span = Math.max(1, maxMs - minMs);

  const slices = Array.from({ length: sliceCount }, (_, i) => {
    const sliceFrom = new Date(minMs + Math.floor((span * i) / sliceCount)).toISOString();
    const sliceTo = i === sliceCount - 1 ? s.max_created_at : new Date(minMs + Math.floor((span * (i + 1)) / sliceCount)).toISOString();
    return { sliceFrom, sliceTo };
  });

  const fetchSlice = async ({ sliceFrom, sliceTo }) => {
    const rows = [];
    let cursor = null;
    while (true) {
      const page = await fetchAuditLogs({
        limit: 500,
        cursor,
        category,
        action,
        search,
        from: sliceFrom,
        to: sliceTo,
      });
      rows.push(...(page?.items ?? []));
      if (!page?.has_more || !page?.next_cursor) break;
      cursor = page.next_cursor;
    }
    return rows;
  };

  const results = await Promise.all(slices.map(fetchSlice));
  const byId = new Map();
  for (const list of results) {
    for (const row of list) byId.set(row.id, row);
  }
  return Array.from(byId.values()).sort((a, b) => Number(b.id) - Number(a.id));
}
export const fetchGatewayAdminConfig = () => rpc('admin_gateway_config');
export const fetchGatewayPayments = (filter = 'all') => rpc('admin_gateway_payments', { p_filter: filter });
export const fetchAdminPayouts = (filter = 'open') => rpc('admin_payouts', { p_filter: filter });
export const fetchDoctorBalances = () => rpc('admin_doctor_balances');
export const fetchTaxSummary = (year) => rpc('admin_tax_summary', { p_year: year });

export async function saveGatewaySettings(s) {
  await rpc('admin_set_gateway_settings', {
    p_enabled: s.enabled, p_manual_fallback: s.manual_fallback, p_hold_days: Number(s.hold_days),
    p_min_payout: Number(s.min_payout), p_payout_fee: Number(s.payout_fee),
  });
  if (s.withholding_pct != null) await rpc('admin_set_withholding', { p_pct: Number(s.withholding_pct) }); // migration 0018
}

/** PayMongo's payout deductions (the digital tax) and ODYSSEY's revenue per day (migration 0019). */
export const fetchDeductions = () => rpc('admin_deductions');
export const recordDeduction = ({ kind, amount, occurredAt, payoutId, reference, note }) => rpc('admin_record_deduction', {
  p_kind: kind, p_amount: amount, p_occurred_at: occurredAt, p_payout_id: payoutId || null, p_reference: reference || null, p_note: note || null,
});
export const removeDeduction = (id) => rpc('admin_remove_deduction', { p_id: id });
export const fetchRevenueByDay = (days) => rpc('admin_revenue_by_day', { p_days: days });

/** ODYSSEY's own payout account and revenue withdrawals (migration 0022). Sending goes through paymongoOps('withdraw'). */
export const fetchOdysseyWithdrawals = () => rpc('admin_odyssey_withdrawals');
export const setOdysseyPayoutAccount = ({ provider, bankCode, bankName, accountName, accountNumber }) => rpc('admin_set_odyssey_payout_account', {
  p_provider: provider, p_bank_code: bankCode, p_bank_name: bankName, p_account_name: accountName, p_account_number: accountNumber,
});

/** Creates this week's payouts now (the Saturday cron does the same). Returns { created, total, below_minimum }. */
export const prepareWeeklyPayouts = () => rpc('admin_prepare_weekly_payouts');

export const saveFeeRate = (r) => rpc('admin_set_fee_rate', {
  p_method: r.method, p_enabled: r.is_enabled, p_fee_pct: Number(r.fee_pct), p_fee_fixed: Number(r.fee_fixed),
  p_fee_min: Number(r.fee_min), p_cost_pct: Number(r.cost_pct), p_cost_fixed: Number(r.cost_fixed),
});

export const rejectPayout = ({ id, note }) => rpc('admin_reject_payout', { p_id: id, p_note: note || null });
export const resolvePayout = ({ id, sent, reference, note }) =>
  rpc('admin_resolve_payout', { p_id: id, p_sent: sent, p_reference: reference || null, p_note: note || null });

export async function fetchExpenses(year) {
  const { data, error } = await db()
    .from('business_expenses')
    .select('*')
    .gte('spent_on', `${year}-01-01`)
    .lte('spent_on', `${year}-12-31`)
    .order('spent_on', { ascending: false });
  if (error) throw error;
  return data;
}

export async function addExpense({ spentOn, category, description, amount, file }) {
  let receipt_path = null;
  if (file) {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    receipt_path = `${spentOn.slice(0, 4)}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await db().storage.from('expense-receipts').upload(receipt_path, file, { contentType: file.type });
    if (upErr) throw new Error('Could not upload the receipt. Try again.');
  }
  const { error } = await db().from('business_expenses').insert({
    spent_on: spentOn, category, description: description.trim(), amount: Number(amount), receipt_path,
  });
  if (error) throw error;
}

export async function deleteExpense(e) {
  const { error } = await db().from('business_expenses').delete().eq('id', e.id);
  if (error) throw error;
  if (e.receipt_path) await db().storage.from('expense-receipts').remove([e.receipt_path]);
}

export async function expenseReceiptUrl(path) {
  const { data, error } = await db().storage.from('expense-receipts').createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}

// ---------------------------------------------------------------------------------------------------------
// Referrals (0016_referrals.sql)
// ---------------------------------------------------------------------------------------------------------

export async function fetchAdminReferrals() {
  const { data, error } = await db().rpc('admin_referrals');
  if (error) throw error;
  return data;
}

export async function saveReferralSettings(f) {
  const { error } = await db().rpc('admin_set_referral_settings', {
    p_enabled: Boolean(f.enabled),
    p_required_rx: Number(f.requiredRx),
    p_reward_rx: Number(f.rewardRx),
    p_reward_days: Number(f.rewardDays),
    p_monthly_cap: Number(f.monthlyCap),
  });
  if (error) throw error;
}
