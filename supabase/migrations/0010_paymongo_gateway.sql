-- Migration: 0010_paymongo_gateway.sql   (needs 0006, 0007, 0008 and 0009)
--
-- Online payments through ODYSSEY's PayMongo account, with no manual verification:
--   * Patients pay a prescription online. ODYSSEY collects it as the doctor's collecting agent, keeps its fee,
--     and holds the doctor's share until the doctor asks for a payout.
--   * Doctors pay for plans, extra seats and prescription packs online. ODYSSEY absorbs the PayMongo fee.
--   * Each doctor chooses who pays ODYSSEY's fee: the patient (added on top) or the doctor (taken from the share).
--   * Every movement of money is a permanent ledger line. Balances are sums of lines, never stored numbers.
--   * Payouts: the doctor asks, an admin approves, and the money goes out through PayMongo's transfer API.
--   * Refunds: fees are not refunded. Whoever paid the fee keeps that cost.
--
-- The browser never sees PayMongo keys. Edge Functions (service role) create checkouts, send payouts and refunds,
-- and pass signed webhook events to gateway_handle_event(), which is the only path that marks online payments paid.

-- ---------------------------------------------------------------------------------------------------------
-- 1. Settings and fee rates (editable by admins)
-- ---------------------------------------------------------------------------------------------------------
create table if not exists public.gateway_settings (
  id               boolean primary key default true check (id),
  enabled          boolean not null default true,           -- online payments on for everyone
  manual_fallback  boolean not null default false,          -- also offer the old QR + receipt flows
  hold_days        integer not null default 7 check (hold_days between 0 and 60),
  min_payout       numeric(10, 2) not null default 500 check (min_payout between 1 and 100000),
  payout_fee       numeric(10, 2) not null default 11.20 check (payout_fee between 0 and 1000),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references public.profiles (id)
);
insert into public.gateway_settings (id) values (true) on conflict (id) do nothing;

-- fee_* is what ODYSSEY charges (all-in, PayMongo's cost included). cost_* is PayMongo's charge to ODYSSEY with VAT,
-- used as an estimate until the real fee arrives with the payment.
create table if not exists public.gateway_fee_rates (
  method      text primary key check (method in ('qrph', 'gcash', 'paymaya', 'card')),
  label       text not null check (char_length(label) between 2 and 40),
  sort        integer not null default 0,
  is_enabled  boolean not null default false,
  fee_pct     numeric(6, 3) not null check (fee_pct between 0 and 20),
  fee_fixed   numeric(10, 2) not null default 0 check (fee_fixed between 0 and 1000),
  fee_min     numeric(10, 2) not null default 0 check (fee_min between 0 and 1000),
  cost_pct    numeric(6, 3) not null check (cost_pct between 0 and 20),
  cost_fixed  numeric(10, 2) not null default 0 check (cost_fixed between 0 and 1000),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id)
);

insert into public.gateway_fee_rates (method, label, sort, is_enabled, fee_pct, fee_fixed, fee_min, cost_pct, cost_fixed) values
  ('qrph',    'QR Ph',             1, true,  3.000, 0,  20, 1.500, 0),
  ('gcash',   'GCash',             2, false, 3.800, 0,  0,  2.500, 0),
  ('paymaya', 'Maya',              3, false, 3.500, 0,  0,  2.000, 0),
  ('card',    'Visa / Mastercard', 4, false, 5.500, 15, 0,  3.500, 15)
on conflict (method) do nothing;

alter table public.gateway_settings enable row level security;
alter table public.gateway_fee_rates enable row level security;
revoke all on public.gateway_settings, public.gateway_fee_rates from anon, authenticated;

-- ODYSSEY's fee on a price, and PayMongo's estimated charge on what the payer pays.
create or replace function public.gateway_fee(p_method text, p_price numeric)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select greatest(round(p_price * r.fee_pct / 100 + r.fee_fixed, 2), r.fee_min)
    from public.gateway_fee_rates r where r.method = p_method;
$$;

create or replace function public.gateway_cost(p_method text, p_total numeric)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select round(p_total * r.cost_pct / 100 + r.cost_fixed, 2)
    from public.gateway_fee_rates r where r.method = p_method;
$$;

revoke all on function public.gateway_fee(text, numeric) from public, anon, authenticated;
revoke all on function public.gateway_cost(text, numeric) from public, anon, authenticated;

-- What any page may know: whether online payments are on, and the fee for each method.
create or replace function public.gateway_public_config()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'enabled',         s.enabled,
    'manual_fallback', s.manual_fallback,
    'hold_days',       s.hold_days,
    'min_payout',      s.min_payout,
    'payout_fee',      s.payout_fee,
    'methods', coalesce((
      select jsonb_agg(jsonb_build_object('method', r.method, 'label', r.label, 'fee_pct', r.fee_pct,
                                          'fee_fixed', r.fee_fixed, 'fee_min', r.fee_min) order by r.sort)
        from public.gateway_fee_rates r where r.is_enabled), '[]'::jsonb))
  from public.gateway_settings s;
$$;

revoke all on function public.gateway_public_config() from public;
grant execute on function public.gateway_public_config() to anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 2. Each doctor's online payment settings and payout account
-- ---------------------------------------------------------------------------------------------------------
create table if not exists public.doctor_payment_settings (
  doctor_id              uuid primary key references public.profiles (id) on delete cascade,
  online_enabled         boolean not null default false,
  fee_mode               text not null default 'pass' check (fee_mode in ('pass', 'absorb')),
  agent_terms_accepted_at timestamptz,
  payout_provider        text check (payout_provider in ('instapay', 'pesonet')),
  payout_bank_code       text check (payout_bank_code ~ '^[A-Za-z0-9]{3,20}$'),
  payout_bank_name       text check (char_length(payout_bank_name) between 2 and 120),
  payout_account_name    text check (char_length(payout_account_name) between 2 and 120),
  payout_account_number  text check (payout_account_number ~ '^[0-9]{4,30}$'),
  updated_at             timestamptz not null default now()
);

alter table public.doctor_payment_settings enable row level security;
revoke all on public.doctor_payment_settings from anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 3. Plan payments can now be made online
-- ---------------------------------------------------------------------------------------------------------
alter table public.plan_requests add column if not exists channel text not null default 'manual';
do $$ begin
  alter table public.plan_requests add constraint plan_requests_channel_check check (channel in ('manual', 'gateway'));
exception when duplicate_object then null; end $$;
alter table public.plan_requests alter column reference_no drop not null;
alter table public.plan_requests alter column screenshot_path drop not null;
do $$ begin
  alter table public.plan_requests add constraint plan_requests_manual_proof
    check (channel = 'gateway' or (reference_no is not null and screenshot_path is not null));
exception when duplicate_object then null; end $$;
-- awaiting_payment: an online checkout was opened. paid_needs_review: paid online, but it could not be applied by itself.
alter table public.plan_requests drop constraint if exists plan_requests_status_check;
alter table public.plan_requests add constraint plan_requests_status_check
  check (status in ('pending', 'approved', 'rejected', 'cancelled', 'awaiting_payment', 'paid_needs_review'));

-- ---------------------------------------------------------------------------------------------------------
-- 4. Online payments, payouts, refunds and the ledger
-- ---------------------------------------------------------------------------------------------------------
create table if not exists public.gateway_payments (
  id                  uuid primary key default gen_random_uuid(),
  reference           text not null unique default public.nanoid_21(),   -- our reference_number at PayMongo
  kind                text not null check (kind in ('rx', 'purchase')),
  prescription_id     text references public.prescriptions (id) on delete set null,
  plan_request_id     uuid references public.plan_requests (id) on delete set null,
  doctor_id           uuid not null references public.profiles (id),      -- rx: the prescriber; purchase: the buyer
  method              text not null references public.gateway_fee_rates (method),
  fee_mode            text not null check (fee_mode in ('pass', 'absorb', 'odyssey')),
  price               numeric(10, 2) not null check (price > 0),           -- the prescription fee or what was bought
  fee                 numeric(10, 2) not null default 0 check (fee >= 0),  -- ODYSSEY's fee
  total               numeric(10, 2) not null check (total > 0),           -- what the payer pays
  doctor_share        numeric(10, 2) not null default 0 check (doctor_share >= 0),
  est_cost            numeric(10, 2) not null default 0,                   -- PayMongo's charge, estimated
  paymongo_cost       numeric(10, 2),                                      -- PayMongo's charge, from the payment
  paid_amount         numeric(10, 2),
  rates               jsonb not null,                                       -- the rates used, kept for the record
  status              text not null default 'open'
                      check (status in ('open', 'paid', 'needs_review', 'refunded')),
  review_note         text check (char_length(review_note) <= 500),
  checkout_session_id text unique,
  checkout_url        text,
  paymongo_payment_id text unique,
  livemode            boolean,
  paid_at             timestamptz,
  available_at        timestamptz,                                          -- when the doctor's share can be paid out
  created_at          timestamptz not null default now(),
  check (kind = 'purchase' or prescription_id is not null),
  check (kind = 'rx' or plan_request_id is not null)
);

create index if not exists gateway_payments_rx_idx on public.gateway_payments (prescription_id, created_at desc);
create index if not exists gateway_payments_doctor_idx on public.gateway_payments (doctor_id, created_at desc);
create index if not exists gateway_payments_status_idx on public.gateway_payments (status, created_at desc);

