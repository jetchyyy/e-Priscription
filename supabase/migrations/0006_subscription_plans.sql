-- Migration: 0006_subscription_plans.sql
--
-- Subscription plans with limits the database enforces, paid by manual verification (no gateway yet):
--   1. Plans (name, prices, prescriptions a month, payment QRs) live in a table the admin edits.
--      The pricing page and the limits read from the same rows, so a change applies everywhere at once.
--   2. Each doctor has at most one subscription row. No row, or a paid period that has ended, means the
--      default (free) plan. An admin may set a custom prescription limit for one doctor.
--   3. A prescription insert fails once the doctor has used the month's limit (calendar month, Manila time).
--   4. To subscribe, a doctor pays ODYSSEY's QR, uploads the receipt and reference number; an admin checks
--      the payment and approves it, which starts or extends the paid period.

-- ---------------------------------------------------------------------------------------------------------
-- 1. Plans
-- ---------------------------------------------------------------------------------------------------------
create table if not exists public.subscription_plans (
  id                 text primary key check (id ~ '^[a-z0-9-]{2,30}$'),
  name               text not null check (char_length(trim(name)) between 2 and 40),
  description        text check (char_length(description) <= 200),
  monthly_price      numeric(10, 2) not null default 0 check (monthly_price between 0 and 1000000),
  yearly_price       numeric(10, 2) check (yearly_price between 0 and 10000000),   -- null: 10 x monthly
  rx_limit           integer not null check (rx_limit between 0 and 1000000),       -- prescriptions a month
  qr_limit           integer not null default 1 check (qr_limit between 0 and 100),  -- active payment QRs
  max_doctors        integer not null default 1 check (max_doctors between 1 and 1000),
  extra_doctor_price numeric(10, 2) check (extra_doctor_price between 0 and 1000000),
  features           text[] not null default '{}' check (cardinality(features) <= 12),
  cta                text check (char_length(cta) <= 40),
  sort_order         integer not null default 0,
  is_public          boolean not null default true,     -- shown on the pricing page and to doctors
  is_default         boolean not null default false,    -- the free plan every doctor falls back to
  updated_at         timestamptz not null default now()
);

create unique index if not exists subscription_plans_one_default
  on public.subscription_plans (is_default) where is_default;

insert into public.subscription_plans
  (id, name, description, monthly_price, rx_limit, qr_limit, max_doctors, extra_doctor_price, features, cta, sort_order, is_default)
values
  ('starter', 'Starter', 'For trying it in your clinic before you commit.', 0, 20, 1, 1, null,
   array['1 doctor', '1 payment QR', '90 days of history'], 'Start free', 10, true),
  ('solo', 'Solo', 'For a doctor with their own practice.', 499, 250, 3, 1, null,
   array['1 doctor', '3 payment QRs', 'Full history', 'Your clinic letterhead', 'CSV export'], 'Choose Solo', 20, false),
  ('clinic', 'Clinic', 'For a clinic where several doctors share one front desk.', 1999, 1500, 10, 5, 349,
   array['Up to 5 doctors', '₱349 per extra doctor', '10 payment QRs', 'Letterhead per doctor', 'Clinic admin and reports', 'Onboarding call'],
   'Choose Clinic', 30, false)
on conflict (id) do nothing;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists subscription_plans_touch on public.subscription_plans;
create trigger subscription_plans_touch
  before update on public.subscription_plans
  for each row execute function public.touch_updated_at();

-- The default plan must stay free and cannot be hidden, so every doctor always has a plan to fall back to.
create or replace function public.guard_default_plan()
returns trigger
language plpgsql
as $$
begin
  if new.is_default and (new.monthly_price <> 0 or coalesce(new.yearly_price, 0) <> 0 or not new.is_public) then
    raise exception 'The default plan must be free and shown on the pricing page' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' and old.is_default and not new.is_default then
    raise exception 'Choose another default plan first' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists subscription_plans_guard_default on public.subscription_plans;
