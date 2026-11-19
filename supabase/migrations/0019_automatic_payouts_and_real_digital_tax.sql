-- Migration: 0019_automatic_payouts_and_real_digital_tax.sql   (needs 0018)
--
-- Same approach as the ODC Courts (pickleball) platform:
--
-- 1. Saturday payouts are fully automatic. The Worker cron runs every 15 minutes. During the 72 hours after
--    Saturday 00:00 Manila it prepares each doctor's payout (cron_prepare_weekly_payouts) and sends the ones whose
--    account name matches the verified doctor, as far as the PayMongo Wallet covers them (cron_payouts_to_send,
--    cron_begin_payout). A missed tick or a short PayMongo outage delays a payout by minutes, not a week. A payout
--    the bank rejected is tried again after 2 hours, at most 3 times a week. Names that do not match wait for an admin.
--
-- 2. The digital tax is recorded from what PayMongo really kept. PayMongo takes it when it settles a payout to
--    ODYSSEY's wallet (about 0.5% under RR 5-2025), not per payment. The cron reads PayMongo's recent payouts and
--    records amount - net - fees - refunds - disputes as one deduction per payout (paymongo_deductions). An admin can
--    also record one by hand. Each deduction is a ledger line on the `withholding_tax` account.
--    Doctors still bear the tax on their share: each prescription payment moves 0.5% of the doctor's share from the
--    doctor to the `withholding_tax` account. So that account's balance is ODYSSEY's own part of the real tax
--    (a credit on its BIR 2307), and 0018's per-payment estimate of ODYSSEY's part is no longer booked.

-- ---------------------------------------------------------------------------------------------------------
-- 1. Per payment: only the doctor's part
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.internal_gateway_on_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s     public.gateway_settings;
  v_doc numeric := 0;
begin
  select * into s from public.gateway_settings;
  if new.kind = 'rx' then
    new.available_at := public.payout_saturday(coalesce(new.paid_at, now()) + make_interval(days => s.hold_days));
    v_doc := round(new.doctor_share * s.withholding_pct / 100, 2);
  end if;
  -- An estimate for the record; the real amount arrives with PayMongo's payout (paymongo_deductions).
  new.withholding := round(coalesce(new.paid_amount, new.total) * s.withholding_pct / 100, 2);
  new.doctor_withholding := v_doc;

  perform public.internal_ledger('doctor', new.doctor_id, -v_doc, 'withholding_tax', new.id, null, null, new.available_at,
                                 'Tax PayMongo withholds for the BIR (' || s.withholding_pct || '% of your share)');
  perform public.internal_ledger('withholding_tax', null, v_doc, 'withholding_tax', new.id, null, null, null,
                                 'Doctor''s part of the withholding tax');
  return new;
end;
$$;

revoke all on function public.internal_gateway_on_paid() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 2. What PayMongo really kept from its payouts
-- ---------------------------------------------------------------------------------------------------------
create table if not exists public.paymongo_deductions (
  id                 uuid primary key default gen_random_uuid(),
  kind               text not null default 'digital_tax' check (kind in ('digital_tax', 'other')),
  amount             numeric(12, 2) not null check (amount > 0),
  occurred_at        timestamptz not null,
  paymongo_payout_id text unique,                                    -- po_..., one deduction per payout
  paymongo_reference text unique,                                    -- adj_..., when entered by hand
  source             text not null default 'manual' check (source in ('manual', 'auto')),
  details            jsonb,                                          -- the PayMongo payout fields used, for checking
  note               text check (char_length(note) <= 300),
  livemode           boolean,
  recorded_by        uuid references public.profiles (id),
  removed_at         timestamptz,                                    -- kept, so the sync never adds it back
  removed_by         uuid references public.profiles (id),
  created_at         timestamptz not null default now()
);

create index if not exists paymongo_deductions_occurred_idx on public.paymongo_deductions (occurred_at desc);
alter table public.paymongo_deductions enable row level security; -- read only through the functions below

