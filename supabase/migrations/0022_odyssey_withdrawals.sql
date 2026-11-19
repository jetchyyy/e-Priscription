-- Migration: 0022_odyssey_withdrawals.sql   (needs 0010, 0018, 0019)
--
-- ODYSSEY takes its own revenue out of the PayMongo Wallet to its own bank or e-wallet, as on ODC Courts.
--
--   * odyssey_payout_account: one account. Changing an existing one pauses withdrawals for 24 hours, so a
--     hijacked admin login cannot change the account and empty the wallet at once.
--   * odyssey_withdrawals: each withdrawal. The Worker (Admin -> Money) only sends what is ODYSSEY's own
--     (odyssey_revenue_available) and what the wallet holds beyond everything owed to doctors.
--   * Ledger: account 'odyssey_withdrawal' for the money that left, and PayMongo's transfer fee as a PayMongo
--     charge. A failed withdrawal puts both back.
--   * Transfer results arrive by webhook (gateway_handle_withdrawal_event) or, because webhooks can be missed,
--     from the Worker's 15-minute job asking PayMongo (cron_transfers_to_check / cron_transfer_result). That job
--     also finishes doctor payouts whose result never arrived.

alter table public.ledger_entries drop constraint if exists ledger_entries_account_check;
alter table public.ledger_entries add constraint ledger_entries_account_check check (account in (
  'doctor', 'odyssey_fee', 'odyssey_sales', 'paymongo_cost', 'payout_fee', 'suspense', 'withholding_tax',
  'odyssey_withdrawal'));
alter table public.ledger_entries drop constraint if exists ledger_entries_entry_type_check;
alter table public.ledger_entries add constraint ledger_entries_entry_type_check check (entry_type in (
  'rx_payment', 'purchase', 'paymongo_fee', 'payout', 'payout_reversal', 'payout_fee',
  'refund', 'refund_reversal', 'suspense', 'suspense_applied', 'withholding_tax',
  'withdrawal', 'withdrawal_reversal'));

create table if not exists public.odyssey_payout_account (
  id              boolean primary key default true check (id),
  provider        text not null check (provider in ('instapay', 'pesonet')),
  bank_code       text not null,
  bank_name       text not null,
  account_name    text not null check (char_length(account_name) between 2 and 120),
  account_number  text not null check (account_number ~ '^[0-9]{6,20}$'),
  cooldown_until  timestamptz,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles (id)
);
alter table public.odyssey_payout_account enable row level security; -- read only through the functions below

create table if not exists public.odyssey_withdrawals (
  id                  uuid primary key default gen_random_uuid(),
  amount              numeric(12, 2) not null check (amount > 0),   -- what reaches ODYSSEY's account
  fee                 numeric(10, 2) not null check (fee >= 0),     -- PayMongo's transfer fee, estimated
  actual_fee          numeric(10, 2),
  provider            text not null,
  bank_code           text not null,
  bank_name           text not null,
  account_name        text not null,
  account_number      text not null,
  status              text not null default 'sending' check (status in ('sending', 'processing', 'sent', 'failed')),
  transfer_reference  text not null unique default public.nanoid_21(),
  transfer_id         text unique,
  provider_reference  text,
  failure_reason      text check (char_length(failure_reason) <= 500),
  note                text check (char_length(note) <= 300),
  created_by          uuid references public.profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  sent_at             timestamptz
);
create index if not exists odyssey_withdrawals_created_idx on public.odyssey_withdrawals (created_at desc);
alter table public.odyssey_withdrawals enable row level security;

-- ODYSSEY's own money still with PayMongo: fees and sales, less PayMongo's charges, the transfer fee difference,
-- its part of the digital tax and what it already took out. Doctors' tax not yet kept by PayMongo is not counted.
create or replace function public.odyssey_revenue_available()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount) filter (where account in ('odyssey_fee', 'odyssey_sales', 'paymongo_cost', 'payout_fee', 'odyssey_withdrawal')), 0)
       + least(coalesce(sum(amount) filter (where account = 'withholding_tax'), 0), 0)
    from public.ledger_entries;
$$;

revoke all on function public.odyssey_revenue_available() from public, anon, authenticated;

