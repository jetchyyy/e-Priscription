-- Migration: 0023_patient_terms_acceptance.sql   (needs 0005, 0010)
--
-- Before paying for a prescription, the patient ticks "I agree to the Terms and Conditions and have read the
-- Privacy Policy". This keeps a record of each tick: which prescription, which version of each document, when,
-- and which payment it went with.
--
--   * Online (PayMongo): the Worker (/api/paymongo-checkout) refuses to start a payment without the tick and
--     writes the row with the service key, linked to the gateway payment.
--   * Receipt (doctor's own QR): submit_payment_proof now takes the versions and refuses without them; the row
--     is linked to the payment proof.
--
-- Only administrators can read the rows. Nobody can change or delete them from the browser.

create table if not exists public.terms_acceptances (
  id                 uuid primary key default gen_random_uuid(),
  prescription_id    text not null references public.prescriptions (id) on delete cascade,
  channel            text not null check (channel in ('online', 'manual')),
  terms_version      text not null check (terms_version ~ '^\d{4}-\d{2}-\d{2}$'),
  privacy_version    text not null check (privacy_version ~ '^\d{4}-\d{2}-\d{2}$'),
  gateway_payment_id uuid references public.gateway_payments (id) on delete set null,
  payment_proof_id   uuid references public.payment_proofs (id) on delete set null,
  user_agent         text check (char_length(user_agent) <= 300),
  accepted_at        timestamptz not null default now()
);

create index if not exists terms_acceptances_rx_idx on public.terms_acceptances (prescription_id, accepted_at desc);

alter table public.terms_acceptances enable row level security;

drop policy if exists terms_acceptances_admin_read on public.terms_acceptances;
create policy terms_acceptances_admin_read on public.terms_acceptances
  for select to authenticated using (public.is_admin());

revoke all on public.terms_acceptances from anon, authenticated;
grant select on public.terms_acceptances to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Receipt payments: the same function as 0005, plus the two versions the patient agreed to.
-- ---------------------------------------------------------------------------------------------------------
drop function if exists public.submit_payment_proof(text, text, text, uuid, numeric);

create or replace function public.submit_payment_proof(
  p_rx_id           text,
  p_reference       text,
  p_screenshot_path text,
  p_method_id       uuid default null,
  p_amount_read     numeric default null,
  p_terms_version   text default null,
  p_privacy_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rx       public.prescriptions;
  v_ref    text := upper(trim(coalesce(p_reference, '')));
  v_method public.doctor_payment_methods;
  v_id     uuid;
begin
  if p_rx_id is null or p_rx_id !~ '^[A-Za-z0-9_-]{21}$' then
    raise exception 'Prescription not found' using errcode = 'P0002';
  end if;

  if coalesce(p_terms_version, '') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(p_privacy_version, '') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Agree to the Terms and Conditions and the Privacy Policy before paying. Reload the page if you do not see the checkbox.'
      using errcode = '22023';
  end if;

  select * into rx from public.prescriptions where id = p_rx_id for update;
  if not found then
    raise exception 'Prescription not found' using errcode = 'P0002';
  end if;
  if rx.payment_status = 'paid' then
    raise exception 'This prescription is already paid' using errcode = '22023';
  end if;

  if v_ref !~ '^[A-Z0-9 -]{6,40}$' then
    raise exception 'Enter the reference number exactly as it appears on your receipt (6 to 40 letters or numbers)' using errcode = '22023';
  end if;

  if p_screenshot_path is null or split_part(p_screenshot_path, '/', 1) <> p_rx_id
     or not exists (select 1 from storage.objects o where o.bucket_id = 'payment-proofs' and o.name = p_screenshot_path) then
    raise exception 'Upload a screenshot of your receipt' using errcode = '22023';
  end if;

  if (select count(*) from public.payment_proofs where prescription_id = p_rx_id) >= 5 then
    raise exception 'Too many attempts for this prescription. Please contact your doctor.' using errcode = '54000';
  end if;

  if p_method_id is not null then
    select * into v_method from public.doctor_payment_methods
     where id = p_method_id and doctor_id = rx.doctor_id;
  end if;

  begin
    insert into public.payment_proofs
      (prescription_id, doctor_id, payment_method_id, provider, reference_no, amount_read, screenshot_path)
    values
      (rx.id, rx.doctor_id, v_method.id, v_method.provider, v_ref,
       case when p_amount_read between 0 and 100000 then round(p_amount_read, 2) end,
       p_screenshot_path)
    returning id into v_id;
  exception when unique_violation then
    if exists (select 1 from public.payment_proofs where prescription_id = p_rx_id and status = 'pending') then
      raise exception 'Your proof of payment is already waiting for your doctor to confirm' using errcode = '23505';
    end if;
    raise exception 'This reference number has already been used. Check the number on your receipt.' using errcode = '23505';
  end;

  insert into public.terms_acceptances (prescription_id, channel, terms_version, privacy_version, payment_proof_id, user_agent)
  values (rx.id, 'manual', p_terms_version, p_privacy_version, v_id,
          left(nullif(current_setting('request.headers', true), '')::jsonb ->> 'user-agent', 300));

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.submit_payment_proof(text, text, text, uuid, numeric, text, text) from public;
grant execute on function public.submit_payment_proof(text, text, text, uuid, numeric, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Online payments: the Worker records the tick with the service key, right after preparing the payment.
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.record_rx_terms_acceptance(
  p_rx_id              text,
  p_terms_version      text,
  p_privacy_version    text,
  p_gateway_payment_id uuid default null,
  p_user_agent         text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(p_terms_version, '') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(p_privacy_version, '') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Agree to the Terms and Conditions and the Privacy Policy before paying' using errcode = '22023';
  end if;
  insert into public.terms_acceptances (prescription_id, channel, terms_version, privacy_version, gateway_payment_id, user_agent)
  values (p_rx_id, 'online', p_terms_version, p_privacy_version, p_gateway_payment_id, nullif(left(p_user_agent, 300), ''))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.record_rx_terms_acceptance(text, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.record_rx_terms_acceptance(text, text, text, uuid, text) to service_role;