create or replace function public.internal_book_deduction(d public.paymongo_deductions, p_sign integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if d.kind = 'digital_tax' then
    perform public.internal_ledger('withholding_tax', null, -p_sign * d.amount, 'withholding_tax', null, null, null, null,
      case when p_sign > 0 then 'Digital tax kept by PayMongo' else 'Digital tax entry removed' end
      || coalesce(' (' || coalesce(d.paymongo_payout_id, d.paymongo_reference) || ')', ''));
  else
    perform public.internal_ledger('paymongo_cost', null, -p_sign * d.amount, 'paymongo_fee', null, null, null, null,
      case when p_sign > 0 then 'Other PayMongo deduction' else 'PayMongo deduction removed' end
      || coalesce(' (' || coalesce(d.paymongo_payout_id, d.paymongo_reference) || ')', ''));
  end if;
end;
$$;

revoke all on function public.internal_book_deduction(public.paymongo_deductions, integer) from public, anon, authenticated;

-- Worker cron only. Returns true when it recorded something new.
create or replace function public.cron_record_payout_deduction(
  p_payout_id text, p_amount numeric, p_occurred_at timestamptz, p_livemode boolean, p_details jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.paymongo_deductions;
begin
  if p_payout_id is null or coalesce(p_amount, 0) <= 0 then
    return false;
  end if;
  insert into public.paymongo_deductions (kind, amount, occurred_at, paymongo_payout_id, source, details, note, livemode)
  values ('digital_tax', round(p_amount, 2), coalesce(p_occurred_at, now()), p_payout_id, 'auto', p_details,
          'Recorded automatically from the PayMongo payout', p_livemode)
  on conflict do nothing
  returning * into d;
  if d.id is null then
    return false;
  end if;
  perform public.internal_book_deduction(d, 1);
  return true;
end;
$$;

revoke all on function public.cron_record_payout_deduction(text, numeric, timestamptz, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.cron_record_payout_deduction(text, numeric, timestamptz, boolean, jsonb) to service_role;

create or replace function public.admin_record_deduction(
  p_kind text, p_amount numeric, p_occurred_at timestamptz, p_payout_id text default null,
  p_reference text default null, p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.paymongo_deductions;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'The amount must be more than zero' using errcode = '22023';
  end if;
  insert into public.paymongo_deductions (kind, amount, occurred_at, paymongo_payout_id, paymongo_reference, note, recorded_by)
  values (case when p_kind = 'other' then 'other' else 'digital_tax' end, round(p_amount, 2), coalesce(p_occurred_at, now()),
          nullif(trim(p_payout_id), ''), nullif(trim(p_reference), ''), left(nullif(trim(p_note), ''), 300), auth.uid())
  returning * into d;
  perform public.internal_book_deduction(d, 1);
exception when unique_violation then
  raise exception 'This PayMongo deduction is already recorded' using errcode = '23505';
end;
$$;

revoke all on function public.admin_record_deduction(text, numeric, timestamptz, text, text, text) from public, anon;
grant execute on function public.admin_record_deduction(text, numeric, timestamptz, text, text, text) to authenticated;

create or replace function public.admin_remove_deduction(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.paymongo_deductions;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  update public.paymongo_deductions set removed_at = now(), removed_by = auth.uid()
   where id = p_id and removed_at is null
  returning * into d;
  if d.id is null then
    raise exception 'Deduction not found' using errcode = 'P0002';
  end if;
  perform public.internal_book_deduction(d, -1);
end;
$$;

revoke all on function public.admin_remove_deduction(uuid) from public, anon;
grant execute on function public.admin_remove_deduction(uuid) to authenticated;

create or replace function public.admin_deductions()
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
             'id', d.id, 'kind', d.kind, 'amount', d.amount, 'occurred_at', d.occurred_at,
             'payout_id', d.paymongo_payout_id, 'reference', d.paymongo_reference, 'source', d.source,
             'note', d.note, 'details', d.details) order by d.occurred_at desc)
      from public.paymongo_deductions d where d.removed_at is null), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_deductions() from public, anon;
grant execute on function public.admin_deductions() to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 3. Weekly payouts: a catch-up window, retries, automatic sending
-- ---------------------------------------------------------------------------------------------------------
alter table public.payouts add column if not exists weekly boolean not null default false;
create index if not exists payouts_weekly_idx on public.payouts (doctor_id, created_at) where weekly;

-- The latest Saturday 00:00 Manila at or before now: the start of this week's payout run.
create or replace function public.payout_cycle_start()
returns timestamptz
language sql
stable
set search_path = public
as $$
  select (case when t.sat <= t.today then t.sat else t.sat - 7 end)::timestamp at time zone 'Asia/Manila'
    from (select (now() at time zone 'Asia/Manila')::date as today,
                 date_trunc('week', now() at time zone 'Asia/Manila')::date + 5 as sat) t;
$$;

drop function if exists public.cron_prepare_weekly_payouts();
drop function if exists public.admin_prepare_weekly_payouts();
drop function if exists public.internal_prepare_weekly_payouts();

-- One payout per doctor for everything available. p_force (admin button) skips the time window.
create or replace function public.internal_prepare_weekly_payouts(p_force boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s       public.gateway_settings;
  ds      public.doctor_payment_settings;
  po      public.payouts;
  v_cycle timestamptz := public.payout_cycle_start();
  v_avail numeric;
  v_failed integer;
  v_last_failed timestamptz;
  v_count integer := 0;
  v_total numeric := 0;
  v_small integer := 0;
begin
  if not p_force and now() - v_cycle > interval '72 hours' then
    return jsonb_build_object('created', 0, 'total', 0, 'below_minimum', 0, 'outside_window', true);
  end if;
  select * into s from public.gateway_settings;
  for ds in select * from public.doctor_payment_settings where payout_account_number is not null loop
    perform pg_advisory_xact_lock(hashtext('payout:' || ds.doctor_id::text));
    continue when exists (select 1 from public.payouts
                           where doctor_id = ds.doctor_id and status in ('requested', 'sending', 'processing'));
    -- Already paid (or rejected, or cancelled) this week: wait for next Saturday.
    continue when exists (select 1 from public.payouts
                           where doctor_id = ds.doctor_id and weekly and created_at >= v_cycle and status <> 'failed');
    select count(*), max(coalesce(decided_at, created_at)) into v_failed, v_last_failed
      from public.payouts where doctor_id = ds.doctor_id and weekly and created_at >= v_cycle and status = 'failed';
    continue when v_failed >= 3 or (v_last_failed is not null and now() - v_last_failed < interval '2 hours');

    v_avail := round((public.doctor_balance_json(ds.doctor_id) ->> 'available')::numeric, 2);
    if v_avail < s.min_payout or v_avail - s.payout_fee <= 0 then
      if v_avail > 0 then v_small := v_small + 1; end if;
      continue;
    end if;

    insert into public.payouts (doctor_id, amount, fee, net_amount, provider, bank_code, bank_name, account_name, account_number, weekly)
    values (ds.doctor_id, v_avail, s.payout_fee, v_avail - s.payout_fee, ds.payout_provider, ds.payout_bank_code,
            ds.payout_bank_name, ds.payout_account_name, ds.payout_account_number, true)
    returning * into po;
    perform public.internal_ledger('doctor', ds.doctor_id, -v_avail, 'payout', null, po.id, null, null,
                                   'Saturday payout to ' || ds.payout_bank_name || ' ending ' || right(ds.payout_account_number, 4));
    v_count := v_count + 1;
    v_total := v_total + v_avail;
  end loop;
  return jsonb_build_object('created', v_count, 'total', v_total, 'below_minimum', v_small);
end;
$$;

revoke all on function public.internal_prepare_weekly_payouts(boolean) from public, anon, authenticated;

create or replace function public.cron_prepare_weekly_payouts()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.internal_prepare_weekly_payouts(false);
$$;

revoke all on function public.cron_prepare_weekly_payouts() from public, anon, authenticated;
grant execute on function public.cron_prepare_weekly_payouts() to service_role;

create or replace function public.admin_prepare_weekly_payouts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return public.internal_prepare_weekly_payouts(true);
end;
$$;

revoke all on function public.admin_prepare_weekly_payouts() from public, anon;
grant execute on function public.admin_prepare_weekly_payouts() to authenticated;

-- Worker cron: weekly payouts it may send by itself (account name matches the verified doctor), oldest first.
create or replace function public.cron_payouts_to_send()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'net_amount', p.net_amount) order by p.created_at), '[]'::jsonb)
    from public.payouts p
    join public.profiles d on d.id = p.doctor_id
   where p.status = 'requested' and p.weekly
     and public.internal_name_key(p.account_name) = public.internal_name_key(d.full_name);