create trigger subscription_plans_guard_default
  before insert or update on public.subscription_plans
  for each row execute function public.guard_default_plan();

alter table public.subscription_plans enable row level security;

drop policy if exists plans_select on public.subscription_plans;
create policy plans_select on public.subscription_plans
  for select to anon, authenticated using (is_public or public.is_admin());

drop policy if exists plans_insert_admin on public.subscription_plans;
create policy plans_insert_admin on public.subscription_plans
  for insert to authenticated with check (public.is_admin());

drop policy if exists plans_update_admin on public.subscription_plans;
create policy plans_update_admin on public.subscription_plans
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- No deletes: a plan doctors have used is hidden (is_public = false) instead.
revoke all on public.subscription_plans from anon, authenticated;
grant select on public.subscription_plans to anon, authenticated;
grant insert, update on public.subscription_plans to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 2. Doctor subscriptions
-- ---------------------------------------------------------------------------------------------------------
create table if not exists public.doctor_subscriptions (
  doctor_id          uuid primary key references public.profiles (id) on delete cascade,
  plan_id            text not null references public.subscription_plans (id),
  billing_period     text not null default 'monthly' check (billing_period in ('monthly', 'yearly')),
  current_period_end timestamptz,               -- null: no end date (set by an admin)
  rx_limit_override  integer check (rx_limit_override between 0 and 1000000),
  note               text check (char_length(note) <= 300),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references public.profiles (id)
);

alter table public.doctor_subscriptions enable row level security;

drop policy if exists subscriptions_select on public.doctor_subscriptions;
create policy subscriptions_select on public.doctor_subscriptions
  for select to authenticated using (doctor_id = auth.uid() or public.is_admin());

-- Changes only through review_plan_request() and admin_set_doctor_plan().
revoke all on public.doctor_subscriptions from anon, authenticated;
grant select on public.doctor_subscriptions to authenticated;

-- Start of this calendar month in Manila, as a timestamp.
create or replace function public.manila_month_start(p_at timestamptz default now())
returns timestamptz
language sql
stable
as $$
  select date_trunc('month', p_at at time zone 'Asia/Manila') at time zone 'Asia/Manila';
$$;

