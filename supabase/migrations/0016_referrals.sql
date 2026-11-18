-- Migration: 0016_referrals.sql   (needs 0008 and 0014)
--
-- Doctor referrals.
--   * Every profile gets one short referral code. The invite link is the same code: /doctor/register?ref=CODE.
--   * The code travels in the sign-up metadata (referral_code). It is linked once, when the account is created,
--     and never changes afterwards. A doctor cannot refer themselves.
--   * The referrer is rewarded once the invited doctor is approved and has issued the required number of
--     prescriptions (default 5). Prescriptions are immutable, so every issued one counts.
--   * The reward is a row in rx_credits (no pack) that expires, so it is used like a bought pack: only after the
--     monthly limit runs out, soonest expiry first. If the referrer writes from a clinic's pool, the credit goes to
--     that clinic, because personal credits are not used while a doctor is covered by a clinic.
--   * Reward size, validity, the number of prescriptions needed and a monthly cap are admin settings.

-- ---------------------------------------------------------------------------------------------------------
-- 1. Settings (one row, admin edits it)
-- ---------------------------------------------------------------------------------------------------------
create table if not exists public.referral_settings (
  id           boolean primary key default true check (id),
  enabled      boolean not null default true,
  required_rx  integer not null default 5  check (required_rx between 1 and 1000),
  reward_rx    integer not null default 10 check (reward_rx between 1 and 10000),
  reward_days  integer not null default 30 check (reward_days between 1 and 3650),
  monthly_cap  integer not null default 10 check (monthly_cap between 0 and 1000),   -- rewards per referrer a month
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.profiles (id)
);
insert into public.referral_settings (id) values (true) on conflict (id) do nothing;

alter table public.referral_settings enable row level security;
revoke all on public.referral_settings from anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 2. Codes
-- ---------------------------------------------------------------------------------------------------------
alter table public.profiles add column if not exists referral_code text;
create unique index if not exists profiles_referral_code_key on public.profiles (referral_code);

-- 8 characters without look-alikes (no 0/O, 1/I/L).
create or replace function public.new_referral_code()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code     text;
  v_bytes    bytea;
begin
  loop
    v_bytes := gen_random_bytes(8);
    v_code := '';
    for i in 0..7 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % length(v_alphabet)) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where referral_code = v_code);
  end loop;
  return v_code;
end;
$$;

revoke all on function public.new_referral_code() from public, anon, authenticated;

create or replace function public.profiles_set_referral_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.referral_code is null then
    new.referral_code := public.new_referral_code();
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_referral_code on public.profiles;
create trigger profiles_referral_code
  before insert on public.profiles
  for each row execute function public.profiles_set_referral_code();

-- Existing doctors.
update public.profiles set referral_code = public.new_referral_code() where referral_code is null;
alter table public.profiles alter column referral_code set not null;

-- referral_code is not in the column grants from 0004, so doctors cannot change it.

-- ---------------------------------------------------------------------------------------------------------
-- 3. Referrals
-- ---------------------------------------------------------------------------------------------------------
create table if not exists public.referrals (
  id            uuid primary key default gen_random_uuid(),
  referrer_id   uuid not null references public.profiles (id) on delete cascade,
  referred_id   uuid not null unique references public.profiles (id) on delete cascade,
  code_used     text not null,
  created_at    timestamptz not null default now(),
  qualified_at  timestamptz,                                    -- the invited doctor reached the required count
  outcome       text check (outcome in ('rewarded', 'capped')), -- set together with qualified_at
  credit_id     uuid references public.rx_credits (id) on delete set null,
  reward_rx     integer,
  check (referrer_id <> referred_id),
  check ((qualified_at is null) = (outcome is null))
);

create index if not exists referrals_referrer_idx on public.referrals (referrer_id, created_at desc);
create index if not exists referrals_open_idx on public.referrals (referred_id) where qualified_at is null;

-- Read through my_referrals() and admin_referrals() only.
alter table public.referrals enable row level security;
revoke all on public.referrals from anon, authenticated;

-- Link the referral when the account is created. Runs after on_auth_user_created (triggers fire in name order),
-- so the profile exists. It never blocks a sign-up: a bad or unknown code is ignored.
create or replace function public.handle_new_user_referral()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code     text := upper(trim(coalesce(new.raw_user_meta_data ->> 'referral_code', '')));
  v_referrer uuid;
