import { db, supabase } from '../../lib/supabase';
import { PLANS } from '../marketing/plans';

/** Turns a subscription_plans row into the shape the pricing page and the portals use. */
export function toPlan(row) {
  return {
    id: row.id,
    name: row.name,
    who: row.description ?? '',
    monthly: Number(row.monthly_price),
    yearly: row.yearly_price == null ? Number(row.monthly_price) * 10 : Number(row.yearly_price),
    rxLimit: row.rx_limit,
    qrLimit: row.qr_limit,
    doctors: row.max_doctors,
    extraDoctor: row.extra_doctor_price == null ? null : Number(row.extra_doctor_price),
    lines: row.features ?? [],
    cta: row.cta || `Choose ${row.name}`,
    isPublic: row.is_public,
    isDefault: row.is_default,
    sortOrder: row.sort_order,
  };
}

/** Price for one billing period ('monthly' | 'yearly'). */
export const planPrice = (plan, period) => (period === 'yearly' ? plan.yearly : plan.monthly);

/** The plans as the admin set them. Without Supabase (a static preview) the built-in sample plans are used. */
export async function fetchPlans() {
  if (!supabase) return PLANS;
  const { data, error } = await db()
    .from('subscription_plans')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data.map(toPlan);
}

export const plansQuery = { queryKey: ['plans'], queryFn: fetchPlans, staleTime: 5 * 60_000 };

/** Errors the database raises when a plan limit is reached (see 0006_subscription_plans.sql). */
export const isLimitError = (e) => e?.code === '53400';

/** Turns an rx_packs row into the shape the screens use. */
export function toPack(row) {
  return {
    id: row.id,
    name: row.name,
    rx: row.rx_count,
    price: Number(row.price),
    validDays: row.valid_days,
    sortOrder: row.sort_order,
    isPublic: row.is_public,
  };
}

/** Packs of extra prescriptions a doctor can buy (admins also get the hidden ones). */
export async function fetchPacks() {
  const { data, error } = await db().from('rx_packs').select('*').order('sort_order', { ascending: true });
  if (error) throw error;
  return data.map(toPack);
}

export const packsQuery = { queryKey: ['rx-packs'], queryFn: fetchPacks, staleTime: 5 * 60_000 };

/** Price per prescription, for comparing packs. */
export const perRx = (pack) => pack.price / pack.rx;
