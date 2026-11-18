-- Migration: 0014_audit_logs.sql
--
-- Immutable, append-only audit log for ODYSSEY Superadmin.
--   * Strictly append-only: UPDATE, DELETE, and TRUNCATE are blocked by triggers and revoked privileges.
--   * Privacy-safe (RA 10173): records actor, action, entity ID, and non-PII metadata only (no patient data).
--   * Scale-ready past 1,000+ rows: bigint identity + composite keyset cursor indexes + parallel-ready RPCs.

-- ---------------------------------------------------------------------------------------------------------
-- 1. Table & composite keyset indexes
-- ---------------------------------------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  actor_id    uuid,
  actor_role  text not null default 'system' check (actor_role in ('admin', 'doctor', 'patient', 'system')),
  actor_label text not null default 'System' check (char_length(actor_label) between 1 and 160),
  category    text not null check (category in ('doctor', 'prescription', 'payment', 'billing', 'clinic', 'security')),
  action      text not null check (char_length(action) between 3 and 80),
  entity_type text not null check (char_length(entity_type) between 2 and 60),
  entity_id   text not null check (char_length(entity_id) between 1 and 120),
  summary     text not null check (char_length(summary) between 1 and 400),
  metadata    jsonb not null default '{}'::jsonb
);

-- O(1) keyset pagination indexes for >1,000+ rows under concurrent load
create index if not exists audit_logs_cursor_idx
  on public.audit_logs (created_at desc, id desc);

create index if not exists audit_logs_category_cursor_idx
  on public.audit_logs (category, created_at desc, id desc);

create index if not exists audit_logs_action_cursor_idx
  on public.audit_logs (action, created_at desc, id desc);

create index if not exists audit_logs_entity_idx
  on public.audit_logs (entity_type, entity_id, created_at desc, id desc);

create index if not exists audit_logs_actor_idx
  on public.audit_logs (actor_id, created_at desc, id desc)
  where actor_id is not null;

-- ---------------------------------------------------------------------------------------------------------
-- 2. Strict immutability & RLS
-- ---------------------------------------------------------------------------------------------------------
alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_select_admin on public.audit_logs;
create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated using (public.is_admin());

revoke all on public.audit_logs from public, anon, authenticated;
grant select on public.audit_logs to authenticated;

create or replace function public.audit_logs_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Audit logs are immutable and cannot be modified, deleted, or truncated.' using errcode = '42501';
end;
$$;

drop trigger if exists audit_logs_immutable_row on public.audit_logs;
create trigger audit_logs_immutable_row
  before update or delete on public.audit_logs
  for each row execute function public.audit_logs_immutable();

drop trigger if exists audit_logs_immutable_truncate on public.audit_logs;
create trigger audit_logs_immutable_truncate
  before truncate on public.audit_logs
  for each statement execute function public.audit_logs_immutable();