begin
  if v_code = '' or length(v_code) > 20 then
    return new;
  end if;
  select id into v_referrer from public.profiles
   where referral_code = v_code and role = 'doctor' and id <> new.id;
  if v_referrer is null then
    return new;
  end if;
  begin
    insert into public.referrals (referrer_id, referred_id, code_used)
    values (v_referrer, new.id, v_code)
    on conflict (referred_id) do nothing;
  exception when others then
    raise warning 'referral link skipped: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_referral on auth.users;
create trigger on_auth_user_created_referral
  after insert on auth.users
  for each row execute function public.handle_new_user_referral();

-- ---------------------------------------------------------------------------------------------------------
-- 4. Reward: after the invited doctor's Nth prescription
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.referral_check_reward()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref     public.referrals;
  v_set     public.referral_settings;
  v_count   integer;
  v_given   integer;
  v_plan    public.plan_state;
  v_credit  uuid;
  v_name    text;
begin
  select * into v_ref from public.referrals
   where referred_id = new.doctor_id and qualified_at is null
   for update;
  if v_ref.id is null then
    return null;
  end if;

  select * into v_set from public.referral_settings where id;
  if not v_set.enabled then
    return null;
  end if;

  -- Prescriptions can only be written by approved doctors (rx_insert_approved_doctor), so no status check here.
  select count(*)::int into v_count from public.prescriptions where doctor_id = new.doctor_id;
  if v_count < v_set.required_rx then
    return null;
  end if;

  -- Monthly cap per referrer (Manila calendar month).
  perform pg_advisory_xact_lock(hashtextextended('referral_reward:' || v_ref.referrer_id::text, 0));
  select count(*)::int into v_given from public.referrals
   where referrer_id = v_ref.referrer_id and outcome = 'rewarded'
     and qualified_at >= public.manila_month_start();

  select full_name into v_name from public.profiles where id = new.doctor_id;

  if v_given >= v_set.monthly_cap then
    update public.referrals set qualified_at = now(), outcome = 'capped' where id = v_ref.id;
    perform public.write_audit_log(
      'billing', 'referral_capped', 'referral', v_ref.id::text,
      format('Referral qualified but not rewarded: monthly cap of %s reached', v_set.monthly_cap),
      jsonb_build_object('referrer_id', v_ref.referrer_id, 'referred_id', v_ref.referred_id),
      v_ref.referrer_id, 'system', 'System'
    );
    return null;
  end if;

  select * into v_plan from public.effective_plan(v_ref.referrer_id);

  if v_plan.clinic_id is not null then
    insert into public.rx_credits (clinic_id, rx_total, rx_remaining, expires_at)
    values (v_plan.clinic_id, v_set.reward_rx, v_set.reward_rx, now() + make_interval(days => v_set.reward_days))
    returning id into v_credit;
  else
    insert into public.rx_credits (doctor_id, rx_total, rx_remaining, expires_at)
    values (v_ref.referrer_id, v_set.reward_rx, v_set.reward_rx, now() + make_interval(days => v_set.reward_days))
    returning id into v_credit;
  end if;

  update public.referrals
     set qualified_at = now(), outcome = 'rewarded', credit_id = v_credit, reward_rx = v_set.reward_rx
   where id = v_ref.id;

  perform public.write_audit_log(
    'billing', 'referral_rewarded', 'referral', v_ref.id::text,
    format('Referral reward: %s prescriptions for %s days (invited %s)', v_set.reward_rx, v_set.reward_days,
           coalesce(nullif(trim(v_name), ''), 'a doctor')),
    jsonb_build_object('referrer_id', v_ref.referrer_id, 'referred_id', v_ref.referred_id,
                       'credit_id', v_credit, 'clinic_id', v_plan.clinic_id,
                       'reward_rx', v_set.reward_rx, 'reward_days', v_set.reward_days),
    v_ref.referrer_id, 'system', 'System'
  );
  return null;
end;
$$;

revoke all on function public.referral_check_reward() from public, anon, authenticated;

drop trigger if exists prescriptions_referral_reward on public.prescriptions;
create trigger prescriptions_referral_reward
  after insert on public.prescriptions
  for each row execute function public.referral_check_reward();

-- ---------------------------------------------------------------------------------------------------------
-- 5. RPCs
-- ---------------------------------------------------------------------------------------------------------

