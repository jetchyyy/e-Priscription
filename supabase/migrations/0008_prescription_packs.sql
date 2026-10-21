-- Migration: 0008_prescription_packs.sql   (needs 0006 and 0007)
--
-- Prescription packs: a doctor (or a clinic owner, for the clinic) can buy extra prescriptions without changing plan.
--   * Packs (name, number of prescriptions, price, how long they stay valid) live in a table the admin edits.
--   * Bought prescriptions are credits. They are used only after the monthly limit is reached, oldest expiry first.
--     A prescription written with a credit does not count toward the monthly limit.
--   * Payment is manual like plan payments: QR, receipt and reference number, verified by an admin.
--   * A clinic owner's purchase belongs to the clinic and is shared by its doctors; a clinic's per-doctor share
--     still counts every prescription the doctor writes, credits included.

-- ---------------------------------------------------------------------------------------------------------
-- 1. Packs the admin offers
-- ---------------------------------------------------------------------------------------------------------
create table if not exists public.rx_packs (
  id          text primary key check (id ~ '^[a-z0-9-]{2,30}$'),
  name        text not null check (char_length(trim(name)) between 2 and 40),
  rx_count    integer not null check (rx_count between 1 and 100000),
  price       numeric(10, 2) not null check (price > 0 and price <= 1000000),
  valid_days  integer check (valid_days between 1 and 3650),    -- null: never expires
  sort_order  integer not null default 0,
  is_public   boolean not null default true,
  updated_at  timestamptz not null default now()
);

-- Sample packs. Prices are placeholders for ODYSSEY to confirm; the admin edits them in Plans and billing.
insert into public.rx_packs (id, name, rx_count, price, valid_days, sort_order)
values
  ('pack-25',  '25 prescriptions',  25,  149, 90, 10),
  ('pack-100', '100 prescriptions', 100, 499, 90, 20),
  ('pack-250', '250 prescriptions', 250, 999, 180, 30)
on conflict (id) do nothing;

drop trigger if exists rx_packs_touch on public.rx_packs;
create trigger rx_packs_touch
  before update on public.rx_packs
  for each row execute function public.touch_updated_at();

alter table public.rx_packs enable row level security;

drop policy if exists rx_packs_select on public.rx_packs;
create policy rx_packs_select on public.rx_packs
  for select to authenticated using (is_public or public.is_admin());

drop policy if exists rx_packs_insert_admin on public.rx_packs;
create policy rx_packs_insert_admin on public.rx_packs
  for insert to authenticated with check (public.is_admin());

drop policy if exists rx_packs_update_admin on public.rx_packs;
create policy rx_packs_update_admin on public.rx_packs
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- No deletes: a pack doctors have bought is hidden (is_public = false) instead.
revoke all on public.rx_packs from anon, authenticated;
grant select on public.rx_packs to authenticated;
grant insert, update on public.rx_packs to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 2. Credits (what has been bought and what is left)
-- ---------------------------------------------------------------------------------------------------------
create table if not exists public.rx_credits (
  id             uuid primary key default gen_random_uuid(),
  doctor_id      uuid references public.profiles (id) on delete cascade,
  clinic_id      uuid references public.clinics (id) on delete cascade,
  pack_id        text references public.rx_packs (id),
  rx_total       integer not null check (rx_total > 0),
  rx_remaining   integer not null check (rx_remaining >= 0),
  expires_at     timestamptz,
  created_at     timestamptz not null default now(),
  check (num_nonnulls(doctor_id, clinic_id) = 1),
  check (rx_remaining <= rx_total)
);

create index if not exists rx_credits_doctor_idx on public.rx_credits (doctor_id) where rx_remaining > 0;
create index if not exists rx_credits_clinic_idx on public.rx_credits (clinic_id) where rx_remaining > 0;

-- Read through my_plan() and my_clinic() only.
alter table public.rx_credits enable row level security;
revoke all on public.rx_credits from anon, authenticated;

-- Which credit paid for a prescription (set by the database, never by the browser).
alter table public.prescriptions add column if not exists credit_id uuid references public.rx_credits (id) on delete set null;