-- The plan that applies to a doctor right now and its limits (internal; not callable from the browser).
create or replace function public.effective_plan(p_doctor uuid)
returns table (
  plan_id            text,
  plan_name          text,
  rx_limit           integer,
  qr_limit           integer,
  is_paid            boolean,
  billing_period     text,
  current_period_end timestamptz,
  has_override       boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with sub as (
    select s.*
      from public.doctor_subscriptions s
     where s.doctor_id = p_doctor
       and (s.current_period_end is null or s.current_period_end > now())
  ),
  plan as (
    select p.*
      from public.subscription_plans p
     where p.id = coalesce((select sub.plan_id from sub), (select d.id from public.subscription_plans d where d.is_default))
  )
  select plan.id,
         plan.name,
         coalesce((select sub.rx_limit_override from sub), plan.rx_limit),
         plan.qr_limit,
         exists (select 1 from sub) and not plan.is_default,
         (select sub.billing_period from sub),
         (select sub.current_period_end from sub),
         (select sub.rx_limit_override from sub) is not null
    from plan;
$$;

revoke all on function public.effective_plan(uuid) from public, anon, authenticated;

create or replace function public.rx_used_this_month(p_doctor uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from public.prescriptions
   where doctor_id = p_doctor and created_at >= public.manila_month_start();
$$;

revoke all on function public.rx_used_this_month(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 3. Limits the database enforces
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.enforce_rx_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan record;
  v_used integer;
begin
  -- One insert at a time per doctor, so two tabs cannot both take the last prescription.
  perform pg_advisory_xact_lock(hashtextextended('rx_quota:' || new.doctor_id::text, 0));

  select * into v_plan from public.effective_plan(new.doctor_id);
  v_used := public.rx_used_this_month(new.doctor_id);

  if v_used >= v_plan.rx_limit then
    raise exception 'You have used all % prescriptions in your % plan this month. Upgrade your plan to keep writing prescriptions.',
      v_plan.rx_limit, v_plan.plan_name
      using errcode = '53400', hint = 'rx_quota_reached';
  end if;
  return new;
end;
$$;

drop trigger if exists prescriptions_enforce_quota on public.prescriptions;
create trigger prescriptions_enforce_quota
  before insert on public.prescriptions
  for each row execute function public.enforce_rx_quota();

-- Active payment QRs a doctor may show patients. Existing QRs above the limit stay, but no new one can be
-- switched on until the doctor is under the limit.
create or replace function public.enforce_qr_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan   record;
  v_active integer;
begin
  if coalesce(auth.role(), '') in ('', 'service_role') or public.is_admin() then
    return new;
  end if;
  if not new.is_active or (tg_op = 'UPDATE' and old.is_active) then
    return new;
  end if;

  select * into v_plan from public.effective_plan(new.doctor_id);
  select count(*) into v_active
    from public.doctor_payment_methods
   where doctor_id = new.doctor_id and is_active and id <> new.id;

  if v_active >= v_plan.qr_limit then
    raise exception 'Your % plan shows up to % payment QR%. Hide one first or upgrade your plan.',
      v_plan.plan_name, v_plan.qr_limit, case when v_plan.qr_limit = 1 then '' else 's' end
      using errcode = '53400', hint = 'qr_limit_reached';
  end if;
  return new;
end;
$$;

drop trigger if exists doctor_pm_enforce_limit on public.doctor_payment_methods;
create trigger doctor_pm_enforce_limit
  before insert or update of is_active on public.doctor_payment_methods
  for each row execute function public.enforce_qr_limit();

-- ---------------------------------------------------------------------------------------------------------
-- 4. ODYSSEY's own payment QRs (where doctors pay for a plan)
-- ---------------------------------------------------------------------------------------------------------
create table if not exists public.platform_payment_methods (
  id             uuid primary key default gen_random_uuid(),
  provider       text not null check (char_length(trim(provider)) between 2 and 60),
  account_name   text not null check (char_length(trim(account_name)) between 2 and 120),
  account_number text check (char_length(account_number) <= 40),
  qr_image_url   text not null,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

alter table public.platform_payment_methods enable row level security;

drop policy if exists platform_pm_select on public.platform_payment_methods;
create policy platform_pm_select on public.platform_payment_methods
  for select to authenticated using (is_active or public.is_admin());

drop policy if exists platform_pm_insert on public.platform_payment_methods;
create policy platform_pm_insert on public.platform_payment_methods
  for insert to authenticated with check (public.is_admin());

drop policy if exists platform_pm_update on public.platform_payment_methods;
create policy platform_pm_update on public.platform_payment_methods
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists platform_pm_delete on public.platform_payment_methods;
create policy platform_pm_delete on public.platform_payment_methods
  for delete to authenticated using (public.is_admin());

revoke all on public.platform_payment_methods from anon, authenticated;
grant select, insert, update, delete on public.platform_payment_methods to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 5. Plan payment requests
-- ---------------------------------------------------------------------------------------------------------
create table if not exists public.plan_requests (
  id                uuid primary key default gen_random_uuid(),
  doctor_id         uuid not null references public.profiles (id) on delete cascade,
  plan_id           text not null references public.subscription_plans (id),
  billing_period    text not null check (billing_period in ('monthly', 'yearly')),
  amount            numeric(10, 2) not null check (amount > 0),   -- price when requested, set by the database
  payment_method_id uuid references public.platform_payment_methods (id) on delete set null,
  provider          text check (char_length(provider) <= 60),
  reference_no      text not null check (reference_no ~ '^[A-Za-z0-9 -]{6,40}$'),
  reference_norm    text generated always as (upper(regexp_replace(reference_no, '[^A-Za-z0-9]', '', 'g'))) stored,
  amount_read       numeric(10, 2),                              -- what OCR read from the receipt (a hint)
  screenshot_path   text not null,                               -- "plan-payment-proofs" bucket: <doctor id>/<file>
  status            text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  review_note       text check (char_length(review_note) <= 300),
  created_at        timestamptz not null default now(),
  reviewed_at       timestamptz,
  reviewed_by       uuid references public.profiles (id)
);

create index if not exists plan_requests_status_idx on public.plan_requests (status, created_at);
create index if not exists plan_requests_doctor_idx on public.plan_requests (doctor_id, created_at desc);
create unique index if not exists plan_requests_one_pending
  on public.plan_requests (doctor_id) where status = 'pending';
create unique index if not exists plan_requests_unique_reference
  on public.plan_requests (reference_norm) where status in ('pending', 'approved');

alter table public.plan_requests enable row level security;

drop policy if exists plan_requests_select on public.plan_requests;
create policy plan_requests_select on public.plan_requests
  for select to authenticated using (doctor_id = auth.uid() or public.is_admin());

revoke all on public.plan_requests from anon, authenticated;
grant select on public.plan_requests to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('plan-payment-proofs', 'plan-payment-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Doctors upload into their own folder, with a cap so the bucket cannot be filled.
create or replace function public.can_upload_plan_proof(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select split_part(p_name, '/', 1) = auth.uid()::text
     and exists (select 1 from public.profiles where id = auth.uid() and role = 'doctor')
     and (
       select count(*) from storage.objects o
        where o.bucket_id = 'plan-payment-proofs' and split_part(o.name, '/', 1) = auth.uid()::text
     ) < 40;
$$;

revoke all on function public.can_upload_plan_proof(text) from public, anon;
grant execute on function public.can_upload_plan_proof(text) to authenticated;

drop policy if exists plan_proofs_upload on storage.objects;
create policy plan_proofs_upload on storage.objects
  for insert to authenticated
  with check (bucket_id = 'plan-payment-proofs' and public.can_upload_plan_proof(name));

drop policy if exists plan_proofs_read on storage.objects;
create policy plan_proofs_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'plan-payment-proofs'
    and (split_part(name, '/', 1) = auth.uid()::text or public.is_admin())
  );

-- ---------------------------------------------------------------------------------------------------------
-- 6. Doctor: current plan, usage and requests
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.plan_usage_json(p_doctor uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan record;
  v_used integer;
  v_req  public.plan_requests;
begin
  select * into v_plan from public.effective_plan(p_doctor);
  v_used := public.rx_used_this_month(p_doctor);
  select * into v_req from public.plan_requests
   where doctor_id = p_doctor order by created_at desc limit 1;

  return jsonb_build_object(
    'plan_id',            v_plan.plan_id,
    'plan_name',          v_plan.plan_name,
    'is_paid',            v_plan.is_paid,
    'billing_period',     v_plan.billing_period,
    'current_period_end', v_plan.current_period_end,
    'rx_limit',           v_plan.rx_limit,
    'has_override',       v_plan.has_override,
    'qr_limit',           v_plan.qr_limit,
    'rx_used',            v_used,
    'rx_left',            greatest(v_plan.rx_limit - v_used, 0),
    'resets_at',          public.manila_month_start() + interval '1 month',
    'qr_active',          (select count(*) from public.doctor_payment_methods where doctor_id = p_doctor and is_active),
    'latest_request',     case when v_req.id is null then null else jsonb_build_object(
                            'id', v_req.id, 'plan_id', v_req.plan_id, 'billing_period', v_req.billing_period,
                            'amount', v_req.amount, 'status', v_req.status, 'review_note', v_req.review_note,
                            'created_at', v_req.created_at, 'reviewed_at', v_req.reviewed_at,
                            'reference_end', right(v_req.reference_norm, 4)) end
  );
end;
$$;

revoke all on function public.plan_usage_json(uuid) from public, anon, authenticated;

create or replace function public.my_plan()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  return public.plan_usage_json(auth.uid());
end;
$$;

revoke all on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;

create or replace function public.plan_price(p_plan public.subscription_plans, p_period text)
returns numeric
language sql
immutable
as $$
  select case when p_period = 'yearly' then coalesce(p_plan.yearly_price, p_plan.monthly_price * 10)
              else p_plan.monthly_price end;
$$;

create or replace function public.request_plan(
  p_plan_id         text,
  p_period          text,
  p_reference       text,
  p_screenshot_path text,
  p_method_id       uuid default null,
  p_amount_read     numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan   public.subscription_plans;
  v_method public.platform_payment_methods;
  v_ref    text := upper(trim(coalesce(p_reference, '')));
  v_amount numeric;
  v_id     uuid;
begin
  if not public.is_approved_doctor() then
    raise exception 'Only approved doctors can subscribe to a plan' using errcode = '42501';
  end if;
  if p_period not in ('monthly', 'yearly') then
    raise exception 'Choose monthly or yearly billing' using errcode = '22023';
  end if;

  select * into v_plan from public.subscription_plans where id = p_plan_id and is_public;
  if not found then
    raise exception 'This plan is not available' using errcode = 'P0002';
  end if;
  v_amount := public.plan_price(v_plan, p_period);
  if v_amount <= 0 then
    raise exception 'This plan is free; there is nothing to pay' using errcode = '22023';
  end if;

  if v_ref !~ '^[A-Z0-9 -]{6,40}$' then
    raise exception 'Enter the reference number exactly as it appears on your receipt (6 to 40 letters or numbers)' using errcode = '22023';
  end if;
  if p_screenshot_path is null or split_part(p_screenshot_path, '/', 1) <> auth.uid()::text
     or not exists (select 1 from storage.objects o where o.bucket_id = 'plan-payment-proofs' and o.name = p_screenshot_path) then
    raise exception 'Upload a screenshot of your receipt' using errcode = '22023';
  end if;

  if (select count(*) from public.plan_requests
       where doctor_id = auth.uid() and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Too many payment submissions today. Please contact ODYSSEY support.' using errcode = '54000';
  end if;

  if p_method_id is not null then
    select * into v_method from public.platform_payment_methods where id = p_method_id;
  end if;

  begin
    insert into public.plan_requests
      (doctor_id, plan_id, billing_period, amount, payment_method_id, provider, reference_no, amount_read, screenshot_path)
    values
      (auth.uid(), v_plan.id, p_period, v_amount, v_method.id, v_method.provider, v_ref,
       case when p_amount_read between 0 and 10000000 then round(p_amount_read, 2) end,
       p_screenshot_path)
    returning id into v_id;
  exception when unique_violation then
    if exists (select 1 from public.plan_requests where doctor_id = auth.uid() and status = 'pending') then
      raise exception 'You already have a payment waiting for review. Withdraw it first to send a new one.' using errcode = '23505';
    end if;
    raise exception 'This reference number has already been used. Check the number on your receipt.' using errcode = '23505';
  end;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.request_plan(text, text, text, text, uuid, numeric) from public, anon;
grant execute on function public.request_plan(text, text, text, text, uuid, numeric) to authenticated;

create or replace function public.cancel_plan_request(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.plan_requests
     set status = 'cancelled', reviewed_at = now()
   where id = p_id and doctor_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'No payment waiting for review' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.cancel_plan_request(uuid) from public, anon;
grant execute on function public.cancel_plan_request(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 7. Admin: verify payments and manage doctors' plans
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.review_plan_request(p_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.plan_requests;
  v_sub public.doctor_subscriptions;
  v_len interval;
  v_end timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select * into v_req from public.plan_requests where id = p_id for update;
  if not found then
    raise exception 'Payment request not found' using errcode = 'P0002';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'This payment was already reviewed' using errcode = '22023';
  end if;

  if not p_approve then
    update public.plan_requests
       set status = 'rejected',
           review_note = coalesce(left(nullif(trim(p_note), ''), 300), 'We could not find this payment.'),
           reviewed_at = now(), reviewed_by = auth.uid()
     where id = p_id;
    return;
  end if;

  v_len := case when v_req.billing_period = 'yearly' then interval '1 year' else interval '1 month' end;
  select * into v_sub from public.doctor_subscriptions where doctor_id = v_req.doctor_id for update;

  -- Renewing the same plan extends the paid period; a different plan starts today.
  if found and v_sub.plan_id = v_req.plan_id and v_sub.current_period_end > now() then
    v_end := v_sub.current_period_end + v_len;
  else
    v_end := now() + v_len;
  end if;

  insert into public.doctor_subscriptions (doctor_id, plan_id, billing_period, current_period_end, rx_limit_override, updated_at, updated_by)
  values (v_req.doctor_id, v_req.plan_id, v_req.billing_period, v_end, null, now(), auth.uid())
  on conflict (doctor_id) do update
    set plan_id = excluded.plan_id,
        billing_period = excluded.billing_period,
        current_period_end = excluded.current_period_end,
        rx_limit_override = case when doctor_subscriptions.plan_id = excluded.plan_id
                                 then doctor_subscriptions.rx_limit_override end,
        updated_at = now(),
        updated_by = auth.uid();

  update public.plan_requests
     set status = 'approved', review_note = left(nullif(trim(p_note), ''), 300),
         reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_id;
end;
$$;

revoke all on function public.review_plan_request(uuid, boolean, text) from public, anon;
grant execute on function public.review_plan_request(uuid, boolean, text) to authenticated;

-- Set a doctor's plan by hand (a correction, a free month, a hospital deal). p_period_end null = no end date.
create or replace function public.admin_set_doctor_plan(
  p_doctor_id         uuid,
  p_plan_id           text,
  p_period_end        timestamptz default null,
  p_rx_limit_override integer default null,
  p_billing_period    text default 'monthly',
  p_note              text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_doctor_id and role = 'doctor') then
    raise exception 'Doctor not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.subscription_plans where id = p_plan_id) then
    raise exception 'Plan not found' using errcode = 'P0002';
  end if;
  if p_billing_period not in ('monthly', 'yearly') then
    raise exception 'Choose monthly or yearly billing' using errcode = '22023';
  end if;

  insert into public.doctor_subscriptions
    (doctor_id, plan_id, billing_period, current_period_end, rx_limit_override, note, updated_at, updated_by)
  values
    (p_doctor_id, p_plan_id, p_billing_period, p_period_end, p_rx_limit_override, left(nullif(trim(p_note), ''), 300), now(), auth.uid())
  on conflict (doctor_id) do update
    set plan_id = excluded.plan_id,
        billing_period = excluded.billing_period,
        current_period_end = excluded.current_period_end,
        rx_limit_override = excluded.rx_limit_override,
        note = excluded.note,
        updated_at = now(),
        updated_by = auth.uid();
end;
$$;

revoke all on function public.admin_set_doctor_plan(uuid, text, timestamptz, integer, text, text) from public, anon;
grant execute on function public.admin_set_doctor_plan(uuid, text, timestamptz, integer, text, text) to authenticated;

-- Every doctor with their plan and this month's usage, for the admin dashboard.
create or replace function public.admin_doctor_plans()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(
             jsonb_build_object(
               'doctor_id',   d.id,
               'full_name',   d.full_name,
               'email',       d.email,
               'clinic_name', d.clinic_name,
               'status',      d.status,
               'note',        s.note,
               'subscription_plan_id', s.plan_id
             ) || public.plan_usage_json(d.id)
             order by d.full_name)
      from public.profiles d
      left join public.doctor_subscriptions s on s.doctor_id = d.id
     where d.role = 'doctor' and d.status = 'approved'
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_doctor_plans() from public, anon;
grant execute on function public.admin_doctor_plans() to authenticated;
