-- Migration: 0018_weekly_payouts_and_withholding.sql   (needs 0010)
--
-- Settlement: PayMongo settles to ODYSSEY's wallet every Thursday (no instant settlement yet). Doctors are paid every
-- Saturday. A doctor's share of a payment made Monday to Sunday (Manila) becomes available on the Saturday after that
-- Sunday, so Thursday's settlement has landed first. `hold_days` now adds extra days before that cut-off (0 by default).
--
-- Payout run: every Saturday 08:00 Manila the Worker's cron calls cron_prepare_weekly_payouts(), which creates one
-- payout per doctor for everything available (at least min_payout). An admin checks them and sends them from
-- Admin -> Money -> Payouts. PayMongo does not check bank accounts, so the admin check stays.
--
-- Withholding tax: PayMongo withholds 0.5% of gross remittances for the BIR (RR 5-2025, which replaced RR 16-2023's
-- 1% on one-half). The doctor bears it on their share; ODYSSEY bears it on its fee and on plan/pack sales.
-- Each payment keeps what was withheld. Set withholding_pct to 0 while PayMongo has ODYSSEY as exempt
-- (gross remittances under ₱500,000 for the year, with a sworn declaration on file).

alter table public.gateway_settings
  add column if not exists withholding_pct numeric(5, 3) not null default 0.5 check (withholding_pct between 0 and 5);

alter table public.gateway_payments
  add column if not exists withholding        numeric(10, 2) not null default 0 check (withholding >= 0),
  add column if not exists doctor_withholding numeric(10, 2) not null default 0 check (doctor_withholding >= 0);

-- The weekly cut-off replaces the 7-day hold.
update public.gateway_settings set hold_days = 0 where hold_days = 7;

alter table public.ledger_entries drop constraint if exists ledger_entries_account_check;
alter table public.ledger_entries add constraint ledger_entries_account_check check (account in (
  'doctor', 'odyssey_fee', 'odyssey_sales', 'paymongo_cost', 'payout_fee', 'suspense', 'withholding_tax'));
alter table public.ledger_entries drop constraint if exists ledger_entries_entry_type_check;
alter table public.ledger_entries add constraint ledger_entries_entry_type_check check (entry_type in (
  'rx_payment', 'purchase', 'paymongo_fee', 'payout', 'payout_reversal', 'payout_fee',
  'refund', 'refund_reversal', 'suspense', 'suspense_applied', 'withholding_tax'));

-- The Saturday payout that includes a payment made at p_at: the Saturday after that week's Sunday, 00:00 Manila.
create or replace function public.payout_saturday(p_at timestamptz)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select ((date_trunc('week', p_at at time zone 'Asia/Manila')::date + 12)::timestamp) at time zone 'Asia/Manila';
$$;

grant execute on function public.payout_saturday(timestamptz) to authenticated, service_role;

-- When a payment becomes paid: set the doctor's Saturday, and book the tax PayMongo withholds.
-- Runs inside the update that marks it paid (internal_gateway_paid, or an admin applying a held payment), so the
-- doctor's ledger line written right after it picks up the Saturday date.
create or replace function public.internal_gateway_on_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s     public.gateway_settings;
  v_all numeric;
  v_doc numeric := 0;
begin
  select * into s from public.gateway_settings;
  if new.kind = 'rx' then
    new.available_at := public.payout_saturday(coalesce(new.paid_at, now()) + make_interval(days => s.hold_days));
  end if;

  v_all := round(coalesce(new.paid_amount, new.total) * s.withholding_pct / 100, 2);
  if new.kind = 'rx' then
    v_doc := least(round(new.doctor_share * s.withholding_pct / 100, 2), v_all);
  end if;
  new.withholding := v_all;
  new.doctor_withholding := v_doc;

  perform public.internal_ledger('doctor', new.doctor_id, -v_doc, 'withholding_tax', new.id, null, null, new.available_at,
                                 'Tax withheld by PayMongo for the BIR (' || s.withholding_pct || '%)');
  perform public.internal_ledger('withholding_tax', null, -(v_all - v_doc), 'withholding_tax', new.id);
  return new;
end;
$$;

revoke all on function public.internal_gateway_on_paid() from public, anon, authenticated;

drop trigger if exists gateway_payments_on_paid on public.gateway_payments;
create trigger gateway_payments_on_paid
  before update of status on public.gateway_payments
  for each row
  when (new.status = 'paid' and old.status in ('open', 'needs_review'))
  execute function public.internal_gateway_on_paid();