-- Payments for packs reuse plan_requests.
alter table public.plan_requests add column if not exists pack_id text references public.rx_packs (id);
alter table public.plan_requests add column if not exists quantity integer not null default 1;
alter table public.plan_requests add column if not exists pack_rx integer;            -- prescriptions bought, fixed when the request was made
alter table public.plan_requests add column if not exists pack_valid_days integer;    -- validity, fixed when the request was made
alter table public.plan_requests drop constraint if exists plan_requests_kind_check;
alter table public.plan_requests add constraint plan_requests_kind_check check (kind in ('plan', 'extra_seats', 'rx_pack'));
do $$ begin
  alter table public.plan_requests add constraint plan_requests_quantity_check check (quantity between 1 and 20);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------------------------------------
-- 3. Counting: credit-funded prescriptions do not use up the monthly limit
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.rx_used_this_month(p_doctor uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from public.prescriptions
   where doctor_id = p_doctor and clinic_id is null and credit_id is null
     and created_at >= public.manila_month_start();
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
   where clinic_id = p_clinic and credit_id is null and created_at >= public.manila_month_start();
$$;

-- A doctor's own count in the clinic includes credit-funded prescriptions, so a share set by the owner is a real cap.
-- (Unchanged from 0007; restated so the rule is in one place.)
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

-- Credits a doctor can use right now: the clinic's if they are covered by one, otherwise their own.
create or replace function public.credits_available(p_doctor uuid, p_clinic uuid)
returns table (remaining integer, soonest_expiry timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(c.rx_remaining), 0)::int, min(c.expires_at)
    from public.rx_credits c
   where c.rx_remaining > 0
     and (c.expires_at is null or c.expires_at > now())
     and ((p_clinic is not null and c.clinic_id = p_clinic) or (p_clinic is null and c.doctor_id = p_doctor));
$$;

revoke all on function public.credits_available(uuid, uuid) from public, anon, authenticated;

-- Uses one credit (the one that expires first) and returns its id, or null when there is none.
create or replace function public.internal_take_credit(p_doctor uuid, p_clinic uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select c.id into v_id
    from public.rx_credits c
   where c.rx_remaining > 0
     and (c.expires_at is null or c.expires_at > now())
     and ((p_clinic is not null and c.clinic_id = p_clinic) or (p_clinic is null and c.doctor_id = p_doctor))
   order by c.expires_at nulls last, c.created_at
   limit 1
   for update;
  if v_id is null then
    return null;
  end if;
  update public.rx_credits set rx_remaining = rx_remaining - 1 where id = v_id;
  return v_id;
end;
$$;

revoke all on function public.internal_take_credit(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 4. The limit, now with credits as the overflow
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.enforce_rx_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan   public.plan_state;
  v_used   integer;
  v_mine   integer;
  v_credit uuid;
begin
  select * into v_plan from public.effective_plan(new.doctor_id);

  -- One insert at a time per clinic (or per doctor), so two doctors cannot both take the last prescription.
  perform pg_advisory_xact_lock(hashtextextended('rx_quota:' || coalesce(v_plan.clinic_id::text, new.doctor_id::text), 0));

  new.credit_id := null;

  if v_plan.clinic_id is not null then
    -- The doctor's own share is a cap on everything they write, credits included.
    if v_plan.member_cap is not null then
      v_mine := public.doctor_rx_in_clinic(new.doctor_id, v_plan.clinic_id);
      if v_mine >= v_plan.member_cap then
        raise exception 'You have used your share of % prescriptions in % this month. Ask the clinic owner to raise it.',
          v_plan.member_cap, v_plan.clinic_name
          using errcode = '53400', hint = 'doctor_cap_reached';
      end if;
    end if;

    v_used := public.clinic_pool_used(v_plan.clinic_id);
    if v_used >= v_plan.rx_limit then
      v_credit := public.internal_take_credit(new.doctor_id, v_plan.clinic_id);
      if v_credit is null then
        raise exception 'Your clinic has used all % prescriptions in its % plan this month. Ask the clinic owner to upgrade the plan or buy more prescriptions.',
          v_plan.rx_limit, v_plan.plan_name
          using errcode = '53400', hint = 'clinic_quota_reached';
      end if;
      new.credit_id := v_credit;
    end if;
    new.clinic_id := v_plan.clinic_id;
    return new;
  end if;

  v_used := public.rx_used_this_month(new.doctor_id);
  if v_used >= v_plan.rx_limit then
    v_credit := public.internal_take_credit(new.doctor_id, null);
    if v_credit is null then
      raise exception 'You have used all % prescriptions in your % plan this month. Upgrade your plan or buy more prescriptions to keep writing.',
        v_plan.rx_limit, v_plan.plan_name
        using errcode = '53400', hint = 'rx_quota_reached';
    end if;
    new.credit_id := v_credit;
  end if;
  new.clinic_id := null;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- 5. Usage, with credits
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.plan_usage_json(p_doctor uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan     public.plan_state;
  v_used     integer;
  v_mine     integer;
  v_pool_left integer;
  v_avail    integer;
  v_left     integer;
  v_limiter  text;
  v_req      public.plan_requests;
  v_clinic   jsonb;
  v_qr       bigint;
  v_cr       record;
begin
  select * into v_plan from public.effective_plan(p_doctor);
  select * into v_cr from public.credits_available(p_doctor, v_plan.clinic_id);

  if v_plan.clinic_id is not null then
    v_used := public.clinic_pool_used(v_plan.clinic_id);
    v_mine := public.doctor_rx_in_clinic(p_doctor, v_plan.clinic_id);
    v_pool_left := greatest(v_plan.rx_limit - v_used, 0);
    v_avail := v_pool_left + v_cr.remaining;
    v_left := greatest(least(v_avail, coalesce(v_plan.member_cap - v_mine, v_avail)), 0);
    v_limiter := case when v_left > 0 then null when v_avail <= 0 then 'clinic' else 'cap' end;
    v_clinic := jsonb_build_object(
      'id', v_plan.clinic_id, 'name', v_plan.clinic_name, 'role', v_plan.clinic_role,
      'pool_used', v_used, 'my_used', v_mine, 'my_cap', v_plan.member_cap, 'limited_by', v_limiter);
    select count(*) into v_qr
      from public.doctor_payment_methods pm
      join public.clinic_members cm on cm.doctor_id = pm.doctor_id and cm.status = 'active' and cm.clinic_id = v_plan.clinic_id
     where pm.is_active;
  else
    v_used := public.rx_used_this_month(p_doctor);
    v_pool_left := greatest(v_plan.rx_limit - v_used, 0);
    v_left := v_pool_left + v_cr.remaining;
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
    'plan_left',          v_pool_left,
    'credits',            jsonb_build_object('remaining', v_cr.remaining, 'expires_at', v_cr.soonest_expiry),
    'resets_at',          public.manila_month_start() + interval '1 month',
    'qr_active',          v_qr,
    'clinic',             v_clinic,
    'latest_request',     case when v_req.id is null then null else jsonb_build_object(
                            'id', v_req.id, 'kind', v_req.kind, 'seats', v_req.seats, 'plan_id', v_req.plan_id,
                            'pack_id', v_req.pack_id, 'quantity', v_req.quantity, 'pack_rx', v_req.pack_rx,
                            'billing_period', v_req.billing_period, 'amount', v_req.amount, 'status', v_req.status,
                            'review_note', v_req.review_note, 'created_at', v_req.created_at,
                            'reviewed_at', v_req.reviewed_at, 'reference_end', right(v_req.reference_norm, 4)) end
  );
end;
$$;

revoke all on function public.plan_usage_json(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 6. Buying a pack
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.request_rx_pack(
  p_pack_id         text,
  p_quantity        integer,
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
  v_pack   public.rx_packs;
  v_method public.platform_payment_methods;
  v_member public.clinic_members;
  v_clinic public.clinics;
  v_plan   public.plan_state;
  v_ref    text := upper(trim(coalesce(p_reference, '')));
  v_qty    integer := coalesce(p_quantity, 1);
  v_amount numeric;
  v_id     uuid;
begin
  if not public.is_approved_doctor() then
    raise exception 'Only approved doctors can buy prescriptions' using errcode = '42501';
  end if;
  if v_qty < 1 or v_qty > 20 then
    raise exception 'Choose between 1 and 20 packs' using errcode = '22023';
  end if;

  select * into v_pack from public.rx_packs where id = p_pack_id and is_public;
  if not found then
    raise exception 'This pack is not available' using errcode = 'P0002';
  end if;
  v_amount := v_pack.price * v_qty;

  select * into v_member from public.clinic_members where doctor_id = auth.uid() and status = 'active';
  if found and v_member.role = 'doctor' then
    raise exception 'Your clinic owner buys prescriptions for the clinic' using errcode = '42501';
  end if;
  select * into v_clinic from public.clinics where owner_id = auth.uid() and status = 'active';

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
  select * into v_plan from public.effective_plan(auth.uid());

  begin
    insert into public.plan_requests
      (doctor_id, plan_id, billing_period, amount, payment_method_id, provider, reference_no, amount_read,
       screenshot_path, kind, clinic_id, pack_id, quantity, pack_rx, pack_valid_days)
    values
      (auth.uid(), v_plan.plan_id, 'monthly', v_amount, v_method.id, v_method.provider, v_ref,
       case when p_amount_read between 0 and 10000000 then round(p_amount_read, 2) end,
       p_screenshot_path, 'rx_pack', v_clinic.id, v_pack.id, v_qty, v_pack.rx_count * v_qty, v_pack.valid_days)
    returning id into v_id;
  exception when unique_violation then
    if exists (select 1 from public.plan_requests where doctor_id = auth.uid() and status = 'pending') then
      raise exception 'You already have a payment waiting for review. Withdraw it first to send a new one.' using errcode = '23505';
    end if;
    raise exception 'This reference number has already been used. Check the number on your receipt.' using errcode = '23505';
  end;

  return jsonb_build_object('ok', true, 'id', v_id, 'amount', v_amount, 'prescriptions', v_pack.rx_count * v_qty);
end;
$$;

revoke all on function public.request_rx_pack(text, integer, text, text, uuid, numeric) from public, anon;
grant execute on function public.request_rx_pack(text, integer, text, text, uuid, numeric) to authenticated;

-- Admin approval: now also turns a pack payment into credits.
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

  if v_req.kind = 'rx_pack' then
    -- Credits go to the clinic if the buyer owned one when they paid and it is still running, otherwise to the doctor.
    select * into v_clinic from public.clinics where id = v_req.clinic_id and status = 'active';
    if found then
      insert into public.rx_credits (clinic_id, pack_id, rx_total, rx_remaining, expires_at)
      values (v_clinic.id, v_req.pack_id, v_req.pack_rx, v_req.pack_rx,
              case when v_req.pack_valid_days is null then null else now() + make_interval(days => v_req.pack_valid_days) end);
    else
      insert into public.rx_credits (doctor_id, pack_id, rx_total, rx_remaining, expires_at)
      values (v_req.doctor_id, v_req.pack_id, v_req.pack_rx, v_req.pack_rx,
              case when v_req.pack_valid_days is null then null else now() + make_interval(days => v_req.pack_valid_days) end);
    end if;

  elsif v_req.kind = 'extra_seats' then
    select * into v_clinic from public.clinics where id = v_req.clinic_id and status = 'active' for update;
    if not found or (v_clinic.current_period_end is not null and v_clinic.current_period_end <= now()) then
      raise exception 'This clinic plan has ended. Reject the payment or renew the clinic first.' using errcode = '22023';
    end if;
    update public.clinics
       set extra_seats = least(extra_seats + v_req.seats, 100), updated_at = now()
     where id = v_clinic.id;

  elsif v_plan.max_doctors > 1 then
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
-- 7. The clinic page shows the clinic's bought prescriptions
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.my_clinic()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m         public.clinic_members;
  c         public.clinics;
  pl        public.subscription_plans;
  v_seats   record;
  v_cr      record;
  v_owner   boolean;
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
  select * into v_cr from public.credits_available(auth.uid(), c.id);
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
    'credits_left',       v_cr.remaining,
    'credits_expire',     v_cr.soonest_expiry,
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

revoke all on function public.my_clinic() from public, anon;
grant execute on function public.my_clinic() to authenticated;