create or replace function public.admin_set_odyssey_payout_account(
  p_provider text, p_bank_code text, p_bank_name text, p_account_name text, p_account_number text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number text := regexp_replace(coalesce(p_account_number, ''), '\D', '', 'g');
  v_had    boolean;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_provider not in ('instapay', 'pesonet') then
    raise exception 'Choose InstaPay or PESONet' using errcode = '22023';
  end if;
  if nullif(trim(p_bank_code), '') is null or nullif(trim(p_bank_name), '') is null then
    raise exception 'Choose the bank or e-wallet' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_account_name, ''))) < 2 then
    raise exception 'Enter the account name exactly as the bank shows it' using errcode = '22023';
  end if;
  if v_number !~ '^[0-9]{6,20}$' then
    raise exception 'Enter the account number using digits only' using errcode = '22023';
  end if;
  if exists (select 1 from public.odyssey_withdrawals where status in ('sending', 'processing')) then
    raise exception 'A withdrawal is in progress. Change the account after it finishes.' using errcode = '22023';
  end if;

  select exists (select 1 from public.odyssey_payout_account) into v_had;
  insert into public.odyssey_payout_account (id, provider, bank_code, bank_name, account_name, account_number, cooldown_until, updated_at, updated_by)
  values (true, p_provider, trim(p_bank_code), trim(p_bank_name), trim(p_account_name), v_number, null, now(), auth.uid())
  on conflict (id) do update
    set provider = excluded.provider, bank_code = excluded.bank_code, bank_name = excluded.bank_name,
        account_name = excluded.account_name, account_number = excluded.account_number,
        cooldown_until = case when v_had then now() + interval '24 hours' else null end,
        updated_at = now(), updated_by = auth.uid();
end;
$$;

revoke all on function public.admin_set_odyssey_payout_account(text, text, text, text, text) from public, anon;
grant execute on function public.admin_set_odyssey_payout_account(text, text, text, text, text) to authenticated;

create or replace function public.admin_odyssey_withdrawals()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a public.odyssey_payout_account;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select * into a from public.odyssey_payout_account;
  return jsonb_build_object(
    'account', case when a.id is null then null else jsonb_build_object(
      'provider', a.provider, 'bank_code', a.bank_code, 'bank_name', a.bank_name, 'account_name', a.account_name,
      'account_number', a.account_number, 'updated_at', a.updated_at,
      'withdrawals_resume_at', case when a.cooldown_until > now() then a.cooldown_until end) end,
    'revenue_available', round(public.odyssey_revenue_available(), 2),
    'transfer_fee', (select payout_fee from public.gateway_settings),
    'withdrawals', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', w.id, 'amount', w.amount, 'fee', coalesce(w.actual_fee, w.fee), 'status', w.status,
               'bank_name', w.bank_name, 'account_end', right(w.account_number, 4), 'note', w.note,
               'provider_reference', w.provider_reference, 'failure_reason', w.failure_reason,
               'created_at', w.created_at, 'sent_at', w.sent_at) order by w.created_at desc)
        from (select * from public.odyssey_withdrawals order by created_at desc limit 50) w), '[]'::jsonb));
end;
$$;

revoke all on function public.admin_odyssey_withdrawals() from public, anon;
grant execute on function public.admin_odyssey_withdrawals() to authenticated;