-- Public: who invited you, shown on the sign-up page. Name only, shortened ("Juan D."), no other details.
create or replace function public.referral_lookup(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when p.id is null then null else jsonb_build_object(
           'name', trim(split_part(trim(p.full_name), ' ', 1) || ' ' ||
                        coalesce(left(nullif(split_part(trim(p.full_name), ' ', 2), ''), 1) || '.', ''))
         ) end
    from (select 1) one
    left join public.profiles p
      on p.referral_code = upper(trim(coalesce(p_code, ''))) and p.role = 'doctor' and p.status = 'approved'
   where (select enabled from public.referral_settings where id);
$$;

revoke all on function public.referral_lookup(text) from public;
grant execute on function public.referral_lookup(text) to anon, authenticated;

-- The signed-in doctor's code, the rules and the doctors they invited.
create or replace function public.my_referrals()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_set public.referral_settings;
begin
  if v_uid is null or not public.is_approved_doctor() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_set from public.referral_settings where id;

  return jsonb_build_object(
    'code', (select referral_code from public.profiles where id = v_uid),
    'enabled', v_set.enabled,
    'required_rx', v_set.required_rx,
    'reward_rx', v_set.reward_rx,
    'reward_days', v_set.reward_days,
    'monthly_cap', v_set.monthly_cap,
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id,
               'name', p.full_name,
               'joined_at', r.created_at,
               'approved', p.status = 'approved',
               'rejected', p.status = 'rejected',
               'rx_count', least((select count(*) from public.prescriptions x where x.doctor_id = r.referred_id),
                                 v_set.required_rx),
               'outcome', r.outcome,
               'qualified_at', r.qualified_at,
               'reward_rx', r.reward_rx,
               'expires_at', c.expires_at
             ) order by r.created_at desc)
        from public.referrals r
        join public.profiles p on p.id = r.referred_id
        left join public.rx_credits c on c.id = r.credit_id
       where r.referrer_id = v_uid
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.my_referrals() from public, anon;
grant execute on function public.my_referrals() to authenticated;

-- Admin: settings and the latest referrals.
create or replace function public.admin_referrals()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_set public.referral_settings;
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into v_set from public.referral_settings where id;

  return jsonb_build_object(
    'settings', jsonb_build_object(
      'enabled', v_set.enabled, 'required_rx', v_set.required_rx, 'reward_rx', v_set.reward_rx,
      'reward_days', v_set.reward_days, 'monthly_cap', v_set.monthly_cap, 'updated_at', v_set.updated_at),
    'totals', jsonb_build_object(
      'invited',  (select count(*) from public.referrals),
      'rewarded', (select count(*) from public.referrals where outcome = 'rewarded'),
      'capped',   (select count(*) from public.referrals where outcome = 'capped')),
    'recent', coalesce((
      select jsonb_agg(item order by (item ->> 'created_at') desc) from (
        select jsonb_build_object(
                 'id', r.id,
                 'referrer', a.full_name,
                 'referred', b.full_name,
                 'referred_status', b.status,
                 'rx_count', (select count(*) from public.prescriptions x where x.doctor_id = r.referred_id),
                 'outcome', r.outcome,
                 'reward_rx', r.reward_rx,
                 'created_at', r.created_at,
                 'qualified_at', r.qualified_at) as item
          from public.referrals r
          join public.profiles a on a.id = r.referrer_id
          join public.profiles b on b.id = r.referred_id
         order by r.created_at desc
         limit 50
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_referrals() from public, anon;
grant execute on function public.admin_referrals() to authenticated;

create or replace function public.admin_set_referral_settings(
  p_enabled     boolean,
  p_required_rx integer,
  p_reward_rx   integer,
  p_reward_days integer,
  p_monthly_cap integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  update public.referral_settings
     set enabled = p_enabled, required_rx = p_required_rx, reward_rx = p_reward_rx,
         reward_days = p_reward_days, monthly_cap = p_monthly_cap,
         updated_at = now(), updated_by = auth.uid()
   where id;

  perform public.write_audit_log(
    'billing', 'referral_settings_updated', 'referral_settings', 'global',
    format('Referral rules: %s, %s prescriptions needed, reward %s for %s days, cap %s a month',
           case when p_enabled then 'on' else 'off' end, p_required_rx, p_reward_rx, p_reward_days, p_monthly_cap),
    jsonb_build_object('enabled', p_enabled, 'required_rx', p_required_rx, 'reward_rx', p_reward_rx,
                       'reward_days', p_reward_days, 'monthly_cap', p_monthly_cap)
  );
end;
$$;

revoke all on function public.admin_set_referral_settings(boolean, integer, integer, integer, integer) from public, anon;
grant execute on function public.admin_set_referral_settings(boolean, integer, integer, integer, integer) to authenticated;