-- A doctor's balance: the withheld tax waits with the share it came from.
create or replace function public.doctor_balance_json(p_doctor uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with l as (
    select
      coalesce(sum(amount), 0)                                                                  as balance,
      coalesce(sum(amount) filter (where entry_type in ('rx_payment', 'withholding_tax') and available_at > now()), 0) as on_hold,
      coalesce(-sum(amount) filter (where entry_type = 'withholding_tax'), 0)                    as tax_withheld,
      coalesce(sum(amount) filter (where entry_type = 'rx_payment'), 0)                          as earned,
      coalesce(-sum(amount) filter (where entry_type in ('refund', 'refund_reversal')), 0)        as refunded
    from public.ledger_entries where account = 'doctor' and doctor_id = p_doctor
  ), p as (
    select
      coalesce(sum(amount) filter (where status in ('requested', 'sending', 'processing')), 0) as requested,
      coalesce(sum(amount) filter (where status = 'sent'), 0)                                   as paid_out,
      coalesce(sum(net_amount) filter (where status = 'sent'), 0)                               as received,
      coalesce(sum(fee) filter (where status = 'sent'), 0)                                      as transfer_fees
    from public.payouts where doctor_id = p_doctor
  ), f as (
    select coalesce(sum(fee) filter (where fee_mode = 'absorb'), 0) as fees_absorbed,
           coalesce(sum(fee) filter (where fee_mode = 'pass'), 0)   as fees_passed
      from public.gateway_payments where kind = 'rx' and doctor_id = p_doctor and status in ('paid', 'refunded')
  )
  select jsonb_build_object(
    'on_hold',       l.on_hold,
    'available',     l.balance - l.on_hold,
    'requested',     p.requested,
    'paid_out',      p.paid_out,
    'received',      p.received,
    'transfer_fees', p.transfer_fees,
    'refunded',      l.refunded,
    'earned',        l.earned,
    'tax_withheld',  l.tax_withheld,
    'fees_absorbed', f.fees_absorbed,
    'fees_passed',   f.fees_passed,
    'balance',       l.balance,
    -- The next day held money becomes available (Manila date), and how much.
    'next_release',  (select jsonb_build_object('at', min(t.first_at), 'amount', t.amount)
                        from (select (available_at at time zone 'Asia/Manila')::date as day, min(available_at) as first_at,
                                     sum(amount) as amount
                                from public.ledger_entries
                               where account = 'doctor' and doctor_id = p_doctor
                                 and entry_type in ('rx_payment', 'withholding_tax') and available_at > now()
                               group by 1 order by 1 limit 1) t
                       group by t.amount)
  )
  from l, p, f;
$$;

-- Admin overview: the same, plus the tax withheld so far.
create or replace function public.admin_money_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  with acc as (
    select account, coalesce(sum(amount), 0) as total from public.ledger_entries group by account
  ), docs as (
    select doctor_id,
           sum(amount) as balance,
           coalesce(sum(amount) filter (where entry_type in ('rx_payment', 'withholding_tax') and available_at > now()), 0) as on_hold
      from public.ledger_entries where account = 'doctor' group by doctor_id
  )
  select jsonb_build_object(
    'collected',       (select coalesce(sum(paid_amount), 0) from public.gateway_payments where paid_at is not null),
    'rx_collected',    (select coalesce(sum(paid_amount), 0) from public.gateway_payments where paid_at is not null and kind = 'rx'),
    'payments_count',  (select count(*) from public.gateway_payments where paid_at is not null),
    'paymongo_cost',   coalesce((select -total from acc where account = 'paymongo_cost'), 0),
    'odyssey_fees',    coalesce((select total from acc where account = 'odyssey_fee'), 0),
    'odyssey_sales',   coalesce((select total from acc where account = 'odyssey_sales'), 0),
    'payout_fee_diff', coalesce((select total from acc where account = 'payout_fee'), 0),
    'suspense',        coalesce((select total from acc where account = 'suspense'), 0),
    -- Creditable withholding tax PayMongo keeps for the BIR (RR 5-2025). ODYSSEY's part is a credit on its 2307.
    'tax_withheld_odyssey', coalesce((select -total from acc where account = 'withholding_tax'), 0),
    'tax_withheld_doctors', coalesce((select -sum(amount) from public.ledger_entries
                                       where account = 'doctor' and entry_type = 'withholding_tax'), 0),
    'owed_to_doctors', coalesce((select sum(balance) from docs), 0),
    'doctors_on_hold', coalesce((select sum(on_hold) from docs), 0),
    'doctors_available', coalesce((select sum(greatest(balance - on_hold, 0)) from docs), 0),
    'doctors_owing',   coalesce((select -sum(balance - on_hold) from docs where balance - on_hold < 0), 0),
    'payouts_requested', (select coalesce(sum(amount), 0) from public.payouts where status in ('requested', 'sending', 'processing')),
    'payouts_waiting', (select count(*) from public.payouts where status = 'requested'),
    'paid_out',        (select coalesce(sum(amount), 0) from public.payouts where status = 'sent'),
    'refunded',        (select coalesce(sum(amount), 0) from public.gateway_refunds where status in ('processing', 'succeeded')),
    'needs_review',    (select count(*) from public.gateway_payments where status = 'needs_review'),
    'ledger_total',    coalesce((select sum(total) from acc), 0),
    'settled_to_bank', (select coalesce(sum(amount), 0) from public.paymongo_settlements where status = 'deposited')
  ) into v;

  -- ODYSSEY's own money: its fees and sales, less PayMongo's charges.
  return v || jsonb_build_object(
    'odyssey_earned', (v ->> 'odyssey_fees')::numeric + (v ->> 'odyssey_sales')::numeric
                      - (v ->> 'paymongo_cost')::numeric + (v ->> 'payout_fee_diff')::numeric,
    'expected_with_paymongo', (v ->> 'ledger_total')::numeric - (v ->> 'settled_to_bank')::numeric);
end;
$$;

-- One payout per doctor for everything available. Doctors with a payout already open are skipped.
create or replace function public.internal_prepare_weekly_payouts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s       public.gateway_settings;
  ds      public.doctor_payment_settings;
  po      public.payouts;
  v_avail numeric;
  v_count integer := 0;
  v_total numeric := 0;
  v_small integer := 0;
begin
  select * into s from public.gateway_settings;
  for ds in select * from public.doctor_payment_settings where payout_account_number is not null loop
    perform pg_advisory_xact_lock(hashtext('payout:' || ds.doctor_id::text));
    continue when exists (select 1 from public.payouts
                           where doctor_id = ds.doctor_id and status in ('requested', 'sending', 'processing'));
    v_avail := round((public.doctor_balance_json(ds.doctor_id) ->> 'available')::numeric, 2);
    if v_avail < s.min_payout or v_avail - s.payout_fee <= 0 then
      if v_avail > 0 then v_small := v_small + 1; end if;
      continue;
    end if;

    insert into public.payouts (doctor_id, amount, fee, net_amount, provider, bank_code, bank_name, account_name, account_number)
    values (ds.doctor_id, v_avail, s.payout_fee, v_avail - s.payout_fee, ds.payout_provider, ds.payout_bank_code,
            ds.payout_bank_name, ds.payout_account_name, ds.payout_account_number)
    returning * into po;
    perform public.internal_ledger('doctor', ds.doctor_id, -v_avail, 'payout', null, po.id, null, null,
                                   'Saturday payout to ' || ds.payout_bank_name || ' ending ' || right(ds.payout_account_number, 4));
    v_count := v_count + 1;
    v_total := v_total + v_avail;
  end loop;
  return jsonb_build_object('created', v_count, 'total', v_total, 'below_minimum', v_small);
end;
$$;

revoke all on function public.internal_prepare_weekly_payouts() from public, anon, authenticated;

-- The Worker's Saturday cron (service_role only).
create or replace function public.cron_prepare_weekly_payouts()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.internal_prepare_weekly_payouts();
$$;

revoke all on function public.cron_prepare_weekly_payouts() from public, anon, authenticated;
grant execute on function public.cron_prepare_weekly_payouts() to service_role;

-- The same from the admin page, in case the cron did not run.
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
  return public.internal_prepare_weekly_payouts();
end;
$$;

revoke all on function public.admin_prepare_weekly_payouts() from public, anon;
grant execute on function public.admin_prepare_weekly_payouts() to authenticated;

create or replace function public.admin_set_withholding(p_pct numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_pct is null or p_pct < 0 or p_pct > 5 then
    raise exception 'Enter a rate from 0 to 5 percent' using errcode = '22023';
  end if;
  update public.gateway_settings set withholding_pct = round(p_pct, 3), updated_at = now(), updated_by = auth.uid();
end;
$$;

revoke all on function public.admin_set_withholding(numeric) from public, anon;
grant execute on function public.admin_set_withholding(numeric) to authenticated;