-- Worker (with the admin's login): start a withdrawal. p_wallet_cap is what the PayMongo Wallet holds beyond
-- everything owed to doctors, read by the Worker just before. The amount and PayMongo's fee must fit in both.
create or replace function public.admin_begin_withdrawal(p_amount numeric, p_wallet_cap numeric, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a       public.odyssey_payout_account;
  w       public.odyssey_withdrawals;
  v_fee   numeric := (select payout_fee from public.gateway_settings);
  v_amt   numeric := round(coalesce(p_amount, 0), 2);
  v_avail numeric;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('odyssey-withdrawal'));
  select * into a from public.odyssey_payout_account;
  if a.id is null then
    raise exception 'Add ODYSSEY''s payout account first' using errcode = '22023';
  end if;
  if a.cooldown_until > now() then
    raise exception 'The payout account was just changed. Withdrawals resume %.',
      to_char(a.cooldown_until at time zone 'Asia/Manila', 'Mon FMDD, FMHH12:MI AM') using errcode = '22023';
  end if;
  if v_amt <= 0 then
    raise exception 'Enter an amount above zero' using errcode = '22023';
  end if;
  if exists (select 1 from public.odyssey_withdrawals where status = 'sending') then
    raise exception 'Another withdrawal is being sent. Try again in a minute.' using errcode = '23505';
  end if;
  v_avail := round(public.odyssey_revenue_available(), 2);
  if v_amt + v_fee > v_avail then
    raise exception 'ODYSSEY has ₱% of its own revenue to take out (₱% after the ₱% transfer fee)',
      to_char(greatest(v_avail, 0), 'FM999,999,990.00'), to_char(greatest(v_avail - v_fee, 0), 'FM999,999,990.00'),
      to_char(v_fee, 'FM990.00') using errcode = '22023';
  end if;
  if p_wallet_cap is null or v_amt + v_fee > p_wallet_cap then
    raise exception 'Only ₱% can leave the PayMongo Wallet now without touching doctors'' money (₱% after the transfer fee). Wait for PayMongo''s Thursday settlement.',
      to_char(greatest(coalesce(p_wallet_cap, 0), 0), 'FM999,999,990.00'),
      to_char(greatest(coalesce(p_wallet_cap, 0) - v_fee, 0), 'FM999,999,990.00') using errcode = '22023';
  end if;

  insert into public.odyssey_withdrawals (amount, fee, provider, bank_code, bank_name, account_name, account_number, note, created_by)
  values (v_amt, v_fee, a.provider, a.bank_code, a.bank_name, a.account_name, a.account_number, left(nullif(trim(p_note), ''), 300), auth.uid())
  returning * into w;
  perform public.internal_ledger('odyssey_withdrawal', null, -v_amt, 'withdrawal', null, null, null, null,
                                 'ODYSSEY withdrawal to ' || a.bank_name || ' ending ' || right(a.account_number, 4));
  perform public.internal_ledger('paymongo_cost', null, -v_fee, 'paymongo_fee', null, null, null, null,
                                 'Transfer fee, ODYSSEY withdrawal ' || w.transfer_reference);

  return jsonb_build_object(
    'id', w.id, 'net_amount', w.amount, 'provider', w.provider, 'bank_code', w.bank_code,
    'account_name', w.account_name, 'account_number', w.account_number, 'reference', w.transfer_reference);
end;
$$;

revoke all on function public.admin_begin_withdrawal(numeric, numeric, text) from public, anon;
grant execute on function public.admin_begin_withdrawal(numeric, numeric, text) to authenticated;

create or replace function public.internal_withdrawal_finished(p_id uuid, p_ok boolean, p_detail text, p_provider_ref text, p_actual_fee numeric)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.odyssey_withdrawals;
begin
  select * into w from public.odyssey_withdrawals where id = p_id for update;
  if not found then
    return 'unknown_withdrawal';
  end if;
  if w.status in ('sent', 'failed') then
    return 'already';
  end if;
  if p_ok then
    update public.odyssey_withdrawals
       set status = 'sent', sent_at = now(), updated_at = now(),
           provider_reference = coalesce(p_provider_ref, provider_reference), actual_fee = coalesce(p_actual_fee, actual_fee)
     where id = w.id
    returning * into w;
    if w.actual_fee is not null and w.actual_fee <> w.fee then
      perform public.internal_ledger('paymongo_cost', null, w.fee - w.actual_fee, 'paymongo_fee', null, null, null, null,
                                     'Transfer fee correction, ODYSSEY withdrawal ' || w.transfer_reference);
    end if;
    return 'withdrawal_sent';
  end if;
  update public.odyssey_withdrawals
     set status = 'failed', updated_at = now(), failure_reason = left(coalesce(p_detail, 'The transfer failed'), 500)
   where id = w.id;
  perform public.internal_ledger('odyssey_withdrawal', null, w.amount, 'withdrawal_reversal', null, null, null, null,
                                 'Withdrawal failed, back with PayMongo');
  perform public.internal_ledger('paymongo_cost', null, w.fee, 'paymongo_fee', null, null, null, null,
                                 'Transfer fee back, ODYSSEY withdrawal ' || w.transfer_reference);
  return 'withdrawal_failed';
end;
$$;

revoke all on function public.internal_withdrawal_finished(uuid, boolean, text, text, numeric) from public, anon, authenticated;

-- Worker only: PayMongo's answer when the transfer was created. Same outcomes as gateway_payout_result.
create or replace function public.gateway_withdrawal_result(p_id uuid, p_outcome text, p_transfer_id text, p_fee numeric, p_detail text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.odyssey_withdrawals;
begin
  select * into w from public.odyssey_withdrawals where id = p_id for update;
  if not found or w.status <> 'sending' then
    return 'not_sending';
  end if;
  if p_outcome in ('accepted', 'succeeded') then
    update public.odyssey_withdrawals
       set status = 'processing', transfer_id = coalesce(p_transfer_id, transfer_id), actual_fee = coalesce(p_fee, actual_fee), updated_at = now()
     where id = w.id;
    if p_outcome = 'succeeded' then
      return public.internal_withdrawal_finished(w.id, true, null, null, p_fee);
    end if;
    return 'processing';
  elsif p_outcome = 'rejected' then
    return public.internal_withdrawal_finished(w.id, false, 'PayMongo did not accept the transfer: ' || coalesce(p_detail, ''), null, null);
  end if;
  update public.odyssey_withdrawals
     set failure_reason = left('No clear answer from PayMongo. Check the dashboard. ' || coalesce(p_detail, ''), 500), updated_at = now()
   where id = w.id;
  return 'unknown';
end;
$$;

revoke all on function public.gateway_withdrawal_result(uuid, text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.gateway_withdrawal_result(uuid, text, text, numeric, text) to service_role;

-- Worker only: a signed transfer webhook for an ODYSSEY withdrawal. Returns null when it is not one (the Worker then
-- passes the event to gateway_handle_event, which handles doctor payouts).
create or replace function public.gateway_handle_withdrawal_event(p_event jsonb)
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
  v_status text;
  w        public.odyssey_withdrawals;
  v_result text;
begin
  if v_type is null and coalesce(p_event #>> '{data,type}', p_event ->> 'type') = 'wallet_transaction' then
    v_res := coalesce(p_event -> 'data', p_event);
    v_status := v_res #>> '{attributes,status}';
    v_type := case when v_status = 'succeeded' then 'transfer.outward.successful'
                   when v_status = 'failed' then 'transfer.outward.failed' else 'transfer.outward.' || coalesce(v_status, 'unknown') end;
    v_live := (v_res #>> '{attributes,livemode}')::boolean;
    v_id := 'transfer:' || (v_res ->> 'id') || ':' || coalesce(v_status, '');
  end if;
  if v_type not in ('transfer.outward.successful', 'transfer.outward.failed') then
    return null;
  end if;
  select * into w from public.odyssey_withdrawals
   where transfer_id = v_res ->> 'id'
      or transfer_id = v_res #>> '{attributes,transfer_id}'
      or transfer_reference = v_res #>> '{attributes,reference_number}'
   limit 1;
  if w.id is null then
    return null;
  end if;

  insert into public.gateway_webhook_events (id, type, livemode) values (v_id, v_type, v_live) on conflict (id) do nothing;
  if not found then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  v_result := public.internal_withdrawal_finished(
    w.id, v_type = 'transfer.outward.successful',
    nullif(concat_ws(' ', v_res #>> '{attributes,provider_error}', '(' || nullif(v_res #>> '{attributes,provider_error_code}', '') || ')'), ''),
    nullif(v_res #>> '{attributes,provider_reference_number}', ''),
    (v_res #>> '{attributes,fee}')::numeric / 100);
  update public.gateway_webhook_events set result = v_result where id = v_id;
  return jsonb_build_object('ok', true, 'result', v_result);
end;
$$;

revoke all on function public.gateway_handle_withdrawal_event(jsonb) from public, anon, authenticated;
grant execute on function public.gateway_handle_withdrawal_event(jsonb) to service_role;

-- Worker cron: transfers PayMongo accepted whose result has not arrived (doctor payouts and ODYSSEY withdrawals).
create or replace function public.cron_transfers_to_check()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(t), '[]'::jsonb) from (
    (select 'payout' as kind, id, transfer_id from public.payouts
      where status = 'processing' and transfer_id is not null order by created_at limit 20)
    union all
    (select 'withdrawal', id, transfer_id from public.odyssey_withdrawals
      where status = 'processing' and transfer_id is not null order by created_at limit 20)
  ) t;
$$;

revoke all on function public.cron_transfers_to_check() from public, anon, authenticated;
grant execute on function public.cron_transfers_to_check() to service_role;

-- Worker cron: what PayMongo says about one of those transfers. Only a final answer changes anything.
create or replace function public.cron_transfer_result(
  p_kind text, p_id uuid, p_status text, p_detail text, p_provider_ref text, p_fee numeric
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('succeeded', 'failed') then
    return 'still_' || coalesce(p_status, 'unknown');
  end if;
  if p_kind = 'withdrawal' then
    return public.internal_withdrawal_finished(p_id, p_status = 'succeeded', p_detail, p_provider_ref, p_fee);
  elsif p_kind = 'payout' then
    if not exists (select 1 from public.payouts where id = p_id and status = 'processing') then
      return 'already';
    end if;
    return public.internal_payout_finished(p_id, p_status = 'succeeded', p_detail, p_provider_ref, p_fee);
  end if;
  return 'unknown_kind';
end;
$$;

revoke all on function public.cron_transfer_result(text, uuid, text, text, text, numeric) from public, anon, authenticated;
grant execute on function public.cron_transfer_result(text, uuid, text, text, text, numeric) to service_role;