create table if not exists public.payouts (
  id                  uuid primary key default gen_random_uuid(),
  doctor_id           uuid not null references public.profiles (id),
  amount              numeric(10, 2) not null check (amount > 0),           -- taken from the doctor's balance
  fee                 numeric(10, 2) not null check (fee >= 0),             -- the transfer fee the doctor pays
  net_amount          numeric(10, 2) not null check (net_amount > 0),       -- what reaches the doctor's account
  actual_fee          numeric(10, 2),                                       -- PayMongo's real transfer fee
  provider            text not null check (provider in ('instapay', 'pesonet')),
  bank_code           text not null,
  bank_name           text not null,
  account_name        text not null,
  account_number      text not null,
  status              text not null default 'requested'
                      check (status in ('requested', 'sending', 'processing', 'sent', 'failed', 'rejected', 'cancelled')),
  transfer_reference  text not null unique default public.nanoid_21(),     -- our reference_number at PayMongo
  transfer_id         text unique,
  provider_reference  text,                                                -- InstaPay / PESONet number
  manual_reference    text check (char_length(manual_reference) <= 60),
  failure_reason      text check (char_length(failure_reason) <= 500),
  admin_note          text check (char_length(admin_note) <= 300),
  created_at          timestamptz not null default now(),
  decided_at          timestamptz,
  decided_by          uuid references public.profiles (id),
  sent_at             timestamptz,
  check (net_amount = amount - fee)
);

create index if not exists payouts_doctor_idx on public.payouts (doctor_id, created_at desc);
create index if not exists payouts_status_idx on public.payouts (status, created_at);
create unique index if not exists payouts_one_open
  on public.payouts (doctor_id) where status in ('requested', 'sending', 'processing');