-- ---------------------------------------------------------------------------------------------------------
-- 3. Internal writer helper
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.write_audit_log(
  p_category    text,
  p_action      text,
  p_entity_type text,
  p_entity_id   text,
  p_summary     text,
  p_metadata    jsonb default '{}'::jsonb,
  p_actor_id    uuid default null,
  p_actor_role  text default null,
  p_actor_label text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := coalesce(p_actor_id, auth.uid());
  v_prof  record;
  v_role  text;
  v_label text;
begin
  if v_uid is not null then
    select role::text as role, full_name, email
      into v_prof
      from public.profiles
     where id = v_uid;
  end if;

  v_role := coalesce(
    p_actor_role,
    case when v_prof.role in ('admin', 'doctor') then v_prof.role else null end,
    'system'
  );
  v_label := left(coalesce(
    nullif(trim(p_actor_label), ''),
    nullif(trim(v_prof.full_name), ''),
    nullif(trim(v_prof.email), ''),
    case when v_role = 'patient' then 'Patient' else 'System' end
  ), 160);

  insert into public.audit_logs (
    actor_id, actor_role, actor_label, category, action, entity_type, entity_id, summary, metadata
  ) values (
    v_uid,
    v_role,
    v_label,
    p_category,
    left(p_action, 80),
    left(p_entity_type, 60),
    left(coalesce(nullif(p_entity_id, ''), 'unknown'), 120),
    left(p_summary, 400),
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.write_audit_log(text, text, text, text, text, jsonb, uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 4. Automatic database triggers (zero patient PII)
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.audit_profiles_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc_label text := coalesce(nullif(trim(new.full_name), ''), new.email, new.id::text);
begin
  if tg_op = 'INSERT' then
    if new.role = 'doctor' then
      perform public.write_audit_log(
        'doctor',
        'doctor.registered',
        'profile',
        new.id::text,
        format('Doctor registered: %s (PRC %s)', v_doc_label, coalesce(nullif(new.prc_no, ''), 'pending')),
        jsonb_build_object('status', new.status, 'specialty', new.specialty, 'prc_no', new.prc_no),
        new.id,
        'doctor',
        v_doc_label
      );
    end if;
    return new;
  end if;

  if old.status is distinct from new.status then
    perform public.write_audit_log(
      'doctor',
      case
        when new.status = 'approved' then 'doctor.approved'
        when new.status = 'rejected' then 'doctor.rejected'
        else 'doctor.status_changed'
      end,
      'profile',
      new.id::text,
      format('Doctor %s status changed from %s to %s', v_doc_label, old.status, new.status),
      jsonb_build_object(
        'from_status', old.status,
        'to_status', new.status,
        'reject_reason', new.reject_reason
      ),
      coalesce(auth.uid(), new.reviewed_by)
    );
  end if;

  if old.role is distinct from new.role then
    perform public.write_audit_log(
      'security',
      'profile.role_changed',
      'profile',
      new.id::text,
      format('Account role changed for %s: %s -> %s', v_doc_label, old.role, new.role),
      jsonb_build_object('from_role', old.role, 'to_role', new.role)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_audit_profiles on public.profiles;
create trigger trg_audit_profiles
  after insert or update on public.profiles
  for each row execute function public.audit_profiles_trigger();

create or replace function public.audit_profile_change_requests_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit_log(
      'doctor',
      'profile_change.requested',
      'profile_change_request',
      new.id::text,
      'Doctor submitted a verified profile change request',
      jsonb_build_object('doctor_id', new.doctor_id, 'fields', (select jsonb_agg(k) from jsonb_object_keys(new.changes) k)),
      new.doctor_id,
      'doctor'
    );
    return new;
  end if;

  if old.status is distinct from new.status then
    perform public.write_audit_log(
      case when new.status = 'cancelled' then 'doctor' else 'security' end,
      format('profile_change.%s', new.status),
      'profile_change_request',
      new.id::text,
      format('Profile change request marked %s', new.status),
      jsonb_build_object('doctor_id', new.doctor_id, 'from_status', old.status, 'to_status', new.status, 'note', new.review_note),
      coalesce(auth.uid(), new.reviewed_by, case when new.status = 'cancelled' then new.doctor_id else null end)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_audit_profile_change_requests on public.profile_change_requests;
create trigger trg_audit_profile_change_requests
  after insert or update on public.profile_change_requests
  for each row execute function public.audit_profile_change_requests_trigger();

create or replace function public.audit_prescriptions_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind_label text := case when new.kind = 'lab' then 'Lab request' else 'Prescription' end;
begin
  if tg_op = 'INSERT' then
    perform public.write_audit_log(
      'prescription',
      case when new.kind = 'lab' then 'lab.created' else 'rx.created' end,
      'prescription',
      new.id,
      format('%s issued (fee PHP %s)', v_kind_label, trim(to_char(new.amount, 'FM999999990.00'))),
      jsonb_build_object('kind', new.kind, 'amount', new.amount, 'clinic_id', new.clinic_id, 'doctor_id', new.doctor_id),
      new.doctor_id,
      'doctor'
    );
    return new;
  end if;

  if old.payment_status is distinct from new.payment_status then
    perform public.write_audit_log(
      'prescription',
      case
        when new.payment_status = 'paid' then 'rx.paid'
        when new.payment_status = 'pending' then 'rx.payment_pending'
        when new.payment_status = 'expired' then 'rx.expired'
        else 'rx.payment_status_changed'
      end,
      'prescription',
      new.id,
      format('%s payment status: %s -> %s (PHP %s)', v_kind_label, old.payment_status, new.payment_status, trim(to_char(new.amount, 'FM999999990.00'))),
      jsonb_build_object('kind', new.kind, 'from_status', old.payment_status, 'to_status', new.payment_status, 'amount', new.amount, 'doctor_id', new.doctor_id)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_audit_prescriptions on public.prescriptions;
create trigger trg_audit_prescriptions
  after insert or update on public.prescriptions
  for each row execute function public.audit_prescriptions_trigger();

create or replace function public.audit_payment_proofs_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit_log(
      'payment',
      'payment_proof.submitted',
      'payment_proof',
      new.id::text,
      format('Manual payment receipt submitted via %s for Rx %s', coalesce(nullif(new.provider, ''), 'QR'), new.prescription_id),
      jsonb_build_object('prescription_id', new.prescription_id, 'doctor_id', new.doctor_id, 'provider', new.provider),
      null,
      'patient',
      'Patient'
    );
    return new;
  end if;

  if old.status is distinct from new.status then
    perform public.write_audit_log(
      'payment',
      format('payment_proof.%s', new.status),
      'payment_proof',
      new.id::text,
      format('Manual payment receipt %s for Rx %s', new.status, new.prescription_id),
      jsonb_build_object('prescription_id', new.prescription_id, 'doctor_id', new.doctor_id, 'from_status', old.status, 'to_status', new.status, 'reject_reason', new.reject_reason),
      coalesce(auth.uid(), new.doctor_id)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_audit_payment_proofs on public.payment_proofs;
create trigger trg_audit_payment_proofs
  after insert or update on public.payment_proofs
  for each row execute function public.audit_payment_proofs_trigger();

create or replace function public.audit_gateway_payments_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit_log(
      'payment',
      'gateway_payment.created',
      'gateway_payment',
      new.id::text,
      format('PayMongo %s checkout started (%s, PHP %s)', new.kind, upper(new.method), trim(to_char(new.total, 'FM999999990.00'))),
      jsonb_build_object('kind', new.kind, 'method', new.method, 'price', new.price, 'fee', new.fee, 'total', new.total, 'prescription_id', new.prescription_id, 'plan_request_id', new.plan_request_id, 'doctor_id', new.doctor_id),
      case when new.kind = 'purchase' then new.doctor_id else null end,
      case when new.kind = 'purchase' then 'doctor' else 'patient' end,
      case when new.kind = 'purchase' then null else 'Patient' end
    );
    return new;
  end if;

  if old.status is distinct from new.status then
    perform public.write_audit_log(
      'payment',
      format('gateway_payment.%s', new.status),
      'gateway_payment',
      new.id::text,
      format('PayMongo %s payment %s (%s, PHP %s)', new.kind, new.status, upper(new.method), trim(to_char(coalesce(new.paid_amount, new.total), 'FM999999990.00'))),
      jsonb_build_object('kind', new.kind, 'method', new.method, 'from_status', old.status, 'to_status', new.status, 'total', new.total, 'paid_amount', new.paid_amount, 'prescription_id', new.prescription_id, 'doctor_id', new.doctor_id, 'review_note', new.review_note),
      auth.uid(),
      case when auth.uid() is null then 'system' else null end,
      case when auth.uid() is null then 'PayMongo webhook' else null end
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_audit_gateway_payments on public.gateway_payments;
create trigger trg_audit_gateway_payments
  after insert or update on public.gateway_payments
  for each row execute function public.audit_gateway_payments_trigger();

create or replace function public.audit_payouts_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit_log(
      'payment',
      'payout.requested',
      'payout',
      new.id::text,
      format('Payout requested: PHP %s via %s (%s)', trim(to_char(new.amount, 'FM999999990.00')), upper(new.provider), new.bank_name),
      jsonb_build_object('doctor_id', new.doctor_id, 'amount', new.amount, 'fee', new.fee, 'net_amount', new.net_amount, 'provider', new.provider, 'bank_name', new.bank_name),
      new.doctor_id,
      'doctor'
    );
    return new;
  end if;

  if old.status is distinct from new.status then
    perform public.write_audit_log(
      'payment',
      format('payout.%s', new.status),
      'payout',
      new.id::text,
      format('Payout %s: PHP %s (%s)', new.status, trim(to_char(new.amount, 'FM999999990.00')), new.bank_name),
      jsonb_build_object('doctor_id', new.doctor_id, 'from_status', old.status, 'to_status', new.status, 'amount', new.amount, 'admin_note', new.admin_note, 'failure_reason', new.failure_reason),
      coalesce(auth.uid(), new.decided_by)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_audit_payouts on public.payouts;
create trigger trg_audit_payouts
  after insert or update on public.payouts
  for each row execute function public.audit_payouts_trigger();

create or replace function public.audit_plan_requests_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit_log(
      'billing',
      'plan_request.created',
      'plan_request',
      new.id::text,
      format('Plan/pack request (%s) for %s: PHP %s via %s', new.kind, coalesce(new.pack_id, new.plan_id), trim(to_char(new.amount, 'FM999999990.00')), new.channel),
      jsonb_build_object('doctor_id', new.doctor_id, 'kind', new.kind, 'plan_id', new.plan_id, 'pack_id', new.pack_id, 'amount', new.amount, 'channel', new.channel),
      new.doctor_id,
      'doctor'
    );
    return new;
  end if;

  if old.status is distinct from new.status then
    perform public.write_audit_log(
      'billing',
      format('plan_request.%s', new.status),
      'plan_request',
      new.id::text,
      format('Plan/pack request marked %s (PHP %s)', new.status, trim(to_char(new.amount, 'FM999999990.00'))),
      jsonb_build_object('doctor_id', new.doctor_id, 'from_status', old.status, 'to_status', new.status, 'plan_id', new.plan_id, 'pack_id', new.pack_id, 'review_note', new.review_note),
      coalesce(auth.uid(), new.reviewed_by)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_audit_plan_requests on public.plan_requests;
create trigger trg_audit_plan_requests
  after insert or update on public.plan_requests
  for each row execute function public.audit_plan_requests_trigger();

create or replace function public.audit_doctor_subscriptions_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT'
     or old.plan_id is distinct from new.plan_id
     or old.billing_period is distinct from new.billing_period
     or old.current_period_end is distinct from new.current_period_end
     or old.rx_limit_override is distinct from new.rx_limit_override then
    perform public.write_audit_log(
      'billing',
      'subscription.updated',
      'doctor_subscription',
      new.doctor_id::text,
      format('Doctor subscription set to %s (%s)', new.plan_id, new.billing_period),
      jsonb_build_object(
        'plan_id', new.plan_id,
        'billing_period', new.billing_period,
        'current_period_end', new.current_period_end,
        'rx_limit_override', new.rx_limit_override,
        'note', new.note
      ),
      coalesce(auth.uid(), new.updated_by)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_doctor_subscriptions on public.doctor_subscriptions;
create trigger trg_audit_doctor_subscriptions
  after insert or update on public.doctor_subscriptions
  for each row execute function public.audit_doctor_subscriptions_trigger();

create or replace function public.audit_clinics_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit_log(
      'clinic',
      'clinic.created',
      'clinic',
      new.id::text,
      format('Clinic created: %s (%s plan)', new.name, new.plan_id),
      jsonb_build_object('owner_id', new.owner_id, 'plan_id', new.plan_id, 'extra_seats', new.extra_seats),
      coalesce(auth.uid(), new.owner_id)
    );
    return new;
  end if;

  if old.status is distinct from new.status
     or old.plan_id is distinct from new.plan_id
     or old.extra_seats is distinct from new.extra_seats
     or old.rx_limit_override is distinct from new.rx_limit_override then
    perform public.write_audit_log(
      'clinic',
      case when old.status is distinct from new.status and new.status = 'ended' then 'clinic.ended' else 'clinic.updated' end,
      'clinic',
      new.id::text,
      format('Clinic %s updated (status: %s, plan: %s, extra seats: %s)', new.name, new.status, new.plan_id, new.extra_seats),
      jsonb_build_object('from_status', old.status, 'to_status', new.status, 'plan_id', new.plan_id, 'extra_seats', new.extra_seats, 'rx_limit_override', new.rx_limit_override)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_audit_clinics on public.clinics;
create trigger trg_audit_clinics
  after insert or update on public.clinics
  for each row execute function public.audit_clinics_trigger();

create or replace function public.audit_gateway_config_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'gateway_settings' then
    perform public.write_audit_log(
      'security',
      'gateway.settings_updated',
      'gateway_settings',
      'global',
      format('Gateway settings updated (enabled: %s, manual fallback: %s, hold: %sd)', new.enabled, new.manual_fallback, new.hold_days),
      jsonb_build_object('enabled', new.enabled, 'manual_fallback', new.manual_fallback, 'hold_days', new.hold_days, 'min_payout', new.min_payout, 'payout_fee', new.payout_fee),
      coalesce(auth.uid(), new.updated_by)
    );
  elsif tg_table_name = 'gateway_fee_rates' then
    perform public.write_audit_log(
      'security',
      'gateway.fee_rate_updated',
      'gateway_fee_rate',
      new.method,
      format('Gateway rate updated for %s (enabled: %s, fee: %s%% + PHP %s)', upper(new.method), new.is_enabled, new.fee_pct, new.fee_fixed),
      jsonb_build_object('method', new.method, 'is_enabled', new.is_enabled, 'fee_pct', new.fee_pct, 'fee_fixed', new.fee_fixed, 'fee_min', new.fee_min),
      coalesce(auth.uid(), new.updated_by)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_gateway_settings on public.gateway_settings;
create trigger trg_audit_gateway_settings
  after update on public.gateway_settings
  for each row execute function public.audit_gateway_config_trigger();

drop trigger if exists trg_audit_gateway_fee_rates on public.gateway_fee_rates;
create trigger trg_audit_gateway_fee_rates
  after update on public.gateway_fee_rates
  for each row execute function public.audit_gateway_config_trigger();

-- ---------------------------------------------------------------------------------------------------------
-- 5. Parallel-ready keyset pagination & summary RPCs (handles >1,000+ rows cleanly)
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.admin_audit_logs(
  p_limit     integer default 50,
  p_cursor_at timestamptz default null,
  p_cursor_id bigint default null,
  p_category  text default null,
  p_action    text default null,
  p_search    text default null,
  p_from      timestamptz default null,
  p_to        timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit   integer := least(greatest(coalesce(p_limit, 50), 1), 500);
  v_cat     text := nullif(trim(p_category), '');
  v_act     text := nullif(trim(p_action), '');
  v_search  text := nullif(trim(p_search), '');
  v_rows    jsonb;
  v_has_more boolean := false;
  v_last_at timestamptz;
  v_last_id bigint;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  with matched as (
    select a.id,
           a.created_at,
           a.actor_id,
           a.actor_role,
           a.actor_label,
           a.category,
           a.action,
           a.entity_type,
           a.entity_id,
           a.summary,
           a.metadata
      from public.audit_logs a
     where (v_cat is null or a.category = v_cat)
       and (v_act is null or a.action = v_act)
       and (p_from is null or a.created_at >= p_from)
       and (p_to is null or a.created_at <= p_to)
       and (
         v_search is null
         or a.summary ilike '%' || v_search || '%'
         or a.actor_label ilike '%' || v_search || '%'
         or a.entity_id ilike '%' || v_search || '%'
         or a.action ilike '%' || v_search || '%'
       )
       and (
         p_cursor_at is null
         or p_cursor_id is null
         or (a.created_at, a.id) < (p_cursor_at, p_cursor_id)
       )
     order by a.created_at desc, a.id desc
     limit v_limit + 1
  ),
  page as (
    select * from matched limit v_limit
  )
  select (select count(*) > v_limit from matched),
         coalesce((
           select jsonb_agg(
             jsonb_build_object(
               'id',          p.id,
               'created_at',  p.created_at,
               'actor_id',    p.actor_id,
               'actor_role',  p.actor_role,
               'actor_label', p.actor_label,
               'category',    p.category,
               'action',      p.action,
               'entity_type', p.entity_type,
               'entity_id',   p.entity_id,
               'summary',     p.summary,
               'metadata',    p.metadata
             )
             order by p.created_at desc, p.id desc
           )
           from page p
         ), '[]'::jsonb),
         (select p.created_at from page p order by p.created_at asc, p.id asc limit 1),
         (select p.id from page p order by p.created_at asc, p.id asc limit 1)
    into v_has_more, v_rows, v_last_at, v_last_id;

  return jsonb_build_object(
    'items',       v_rows,
    'has_more',    v_has_more,
    'next_cursor', case
                     when v_has_more and v_last_at is not null then
                       jsonb_build_object('created_at', v_last_at, 'id', v_last_id)
                     else null
                   end
  );
end;
$$;

revoke all on function public.admin_audit_logs(integer, timestamptz, bigint, text, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_audit_logs(integer, timestamptz, bigint, text, text, text, timestamptz, timestamptz) to authenticated;

create or replace function public.admin_audit_summary(
  p_category text default null,
  p_action   text default null,
  p_search   text default null,
  p_from     timestamptz default null,
  p_to       timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cat    text := nullif(trim(p_category), '');
  v_act    text := nullif(trim(p_action), '');
  v_search text := nullif(trim(p_search), '');
  v_res    jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  with filtered as (
    select a.category, a.action, a.created_at
      from public.audit_logs a
     where (v_cat is null or a.category = v_cat)
       and (v_act is null or a.action = v_act)
       and (p_from is null or a.created_at >= p_from)
       and (p_to is null or a.created_at <= p_to)
       and (
         v_search is null
         or a.summary ilike '%' || v_search || '%'
         or a.actor_label ilike '%' || v_search || '%'
         or a.entity_id ilike '%' || v_search || '%'
         or a.action ilike '%' || v_search || '%'
       )
  )
  select jsonb_build_object(
    'total_all',      (select count(*) from public.audit_logs),
    'last_24h',       (select count(*) from public.audit_logs where created_at >= now() - interval '24 hours'),
    'total_matching', (select count(*) from filtered),
    'min_created_at', (select min(created_at) from filtered),
    'max_created_at', (select max(created_at) from filtered),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('category', c.category, 'count', c.cnt) order by c.cnt desc, c.category)
        from (select category, count(*) as cnt from public.audit_logs group by category) c
    ), '[]'::jsonb),
    'actions', coalesce((
      select jsonb_agg(act order by act)
        from (select distinct action as act from public.audit_logs order by action limit 80) acts
    ), '[]'::jsonb)
  )
  into v_res;

  return v_res;
end;
$$;

revoke all on function public.admin_audit_summary(text, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_audit_summary(text, text, text, timestamptz, timestamptz) to authenticated;