$$;

revoke all on function public.cron_payouts_to_send() from public, anon, authenticated;
grant execute on function public.cron_payouts_to_send() to service_role;

-- Worker cron: claim a payout for sending, like admin_begin_payout. Only one sender can claim it.
create or replace function public.cron_begin_payout(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  po public.payouts;
begin
  update public.payouts set status = 'sending', decided_at = now()
   where id = p_id and status = 'requested'
  returning * into po;
  if po.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'id', po.id, 'net_amount', po.net_amount, 'provider', po.provider, 'bank_code', po.bank_code,
    'account_name', po.account_name, 'account_number', po.account_number, 'reference', po.transfer_reference,
    'doctor_id', po.doctor_id);
end;
$$;

revoke all on function public.cron_begin_payout(uuid) from public, anon, authenticated;
grant execute on function public.cron_begin_payout(uuid) to service_role;

-- ---------------------------------------------------------------------------------------------------------
-- 4. ODYSSEY's revenue per day (Manila): fees and sales, less PayMongo's charges and the transfer fee difference
--    (the same sum as "ODYSSEY earned" in admin_money_overview; the digital tax is shown on its own)
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.admin_revenue_by_day(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 366);
  v_from date := (now() at time zone 'Asia/Manila')::date - (v_days - 1);
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return (
    select jsonb_agg(jsonb_build_object('day', d.day::date, 'revenue', coalesce(r.revenue, 0)) order by d.day)
      from generate_series(v_from, v_from + (v_days - 1), interval '1 day') as d(day)
      left join (
        select (created_at at time zone 'Asia/Manila')::date as day, sum(amount) as revenue
          from public.ledger_entries
         where account in ('odyssey_fee', 'odyssey_sales', 'paymongo_cost', 'payout_fee')
           and created_at >= v_from::timestamp at time zone 'Asia/Manila'
         group by 1
      ) r on r.day = d.day::date);
end;
$$;

revoke all on function public.admin_revenue_by_day(integer) from public, anon;
grant execute on function public.admin_revenue_by_day(integer) to authenticated;
