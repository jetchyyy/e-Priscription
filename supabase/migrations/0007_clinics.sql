-- Migration: 0007_clinics.sql   (needs 0006_subscription_plans.sql)
--
-- Clinics: several doctor accounts share one plan.
--   * A doctor who pays for a plan with more than one doctor (Clinic) becomes the clinic owner. The clinic holds
--     the plan, the paid period and the extra doctor seats; the owner invites doctors by email.
--   * All active members draw from one monthly prescription pool. The owner may cap a doctor's share.
--   * A doctor is in at most one clinic. While in a clinic their own paid plan is paused and resumes, with the
--     same remaining days, when they leave or the clinic's paid period ends.
--   * The owner sees counts and fees collected per doctor, never patient or clinical details.
--   * More doctors than the plan includes need paid extra seats, verified by an admin like any plan payment.

-- ---------------------------------------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------------------------------------
create table if not exists public.clinics (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (char_length(trim(name)) between 2 and 80),
  owner_id           uuid not null references public.profiles (id) on delete cascade,
  plan_id            text not null references public.subscription_plans (id),
  billing_period     text not null default 'monthly' check (billing_period in ('monthly', 'yearly')),
  current_period_end timestamptz,                  -- null: no end date (set by an admin)
  extra_seats        integer not null default 0 check (extra_seats between 0 and 100),
  rx_limit_override  integer check (rx_limit_override between 0 and 1000000),
  note               text check (char_length(note) <= 300),
  status             text not null default 'active' check (status in ('active', 'ended')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index if not exists clinics_one_active_per_owner on public.clinics (owner_id) where status = 'active';

create table if not exists public.clinic_members (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null references public.clinics (id) on delete cascade,
  doctor_id        uuid not null references public.profiles (id) on delete cascade,
  role             text not null default 'doctor' check (role in ('owner', 'doctor')),
  status           text not null default 'active' check (status in ('active', 'left')),
  rx_cap           integer check (rx_cap between 0 and 1000000),   -- this doctor's monthly share; null: no cap
  paused_remaining interval,                                       -- days left on the doctor's own plan when they joined
  joined_at        timestamptz not null default now(),
  left_at          timestamptz
);

-- A doctor can be an active member of only one clinic.
create unique index if not exists clinic_members_one_active on public.clinic_members (doctor_id) where status = 'active';
create index if not exists clinic_members_clinic_idx on public.clinic_members (clinic_id, status);
create unique index if not exists clinic_members_one_owner on public.clinic_members (clinic_id) where status = 'active' and role = 'owner';

create table if not exists public.clinic_invites (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references public.clinics (id) on delete cascade,
  email      text not null check (email = lower(email) and email ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'),
  invited_by uuid not null references public.profiles (id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);

create unique index if not exists clinic_invites_one_pending on public.clinic_invites (clinic_id, email) where status = 'pending';
create index if not exists clinic_invites_email_idx on public.clinic_invites (email, status);

-- Everything goes through the functions below. Nothing here is readable or writable from the browser directly,
-- so an owner can never read another doctor's rows.
alter table public.clinics enable row level security;
alter table public.clinic_members enable row level security;
alter table public.clinic_invites enable row level security;
revoke all on public.clinics, public.clinic_members, public.clinic_invites from anon, authenticated;

-- Which clinic a prescription was written under (set by the database, never by the browser).
alter table public.prescriptions add column if not exists clinic_id uuid references public.clinics (id) on delete set null;
create index if not exists prescriptions_clinic_idx on public.prescriptions (clinic_id, created_at desc) where clinic_id is not null;

-- Plan payments can now be for a clinic, and for extra doctor seats.
alter table public.plan_requests add column if not exists kind text not null default 'plan';
alter table public.plan_requests add column if not exists seats integer not null default 0;
alter table public.plan_requests add column if not exists clinic_id uuid references public.clinics (id) on delete set null;
do $$ begin
  alter table public.plan_requests add constraint plan_requests_kind_check check (kind in ('plan', 'extra_seats'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.plan_requests add constraint plan_requests_seats_check check (seats between 0 and 100);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------------------------------------
-- 2. The plan that applies to a doctor, now clinic aware
-- ---------------------------------------------------------------------------------------------------------
do $$ begin
  create type public.plan_state as (
    plan_id            text,
    plan_name          text,
    rx_limit           integer,
    qr_limit           integer,
    is_paid            boolean,
    billing_period     text,
    current_period_end timestamptz,
    has_override       boolean,
    clinic_id          uuid,
    clinic_name        text,
    clinic_role        text,
    member_cap         integer
  );
exception when duplicate_object then null; end $$;

drop function if exists public.effective_plan(uuid);

-- 1. an active member of a clinic whose paid period has not ended uses the clinic's plan;
-- 2. otherwise their own paid plan (its days resume from where they paused, once the clinic's period has ended);
-- 3. otherwise the free plan.
create function public.effective_plan(p_doctor uuid)
returns public.plan_state
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r        public.plan_state;
  m        record;
  c        public.clinics;
  s        public.doctor_subscriptions;
  pl       public.subscription_plans;
  v_member boolean;
  v_end    timestamptz;
begin
  select cm.clinic_id, cm.role, cm.rx_cap, cm.paused_remaining
    into m
    from public.clinic_members cm
    join public.clinics cl on cl.id = cm.clinic_id
   where cm.doctor_id = p_doctor and cm.status = 'active' and cl.status = 'active';
  v_member := found;

  if v_member then
    select * into c from public.clinics where id = m.clinic_id;
    if c.current_period_end is null or c.current_period_end > now() then
      select * into pl from public.subscription_plans where id = c.plan_id;
      r := row(pl.id, pl.name, coalesce(c.rx_limit_override, pl.rx_limit), pl.qr_limit, true, c.billing_period,
               c.current_period_end, c.rx_limit_override is not null, c.id, c.name, m.role, m.rx_cap);
      return r;
    end if;
  end if;

  select * into s from public.doctor_subscriptions where doctor_id = p_doctor;
  if found then
    v_end := case when v_member and m.paused_remaining is not null
                  then c.current_period_end + m.paused_remaining
                  else s.current_period_end end;
    if v_end is null or v_end > now() then
      select * into pl from public.subscription_plans where id = s.plan_id;
      r := row(pl.id, pl.name, coalesce(s.rx_limit_override, pl.rx_limit), pl.qr_limit, not pl.is_default, s.billing_period,
               v_end, s.rx_limit_override is not null, null::uuid, null::text, null::text, null::integer);
      return r;
    end if;
  end if;

  select * into pl from public.subscription_plans where is_default;
  r := row(pl.id, pl.name, pl.rx_limit, pl.qr_limit, false, null::text, null::timestamptz, false,
           null::uuid, null::text, null::text, null::integer);
  return r;
end;
$$;

revoke all on function public.effective_plan(uuid) from public, anon, authenticated;

-- Prescriptions a doctor wrote this month outside any clinic (their own plan's count).
create or replace function public.rx_used_this_month(p_doctor uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from public.prescriptions
   where doctor_id = p_doctor and clinic_id is null and created_at >= public.manila_month_start();
$$;

create or replace function public.clinic_pool_used(p_clinic uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from public.prescriptions
   where clinic_id = p_clinic and created_at >= public.manila_month_start();
$$;

create or replace function public.doctor_rx_in_clinic(p_doctor uuid, p_clinic uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from public.prescriptions
   where doctor_id = p_doctor and clinic_id = p_clinic and created_at >= public.manila_month_start();
$$;

revoke all on function public.rx_used_this_month(uuid) from public, anon, authenticated;
revoke all on function public.clinic_pool_used(uuid) from public, anon, authenticated;
revoke all on function public.doctor_rx_in_clinic(uuid, uuid) from public, anon, authenticated;

-- Seats a clinic may fill, and how many are filled.
create or replace function public.clinic_seats(p_clinic uuid)
returns table (allowed integer, used integer)
language sql
stable
security definer
set search_path = public
as $$
  select pl.max_doctors + c.extra_seats,
         (select count(*)::int from public.clinic_members m where m.clinic_id = c.id and m.status = 'active')
    from public.clinics c
    join public.subscription_plans pl on pl.id = c.plan_id
   where c.id = p_clinic;
$$;

revoke all on function public.clinic_seats(uuid) from public, anon, authenticated;

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
  v_plan public.plan_state;
  v_used integer;
  v_mine integer;
begin
  select * into v_plan from public.effective_plan(new.doctor_id);

  -- One insert at a time per clinic (or per doctor), so two doctors cannot both take the last prescription.
  perform pg_advisory_xact_lock(hashtextextended('rx_quota:' || coalesce(v_plan.clinic_id::text, new.doctor_id::text), 0));

  if v_plan.clinic_id is not null then
    v_used := public.clinic_pool_used(v_plan.clinic_id);
    if v_used >= v_plan.rx_limit then
      raise exception 'Your clinic has used all % prescriptions in its % plan this month. Ask the clinic owner to upgrade the plan.',
        v_plan.rx_limit, v_plan.plan_name
        using errcode = '53400', hint = 'clinic_quota_reached';
    end if;
    if v_plan.member_cap is not null then
      v_mine := public.doctor_rx_in_clinic(new.doctor_id, v_plan.clinic_id);
      if v_mine >= v_plan.member_cap then
        raise exception 'You have used your share of % prescriptions in % this month. Ask the clinic owner to raise it.',
          v_plan.member_cap, v_plan.clinic_name
          using errcode = '53400', hint = 'doctor_cap_reached';
      end if;
    end if;
    new.clinic_id := v_plan.clinic_id;
    return new;
  end if;

  v_used := public.rx_used_this_month(new.doctor_id);
  if v_used >= v_plan.rx_limit then
    raise exception 'You have used all % prescriptions in your % plan this month. Upgrade your plan to keep writing prescriptions.',
      v_plan.rx_limit, v_plan.plan_name
      using errcode = '53400', hint = 'rx_quota_reached';
  end if;
  new.clinic_id := null;
  return new;
end;
$$;

-- Active payment QRs: a clinic's limit is shared by all its doctors.
create or replace function public.enforce_qr_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan   public.plan_state;
  v_active integer;
begin
  if coalesce(auth.role(), '') in ('', 'service_role') or public.is_admin() then
    return new;
  end if;
  if not new.is_active or (tg_op = 'UPDATE' and old.is_active) then
    return new;
  end if;

  select * into v_plan from public.effective_plan(new.doctor_id);
  if v_plan.clinic_id is not null then
    select count(*) into v_active
      from public.doctor_payment_methods pm
      join public.clinic_members cm on cm.doctor_id = pm.doctor_id and cm.status = 'active' and cm.clinic_id = v_plan.clinic_id
     where pm.is_active and pm.id <> new.id;
  else
    select count(*) into v_active
      from public.doctor_payment_methods
     where doctor_id = new.doctor_id and is_active and id <> new.id;
  end if;

  if v_active >= v_plan.qr_limit then
    raise exception 'Your % plan shows up to % payment QR%. Hide one first or upgrade your plan.',
      v_plan.plan_name, v_plan.qr_limit, case when v_plan.qr_limit = 1 then '' else 's' end
      using errcode = '53400', hint = 'qr_limit_reached';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- 4. Joining, leaving and ending (internal; the public functions below check who is calling)
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.internal_clinic_join(p_clinic uuid, p_doctor uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s     public.doctor_subscriptions;
  v_rem interval;
begin
  select * into s from public.doctor_subscriptions where doctor_id = p_doctor;
  -- The doctor's own paid days wait while the clinic covers them.
  if found and s.current_period_end is not null and s.current_period_end > now() then
    v_rem := s.current_period_end - now();
  end if;

  begin
    insert into public.clinic_members (clinic_id, doctor_id, role, paused_remaining)
    values (p_clinic, p_doctor, p_role, v_rem);
  exception when unique_violation then
    raise exception 'This doctor is already in a clinic. Leave it first.' using errcode = '23505';
  end;
end;
$$;

create or replace function public.internal_clinic_leave(p_clinic uuid, p_doctor uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m        public.clinic_members;
  c        public.clinics;
  v_cover  boolean;
begin
  select * into m from public.clinic_members
   where clinic_id = p_clinic and doctor_id = p_doctor and status = 'active' for update;
  if not found then
    return;
  end if;
  select * into c from public.clinics where id = p_clinic;
  v_cover := c.current_period_end is null or c.current_period_end > now();

  -- Resume the doctor's own plan with the days they had left.
  if m.paused_remaining is not null then
    update public.doctor_subscriptions
       set current_period_end = (case when v_cover then now() else c.current_period_end end) + m.paused_remaining,
           updated_at = now()
     where doctor_id = p_doctor;
  end if;

  update public.clinic_members
     set status = 'left', left_at = now(), paused_remaining = null
   where id = m.id;
end;
$$;

create or replace function public.internal_clinic_end(p_clinic uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in select doctor_id from public.clinic_members where clinic_id = p_clinic and status = 'active' loop
    perform public.internal_clinic_leave(p_clinic, r.doctor_id);
  end loop;
  update public.clinic_invites set status = 'cancelled' where clinic_id = p_clinic and status = 'pending';
  update public.clinics set status = 'ended', updated_at = now() where id = p_clinic;
end;
$$;

revoke all on function public.internal_clinic_join(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.internal_clinic_leave(uuid, uuid) from public, anon, authenticated;
revoke all on function public.internal_clinic_end(uuid) from public, anon, authenticated;

-- A doctor who is suspended or rejected leaves their clinic; an owner's clinic ends.
create or replace function public.clinic_cleanup_on_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.clinic_members;
begin
  select * into m from public.clinic_members where doctor_id = new.id and status = 'active';
  if found then
    if m.role = 'owner' then
      perform public.internal_clinic_end(m.clinic_id);
    else
      perform public.internal_clinic_leave(m.clinic_id, new.id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_clinic_cleanup on public.profiles;
create trigger profiles_clinic_cleanup
  after update of status on public.profiles
  for each row when (old.status = 'approved' and new.status <> 'approved')
  execute function public.clinic_cleanup_on_status();

-- ---------------------------------------------------------------------------------------------------------
-- 5. Usage, now with the clinic's pool and the doctor's own share
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.plan_usage_json(p_doctor uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan   public.plan_state;
  v_used   integer;
  v_mine   integer;
  v_left   integer;
  v_limiter text;
  v_req    public.plan_requests;
  v_clinic jsonb;
  v_qr     bigint;
begin
  select * into v_plan from public.effective_plan(p_doctor);

  if v_plan.clinic_id is not null then
    v_used := public.clinic_pool_used(v_plan.clinic_id);
    v_mine := public.doctor_rx_in_clinic(p_doctor, v_plan.clinic_id);
    v_left := greatest(least(v_plan.rx_limit - v_used, coalesce(v_plan.member_cap - v_mine, v_plan.rx_limit - v_used)), 0);
    v_limiter := case when v_left > 0 then null when v_plan.rx_limit - v_used <= 0 then 'clinic' else 'cap' end;
    v_clinic := jsonb_build_object(
      'id', v_plan.clinic_id, 'name', v_plan.clinic_name, 'role', v_plan.clinic_role,
      'pool_used', v_used, 'my_used', v_mine, 'my_cap', v_plan.member_cap, 'limited_by', v_limiter);
    select count(*) into v_qr
      from public.doctor_payment_methods pm
      join public.clinic_members cm on cm.doctor_id = pm.doctor_id and cm.status = 'active' and cm.clinic_id = v_plan.clinic_id
     where pm.is_active;
  else
    v_used := public.rx_used_this_month(p_doctor);
    v_left := greatest(v_plan.rx_limit - v_used, 0);
    v_clinic := null;
    select count(*) into v_qr from public.doctor_payment_methods where doctor_id = p_doctor and is_active;
  end if;

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
    'rx_left',            v_left,
    'resets_at',          public.manila_month_start() + interval '1 month',
    'qr_active',          v_qr,
    'clinic',             v_clinic,
    'latest_request',     case when v_req.id is null then null else jsonb_build_object(
                            'id', v_req.id, 'kind', v_req.kind, 'seats', v_req.seats, 'plan_id', v_req.plan_id,
                            'billing_period', v_req.billing_period, 'amount', v_req.amount, 'status', v_req.status,
                            'review_note', v_req.review_note, 'created_at', v_req.created_at,
                            'reviewed_at', v_req.reviewed_at, 'reference_end', right(v_req.reference_norm, 4)) end
  );
end;
$$;

revoke all on function public.plan_usage_json(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 6. Paying for a clinic plan and for extra seats
-- ---------------------------------------------------------------------------------------------------------
drop function if exists public.request_plan(text, text, text, text, uuid, numeric);

create or replace function public.request_plan(
  p_plan_id         text,
  p_period          text,
  p_reference       text,
  p_screenshot_path text,
  p_method_id       uuid default null,
  p_amount_read     numeric default null,
  p_extra_seats     integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan    public.subscription_plans;
  v_method  public.platform_payment_methods;
  v_ref     text := upper(trim(coalesce(p_reference, '')));
  v_amount  numeric;
  v_id      uuid;
  v_seats   integer := coalesce(p_extra_seats, 0);
  v_clinic  public.clinics;
  v_member  public.clinic_members;
  v_need    integer;
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

  select * into v_member from public.clinic_members where doctor_id = auth.uid() and status = 'active';
  if found and v_member.role = 'doctor' then
    raise exception 'Your clinic owner manages your plan' using errcode = '42501';
  end if;
  select * into v_clinic from public.clinics where owner_id = auth.uid() and status = 'active';

  if v_plan.max_doctors > 1 then
    -- A clinic plan: extra seats are optional, priced per doctor for the whole period.
    if v_seats < 0 or v_seats > 50 or (v_seats > 0 and v_plan.extra_doctor_price is null) then
      raise exception 'Choose a valid number of extra doctors' using errcode = '22023';
    end if;
    if v_clinic.id is not null then
      select greatest(allowed.used - v_plan.max_doctors, 0) into v_need from public.clinic_seats(v_clinic.id) allowed;
      if v_seats < coalesce(v_need, 0) then
        raise exception 'Your clinic has % doctors. Keep at least % extra seat(s) or remove a doctor first.',
          v_need + v_plan.max_doctors, v_need using errcode = '22023';
      end if;
    end if;
    v_amount := v_amount + v_seats * coalesce(v_plan.extra_doctor_price, 0) * (case when p_period = 'yearly' then 10 else 1 end);
  else
    if v_seats <> 0 then
      raise exception 'Extra doctor seats are only for clinic plans' using errcode = '22023';
    end if;
    if v_clinic.id is not null then
      raise exception 'You run a clinic. Choose a clinic plan, or end the clinic first.' using errcode = '22023';
    end if;
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
      (doctor_id, plan_id, billing_period, amount, payment_method_id, provider, reference_no, amount_read,
       screenshot_path, kind, seats, clinic_id)
    values
      (auth.uid(), v_plan.id, p_period, v_amount, v_method.id, v_method.provider, v_ref,
       case when p_amount_read between 0 and 10000000 then round(p_amount_read, 2) end,
       p_screenshot_path, 'plan', v_seats, v_clinic.id)
    returning id into v_id;
  exception when unique_violation then
    if exists (select 1 from public.plan_requests where doctor_id = auth.uid() and status = 'pending') then
      raise exception 'You already have a payment waiting for review. Withdraw it first to send a new one.' using errcode = '23505';
    end if;
    raise exception 'This reference number has already been used. Check the number on your receipt.' using errcode = '23505';
  end;

  return jsonb_build_object('ok', true, 'id', v_id, 'amount', v_amount);
end;
$$;

revoke all on function public.request_plan(text, text, text, text, uuid, numeric, integer) from public, anon;
grant execute on function public.request_plan(text, text, text, text, uuid, numeric, integer) to authenticated;

-- Price of extra seats for the rest of the clinic's paid period.
create or replace function public.internal_seat_quote(p_clinic uuid, p_seats integer)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c      public.clinics;
  pl     public.subscription_plans;
  v_len  numeric;
  v_frac numeric := 1;
  v_unit numeric;
begin
  select * into c from public.clinics where id = p_clinic;
  select * into pl from public.subscription_plans where id = c.plan_id;
  if pl.extra_doctor_price is null then
    raise exception 'This plan has no extra doctor seats. Contact ODYSSEY.' using errcode = '22023';
  end if;
  v_unit := pl.extra_doctor_price * (case when c.billing_period = 'yearly' then 10 else 1 end);
  if c.current_period_end is not null then
    v_len := extract(epoch from (case when c.billing_period = 'yearly' then interval '1 year' else interval '1 month' end));
    v_frac := greatest(least(extract(epoch from (c.current_period_end - now())) / v_len, 1), 0.05);
  end if;
  return greatest(round(p_seats * v_unit * v_frac, 2), 1);
end;
$$;

revoke all on function public.internal_seat_quote(uuid, integer) from public, anon, authenticated;

create or replace function public.quote_extra_seats(p_seats integer)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c public.clinics;
begin
  select * into c from public.clinics where owner_id = auth.uid() and status = 'active';
  if not found then
    raise exception 'Only the clinic owner can add seats' using errcode = '42501';
  end if;
  if p_seats is null or p_seats < 1 or p_seats > 50 then
    raise exception 'Choose between 1 and 50 seats' using errcode = '22023';
  end if;
  return public.internal_seat_quote(c.id, p_seats);
end;
$$;

revoke all on function public.quote_extra_seats(integer) from public, anon;
grant execute on function public.quote_extra_seats(integer) to authenticated;

create or replace function public.request_extra_seats(
  p_seats           integer,
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
  c        public.clinics;
  v_method public.platform_payment_methods;
  v_ref    text := upper(trim(coalesce(p_reference, '')));
  v_amount numeric;
  v_id     uuid;
begin
  select * into c from public.clinics where owner_id = auth.uid() and status = 'active';
  if not found or not public.is_approved_doctor() then
    raise exception 'Only the clinic owner can add seats' using errcode = '42501';
  end if;
  if c.current_period_end is not null and c.current_period_end <= now() then
    raise exception 'Renew the clinic plan first' using errcode = '22023';
  end if;
  if p_seats is null or p_seats < 1 or p_seats > 50 then
    raise exception 'Choose between 1 and 50 seats' using errcode = '22023';
  end if;
  v_amount := public.internal_seat_quote(c.id, p_seats);

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
      (doctor_id, plan_id, billing_period, amount, payment_method_id, provider, reference_no, amount_read,
       screenshot_path, kind, seats, clinic_id)
    values
      (auth.uid(), c.plan_id, c.billing_period, v_amount, v_method.id, v_method.provider, v_ref,
       case when p_amount_read between 0 and 10000000 then round(p_amount_read, 2) end,
       p_screenshot_path, 'extra_seats', p_seats, c.id)
    returning id into v_id;
  exception when unique_violation then
    if exists (select 1 from public.plan_requests where doctor_id = auth.uid() and status = 'pending') then
      raise exception 'You already have a payment waiting for review. Withdraw it first to send a new one.' using errcode = '23505';
    end if;
    raise exception 'This reference number has already been used. Check the number on your receipt.' using errcode = '23505';
  end;

  return jsonb_build_object('ok', true, 'id', v_id, 'amount', v_amount);
end;
$$;

revoke all on function public.request_extra_seats(integer, text, text, uuid, numeric) from public, anon;
grant execute on function public.request_extra_seats(integer, text, text, uuid, numeric) to authenticated;

-- Admin approval, now for clinic plans and extra seats as well.
create or replace function public.review_plan_request(p_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req    public.plan_requests;
  v_plan   public.subscription_plans;
  v_sub    public.doctor_subscriptions;
  v_clinic public.clinics;
  v_doc    public.profiles;
  v_len    interval;
  v_end    timestamptz;
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

  select * into v_plan from public.subscription_plans where id = v_req.plan_id;
  v_len := case when v_req.billing_period = 'yearly' then interval '1 year' else interval '1 month' end;

  if v_req.kind = 'extra_seats' then
    select * into v_clinic from public.clinics where id = v_req.clinic_id and status = 'active' for update;
    if not found or (v_clinic.current_period_end is not null and v_clinic.current_period_end <= now()) then
      raise exception 'This clinic plan has ended. Reject the payment or renew the clinic first.' using errcode = '22023';
    end if;
    update public.clinics
       set extra_seats = least(extra_seats + v_req.seats, 100), updated_at = now()
     where id = v_clinic.id;

  elsif v_plan.max_doctors > 1 then
    -- A clinic plan: start a new clinic with the doctor as owner, or renew the one they own.
    select * into v_clinic from public.clinics where owner_id = v_req.doctor_id and status = 'active' for update;
    if found then
      if v_clinic.plan_id = v_req.plan_id and v_clinic.current_period_end > now() then
        v_end := v_clinic.current_period_end + v_len;
      else
        v_end := now() + v_len;
      end if;
      update public.clinics
         set plan_id = v_req.plan_id, billing_period = v_req.billing_period, current_period_end = v_end,
             extra_seats = v_req.seats,
             rx_limit_override = case when plan_id = v_req.plan_id then rx_limit_override end,
             updated_at = now()
       where id = v_clinic.id;
    else
      select * into v_doc from public.profiles where id = v_req.doctor_id;
      insert into public.clinics (name, owner_id, plan_id, billing_period, current_period_end, extra_seats)
      values (
        coalesce(nullif(left(trim(coalesce(v_doc.clinic_name, '')), 80), ''), left('Clinic of ' || coalesce(v_doc.full_name, 'doctor'), 80)),
        v_req.doctor_id, v_req.plan_id, v_req.billing_period, now() + v_len, v_req.seats)
      returning * into v_clinic;
      perform public.internal_clinic_join(v_clinic.id, v_req.doctor_id, 'owner');
    end if;

  else
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
  end if;

  update public.plan_requests
     set status = 'approved', review_note = left(nullif(trim(p_note), ''), 300),
         reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- 7. Owner: invites, members, shares
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.internal_owned_clinic()
returns public.clinics
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c public.clinics;
begin
  select * into c from public.clinics where owner_id = auth.uid() and status = 'active';
  if not found then
    raise exception 'Only the clinic owner can do this' using errcode = '42501';
  end if;
  return c;
end;
$$;

revoke all on function public.internal_owned_clinic() from public, anon, authenticated;

create or replace function public.invite_doctor(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  c       public.clinics;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_id    uuid;
begin
  c := public.internal_owned_clinic();
  if c.current_period_end is not null and c.current_period_end <= now() then
    raise exception 'Renew the clinic plan before inviting doctors' using errcode = '22023';
  end if;
  if v_email !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' then
    raise exception 'Enter a valid email address' using errcode = '22023';
  end if;
  if exists (select 1 from public.clinic_members m join public.profiles p on p.id = m.doctor_id
              where m.clinic_id = c.id and m.status = 'active' and lower(p.email) = v_email) then
    raise exception 'This doctor is already in your clinic' using errcode = '23505';
  end if;

  update public.clinic_invites set status = 'expired'
   where clinic_id = c.id and status = 'pending' and expires_at <= now();
  if (select count(*) from public.clinic_invites where clinic_id = c.id and status = 'pending') >= 20 then
    raise exception 'You have 20 invitations waiting. Cancel some first.' using errcode = '54000';
  end if;

  begin
    insert into public.clinic_invites (clinic_id, email, invited_by) values (c.id, v_email, auth.uid()) returning id into v_id;
  exception when unique_violation then
    raise exception 'This email already has an invitation waiting' using errcode = '23505';
  end;
  return v_id;
end;
$$;

create or replace function public.cancel_clinic_invite(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.clinics;
begin
  c := public.internal_owned_clinic();
  update public.clinic_invites set status = 'cancelled'
   where id = p_id and clinic_id = c.id and status = 'pending';
  if not found then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.rename_clinic(p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.clinics;
  v text := trim(coalesce(p_name, ''));
begin
  c := public.internal_owned_clinic();
  if char_length(v) < 2 or char_length(v) > 80 then
    raise exception 'The clinic name must be 2 to 80 characters' using errcode = '22023';
  end if;
  update public.clinics set name = v, updated_at = now() where id = c.id;
end;
$$;

create or replace function public.set_member_cap(p_doctor uuid, p_cap integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.clinics;
begin
  c := public.internal_owned_clinic();
  if p_cap is not null and (p_cap < 0 or p_cap > 1000000) then
    raise exception 'Enter a number from 0 up' using errcode = '22023';
  end if;
  update public.clinic_members set rx_cap = p_cap
   where clinic_id = c.id and doctor_id = p_doctor and status = 'active' and role = 'doctor';
  if not found then
    raise exception 'Doctor not found in your clinic' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.remove_clinic_member(p_doctor uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.clinics;
begin
  c := public.internal_owned_clinic();
  if p_doctor = auth.uid() then
    raise exception 'Hand over ownership or end the clinic instead' using errcode = '22023';
  end if;
  if not exists (select 1 from public.clinic_members where clinic_id = c.id and doctor_id = p_doctor and status = 'active') then
    raise exception 'Doctor not found in your clinic' using errcode = 'P0002';
  end if;
  perform public.internal_clinic_leave(c.id, p_doctor);
end;
$$;

create or replace function public.transfer_clinic_owner(p_doctor uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.clinics;
begin
  c := public.internal_owned_clinic();
  if p_doctor = auth.uid() then
    raise exception 'You already own this clinic' using errcode = '22023';
  end if;
  if not exists (select 1 from public.clinic_members where clinic_id = c.id and doctor_id = p_doctor and status = 'active') then
    raise exception 'Choose a doctor who is in your clinic' using errcode = 'P0002';
  end if;
  update public.clinic_members set role = 'doctor' where clinic_id = c.id and doctor_id = auth.uid() and status = 'active';
  update public.clinic_members set role = 'owner', rx_cap = null where clinic_id = c.id and doctor_id = p_doctor and status = 'active';
  update public.clinics set owner_id = p_doctor, updated_at = now() where id = c.id;
end;
$$;

create or replace function public.end_clinic()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.clinics;
begin
  c := public.internal_owned_clinic();
  perform public.internal_clinic_end(c.id);
end;
$$;

revoke all on function public.invite_doctor(text) from public, anon;
revoke all on function public.cancel_clinic_invite(uuid) from public, anon;
revoke all on function public.rename_clinic(text) from public, anon;
revoke all on function public.set_member_cap(uuid, integer) from public, anon;
revoke all on function public.remove_clinic_member(uuid) from public, anon;
revoke all on function public.transfer_clinic_owner(uuid) from public, anon;
revoke all on function public.end_clinic() from public, anon;
grant execute on function public.invite_doctor(text) to authenticated;
grant execute on function public.cancel_clinic_invite(uuid) to authenticated;
grant execute on function public.rename_clinic(text) to authenticated;
grant execute on function public.set_member_cap(uuid, integer) to authenticated;
grant execute on function public.remove_clinic_member(uuid) to authenticated;
grant execute on function public.transfer_clinic_owner(uuid) to authenticated;
grant execute on function public.end_clinic() to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 8. Doctor: invitations, leaving, and the clinic page
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.my_clinic_invites()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  select lower(email) into v_email from public.profiles where id = auth.uid() and role = 'doctor' and status = 'approved';
  if v_email is null then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', i.id, 'clinic_name', c.name, 'owner_name', o.full_name,
             'created_at', i.created_at, 'expires_at', i.expires_at,
             'has_seat', (select s.used < s.allowed from public.clinic_seats(c.id) s)) order by i.created_at desc)
      from public.clinic_invites i
      join public.clinics c on c.id = i.clinic_id and c.status = 'active'
      join public.profiles o on o.id = c.owner_id
     where i.email = v_email and i.status = 'pending' and i.expires_at > now()
  ), '[]'::jsonb);
end;
$$;

create or replace function public.respond_clinic_invite(p_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  i       public.clinic_invites;
  c       public.clinics;
  v_email text;
  v_seats record;
begin
  select lower(email) into v_email from public.profiles where id = auth.uid() and role = 'doctor' and status = 'approved';
  if v_email is null then
    raise exception 'Only approved doctors can join a clinic' using errcode = '42501';
  end if;

  select * into i from public.clinic_invites where id = p_id for update;
  if not found or i.email <> v_email or i.status <> 'pending' or i.expires_at <= now() then
    raise exception 'This invitation is no longer available' using errcode = 'P0002';
  end if;

  if not p_accept then
    update public.clinic_invites set status = 'declined' where id = p_id;
    return;
  end if;

  select * into c from public.clinics where id = i.clinic_id and status = 'active' for update;
  if not found or (c.current_period_end is not null and c.current_period_end <= now()) then
    raise exception 'This clinic plan has ended. Ask the clinic owner to renew it.' using errcode = '22023';
  end if;
  if exists (select 1 from public.clinic_members where doctor_id = auth.uid() and status = 'active') then
    raise exception 'You are already in a clinic. Leave it first.' using errcode = '23505';
  end if;
  select * into v_seats from public.clinic_seats(c.id);
  if v_seats.used >= v_seats.allowed then
    raise exception 'This clinic has no free doctor seat. Ask the clinic owner to add one.' using errcode = '53400', hint = 'no_seat';
  end if;

  perform public.internal_clinic_join(c.id, auth.uid(), 'doctor');
  update public.clinic_invites set status = 'accepted' where id = p_id;
end;
$$;

create or replace function public.leave_clinic()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.clinic_members;
begin
  select * into m from public.clinic_members where doctor_id = auth.uid() and status = 'active';
  if not found then
    raise exception 'You are not in a clinic' using errcode = 'P0002';
  end if;
  if m.role = 'owner' then
    raise exception 'Hand over ownership to another doctor or end the clinic first' using errcode = '22023';
  end if;
  perform public.internal_clinic_leave(m.clinic_id, auth.uid());
end;
$$;

-- The clinic page. The owner sees each doctor's counts and fees; members see only the clinic and their own share.
-- Patient names, diagnoses and medicines are never part of this.
create or replace function public.my_clinic()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m       public.clinic_members;
  c       public.clinics;
  pl      public.subscription_plans;
  v_seats record;
  v_owner boolean;
  v_covered boolean;
begin
  select * into m from public.clinic_members where doctor_id = auth.uid() and status = 'active';
  if not found then
    return null;
  end if;
  select * into c from public.clinics where id = m.clinic_id and status = 'active';
  if not found then
    return null;
  end if;
  select * into pl from public.subscription_plans where id = c.plan_id;
  select * into v_seats from public.clinic_seats(c.id);
  v_owner := m.role = 'owner';
  v_covered := c.current_period_end is null or c.current_period_end > now();

  return jsonb_build_object(
    'id',                 c.id,
    'name',               c.name,
    'role',               m.role,
    'plan_id',            pl.id,
    'plan_name',          pl.name,
    'billing_period',     c.billing_period,
    'current_period_end', c.current_period_end,
    'covered',            v_covered,
    'rx_limit',           coalesce(c.rx_limit_override, pl.rx_limit),
    'pool_used',          public.clinic_pool_used(c.id),
    'resets_at',          public.manila_month_start() + interval '1 month',
    'seats_allowed',      v_seats.allowed,
    'seats_used',         v_seats.used,
    'seats_included',     pl.max_doctors,
    'extra_seats',        c.extra_seats,
    'extra_seat_price',   pl.extra_doctor_price,
    'my_used',            public.doctor_rx_in_clinic(auth.uid(), c.id),
    'my_cap',             m.rx_cap,
    'members', case when not v_owner then null else coalesce((
        select jsonb_agg(jsonb_build_object(
                 'doctor_id', x.doctor_id, 'full_name', p.full_name, 'email', p.email, 'role', x.role,
                 'rx_cap', x.rx_cap, 'joined_at', x.joined_at,
                 'rx_used', public.doctor_rx_in_clinic(x.doctor_id, c.id),
                 'fees_collected', coalesce((
                    select sum(r.amount) from public.prescriptions r
                     where r.doctor_id = x.doctor_id and r.clinic_id = c.id and r.payment_status = 'paid'
                       and r.created_at >= public.manila_month_start()), 0)
               ) order by (x.role = 'owner') desc, p.full_name)
          from public.clinic_members x
          join public.profiles p on p.id = x.doctor_id
         where x.clinic_id = c.id and x.status = 'active'
      ), '[]'::jsonb) end,
    'invites', case when not v_owner then null else coalesce((
        select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'created_at', i.created_at, 'expires_at', i.expires_at)
                         order by i.created_at desc)
          from public.clinic_invites i
         where i.clinic_id = c.id and i.status = 'pending' and i.expires_at > now()
      ), '[]'::jsonb) end
  );
end;
$$;

revoke all on function public.my_clinic_invites() from public, anon;
revoke all on function public.respond_clinic_invite(uuid, boolean) from public, anon;
revoke all on function public.leave_clinic() from public, anon;
revoke all on function public.my_clinic() from public, anon;
grant execute on function public.my_clinic_invites() to authenticated;
grant execute on function public.respond_clinic_invite(uuid, boolean) to authenticated;
grant execute on function public.leave_clinic() to authenticated;
grant execute on function public.my_clinic() to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 9. Admin: see and correct clinics
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.admin_clinics()
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
    select jsonb_agg(jsonb_build_object(
             'id', c.id, 'name', c.name, 'owner_name', o.full_name, 'owner_email', o.email,
             'plan_id', c.plan_id, 'plan_name', pl.name, 'billing_period', c.billing_period,
             'current_period_end', c.current_period_end, 'extra_seats', c.extra_seats,
             'rx_limit', coalesce(c.rx_limit_override, pl.rx_limit), 'has_override', c.rx_limit_override is not null,
             'pool_used', public.clinic_pool_used(c.id), 'note', c.note,
             'seats_allowed', pl.max_doctors + c.extra_seats,
             'seats_used', (select count(*) from public.clinic_members m where m.clinic_id = c.id and m.status = 'active'),
             'members', (select coalesce(jsonb_agg(jsonb_build_object(
                           'full_name', p.full_name, 'role', m.role,
                           'rx_used', public.doctor_rx_in_clinic(m.doctor_id, c.id)) order by (m.role = 'owner') desc, p.full_name), '[]'::jsonb)
                           from public.clinic_members m join public.profiles p on p.id = m.doctor_id
                          where m.clinic_id = c.id and m.status = 'active')
           ) order by c.created_at desc)
      from public.clinics c
      join public.subscription_plans pl on pl.id = c.plan_id
      join public.profiles o on o.id = c.owner_id
     where c.status = 'active'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_set_clinic(
  p_id                uuid,
  p_plan_id           text,
  p_period_end        timestamptz default null,
  p_extra_seats       integer default 0,
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
  if not exists (select 1 from public.subscription_plans where id = p_plan_id) then
    raise exception 'Plan not found' using errcode = 'P0002';
  end if;
  if p_billing_period not in ('monthly', 'yearly') or p_extra_seats < 0 or p_extra_seats > 100 then
    raise exception 'Check the billing period and extra seats' using errcode = '22023';
  end if;
  update public.clinics
     set plan_id = p_plan_id, current_period_end = p_period_end, extra_seats = p_extra_seats,
         rx_limit_override = p_rx_limit_override, billing_period = p_billing_period,
         note = left(nullif(trim(p_note), ''), 300), updated_at = now()
   where id = p_id and status = 'active';
  if not found then
    raise exception 'Clinic not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.admin_end_clinic(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.clinics where id = p_id and status = 'active') then
    raise exception 'Clinic not found' using errcode = 'P0002';
  end if;
  perform public.internal_clinic_end(p_id);
end;
$$;

revoke all on function public.admin_clinics() from public, anon;
revoke all on function public.admin_set_clinic(uuid, text, timestamptz, integer, integer, text, text) from public, anon;
revoke all on function public.admin_end_clinic(uuid) from public, anon;
grant execute on function public.admin_clinics() to authenticated;
grant execute on function public.admin_set_clinic(uuid, text, timestamptz, integer, integer, text, text) to authenticated;
grant execute on function public.admin_end_clinic(uuid) to authenticated;

-- The payments list shows which clinic a payment belongs to.
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
