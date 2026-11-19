-- Migration: 0021_online_payments_stay_on_and_rx_confirm.sql   (needs 0010, 0020)
--
-- 1. Online payments are part of how ODYSSEY earns, so once a doctor turns them on they stay on: a doctor can change
--    who pays the fee, but not switch online payments off. (ODYSSEY can still pause them for everyone in
--    Admin -> Money -> Fees and rules.)
-- 2. The prescription page can ask the Worker to check its open payments with PayMongo when it opens, so a patient
--    who paid and closed the tab does not wait for the 15-minute job (worker/src/confirm.ts).

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
  if not coalesce(p_enabled, false) then
    raise exception 'Online payments stay on once they are turned on. You can still choose who pays the fee.' using errcode = '42501';
  end if;
  if ds.agent_terms_accepted_at is null and not coalesce(p_accept_terms, false) then
    raise exception 'Accept the collection terms to take online payments' using errcode = '22023';
  end if;

  insert into public.doctor_payment_settings (doctor_id, online_enabled, fee_mode, agent_terms_accepted_at, updated_at)
  values (auth.uid(), true, p_fee_mode, case when p_accept_terms then now() end, now())
  on conflict (doctor_id) do update
    set online_enabled = true,
        fee_mode = excluded.fee_mode,
        agent_terms_accepted_at = coalesce(doctor_payment_settings.agent_terms_accepted_at, excluded.agent_terms_accepted_at),
        updated_at = now();
end;
$$;

revoke all on function public.set_online_payments(boolean, text, boolean) from public, anon;
grant execute on function public.set_online_payments(boolean, text, boolean) to authenticated;

-- Worker only: the newest open embedded payments for one prescription, from the last 2 hours.
create or replace function public.cron_open_intents_for_rx(p_rx text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(checkout_session_id), '[]'::jsonb)
    from (select checkout_session_id from public.gateway_payments
           where prescription_id = p_rx and status = 'open' and checkout_session_id like 'pi\_%'
             and created_at > now() - interval '2 hours'
           order by created_at desc limit 3) g;
$$;

revoke all on function public.cron_open_intents_for_rx(text) from public, anon, authenticated;
grant execute on function public.cron_open_intents_for_rx(text) to service_role;