create table if not exists public.gateway_refunds (
  id                  uuid primary key default gen_random_uuid(),
  gateway_payment_id  uuid not null references public.gateway_payments (id),
  amount              numeric(10, 2) not null check (amount > 0),
  reason              text not null check (reason in ('duplicate', 'fraudulent', 'others', 'requested_by_customer')),
  notes               text check (char_length(notes) <= 300),
  status              text not null default 'creating' check (status in ('creating', 'processing', 'succeeded', 'failed')),
  paymongo_refund_id  text unique,
  transfer_link       text,                                                 -- QR Ph refunds: the patient claims with this link
  failure_reason      text check (char_length(failure_reason) <= 500),
  created_by          uuid references public.profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists gateway_refunds_one_active
  on public.gateway_refunds (gateway_payment_id) where status <> 'failed';

-- Accounts:
--   doctor        what ODYSSEY owes the doctor (+ share of a payment, - payout, - refund)
--   odyssey_fee   ODYSSEY's fee on prescription payments
--   odyssey_sales plans, seats and packs sold
--   paymongo_cost PayMongo's charges (negative)
--   payout_fee    difference between the transfer fee charged to the doctor and PayMongo's real fee
--   suspense      money received that could not be applied (a duplicate payment, a wrong amount); refund or apply it
-- The sum of every line is the money that should be with PayMongo, before ODYSSEY's own withdrawals.
create table if not exists public.ledger_entries (
  id                  bigint generated always as identity primary key,
  created_at          timestamptz not null default now(),
  account             text not null check (account in ('doctor', 'odyssey_fee', 'odyssey_sales', 'paymongo_cost', 'payout_fee', 'suspense')),
  doctor_id           uuid references public.profiles (id),
  amount              numeric(12, 2) not null check (amount <> 0),
  entry_type          text not null check (entry_type in (
                        'rx_payment', 'purchase', 'paymongo_fee', 'payout', 'payout_reversal', 'payout_fee',
                        'refund', 'refund_reversal', 'suspense', 'suspense_applied')),
  gateway_payment_id  uuid references public.gateway_payments (id),
  payout_id           uuid references public.payouts (id),
  refund_id           uuid references public.gateway_refunds (id),
  available_at        timestamptz,
  memo                text check (char_length(memo) <= 300),
  check (account <> 'doctor' or doctor_id is not null)
);

create index if not exists ledger_doctor_idx on public.ledger_entries (doctor_id, created_at) where account = 'doctor';
create index if not exists ledger_payment_idx on public.ledger_entries (gateway_payment_id);
create index if not exists ledger_created_idx on public.ledger_entries (created_at);

-- Lines are never changed or removed. A correction is a new line.
create or replace function public.ledger_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Ledger lines cannot be changed or removed. Add a correcting line instead.' using errcode = '42501';
end;
$$;

drop trigger if exists ledger_entries_append_only on public.ledger_entries;
create trigger ledger_entries_append_only
  before update or delete on public.ledger_entries
  for each row execute function public.ledger_append_only();

-- PayMongo paying ODYSSEY's own bank (payout.deposited), for the balance check.
create table if not exists public.paymongo_settlements (
  id          text primary key,
  amount      numeric(12, 2) not null,
  status      text not null check (status in ('deposited', 'returned')),
  livemode    boolean,
  details     jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Webhook events already handled (PayMongo retries up to 12 times).
create table if not exists public.gateway_webhook_events (
  id          text primary key,
  type        text,
  livemode    boolean,
  result      text,
  received_at timestamptz not null default now()
);

-- ODYSSEY's own business expenses, for the tax estimate.
create table if not exists public.business_expenses (
  id           uuid primary key default gen_random_uuid(),
  spent_on     date not null check (spent_on > date '2020-01-01'),
  category     text not null check (category in ('hosting', 'software', 'marketing', 'staff', 'office', 'transport',
                                                 'professional_fees', 'bank_fees', 'other')),
  description  text not null check (char_length(trim(description)) between 2 and 200),
  amount       numeric(12, 2) not null check (amount > 0 and amount < 100000000),
  receipt_path text,
  created_by   uuid references public.profiles (id) default auth.uid(),
  created_at   timestamptz not null default now()
);

create index if not exists business_expenses_date_idx on public.business_expenses (spent_on);

alter table public.gateway_payments enable row level security;
alter table public.payouts enable row level security;
alter table public.gateway_refunds enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.paymongo_settlements enable row level security;
alter table public.gateway_webhook_events enable row level security;
alter table public.business_expenses enable row level security;
revoke all on public.gateway_payments, public.payouts, public.gateway_refunds, public.ledger_entries,
              public.paymongo_settlements, public.gateway_webhook_events, public.business_expenses
  from anon, authenticated;

-- Expenses are entered by admins straight from the admin page.
drop policy if exists business_expenses_admin on public.business_expenses;
create policy business_expenses_admin on public.business_expenses
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.business_expenses to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expense-receipts', 'expense-receipts', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists expense_receipts_admin_read on storage.objects;
create policy expense_receipts_admin_read on storage.objects
  for select to authenticated using (bucket_id = 'expense-receipts' and public.is_admin());
drop policy if exists expense_receipts_admin_insert on storage.objects;
create policy expense_receipts_admin_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'expense-receipts' and public.is_admin());
drop policy if exists expense_receipts_admin_delete on storage.objects;
create policy expense_receipts_admin_delete on storage.objects
  for delete to authenticated using (bucket_id = 'expense-receipts' and public.is_admin());

-- One ledger line. Zero amounts are skipped.
create or replace function public.internal_ledger(
  p_account text, p_doctor uuid, p_amount numeric, p_type text,
  p_payment uuid default null, p_payout uuid default null, p_refund uuid default null,
  p_available_at timestamptz default null, p_memo text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(p_amount, 0) = 0 then
    return;
  end if;
  insert into public.ledger_entries (account, doctor_id, amount, entry_type, gateway_payment_id, payout_id, refund_id, available_at, memo)
  values (p_account, p_doctor, round(p_amount, 2), p_type, p_payment, p_payout, p_refund, p_available_at, left(p_memo, 300));
end;
$$;

revoke all on function public.internal_ledger(text, uuid, numeric, text, uuid, uuid, uuid, timestamptz, text) from public, anon, authenticated;

-- A doctor's balance, split the way the doctor sees it.
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
      coalesce(sum(amount) filter (where entry_type = 'rx_payment' and available_at > now()), 0) as on_hold,
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
    'fees_absorbed', f.fees_absorbed,
    'fees_passed',   f.fees_passed,
    'balance',       l.balance,
    -- The next day held money becomes available (Manila date), and how much.
    'next_release',  (select jsonb_build_object('at', min(t.first_at), 'amount', t.amount)
                        from (select (available_at at time zone 'Asia/Manila')::date as day, min(available_at) as first_at,
                                     sum(amount) as amount
                                from public.ledger_entries
                               where account = 'doctor' and doctor_id = p_doctor and entry_type = 'rx_payment'
                                 and available_at > now()
                               group by 1 order by 1 limit 1) t
                       group by t.amount)
  )
  from l, p, f;
$$;

revoke all on function public.doctor_balance_json(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 5. Patients: paying a prescription online
-- ---------------------------------------------------------------------------------------------------------
-- What the patient may choose, with the exact amounts. Null when the doctor does not take online payments.
create or replace function public.rx_online_options(p_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  rx  public.prescriptions;
  s   public.gateway_settings;
  ds  public.doctor_payment_settings;
  v_methods jsonb;
  v_last public.gateway_payments;
begin
  if p_id is null or p_id !~ '^[A-Za-z0-9_-]{21}$' then
    return null;
  end if;
  select * into rx from public.prescriptions where id = p_id;
  if not found then
    return null;
  end if;
  select * into s from public.gateway_settings;
  select * into ds from public.doctor_payment_settings where doctor_id = rx.doctor_id;
  if not s.enabled or not coalesce(ds.online_enabled, false)
     or not exists (select 1 from public.profiles where id = rx.doctor_id and status = 'approved') then
    return null;
  end if;

  select coalesce(jsonb_agg(x.m order by x.sort), '[]'::jsonb) into v_methods
  from (
    select r.sort, jsonb_build_object(
             'method', r.method, 'label', r.label,
             'fee', public.gateway_fee(r.method, rx.amount),
             'total', case when ds.fee_mode = 'pass' then rx.amount + public.gateway_fee(r.method, rx.amount) else rx.amount end
           ) as m
      from public.gateway_fee_rates r
     where r.is_enabled
       and (ds.fee_mode = 'pass' or rx.amount - public.gateway_fee(r.method, rx.amount) >= 1)
  ) x;

  select * into v_last from public.gateway_payments
   where prescription_id = rx.id order by created_at desc limit 1;

  return jsonb_build_object(
    'fee_mode', ds.fee_mode,
    'price',    rx.amount,
    'paid',     rx.payment_status = 'paid',
    'methods',  v_methods,
    'last',     case when v_last.id is null then null else jsonb_build_object(
                  'status', v_last.status, 'method', v_last.method, 'total', v_last.total, 'created_at', v_last.created_at) end
  );
end;
$$;

revoke all on function public.rx_online_options(text) from public;
grant execute on function public.rx_online_options(text) to anon, authenticated;

-- Edge Function only: open (or reuse) a checkout for a prescription.
create or replace function public.gateway_prepare_rx(p_id text, p_method text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rx   public.prescriptions;
  s    public.gateway_settings;
  ds   public.doctor_payment_settings;
  r    public.gateway_fee_rates;
  gp   public.gateway_payments;
  doc  public.profiles;
  v_fee   numeric;
  v_total numeric;
  v_share numeric;
begin
  if p_id is null or p_id !~ '^[A-Za-z0-9_-]{21}$' then
    raise exception 'Prescription not found' using errcode = 'P0002';
  end if;
  select * into rx from public.prescriptions where id = p_id for update;
  if not found then
    raise exception 'Prescription not found' using errcode = 'P0002';
  end if;
  if rx.payment_status = 'paid' then
    raise exception 'This prescription is already paid' using errcode = '22023';
  end if;

  select * into s from public.gateway_settings;
  select * into ds from public.doctor_payment_settings where doctor_id = rx.doctor_id;
  select * into doc from public.profiles where id = rx.doctor_id;
  if not s.enabled or not coalesce(ds.online_enabled, false) or doc.status <> 'approved' then
    raise exception 'Online payment is not available for this prescription' using errcode = '22023';
  end if;
  select * into r from public.gateway_fee_rates where method = p_method and is_enabled;
  if not found then
    raise exception 'This payment method is not available' using errcode = '22023';
  end if;

  v_fee := public.gateway_fee(r.method, rx.amount);
  if ds.fee_mode = 'pass' then
    v_total := rx.amount + v_fee;
    v_share := rx.amount;
  else
    v_total := rx.amount;
    v_share := rx.amount - v_fee;
  end if;
  if v_share < 1 then
    raise exception 'This payment method is not available for this amount' using errcode = '22023';
  end if;

  -- Reuse a checkout opened in the last 50 minutes for the same method and amount.
  select * into gp from public.gateway_payments
   where prescription_id = rx.id and method = r.method and status = 'open' and total = v_total
     and checkout_url is not null and created_at > now() - interval '50 minutes'
   order by created_at desc limit 1;
  if found then
    return jsonb_build_object('id', gp.id, 'reference', gp.reference, 'checkout_url', gp.checkout_url, 'reused', true);
  end if;

  if (select count(*) from public.gateway_payments where prescription_id = rx.id and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many payment attempts. Please wait a few minutes and try again.' using errcode = '54000';
  end if;

  insert into public.gateway_payments
    (kind, prescription_id, doctor_id, method, fee_mode, price, fee, total, doctor_share, est_cost, rates)
  values
    ('rx', rx.id, rx.doctor_id, r.method, ds.fee_mode, rx.amount, v_fee, v_total, v_share,
     public.gateway_cost(r.method, v_total), to_jsonb(r) - 'updated_by' - 'updated_at')
  returning * into gp;

  return jsonb_build_object(
    'id', gp.id, 'reference', gp.reference, 'reused', false,
    'method', r.method, 'price', rx.amount, 'fee', v_fee, 'total', v_total, 'fee_mode', ds.fee_mode,
    'doctor_name', coalesce(rx.doctor_snapshot ->> 'full_name', doc.full_name),
    'prescription_id', rx.id
  );
end;
$$;

revoke all on function public.gateway_prepare_rx(text, text) from public, anon, authenticated;
grant execute on function public.gateway_prepare_rx(text, text) to service_role;

-- Edge Function only: remember the PayMongo checkout that was opened.
create or replace function public.gateway_attach_session(p_id uuid, p_session text, p_url text, p_livemode boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.gateway_payments
     set checkout_session_id = p_session, checkout_url = p_url, livemode = p_livemode
   where id = p_id and status = 'open';
$$;

revoke all on function public.gateway_attach_session(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.gateway_attach_session(uuid, text, text, boolean) to service_role;

-- ---------------------------------------------------------------------------------------------------------
-- 6. Doctors: paying for plans, seats and packs online
-- ---------------------------------------------------------------------------------------------------------
-- The three request functions keep every check they had. Inside start_gateway_purchase() they skip the receipt
-- and create an "awaiting_payment" request instead; the webhook applies it once PayMongo confirms the payment.
-- When online payments are on and the fallback is off, receipts can no longer be sent.
create or replace function public.internal_gateway_mode()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('app.gateway_checkout', true), '') = 'on';
$$;

create or replace function public.internal_manual_allowed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select not enabled or manual_fallback from public.gateway_settings), true);
$$;

revoke all on function public.internal_manual_allowed() from public, anon, authenticated;

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
  v_gw      boolean := public.internal_gateway_mode();
begin
  if not public.is_approved_doctor() then
    raise exception 'Only approved doctors can subscribe to a plan' using errcode = '42501';
  end if;
  if not v_gw and not public.internal_manual_allowed() then
    raise exception 'Pay online instead. Receipts are no longer needed.' using errcode = '22023';
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

  if not v_gw then
    if v_ref !~ '^[A-Z0-9 -]{6,40}$' then
      raise exception 'Enter the reference number exactly as it appears on your receipt (6 to 40 letters or numbers)' using errcode = '22023';
    end if;
    if p_screenshot_path is null or split_part(p_screenshot_path, '/', 1) <> auth.uid()::text
       or not exists (select 1 from storage.objects o where o.bucket_id = 'plan-payment-proofs' and o.name = p_screenshot_path) then
      raise exception 'Upload a screenshot of your receipt' using errcode = '22023';
    end if;
    if (select count(*) from public.plan_requests
         where doctor_id = auth.uid() and channel = 'manual' and created_at > now() - interval '1 day') >= 5 then
      raise exception 'Too many payment submissions today. Please contact ODYSSEY support.' using errcode = '54000';
    end if;
    if p_method_id is not null then
      select * into v_method from public.platform_payment_methods where id = p_method_id;
    end if;
  end if;

  begin
    insert into public.plan_requests
      (doctor_id, plan_id, billing_period, amount, payment_method_id, provider, reference_no, amount_read,
       screenshot_path, kind, seats, clinic_id, channel, status)
    values
      (auth.uid(), v_plan.id, p_period, v_amount, v_method.id, v_method.provider, nullif(v_ref, ''),
       case when not v_gw and p_amount_read between 0 and 10000000 then round(p_amount_read, 2) end,
       case when v_gw then null else p_screenshot_path end, 'plan', v_seats, v_clinic.id,
       case when v_gw then 'gateway' else 'manual' end, case when v_gw then 'awaiting_payment' else 'pending' end)
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
  v_gw     boolean := public.internal_gateway_mode();
begin
  select * into c from public.clinics where owner_id = auth.uid() and status = 'active';
  if not found or not public.is_approved_doctor() then
    raise exception 'Only the clinic owner can add seats' using errcode = '42501';
  end if;
  if not v_gw and not public.internal_manual_allowed() then
    raise exception 'Pay online instead. Receipts are no longer needed.' using errcode = '22023';
  end if;
  if c.current_period_end is not null and c.current_period_end <= now() then
    raise exception 'Renew the clinic plan first' using errcode = '22023';
  end if;
  if p_seats is null or p_seats < 1 or p_seats > 50 then
    raise exception 'Choose between 1 and 50 seats' using errcode = '22023';
  end if;
  v_amount := public.internal_seat_quote(c.id, p_seats);

  if not v_gw then
    if v_ref !~ '^[A-Z0-9 -]{6,40}$' then
      raise exception 'Enter the reference number exactly as it appears on your receipt (6 to 40 letters or numbers)' using errcode = '22023';
    end if;
    if p_screenshot_path is null or split_part(p_screenshot_path, '/', 1) <> auth.uid()::text
       or not exists (select 1 from storage.objects o where o.bucket_id = 'plan-payment-proofs' and o.name = p_screenshot_path) then
      raise exception 'Upload a screenshot of your receipt' using errcode = '22023';
    end if;
    if (select count(*) from public.plan_requests
         where doctor_id = auth.uid() and channel = 'manual' and created_at > now() - interval '1 day') >= 5 then
      raise exception 'Too many payment submissions today. Please contact ODYSSEY support.' using errcode = '54000';
    end if;
    if p_method_id is not null then
      select * into v_method from public.platform_payment_methods where id = p_method_id;
    end if;
  end if;

  begin
    insert into public.plan_requests
      (doctor_id, plan_id, billing_period, amount, payment_method_id, provider, reference_no, amount_read,
       screenshot_path, kind, seats, clinic_id, channel, status)
    values
      (auth.uid(), c.plan_id, c.billing_period, v_amount, v_method.id, v_method.provider, nullif(v_ref, ''),
       case when not v_gw and p_amount_read between 0 and 10000000 then round(p_amount_read, 2) end,
       case when v_gw then null else p_screenshot_path end, 'extra_seats', p_seats, c.id,
       case when v_gw then 'gateway' else 'manual' end, case when v_gw then 'awaiting_payment' else 'pending' end)
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
  v_gw     boolean := public.internal_gateway_mode();
begin
  if not public.is_approved_doctor() then
    raise exception 'Only approved doctors can buy prescriptions' using errcode = '42501';
  end if;
  if not v_gw and not public.internal_manual_allowed() then
    raise exception 'Pay online instead. Receipts are no longer needed.' using errcode = '22023';
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

  if not v_gw then
    if v_ref !~ '^[A-Z0-9 -]{6,40}$' then
      raise exception 'Enter the reference number exactly as it appears on your receipt (6 to 40 letters or numbers)' using errcode = '22023';
    end if;
    if p_screenshot_path is null or split_part(p_screenshot_path, '/', 1) <> auth.uid()::text
       or not exists (select 1 from storage.objects o where o.bucket_id = 'plan-payment-proofs' and o.name = p_screenshot_path) then
      raise exception 'Upload a screenshot of your receipt' using errcode = '22023';
    end if;
    if (select count(*) from public.plan_requests
         where doctor_id = auth.uid() and channel = 'manual' and created_at > now() - interval '1 day') >= 5 then
      raise exception 'Too many payment submissions today. Please contact ODYSSEY support.' using errcode = '54000';
    end if;
    if p_method_id is not null then
      select * into v_method from public.platform_payment_methods where id = p_method_id;
    end if;
  end if;
  select * into v_plan from public.effective_plan(auth.uid());

  begin
    insert into public.plan_requests
      (doctor_id, plan_id, billing_period, amount, payment_method_id, provider, reference_no, amount_read,
       screenshot_path, kind, clinic_id, pack_id, quantity, pack_rx, pack_valid_days, channel, status)
    values
      (auth.uid(), v_plan.plan_id, 'monthly', v_amount, v_method.id, v_method.provider, nullif(v_ref, ''),
       case when not v_gw and p_amount_read between 0 and 10000000 then round(p_amount_read, 2) end,
       case when v_gw then null else p_screenshot_path end, 'rx_pack', v_clinic.id, v_pack.id, v_qty,
       v_pack.rx_count * v_qty, v_pack.valid_days,
       case when v_gw then 'gateway' else 'manual' end, case when v_gw then 'awaiting_payment' else 'pending' end)
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

-- A doctor opens an online checkout for a plan ('plan'), extra seats ('seats') or a pack ('pack').
-- The Edge Function calls this with the doctor's own login, then opens the PayMongo checkout.
create or replace function public.start_gateway_purchase(
  p_kind     text,
  p_method   text,
  p_plan_id  text default null,
  p_period   text default 'monthly',
  p_seats    integer default 0,
  p_pack_id  text default null,
  p_quantity integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s     public.gateway_settings;
  r     public.gateway_fee_rates;
  v_res jsonb;
  v_req public.plan_requests;
  gp    public.gateway_payments;
  v_title text;
begin
  if not public.is_approved_doctor() then
    raise exception 'Only approved doctors can buy' using errcode = '42501';
  end if;
  select * into s from public.gateway_settings;
  if not s.enabled then
    raise exception 'Online payment is switched off right now' using errcode = '22023';
  end if;
  select * into r from public.gateway_fee_rates where method = p_method and is_enabled;
  if not found then
    raise exception 'This payment method is not available' using errcode = '22023';
  end if;
  if exists (select 1 from public.plan_requests where doctor_id = auth.uid() and status = 'pending') then
    raise exception 'You already have a payment waiting for review. Withdraw it first.' using errcode = '23505';
  end if;
  if (select count(*) from public.plan_requests
       where doctor_id = auth.uid() and channel = 'gateway' and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Too many payment attempts today. Please contact ODYSSEY support.' using errcode = '54000';
  end if;

  perform set_config('app.gateway_checkout', 'on', true);
  begin
    if p_kind = 'plan' then
      v_res := public.request_plan(p_plan_id, p_period, null, null, null, null, coalesce(p_seats, 0));
    elsif p_kind = 'seats' then
      v_res := public.request_extra_seats(p_seats, null, null);
    elsif p_kind = 'pack' then
      v_res := public.request_rx_pack(p_pack_id, p_quantity, null, null);
    else
      raise exception 'Choose what to buy' using errcode = '22023';
    end if;
  exception when others then
    perform set_config('app.gateway_checkout', '', true);
    raise;
  end;
  perform set_config('app.gateway_checkout', '', true);

  select * into v_req from public.plan_requests where id = (v_res ->> 'id')::uuid;
  v_title := case v_req.kind
    when 'extra_seats' then v_req.seats || ' extra doctor seat' || case when v_req.seats = 1 then '' else 's' end
    when 'rx_pack' then v_req.pack_rx || ' extra prescriptions'
    else (select name from public.subscription_plans where id = v_req.plan_id) || ' plan, '
         || case when v_req.billing_period = 'yearly' then 'one year' else 'one month' end
           || case when v_req.seats > 0 then ' + ' || v_req.seats || ' extra doctor' || case when v_req.seats = 1 then '' else 's' end else '' end
  end;

  insert into public.gateway_payments
    (kind, plan_request_id, doctor_id, method, fee_mode, price, fee, total, doctor_share, est_cost, rates)
  values
    ('purchase', v_req.id, auth.uid(), r.method, 'odyssey', v_req.amount, 0, v_req.amount, 0,
     public.gateway_cost(r.method, v_req.amount), to_jsonb(r) - 'updated_by' - 'updated_at')
  returning * into gp;

  return jsonb_build_object('id', gp.id, 'reference', gp.reference, 'total', gp.total, 'method', gp.method,
                            'title', v_title, 'request_id', v_req.id);
end;
$$;

revoke all on function public.start_gateway_purchase(text, text, text, text, integer, text, integer) from public, anon;
grant execute on function public.start_gateway_purchase(text, text, text, text, integer, text, integer) to authenticated;

-- Applying a paid request (the approval part of review_plan_request from 0008, unchanged).
create or replace function public.internal_apply_plan_request(p_id uuid, p_by uuid, p_note text)
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
  select * into v_req from public.plan_requests where id = p_id for update;
  select * into v_plan from public.subscription_plans where id = v_req.plan_id;
  v_len := case when v_req.billing_period = 'yearly' then interval '1 year' else interval '1 month' end;

  if v_req.kind = 'rx_pack' then
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
    values (v_req.doctor_id, v_req.plan_id, v_req.billing_period, v_end, null, now(), p_by)
    on conflict (doctor_id) do update
      set plan_id = excluded.plan_id,
          billing_period = excluded.billing_period,
          current_period_end = excluded.current_period_end,
          rx_limit_override = case when doctor_subscriptions.plan_id = excluded.plan_id
                                   then doctor_subscriptions.rx_limit_override end,
          updated_at = now(),
          updated_by = p_by;
  end if;

  update public.plan_requests
     set status = 'approved', review_note = left(nullif(trim(p_note), ''), 300),
         reviewed_at = now(), reviewed_by = p_by
   where id = p_id;
end;
$$;

revoke all on function public.internal_apply_plan_request(uuid, uuid, text) from public, anon, authenticated;

-- Admin review of receipts, and of online payments that could not be applied by themselves.
create or replace function public.review_plan_request(p_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.plan_requests;
  gp    public.gateway_payments;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select * into v_req from public.plan_requests where id = p_id for update;
  if not found then
    raise exception 'Payment request not found' using errcode = 'P0002';
  end if;
  if v_req.status not in ('pending', 'paid_needs_review') then
    raise exception 'This payment was already reviewed' using errcode = '22023';
  end if;

  if not p_approve then
    update public.plan_requests
       set status = 'rejected',
           review_note = coalesce(left(nullif(trim(p_note), ''), 300),
                                  case when v_req.channel = 'gateway' then 'We could not apply this payment. It will be refunded.'
                                       else 'We could not find this payment.' end),
           reviewed_at = now(), reviewed_by = auth.uid()
     where id = p_id;
    return;
  end if;

  perform public.internal_apply_plan_request(p_id, auth.uid(), p_note);

  -- An online payment held aside becomes a sale.
  if v_req.status = 'paid_needs_review' then
    select * into gp from public.gateway_payments where plan_request_id = p_id and status = 'needs_review' for update;
    if found then
      perform public.internal_ledger('suspense', null, -gp.paid_amount, 'suspense_applied', gp.id, null, null, null, 'Applied by admin');
      perform public.internal_ledger('odyssey_sales', null, gp.paid_amount, 'purchase', gp.id, null, null, null, 'Applied by admin');
      update public.gateway_payments set status = 'paid', review_note = null where id = gp.id;
    end if;
  end if;
end;
$$;

revoke all on function public.review_plan_request(uuid, boolean, text) from public, anon;
grant execute on function public.review_plan_request(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 7. Webhook events (the only path that marks online payments paid)
-- ---------------------------------------------------------------------------------------------------------
-- Money that arrived but could not be applied is held aside, so nothing is lost and the admin can refund it.
create or replace function public.internal_gateway_hold(gp public.gateway_payments, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.gateway_payments set status = 'needs_review', review_note = left(p_note, 500) where id = gp.id;
  perform public.internal_ledger('suspense', null, gp.paid_amount, 'suspense', gp.id, null, null, null, left(p_note, 300));
  perform public.internal_ledger('paymongo_cost', null, -gp.paymongo_cost, 'paymongo_fee', gp.id);
end;
$$;

revoke all on function public.internal_gateway_hold(public.gateway_payments, text) from public, anon, authenticated;

create or replace function public.internal_gateway_paid(p_session jsonb, p_livemode boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  gp       public.gateway_payments;
  rx       public.prescriptions;
  s        public.gateway_settings;
  v_pay    jsonb;
  v_amount numeric;
  v_net    numeric;
  v_fee    numeric;
  v_cost   numeric;
  v_req    public.plan_requests;
begin
  select * into gp from public.gateway_payments
   where reference = p_session #>> '{attributes,reference_number}'
      or (checkout_session_id is not null and checkout_session_id = p_session ->> 'id')
   order by (reference = p_session #>> '{attributes,reference_number}') desc
   limit 1
   for update;
  if not found then
    return 'unknown_checkout';
  end if;

  select value into v_pay from jsonb_array_elements(coalesce(p_session #> '{attributes,payments}', '[]'::jsonb))
   where value #>> '{attributes,status}' = 'paid' limit 1;
  if v_pay is null then
    return 'no_paid_payment';
  end if;
  if gp.status <> 'open' then
    return case when gp.paymongo_payment_id = v_pay ->> 'id' then 'already' else 'already_other' end;
  end if;

  v_amount := (v_pay #>> '{attributes,amount}')::numeric / 100;
  v_net    := (v_pay #>> '{attributes,net_amount}')::numeric / 100;
  v_fee    := (v_pay #>> '{attributes,fee}')::numeric / 100;
  v_cost   := coalesce(v_amount - v_net, v_fee, gp.est_cost);

  update public.gateway_payments
     set paymongo_payment_id = v_pay ->> 'id', paid_amount = v_amount, paymongo_cost = v_cost,
         paid_at = now(), livemode = p_livemode, checkout_session_id = coalesce(checkout_session_id, p_session ->> 'id')
   where id = gp.id
  returning * into gp;

  if v_amount is null or v_amount <> gp.total then
    perform public.internal_gateway_hold(gp, format('Paid %s but %s was expected. Check it in PayMongo, then refund it.',
                                                    coalesce(v_amount::text, 'an unknown amount'), gp.total));
    return 'held_amount';
  end if;

  if gp.kind = 'rx' then
    select * into rx from public.prescriptions where id = gp.prescription_id for update;
    if not found or rx.payment_status = 'paid' then
      perform public.internal_gateway_hold(gp, 'This prescription was already paid. Refund this second payment.');
      return 'held_duplicate';
    end if;
    select * into s from public.gateway_settings;
    update public.prescriptions set payment_status = 'paid', paid_at = now() where id = rx.id;
    update public.gateway_payments
       set status = 'paid', available_at = now() + make_interval(days => s.hold_days)
     where id = gp.id
    returning * into gp;
    perform public.internal_ledger('doctor', gp.doctor_id, gp.doctor_share, 'rx_payment', gp.id, null, null, gp.available_at,
                                   'Prescription ' || gp.prescription_id);
    perform public.internal_ledger('odyssey_fee', null, gp.fee, 'rx_payment', gp.id);
    perform public.internal_ledger('paymongo_cost', null, -gp.paymongo_cost, 'paymongo_fee', gp.id);
    return 'rx_paid';
  end if;

  -- A plan, seats or pack
  select * into v_req from public.plan_requests where id = gp.plan_request_id for update;
  if not found or v_req.status not in ('awaiting_payment', 'cancelled', 'rejected') then
    perform public.internal_gateway_hold(gp, 'This purchase was already handled. Refund this payment.');
    return 'held_duplicate';
  end if;
  begin
    perform public.internal_apply_plan_request(v_req.id, null, 'Paid online');
  exception when others then
    update public.plan_requests
       set status = 'paid_needs_review', review_note = left('Paid online. Waiting for ODYSSEY: ' || sqlerrm, 300)
     where id = v_req.id;
    perform public.internal_gateway_hold(gp, 'Paid, but it could not be applied: ' || sqlerrm || ' Approve or reject it in Payments to verify.');
    return 'held_apply';
  end;
  update public.gateway_payments set status = 'paid' where id = gp.id;
  perform public.internal_ledger('odyssey_sales', null, gp.price, 'purchase', gp.id);
  perform public.internal_ledger('paymongo_cost', null, -gp.paymongo_cost, 'paymongo_fee', gp.id);
  return 'purchase_paid';
end;
$$;

revoke all on function public.internal_gateway_paid(jsonb, boolean) from public, anon, authenticated;

-- A payout reached the doctor, or failed.
create or replace function public.internal_payout_finished(p_payout uuid, p_ok boolean, p_detail text, p_provider_ref text, p_actual_fee numeric)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  po public.payouts;
begin
  select * into po from public.payouts where id = p_payout for update;
  if not found then
    return 'unknown_payout';
  end if;
  if po.status in ('sent', 'failed', 'rejected', 'cancelled') then
    return 'already';
  end if;

  if p_ok then
    update public.payouts
       set status = 'sent', sent_at = now(), provider_reference = coalesce(p_provider_ref, provider_reference),
           actual_fee = coalesce(p_actual_fee, actual_fee)
     where id = po.id
    returning * into po;
    if po.actual_fee is not null and po.actual_fee <> po.fee then
      perform public.internal_ledger('payout_fee', null, po.fee - po.actual_fee, 'payout_fee', null, po.id, null, null,
                                     'Transfer fee charged ' || po.fee || ', PayMongo charged ' || po.actual_fee);
    end if;
    return 'payout_sent';
  end if;

  update public.payouts set status = 'failed', failure_reason = left(coalesce(p_detail, 'The transfer failed'), 500)
   where id = po.id;
  perform public.internal_ledger('doctor', po.doctor_id, po.amount, 'payout_reversal', null, po.id, null, null,
                                 'Payout failed, money returned to balance');
  return 'payout_failed';
end;
$$;

revoke all on function public.internal_payout_finished(uuid, boolean, text, text, numeric) from public, anon, authenticated;

-- A refund finished, or failed.
create or replace function public.internal_refund_finished(p_refund uuid, p_ok boolean, p_detail text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  rf public.gateway_refunds;
  gp public.gateway_payments;
begin
  select * into rf from public.gateway_refunds where id = p_refund for update;
  if not found then
    return 'unknown_refund';
  end if;
  if rf.status in ('succeeded', 'failed') then
    return 'already';
  end if;
  select * into gp from public.gateway_payments where id = rf.gateway_payment_id for update;

  if p_ok then
    update public.gateway_refunds set status = 'succeeded', updated_at = now() where id = rf.id;
    update public.gateway_payments set status = 'refunded' where id = gp.id;
    return 'refund_succeeded';
  end if;

  update public.gateway_refunds set status = 'failed', failure_reason = left(coalesce(p_detail, 'The refund failed'), 500),
         updated_at = now() where id = rf.id;
  -- Put the money back where it came from.
  insert into public.ledger_entries (account, doctor_id, amount, entry_type, gateway_payment_id, refund_id, memo)
  select account, doctor_id, -amount, 'refund_reversal', gateway_payment_id, refund_id, 'Refund failed'
    from public.ledger_entries where refund_id = rf.id and entry_type = 'refund';
  return 'refund_failed';
end;
$$;

revoke all on function public.internal_refund_finished(uuid, boolean, text) from public, anon, authenticated;

-- Edge Function only: one signed PayMongo event. Runs in one transaction, so a failure is retried by PayMongo
-- and a repeated event is ignored.
create or replace function public.gateway_handle_event(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     text := p_event #>> '{data,id}';
  v_type   text := p_event #>> '{data,attributes,type}';
  v_live   boolean := (p_event #>> '{data,attributes,livemode}')::boolean;
  v_res    jsonb := p_event #> '{data,attributes,data}';
  v_result text := 'ignored';
  v_po     public.payouts;
  v_rf     public.gateway_refunds;
  v_status text;
begin
  -- Transfer events may arrive as the bare transfer resource.
  if v_type is null and coalesce(p_event #>> '{data,type}', p_event ->> 'type') = 'wallet_transaction' then
    v_res := coalesce(p_event -> 'data', p_event);
    v_status := v_res #>> '{attributes,status}';
    v_type := case when v_status = 'succeeded' then 'transfer.outward.successful'
                   when v_status = 'failed' then 'transfer.outward.failed' else 'transfer.outward.' || coalesce(v_status, 'unknown') end;
    v_live := (v_res #>> '{attributes,livemode}')::boolean;
    v_id := 'transfer:' || (v_res ->> 'id') || ':' || coalesce(v_status, '');
  end if;
  if v_id is null or v_type is null then
    return jsonb_build_object('ok', false, 'error', 'unrecognized_event');
  end if;

  insert into public.gateway_webhook_events (id, type, livemode) values (v_id, v_type, v_live)
  on conflict (id) do nothing;
  if not found then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  if v_type = 'checkout_session.payment.paid' then
    v_result := public.internal_gateway_paid(v_res, v_live);

  elsif v_type in ('transfer.outward.successful', 'transfer.outward.failed') then
    select * into v_po from public.payouts
     where transfer_id = v_res ->> 'id'
        or transfer_id = v_res #>> '{attributes,transfer_id}'
        or transfer_reference = v_res #>> '{attributes,reference_number}'
     limit 1;
    if v_po.id is null then
      v_result := 'unknown_payout';
    else
      v_result := public.internal_payout_finished(
        v_po.id, v_type = 'transfer.outward.successful',
        nullif(concat_ws(' ', v_res #>> '{attributes,provider_error}', '(' || nullif(v_res #>> '{attributes,provider_error_code}', '') || ')'), ''),
        nullif(v_res #>> '{attributes,provider_reference_number}', ''),
        (v_res #>> '{attributes,fee}')::numeric / 100);
    end if;

  elsif v_type = 'payment.refund.updated' then
    select * into v_rf from public.gateway_refunds where paymongo_refund_id = v_res ->> 'id';
    v_status := v_res #>> '{attributes,status}';
    if v_rf.id is null then
      v_result := 'unknown_refund';
    elsif v_status = 'succeeded' then
      v_result := public.internal_refund_finished(v_rf.id, true, null);
    elsif v_status = 'failed' then
      v_result := public.internal_refund_finished(v_rf.id, false, 'PayMongo marked the refund as failed');
    else
      v_result := 'refund_' || coalesce(v_status, 'updated');
    end if;

  elsif v_type = 'payment.refunded' then
    select r.* into v_rf from public.gateway_refunds r
      join public.gateway_payments g on g.id = r.gateway_payment_id
     where g.paymongo_payment_id = v_res ->> 'id' and r.status in ('creating', 'processing')
     limit 1;
    v_result := case when v_rf.id is null then 'no_open_refund' else public.internal_refund_finished(v_rf.id, true, null) end;

  elsif v_type in ('payout.deposited', 'payout.returned') then
    insert into public.paymongo_settlements (id, amount, status, livemode, details)
    values (v_res ->> 'id', coalesce((v_res #>> '{attributes,net_amount}')::numeric, 0) / 100,
            case when v_type = 'payout.returned' then 'returned' else 'deposited' end, v_live,
            jsonb_build_object('bank_name', v_res #>> '{attributes,bank_name}',
                               'error', v_res #>> '{attributes,last_payout_transfer,error_message}'))
    on conflict (id) do update
      set status = excluded.status, amount = excluded.amount, details = excluded.details, updated_at = now();
    v_result := 'settlement_' || case when v_type = 'payout.returned' then 'returned' else 'deposited' end;

  elsif v_type = 'payment.failed' then
    v_result := 'payment_failed_noted';
  end if;

  update public.gateway_webhook_events set result = v_result where id = v_id;
  return jsonb_build_object('ok', true, 'result', v_result);
end;
$$;

revoke all on function public.gateway_handle_event(jsonb) from public, anon, authenticated;
grant execute on function public.gateway_handle_event(jsonb) to service_role;

-- ---------------------------------------------------------------------------------------------------------
-- 8. Doctors: settings, earnings, statements and payouts
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.set_online_payments(p_enabled boolean, p_fee_mode text, p_accept_terms boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ds public.doctor_payment_settings;
begin
  if not public.is_approved_doctor() then
    raise exception 'Only approved doctors can take online payments' using errcode = '42501';
  end if;
  if p_fee_mode not in ('pass', 'absorb') then
    raise exception 'Choose who pays the fee' using errcode = '22023';
  end if;
  select * into ds from public.doctor_payment_settings where doctor_id = auth.uid();
  if p_enabled and ds.agent_terms_accepted_at is null and not coalesce(p_accept_terms, false) then
    raise exception 'Accept the collection terms to take online payments' using errcode = '22023';
  end if;

  insert into public.doctor_payment_settings (doctor_id, online_enabled, fee_mode, agent_terms_accepted_at, updated_at)
  values (auth.uid(), p_enabled, p_fee_mode, case when p_accept_terms then now() end, now())
  on conflict (doctor_id) do update
    set online_enabled = excluded.online_enabled,
        fee_mode = excluded.fee_mode,
        agent_terms_accepted_at = coalesce(doctor_payment_settings.agent_terms_accepted_at, excluded.agent_terms_accepted_at),
        updated_at = now();
end;
$$;

revoke all on function public.set_online_payments(boolean, text, boolean) from public, anon;
grant execute on function public.set_online_payments(boolean, text, boolean) to authenticated;

create or replace function public.set_payout_account(
  p_provider text, p_bank_code text, p_bank_name text, p_account_name text, p_account_number text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number text := regexp_replace(coalesce(p_account_number, ''), '[^0-9]', '', 'g');
begin
  if not public.is_approved_doctor() then
    raise exception 'Only approved doctors can receive payouts' using errcode = '42501';
  end if;
  if p_provider not in ('instapay', 'pesonet') then
    raise exception 'Choose InstaPay or PESONet' using errcode = '22023';
  end if;
  if coalesce(p_bank_code, '') !~ '^[A-Za-z0-9]{3,20}$' or char_length(trim(coalesce(p_bank_name, ''))) < 2 then
    raise exception 'Choose your bank or e-wallet' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_account_name, ''))) < 2 then
    raise exception 'Enter the account name exactly as your bank shows it' using errcode = '22023';
  end if;
  if v_number !~ '^[0-9]{4,30}$' then
    raise exception 'Enter the account number using digits only' using errcode = '22023';
  end if;
  if exists (select 1 from public.payouts where doctor_id = auth.uid() and status in ('requested', 'sending', 'processing')) then
    raise exception 'You have a payout in progress. Change your account after it finishes.' using errcode = '22023';
  end if;

  insert into public.doctor_payment_settings
    (doctor_id, payout_provider, payout_bank_code, payout_bank_name, payout_account_name, payout_account_number, updated_at)
  values (auth.uid(), p_provider, p_bank_code, left(trim(p_bank_name), 120), left(trim(p_account_name), 120), v_number, now())
  on conflict (doctor_id) do update
    set payout_provider = excluded.payout_provider, payout_bank_code = excluded.payout_bank_code,
        payout_bank_name = excluded.payout_bank_name, payout_account_name = excluded.payout_account_name,
        payout_account_number = excluded.payout_account_number, updated_at = now();
end;
$$;

revoke all on function public.set_payout_account(text, text, text, text, text) from public, anon;
grant execute on function public.set_payout_account(text, text, text, text, text) to authenticated;

-- Everything the earnings page shows.
create or replace function public.my_earnings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ds public.doctor_payment_settings;
  s  public.gateway_settings;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select * into ds from public.doctor_payment_settings where doctor_id = auth.uid();
  select * into s from public.gateway_settings;

  return jsonb_build_object(
    'settings', jsonb_build_object(
      'online_enabled', coalesce(ds.online_enabled, false),
      'fee_mode', coalesce(ds.fee_mode, 'pass'),
      'terms_accepted_at', ds.agent_terms_accepted_at,
      'payout_account', case when ds.payout_account_number is null then null else jsonb_build_object(
        'provider', ds.payout_provider, 'bank_code', ds.payout_bank_code, 'bank_name', ds.payout_bank_name,
        'account_name', ds.payout_account_name, 'account_number', ds.payout_account_number) end),
    'rules', jsonb_build_object('enabled', s.enabled, 'hold_days', s.hold_days, 'min_payout', s.min_payout, 'payout_fee', s.payout_fee),
    'balance', public.doctor_balance_json(auth.uid()),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'prescription_id', g.prescription_id, 'patient', rx.patient_name,
               'method', g.method, 'method_label', r.label, 'fee_mode', g.fee_mode,
               'price', g.price, 'fee', g.fee, 'total', g.total, 'doctor_share', g.doctor_share,
               'status', g.status, 'paid_at', g.paid_at, 'available_at', g.available_at,
               'refund', (select jsonb_build_object('amount', f.amount, 'status', f.status, 'created_at', f.created_at)
                            from public.gateway_refunds f where f.gateway_payment_id = g.id and f.status <> 'failed' limit 1))
             order by g.paid_at desc)
        from (select * from public.gateway_payments
               where doctor_id = auth.uid() and kind = 'rx' and status in ('paid', 'refunded')
               order by paid_at desc limit 200) g
        left join public.prescriptions rx on rx.id = g.prescription_id
        left join public.gateway_fee_rates r on r.method = g.method), '[]'::jsonb),
    'payouts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'amount', p.amount, 'fee', p.fee, 'net_amount', p.net_amount, 'status', p.status,
               'bank_name', p.bank_name, 'account_end', right(p.account_number, 4), 'provider', p.provider,
               'provider_reference', p.provider_reference, 'manual_reference', p.manual_reference,
               'failure_reason', p.failure_reason, 'admin_note', p.admin_note,
               'created_at', p.created_at, 'sent_at', p.sent_at) order by p.created_at desc)
        from (select * from public.payouts where doctor_id = auth.uid() order by created_at desc limit 100) p), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.my_earnings() from public, anon;
grant execute on function public.my_earnings() to authenticated;

-- A month's statement: the opening balance, every ledger line in the month, and the closing balance.
create or replace function public.my_statement(p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start timestamptz := (date_trunc('month', p_month)::timestamp) at time zone 'Asia/Manila';
  v_end   timestamptz := ((date_trunc('month', p_month) + interval '1 month')::timestamp) at time zone 'Asia/Manila';
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'month', to_char(p_month, 'YYYY-MM'),
    'opening', (select coalesce(sum(amount), 0) from public.ledger_entries
                 where account = 'doctor' and doctor_id = auth.uid() and created_at < v_start),
    'closing', (select coalesce(sum(amount), 0) from public.ledger_entries
                 where account = 'doctor' and doctor_id = auth.uid() and created_at < v_end),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'at', l.created_at, 'type', l.entry_type, 'amount', l.amount, 'memo', l.memo,
               'prescription_id', g.prescription_id, 'patient', rx.patient_name, 'method', g.method,
               'price', g.price, 'fee', g.fee, 'total', g.total, 'fee_mode', g.fee_mode,
               'payout_fee', p.fee, 'payout_net', p.net_amount, 'available_at', l.available_at) order by l.id)
        from public.ledger_entries l
        left join public.gateway_payments g on g.id = l.gateway_payment_id
        left join public.prescriptions rx on rx.id = g.prescription_id
        left join public.payouts p on p.id = l.payout_id
       where l.account = 'doctor' and l.doctor_id = auth.uid() and l.created_at >= v_start and l.created_at < v_end), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.my_statement(date) from public, anon;
grant execute on function public.my_statement(date) to authenticated;

create or replace function public.request_payout(p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s   public.gateway_settings;
  ds  public.doctor_payment_settings;
  v_b jsonb;
  v_amount numeric := round(coalesce(p_amount, 0), 2);
  po  public.payouts;
begin
  if not public.is_approved_doctor() then
    raise exception 'Only approved doctors can ask for payouts' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('payout:' || auth.uid()::text));

  select * into s from public.gateway_settings;
  select * into ds from public.doctor_payment_settings where doctor_id = auth.uid();
  if ds.payout_account_number is null then
    raise exception 'Add the bank or e-wallet account where we send your money' using errcode = '22023';
  end if;
  if exists (select 1 from public.payouts where doctor_id = auth.uid() and status in ('requested', 'sending', 'processing')) then
    raise exception 'You already have a payout in progress' using errcode = '23505';
  end if;
  if v_amount < s.min_payout then
    raise exception 'The smallest payout is ₱%', to_char(s.min_payout, 'FM999,999,990.00') using errcode = '22023';
  end if;
  v_b := public.doctor_balance_json(auth.uid());
  if v_amount > (v_b ->> 'available')::numeric then
    raise exception 'You can ask for up to ₱% now', to_char(greatest((v_b ->> 'available')::numeric, 0), 'FM999,999,990.00')
      using errcode = '22023';
  end if;
  if v_amount - s.payout_fee <= 0 then
    raise exception 'The amount must be more than the transfer fee' using errcode = '22023';
  end if;

  insert into public.payouts (doctor_id, amount, fee, net_amount, provider, bank_code, bank_name, account_name, account_number)
  values (auth.uid(), v_amount, s.payout_fee, v_amount - s.payout_fee, ds.payout_provider, ds.payout_bank_code,
          ds.payout_bank_name, ds.payout_account_name, ds.payout_account_number)
  returning * into po;
  perform public.internal_ledger('doctor', auth.uid(), -v_amount, 'payout', null, po.id, null, null,
                                 'Payout to ' || ds.payout_bank_name || ' ending ' || right(ds.payout_account_number, 4));

  return jsonb_build_object('id', po.id, 'amount', po.amount, 'fee', po.fee, 'net_amount', po.net_amount);
end;
$$;

revoke all on function public.request_payout(numeric) from public, anon;
grant execute on function public.request_payout(numeric) to authenticated;

create or replace function public.cancel_payout(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  po public.payouts;
begin
  select * into po from public.payouts where id = p_id and doctor_id = auth.uid() for update;
  if not found or po.status <> 'requested' then
    raise exception 'This payout can no longer be cancelled' using errcode = '22023';
  end if;
  update public.payouts set status = 'cancelled', decided_at = now() where id = po.id;
  perform public.internal_ledger('doctor', po.doctor_id, po.amount, 'payout_reversal', null, po.id, null, null, 'Payout cancelled');
end;
$$;

revoke all on function public.cancel_payout(uuid) from public, anon;
grant execute on function public.cancel_payout(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 9. Admin: settings, money overview, payouts, refunds and taxes
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.admin_gateway_config()
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
  return jsonb_build_object(
    'settings', (select to_jsonb(s) - 'id' from public.gateway_settings s),
    'rates', (select jsonb_agg(to_jsonb(r) order by r.sort) from public.gateway_fee_rates r));
end;
$$;

revoke all on function public.admin_gateway_config() from public, anon;
grant execute on function public.admin_gateway_config() to authenticated;

create or replace function public.admin_set_gateway_settings(
  p_enabled boolean, p_manual_fallback boolean, p_hold_days integer, p_min_payout numeric, p_payout_fee numeric
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
  update public.gateway_settings
     set enabled = p_enabled, manual_fallback = p_manual_fallback, hold_days = p_hold_days,
         min_payout = p_min_payout, payout_fee = p_payout_fee, updated_at = now(), updated_by = auth.uid();
end;
$$;

revoke all on function public.admin_set_gateway_settings(boolean, boolean, integer, numeric, numeric) from public, anon;
grant execute on function public.admin_set_gateway_settings(boolean, boolean, integer, numeric, numeric) to authenticated;

create or replace function public.admin_set_fee_rate(
  p_method text, p_enabled boolean, p_fee_pct numeric, p_fee_fixed numeric, p_fee_min numeric,
  p_cost_pct numeric, p_cost_fixed numeric
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
  update public.gateway_fee_rates
     set is_enabled = p_enabled, fee_pct = p_fee_pct, fee_fixed = p_fee_fixed, fee_min = p_fee_min,
         cost_pct = p_cost_pct, cost_fixed = p_cost_fixed, updated_at = now(), updated_by = auth.uid()
   where method = p_method;
  if not found then
    raise exception 'Unknown payment method' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_set_fee_rate(text, boolean, numeric, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.admin_set_fee_rate(text, boolean, numeric, numeric, numeric, numeric, numeric) to authenticated;

-- Where all the money is, by the ledger.
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
           coalesce(sum(amount) filter (where entry_type = 'rx_payment' and available_at > now()), 0) as on_hold
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

revoke all on function public.admin_money_overview() from public, anon;
grant execute on function public.admin_money_overview() to authenticated;

create or replace function public.admin_gateway_payments(p_filter text default 'all')
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
             'id', g.id, 'reference', g.reference, 'kind', g.kind, 'prescription_id', g.prescription_id,
             'plan_request_id', g.plan_request_id, 'doctor_id', g.doctor_id, 'doctor_name', d.full_name,
             'method', g.method, 'fee_mode', g.fee_mode, 'price', g.price, 'fee', g.fee, 'total', g.total,
             'doctor_share', g.doctor_share, 'paymongo_cost', coalesce(g.paymongo_cost, g.est_cost),
             'cost_is_estimate', g.paymongo_cost is null, 'paid_amount', g.paid_amount,
             'status', g.status, 'review_note', g.review_note, 'paid_at', g.paid_at, 'available_at', g.available_at,
             'paymongo_payment_id', g.paymongo_payment_id, 'livemode', g.livemode, 'created_at', g.created_at,
             'refund', (select jsonb_build_object('id', f.id, 'amount', f.amount, 'status', f.status,
                                                  'transfer_link', f.transfer_link, 'failure_reason', f.failure_reason)
                          from public.gateway_refunds f where f.gateway_payment_id = g.id
                         order by f.created_at desc limit 1))
           order by coalesce(g.paid_at, g.created_at) desc)
      from (select * from public.gateway_payments
             where case p_filter
                     when 'needs_review' then status = 'needs_review'
                     when 'refunded' then status = 'refunded' or exists (select 1 from public.gateway_refunds f where f.gateway_payment_id = gateway_payments.id)
                     when 'open' then status = 'open'
                     else status <> 'open' end
             order by coalesce(paid_at, created_at) desc limit 300) g
      join public.profiles d on d.id = g.doctor_id), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_gateway_payments(text) from public, anon;
grant execute on function public.admin_gateway_payments(text) to authenticated;

-- Simple name check for payouts: the bank account name should match the verified doctor.
create or replace function public.internal_name_key(p text)
returns text
language sql
immutable
as $$
  select array_to_string(array(
    select w from unnest(string_to_array(lower(regexp_replace(coalesce(p, ''), '[^A-Za-z ]', ' ', 'g')), ' ')) w
     where w <> '' and w not in ('dr', 'md', 'jr', 'sr', 'iii', 'ii') order by w), ' ');
$$;

create or replace function public.admin_payouts(p_filter text default 'open')
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
             'id', p.id, 'doctor_id', p.doctor_id, 'doctor_name', d.full_name, 'doctor_email', d.email,
             'amount', p.amount, 'fee', p.fee, 'net_amount', p.net_amount, 'actual_fee', p.actual_fee,
             'provider', p.provider, 'bank_code', p.bank_code, 'bank_name', p.bank_name,
             'account_name', p.account_name, 'account_number', p.account_number,
             'name_matches', public.internal_name_key(p.account_name) = public.internal_name_key(d.full_name),
             'status', p.status, 'transfer_id', p.transfer_id, 'transfer_reference', p.transfer_reference,
             'provider_reference', p.provider_reference, 'manual_reference', p.manual_reference,
             'failure_reason', p.failure_reason, 'admin_note', p.admin_note,
             'created_at', p.created_at, 'decided_at', p.decided_at, 'sent_at', p.sent_at,
             'doctor_balance', public.doctor_balance_json(p.doctor_id))
           order by p.created_at)
      from public.payouts p
      join public.profiles d on d.id = p.doctor_id
     where case p_filter when 'open' then p.status in ('requested', 'sending', 'processing')
                         else p.created_at > now() - interval '1 year' end), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_payouts(text) from public, anon;
grant execute on function public.admin_payouts(text) to authenticated;

-- Edge Function (with the admin's login): claim a payout for sending. Only one sender can claim it.
create or replace function public.admin_begin_payout(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  po public.payouts;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select * into po from public.payouts where id = p_id for update;
  if not found then
    raise exception 'Payout not found' using errcode = 'P0002';
  end if;
  if po.status <> 'requested' then
    raise exception 'This payout is already %', po.status using errcode = '22023';
  end if;
  update public.payouts set status = 'sending', decided_at = now(), decided_by = auth.uid() where id = po.id
  returning * into po;
  return jsonb_build_object(
    'id', po.id, 'net_amount', po.net_amount, 'provider', po.provider, 'bank_code', po.bank_code,
    'account_name', po.account_name, 'account_number', po.account_number, 'reference', po.transfer_reference,
    'doctor_id', po.doctor_id);
end;
$$;

revoke all on function public.admin_begin_payout(uuid) from public, anon;
grant execute on function public.admin_begin_payout(uuid) to authenticated;

-- Edge Function only: what PayMongo answered when the transfer was created.
-- p_outcome: 'accepted' (pending at PayMongo), 'succeeded', 'rejected' (PayMongo refused it; nothing was sent),
-- or 'unknown' (no clear answer; the admin checks the PayMongo dashboard).
create or replace function public.gateway_payout_result(p_id uuid, p_outcome text, p_transfer_id text, p_fee numeric, p_detail text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  po public.payouts;
begin
  select * into po from public.payouts where id = p_id for update;
  if not found or po.status <> 'sending' then
    return 'not_sending';
  end if;
  if p_outcome in ('accepted', 'succeeded') then
    update public.payouts set status = 'processing', transfer_id = coalesce(p_transfer_id, transfer_id),
           actual_fee = coalesce(p_fee, actual_fee) where id = po.id;
    if p_outcome = 'succeeded' then
      return public.internal_payout_finished(po.id, true, null, null, p_fee);
    end if;
    return 'processing';
  elsif p_outcome = 'rejected' then
    return public.internal_payout_finished(po.id, false, 'PayMongo did not accept the transfer: ' || coalesce(p_detail, ''), null, null);
  end if;
  update public.payouts set failure_reason = left('No clear answer from PayMongo. Check the dashboard before doing anything. ' || coalesce(p_detail, ''), 500)
   where id = po.id;
  return 'unknown';
end;
$$;

revoke all on function public.gateway_payout_result(uuid, text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.gateway_payout_result(uuid, text, text, numeric, text) to service_role;

create or replace function public.admin_reject_payout(p_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  po public.payouts;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select * into po from public.payouts where id = p_id for update;
  if not found or po.status <> 'requested' then
    raise exception 'Only a requested payout can be rejected' using errcode = '22023';
  end if;
  update public.payouts
     set status = 'rejected', admin_note = coalesce(left(nullif(trim(p_note), ''), 300), 'Rejected by ODYSSEY'),
         decided_at = now(), decided_by = auth.uid()
   where id = po.id;
  perform public.internal_ledger('doctor', po.doctor_id, po.amount, 'payout_reversal', null, po.id, null, null, 'Payout rejected');
end;
$$;

revoke all on function public.admin_reject_payout(uuid, text) from public, anon;
grant execute on function public.admin_reject_payout(uuid, text) to authenticated;

-- For a payout sent by hand outside the system, or one whose transfer result never arrived:
-- the admin records what really happened (after checking PayMongo or the bank).
create or replace function public.admin_resolve_payout(p_id uuid, p_sent boolean, p_reference text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  po public.payouts;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select * into po from public.payouts where id = p_id for update;
  if not found or po.status not in ('requested', 'sending', 'processing') then
    raise exception 'This payout is already finished' using errcode = '22023';
  end if;
  if p_sent and char_length(trim(coalesce(p_reference, ''))) < 4 then
    raise exception 'Enter the transfer reference number' using errcode = '22023';
  end if;
  update public.payouts
     set manual_reference = case when p_sent then left(trim(p_reference), 60) end,
         admin_note = left(nullif(trim(p_note), ''), 300),
         decided_at = coalesce(decided_at, now()), decided_by = coalesce(decided_by, auth.uid())
   where id = po.id;
  perform public.internal_payout_finished(po.id, p_sent, coalesce(nullif(trim(p_note), ''), 'Marked failed by ODYSSEY'), null, null);
end;
$$;

revoke all on function public.admin_resolve_payout(uuid, boolean, text, text) from public, anon;
grant execute on function public.admin_resolve_payout(uuid, boolean, text, text) to authenticated;

-- Edge Function (with the admin's login): start a refund. The money comes off the ledger now, so it can't be
-- paid out meanwhile; it goes back if the refund fails.
-- Fees are not refunded: a prescription refunds its price (the doctor's balance covers it), a purchase refunds
-- what was paid, and money held aside refunds in full.
create or replace function public.admin_begin_refund(p_payment uuid, p_reason text, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  gp public.gateway_payments;
  rf public.gateway_refunds;
  v_amount numeric;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select * into gp from public.gateway_payments where id = p_payment for update;
  if not found or gp.status not in ('paid', 'needs_review') or gp.paymongo_payment_id is null then
    raise exception 'Only a paid payment can be refunded' using errcode = '22023';
  end if;
  if exists (select 1 from public.gateway_refunds where gateway_payment_id = gp.id and status <> 'failed') then
    raise exception 'This payment already has a refund' using errcode = '23505';
  end if;
  if p_reason not in ('duplicate', 'fraudulent', 'others', 'requested_by_customer') then
    raise exception 'Choose a reason' using errcode = '22023';
  end if;

  v_amount := case when gp.status = 'needs_review' then gp.paid_amount else gp.price end;
  insert into public.gateway_refunds (gateway_payment_id, amount, reason, notes, created_by)
  values (gp.id, v_amount, p_reason, left(nullif(trim(p_notes), ''), 300), auth.uid())
  returning * into rf;

  if gp.status = 'needs_review' then
    perform public.internal_ledger('suspense', null, -v_amount, 'refund', gp.id, null, rf.id, null, 'Refund of money held aside');
    update public.plan_requests
       set status = 'rejected', review_note = 'Refunded. Your payment could not be applied.', reviewed_at = now(), reviewed_by = auth.uid()
     where id = gp.plan_request_id and status = 'paid_needs_review';
  elsif gp.kind = 'rx' then
    perform public.internal_ledger('doctor', gp.doctor_id, -v_amount, 'refund', gp.id, null, rf.id, null,
                                   'Refund to patient, prescription ' || gp.prescription_id);
  else
    perform public.internal_ledger('odyssey_sales', null, -v_amount, 'refund', gp.id, null, rf.id, null, 'Refund of a purchase');
  end if;

  return jsonb_build_object('id', rf.id, 'payment_id', gp.paymongo_payment_id, 'amount', v_amount, 'method', gp.method,
                            'reason', rf.reason, 'notes', rf.notes);
end;
$$;

revoke all on function public.admin_begin_refund(uuid, text, text) from public, anon;
grant execute on function public.admin_begin_refund(uuid, text, text) to authenticated;

-- Edge Function only: what PayMongo answered when the refund was created.
create or replace function public.gateway_refund_result(p_id uuid, p_ok boolean, p_refund_id text, p_status text, p_link text, p_detail text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  rf public.gateway_refunds;
begin
  select * into rf from public.gateway_refunds where id = p_id for update;
  if not found or rf.status <> 'creating' then
    return 'not_creating';
  end if;
  if not p_ok then
    return public.internal_refund_finished(rf.id, false, p_detail);
  end if;
  update public.gateway_refunds
     set status = 'processing', paymongo_refund_id = p_refund_id, transfer_link = p_link, updated_at = now()
   where id = rf.id;
  if p_status = 'succeeded' then
    return public.internal_refund_finished(rf.id, true, null);
  end if;
  return 'processing';
end;
$$;

revoke all on function public.gateway_refund_result(uuid, boolean, text, text, text, text) from public, anon, authenticated;
grant execute on function public.gateway_refund_result(uuid, boolean, text, text, text, text) to service_role;

-- What each doctor is owed.
create or replace function public.admin_doctor_balances()
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
    select jsonb_agg(jsonb_build_object('doctor_id', d.id, 'doctor_name', d.full_name, 'email', d.email,
                                        'online_enabled', coalesce(ds.online_enabled, false), 'fee_mode', ds.fee_mode,
                                        'balance', public.doctor_balance_json(d.id)) order by d.full_name)
      from public.profiles d
      left join public.doctor_payment_settings ds on ds.doctor_id = d.id
     where d.role = 'doctor'
       and (ds.online_enabled or exists (select 1 from public.ledger_entries l where l.account = 'doctor' and l.doctor_id = d.id))), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_doctor_balances() from public, anon;
grant execute on function public.admin_doctor_balances() to authenticated;

-- ODYSSEY's gross receipts and costs for a year, by quarter (Manila time), for the tax estimate.
-- Gross receipts are ODYSSEY's own fees and sales only. Doctors' shares pass through and are not included.
create or replace function public.admin_tax_summary(p_year integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start timestamptz := make_timestamp(p_year, 1, 1, 0, 0, 0) at time zone 'Asia/Manila';
  v_end   timestamptz := make_timestamp(p_year + 1, 1, 1, 0, 0, 0) at time zone 'Asia/Manila';
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'year', p_year,
    'quarters', (
      select jsonb_agg(jsonb_build_object(
               'quarter', q,
               'rx_fees', coalesce((select sum(amount) from public.ledger_entries
                                     where account = 'odyssey_fee' and created_at >= v_start and created_at < v_end
                                       and extract(quarter from created_at at time zone 'Asia/Manila') = q), 0),
               'sales', coalesce((select sum(amount) from public.ledger_entries
                                   where account = 'odyssey_sales' and created_at >= v_start and created_at < v_end
                                     and extract(quarter from created_at at time zone 'Asia/Manila') = q), 0),
               'paymongo_cost', coalesce((select -sum(amount) from public.ledger_entries
                                           where account = 'paymongo_cost' and created_at >= v_start and created_at < v_end
                                             and extract(quarter from created_at at time zone 'Asia/Manila') = q), 0),
               'payout_fee_diff', coalesce((select sum(amount) from public.ledger_entries
                                             where account = 'payout_fee' and created_at >= v_start and created_at < v_end
                                               and extract(quarter from created_at at time zone 'Asia/Manila') = q), 0),
               'expenses', coalesce((select sum(amount) from public.business_expenses
                                      where extract(year from spent_on) = p_year and extract(quarter from spent_on) = q), 0))
             order by q)
        from generate_series(1, 4) q),
    'expenses_by_category', coalesce((
      select jsonb_agg(jsonb_build_object('category', category, 'amount', total) order by total desc)
        from (select category, sum(amount) total from public.business_expenses
               where extract(year from spent_on) = p_year group by category) c), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_tax_summary(integer) from public, anon;
grant execute on function public.admin_tax_summary(integer) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 10. The plan page also needs to know whether the latest request was paid online
-- ---------------------------------------------------------------------------------------------------------
do $$ begin
  if to_regprocedure('public.plan_usage_json_0008(uuid)') is null then
    alter function public.plan_usage_json(uuid) rename to plan_usage_json_0008;
  end if;
end $$;

create or replace function public.plan_usage_json(p_doctor uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb := public.plan_usage_json_0008(p_doctor);
begin
  if jsonb_typeof(v -> 'latest_request') = 'object' then
    v := jsonb_set(v, '{latest_request,channel}',
                   to_jsonb((select channel from public.plan_requests where id = (v #>> '{latest_request,id}')::uuid)));
  end if;
  return v;
end;
$$;

revoke all on function public.plan_usage_json_0008(uuid) from public, anon, authenticated;
revoke all on function public.plan_usage_json(uuid) from public, anon, authenticated;
