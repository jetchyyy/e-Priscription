-- Migration: 0013_admin_analytics.sql
--
-- Superadmin platform performance & app analytics.
--   * Strictly aggregate metrics via SECURITY DEFINER RPC guarded by public.is_admin().
--   * Never exposes patient PII (no patient_name, contact, diagnosis, medicines, or lab_tests) per RA 10173.
--   * Time-series and period filters use Asia/Manila calendar boundaries.

-- ---------------------------------------------------------------------------------------------------------
-- 1. Supporting indexes for time-range analytics
-- ---------------------------------------------------------------------------------------------------------
create index if not exists prescriptions_created_at_idx
  on public.prescriptions (created_at desc);

create index if not exists prescriptions_paid_at_idx
  on public.prescriptions (paid_at desc)
  where payment_status = 'paid';

create index if not exists payment_proofs_created_at_idx
  on public.payment_proofs (created_at desc);

create index if not exists gateway_payments_created_at_idx
  on public.gateway_payments (created_at desc);

-- ---------------------------------------------------------------------------------------------------------
-- 2. Admin analytics RPC
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.admin_app_analytics(p_range text default '30d')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_range        text := case when p_range in ('7d', '30d', '90d', 'month', 'all') then p_range else '30d' end;
  v_today        date := (now() at time zone 'Asia/Manila')::date;
  v_month_start  timestamptz := public.manila_month_start(now());
  v_start        timestamptz;
  v_granularity  text;
  v_series_start date;
  v_series_end   date;
  v_step         interval;
  v_min_rx_month date;

  v_documents    jsonb;
  v_payments     jsonb;
  v_doctors      jsonb;
  v_plans        jsonb;
  v_series       jsonb;
  v_top_doctors  jsonb;
  v_top_specs    jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if v_range = '7d' then
    v_start        := (v_today - 6)::timestamp at time zone 'Asia/Manila';
    v_granularity  := 'day';
    v_series_start := v_today - 6;
    v_series_end   := v_today;
    v_step         := interval '1 day';
  elsif v_range = '30d' then
    v_start        := (v_today - 29)::timestamp at time zone 'Asia/Manila';
    v_granularity  := 'day';
    v_series_start := v_today - 29;
    v_series_end   := v_today;
    v_step         := interval '1 day';
  elsif v_range = 'month' then
    v_start        := v_month_start;
    v_granularity  := 'day';
    v_series_start := (v_month_start at time zone 'Asia/Manila')::date;
    v_series_end   := v_today;
    v_step         := interval '1 day';
  elsif v_range = '90d' then
    v_start        := (v_today - 89)::timestamp at time zone 'Asia/Manila';
    v_granularity  := 'week';
    v_series_start := date_trunc('week', v_today - 89)::date;
    v_series_end   := date_trunc('week', v_today)::date;
    v_step         := interval '1 week';
  else
    v_start        := null;
    v_granularity  := 'month';
    select date_trunc('month', min(created_at) at time zone 'Asia/Manila')::date
      into v_min_rx_month
      from public.prescriptions;
    v_series_end   := date_trunc('month', v_today)::date;
    v_series_start := coalesce(v_min_rx_month, (v_series_end - interval '5 months')::date);
    v_step         := interval '1 month';
  end if;

  -- 1. Prescriptions & lab requests summary (created in range)
  with rx_in as (
    select id, doctor_id, kind, amount, payment_status, created_at, paid_at
      from public.prescriptions
     where v_start is null or created_at >= v_start
  )
  select jsonb_build_object(
    'total',             count(*),
    'rx_count',          count(*) filter (where kind = 'rx'),
    'lab_count',         count(*) filter (where kind = 'lab'),
    'paid_count',        count(*) filter (where payment_status = 'paid'),
    'pending_count',     count(*) filter (where payment_status = 'pending'),
    'unpaid_count',      count(*) filter (where payment_status = 'unpaid'),
    'expired_count',     count(*) filter (where payment_status = 'expired'),
    'conversion_rate',   coalesce(round(count(*) filter (where payment_status = 'paid') * 100.0 / nullif(count(*), 0), 1), 0),
    'billed_amount',     coalesce(sum(amount), 0),
    'collected_amount',  coalesce(sum(amount) filter (where payment_status = 'paid'), 0),
    'avg_fee',           coalesce(round(avg(amount), 2), 0),
    'median_fee',        coalesce(round((percentile_cont(0.5) within group (order by amount))::numeric, 2), 0),
    'median_time_to_pay_minutes', (
      select round((percentile_cont(0.5) within group (order by extract(epoch from (paid_at - created_at)) / 60.0))::numeric, 1)
        from rx_in
       where payment_status = 'paid' and paid_at is not null and paid_at >= created_at
    ),
    'avg_time_to_pay_minutes', (
      select round(avg(extract(epoch from (paid_at - created_at)) / 60.0)::numeric, 1)
        from rx_in
       where payment_status = 'paid' and paid_at is not null and paid_at >= created_at
    )
  )
  into v_documents
  from rx_in;

  -- 2. Patient payment channels & verification health (in range)
  with gp_in as (
    select id, prescription_id, method, price, status
      from public.gateway_payments
     where kind = 'rx'
       and (v_start is null or created_at >= v_start)
  ),
  pp_in as (
    select id, prescription_id, provider, status, created_at, reviewed_at
      from public.payment_proofs
     where v_start is null or created_at >= v_start
  ),
  rx_paid_in as (
    select p.id,
           exists (select 1 from public.gateway_payments g where g.prescription_id = p.id and g.kind = 'rx' and g.status = 'paid') as via_gateway,
           exists (select 1 from public.payment_proofs pr where pr.prescription_id = p.id and pr.status = 'confirmed') as via_manual
      from public.prescriptions p
     where p.payment_status = 'paid'
       and (v_start is null or p.created_at >= v_start)
  )
  select jsonb_build_object(
    'gateway_rx_total_checkouts', (select count(*) from gp_in),
    'gateway_rx_paid_count',      (select count(*) from gp_in where status = 'paid'),
    'gateway_rx_paid_amount',     (select coalesce(sum(price), 0) from gp_in where status = 'paid'),
    'gateway_rx_open_count',      (select count(*) from gp_in where status = 'open'),
    'gateway_rx_needs_review',    (select count(*) from gp_in where status = 'needs_review'),
    'gateway_rx_refunded_count',  (select count(*) from gp_in where status = 'refunded'),
    'gateway_rx_completion_rate', (
      select coalesce(round(count(*) filter (where status = 'paid') * 100.0 / nullif(count(*), 0), 1), 0)
        from gp_in
    ),
    'gateway_methods', coalesce((
      select jsonb_agg(
        jsonb_build_object('method', method, 'count', cnt, 'amount', amt)
        order by cnt desc, method
      )
      from (
        select method, count(*) as cnt, coalesce(sum(price), 0) as amt
          from gp_in
         where status = 'paid'
         group by method
      ) gm
    ), '[]'::jsonb),
    'manual_total_count',     (select count(*) from pp_in),
    'manual_confirmed_count', (select count(*) from pp_in where status = 'confirmed'),
    'manual_rejected_count',  (select count(*) from pp_in where status = 'rejected'),
    'manual_pending_count',   (select count(*) from pp_in where status = 'pending'),
    'manual_confirm_rate', (
      select coalesce(round(count(*) filter (where status = 'confirmed') * 100.0
        / nullif(count(*) filter (where status in ('confirmed', 'rejected')), 0), 1), 0)
        from pp_in
    ),
    'manual_median_review_minutes', (
      select round((percentile_cont(0.5) within group (order by extract(epoch from (reviewed_at - created_at)) / 60.0))::numeric, 1)
        from pp_in
       where reviewed_at is not null and reviewed_at >= created_at
    ),
    'manual_providers', coalesce((
      select jsonb_agg(
        jsonb_build_object('provider', prov, 'count', cnt)
        order by cnt desc, prov
      )
      from (
        select coalesce(nullif(trim(provider), ''), 'Other') as prov, count(*) as cnt
          from pp_in
         where status = 'confirmed'
         group by 1
         order by cnt desc, 1
         limit 6
      ) mp
    ), '[]'::jsonb),
    'paid_via_gateway_count', (select count(*) from rx_paid_in where via_gateway),
    'paid_via_manual_count',  (select count(*) from rx_paid_in where not via_gateway and via_manual),
    'paid_via_other_count',   (select count(*) from rx_paid_in where not via_gateway and not via_manual)
  )
  into v_payments;

  -- 3. Doctor activation, retention & operations
  with doc_profiles as (
    select id, status, created_at, reviewed_at
      from public.profiles
     where role = 'doctor'
  ),
  rx_in as (
    select doctor_id, payment_status
      from public.prescriptions
     where v_start is null or created_at >= v_start
  ),
  active_docs_in as (
    select doctor_id,
           count(*) as sent_cnt,
           count(*) filter (where payment_status = 'paid') as paid_cnt
      from rx_in
     group by doctor_id
  )
  select jsonb_build_object(
    'total_registered',       (select count(*) from doc_profiles),
    'approved',               (select count(*) from doc_profiles where status = 'approved'),
    'pending_approval',       (select count(*) from doc_profiles where status = 'pending'),
    'rejected',               (select count(*) from doc_profiles where status = 'rejected'),
    'registered_in_range',    (select count(*) from doc_profiles where v_start is null or created_at >= v_start),
    'active_in_range',        (select count(*) from active_docs_in),
    'earning_in_range',       (select count(*) from active_docs_in where paid_cnt > 0),
    'wau',                    (select count(distinct doctor_id) from public.prescriptions where created_at >= now() - interval '7 days'),
    'mau',                    (select count(distinct doctor_id) from public.prescriptions where created_at >= now() - interval '30 days'),
    'avg_rx_per_active_doctor', coalesce(
      round((select sum(sent_cnt) from active_docs_in)::numeric / nullif((select count(*) from active_docs_in), 0), 1),
      0
    ),
    'activation_rate', coalesce(
      round((
        select count(distinct d.id)
          from doc_profiles d
          join public.prescriptions p on p.doctor_id = d.id
         where d.status = 'approved'
      ) * 100.0 / nullif((select count(*) from doc_profiles where status = 'approved'), 0), 1),
      0
    ),
    'median_approval_hours', (
      select round((percentile_cont(0.5) within group (order by extract(epoch from (reviewed_at - created_at)) / 3600.0))::numeric, 1)
        from doc_profiles
       where status in ('approved', 'rejected') and reviewed_at is not null and reviewed_at >= created_at
    ),
    'open_change_requests',   (select count(*) from public.profile_change_requests where status = 'pending')
  )
  into v_doctors;

  -- 4. Plans, clinics, packs & quota alerts (current state + plan requests in range)
  with approved_docs as (
    select d.id, ep.plan_id, ep.plan_name, ep.rx_limit, ep.clinic_id
      from public.profiles d
      cross join lateral public.effective_plan(d.id) ep
     where d.role = 'doctor' and d.status = 'approved'
  ),
  month_usage as (
    select doctor_id, count(*) as used
      from public.prescriptions
     where created_at >= v_month_start
     group by doctor_id
  ),
  clinic_usage as (
    select clinic_id, count(*) as used
      from public.prescriptions
     where clinic_id is not null and created_at >= v_month_start
     group by clinic_id
  ),
  doc_quota as (
    select a.id,
           a.rx_limit,
           case
             when a.clinic_id is not null then coalesce(cu.used, 0)
             else coalesce(mu.used, 0)
           end as used
      from approved_docs a
      left join month_usage mu on mu.doctor_id = a.id
      left join clinic_usage cu on cu.clinic_id = a.clinic_id
  )
  select jsonb_build_object(
    'plan_distribution', coalesce((
      select jsonb_agg(
        jsonb_build_object('plan_id', pd.plan_id, 'plan_name', pd.plan_name, 'doctors_count', pd.cnt)
        order by pd.sort_order, pd.plan_name
      )
      from (
        select a.plan_id, a.plan_name, coalesce(sp.sort_order, 999) as sort_order, count(*) as cnt
          from approved_docs a
          left join public.subscription_plans sp on sp.id = a.plan_id
         group by a.plan_id, a.plan_name, sp.sort_order
      ) pd
    ), '[]'::jsonb),
    'active_clinics_count',          (select count(*) from public.clinics where status = 'active'),
    'clinic_doctors_count',          (select count(*) from public.clinic_members where status = 'active'),
    'near_quota_doctors_count',      (select count(*) from doc_quota where rx_limit > 0 and used * 100.0 / rx_limit >= 80),
    'active_pack_credits_remaining', (select coalesce(sum(rx_remaining), 0) from public.rx_credits where rx_remaining > 0 and (expires_at is null or expires_at > now())),
    'plan_requests_in_range', (
      select jsonb_build_object(
        'approved',          count(*) filter (where status = 'approved'),
        'pending',           count(*) filter (where status = 'pending'),
        'paid_needs_review', count(*) filter (where status = 'paid_needs_review'),
        'rejected',          count(*) filter (where status = 'rejected')
      )
      from public.plan_requests
      where status not in ('awaiting_payment', 'cancelled')
        and (v_start is null or created_at >= v_start)
    )
  )
  into v_plans;

  -- 5. Time-series trend (Asia/Manila buckets)
  with buckets as (
    select gs::date as bucket
      from generate_series(v_series_start, v_series_end, v_step) gs
  ),
  created_agg as (
    select case
             when v_granularity = 'day' then (created_at at time zone 'Asia/Manila')::date
             when v_granularity = 'week' then date_trunc('week', created_at at time zone 'Asia/Manila')::date
             else date_trunc('month', created_at at time zone 'Asia/Manila')::date
           end as bucket,
           count(*) as sent,
           count(*) filter (where kind = 'rx') as rx,
           count(*) filter (where kind = 'lab') as lab,
           count(distinct doctor_id) as active_doctors
      from public.prescriptions
     where v_start is null or created_at >= v_start
     group by 1
  ),
  paid_agg as (
    select case
             when v_granularity = 'day' then (paid_at at time zone 'Asia/Manila')::date
             when v_granularity = 'week' then date_trunc('week', paid_at at time zone 'Asia/Manila')::date
             else date_trunc('month', paid_at at time zone 'Asia/Manila')::date
           end as bucket,
           count(*) as paid,
           coalesce(sum(amount), 0) as collected
      from public.prescriptions
     where payment_status = 'paid'
       and paid_at is not null
       and (v_start is null or paid_at >= v_start)
     group by 1
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'bucket',         b.bucket,
      'sent',           coalesce(c.sent, 0),
      'rx',             coalesce(c.rx, 0),
      'lab',            coalesce(c.lab, 0),
      'paid',           coalesce(p.paid, 0),
      'collected',      coalesce(p.collected, 0),
      'active_doctors', coalesce(c.active_doctors, 0)
    )
    order by b.bucket
  ), '[]'::jsonb)
  into v_series
  from buckets b
  left join created_agg c on c.bucket = b.bucket
  left join paid_agg p on p.bucket = b.bucket;

  -- 6. Top doctors leaderboard (strictly aggregate counts & fees, zero patient info)
  with doc_stats as (
    select p.doctor_id,
           count(*) as sent_count,
           count(*) filter (where p.kind = 'rx') as rx_count,
           count(*) filter (where p.kind = 'lab') as lab_count,
           count(*) filter (where p.payment_status = 'paid') as paid_count,
           coalesce(sum(p.amount) filter (where p.payment_status = 'paid'), 0) as collected_amount
      from public.prescriptions p
     where v_start is null or p.created_at >= v_start
     group by p.doctor_id
     order by sent_count desc, collected_amount desc
     limit 15
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'doctor_id',        ds.doctor_id,
      'full_name',        d.full_name,
      'specialty',        d.specialty,
      'clinic_name',      coalesce(ep.clinic_name, d.clinic_name),
      'plan_name',        ep.plan_name,
      'sent_count',       ds.sent_count,
      'rx_count',         ds.rx_count,
      'lab_count',        ds.lab_count,
      'paid_count',       ds.paid_count,
      'conversion_rate',  coalesce(round(ds.paid_count * 100.0 / nullif(ds.sent_count, 0), 1), 0),
      'collected_amount', ds.collected_amount
    )
    order by ds.sent_count desc, ds.collected_amount desc
  ), '[]'::jsonb)
  into v_top_doctors
  from doc_stats ds
  join public.profiles d on d.id = ds.doctor_id
  cross join lateral public.effective_plan(d.id) ep;

  -- 7. Top specialties breakdown
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'specialty',        s.specialty,
      'doctors_count',    s.doctors_count,
      'sent_count',       s.sent_count,
      'paid_count',       s.paid_count,
      'collected_amount', s.collected_amount
    )
    order by s.sent_count desc, s.specialty
  ), '[]'::jsonb)
  into v_top_specs
  from (
    select coalesce(nullif(trim(d.specialty), ''), 'Unspecified') as specialty,
           count(distinct p.doctor_id) as doctors_count,
           count(*) as sent_count,
           count(*) filter (where p.payment_status = 'paid') as paid_count,
           coalesce(sum(p.amount) filter (where p.payment_status = 'paid'), 0) as collected_amount
      from public.prescriptions p
      join public.profiles d on d.id = p.doctor_id
     where v_start is null or p.created_at >= v_start
     group by 1
     order by sent_count desc, 1
     limit 8
  ) s;

  return jsonb_build_object(
    'meta', jsonb_build_object(
      'range',        v_range,
      'granularity',  v_granularity,
      'start_at',     v_start,
      'generated_at', now()
    ),
    'documents',         v_documents,
    'payments',          v_payments,
    'doctors',           v_doctors,
    'plans_and_clinics', v_plans,
    'series',            v_series,
    'top_doctors',       v_top_doctors,
    'top_specialties',   v_top_specs
  );
end;
$$;

revoke all on function public.admin_app_analytics(text) from public, anon;
grant execute on function public.admin_app_analytics(text) to authenticated;
