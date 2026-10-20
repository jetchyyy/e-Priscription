-- Migration: 0005_manual_payment_proofs.sql
--
-- Manual payment verification (until a payment gateway is integrated):
--   1. The patient pays the doctor's own QR, then submits the reference number and a screenshot of the receipt.
--   2. The doctor checks their e-wallet or bank app and confirms ("Payment received") or rejects with a reason.
--   3. Only a confirmation by the prescription's own doctor (or an admin) marks the prescription paid.
-- OCR in the browser only pre-fills the form; it never unlocks anything.

-- ---------------------------------------------------------------------------------------------------------
-- 1. Proofs
-- ---------------------------------------------------------------------------------------------------------
create table if not exists public.payment_proofs (
  id                uuid primary key default gen_random_uuid(),
  prescription_id   text not null references public.prescriptions (id) on delete cascade,
  doctor_id         uuid not null references public.profiles (id) on delete cascade,
  payment_method_id uuid references public.doctor_payment_methods (id) on delete set null,
  provider          text check (char_length(provider) <= 60),
  reference_no      text not null check (reference_no ~ '^[A-Za-z0-9 -]{6,40}$'),
  reference_norm    text generated always as (upper(regexp_replace(reference_no, '[^A-Za-z0-9]', '', 'g'))) stored,
  amount_read       numeric(10, 2),            -- what OCR read from the receipt, if anything (a hint for the doctor)
  screenshot_path   text not null,             -- inside the private "payment-proofs" bucket: <prescription id>/<file>
  status            text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  reject_reason     text check (char_length(reject_reason) <= 300),
  created_at        timestamptz not null default now(),
  reviewed_at       timestamptz
);

create index if not exists payment_proofs_doctor_idx on public.payment_proofs (doctor_id, status, created_at desc);
create index if not exists payment_proofs_rx_idx on public.payment_proofs (prescription_id, created_at desc);
-- One proof under review per prescription
create unique index if not exists payment_proofs_one_pending
  on public.payment_proofs (prescription_id) where status = 'pending';
-- A reference number cannot be used twice with the same doctor (unless the earlier proof was rejected)
create unique index if not exists payment_proofs_unique_reference
  on public.payment_proofs (doctor_id, reference_norm) where status in ('pending', 'confirmed');

alter table public.payment_proofs enable row level security;

drop policy if exists payment_proofs_select_doctor on public.payment_proofs;
create policy payment_proofs_select_doctor on public.payment_proofs
  for select to authenticated using (doctor_id = auth.uid() or public.is_admin());

-- Writes only through the functions below; patients see their status through get_public_rx.
revoke all on public.payment_proofs from anon, authenticated;
grant select on public.payment_proofs to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 2. Private storage for receipt screenshots
-- ---------------------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Anyone holding the prescription link may upload into that prescription's folder while it is unpaid,
-- with a cap so a link cannot be used to fill the bucket.
create or replace function public.can_upload_payment_proof(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.prescriptions rx
    where rx.id = split_part(p_name, '/', 1)
      and rx.payment_status <> 'paid'
  )
  and (
    select count(*) from storage.objects o
    where o.bucket_id = 'payment-proofs' and split_part(o.name, '/', 1) = split_part(p_name, '/', 1)
  ) < 6;
$$;

revoke all on function public.can_upload_payment_proof(text) from public;
grant execute on function public.can_upload_payment_proof(text) to anon, authenticated;

drop policy if exists payment_proofs_upload on storage.objects;
create policy payment_proofs_upload on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'payment-proofs' and public.can_upload_payment_proof(name));

-- Only the prescription's doctor and admins can see receipts.
drop policy if exists payment_proofs_read on storage.objects;
create policy payment_proofs_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (
      public.is_admin()
      or exists (
        select 1 from public.prescriptions rx
        where rx.id = split_part(name, '/', 1) and rx.doctor_id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------------------------------------
-- 3. Patient: submit a proof (no account needed; the prescription link is the key)
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.submit_payment_proof(
  p_rx_id           text,
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
  rx       public.prescriptions;
  v_ref    text := upper(trim(coalesce(p_reference, '')));
  v_method public.doctor_payment_methods;
  v_id     uuid;
begin
  if p_rx_id is null or p_rx_id !~ '^[A-Za-z0-9_-]{21}$' then
    raise exception 'Prescription not found' using errcode = 'P0002';
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

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.submit_payment_proof(text, text, text, uuid, numeric) from public;
grant execute on function public.submit_payment_proof(text, text, text, uuid, numeric) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 4. Doctor: confirm or reject
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.confirm_payment_proof(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pr public.payment_proofs;
begin
  select * into pr from public.payment_proofs where id = p_id for update;
  if not found or not (pr.doctor_id = auth.uid() or public.is_admin()) then
    raise exception 'Payment proof not found' using errcode = 'P0002';
  end if;
  if pr.status <> 'pending' then
    raise exception 'This payment was already reviewed' using errcode = '22023';
  end if;

  update public.payment_proofs set status = 'confirmed', reviewed_at = now() where id = p_id;
  update public.prescriptions
     set payment_status = 'paid', paid_at = coalesce(paid_at, now())
   where id = pr.prescription_id and payment_status <> 'paid';
end;
$$;

revoke all on function public.confirm_payment_proof(uuid) from public, anon;
grant execute on function public.confirm_payment_proof(uuid) to authenticated;

create or replace function public.reject_payment_proof(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pr public.payment_proofs;
begin
  select * into pr from public.payment_proofs where id = p_id for update;
  if not found or not (pr.doctor_id = auth.uid() or public.is_admin()) then
    raise exception 'Payment proof not found' using errcode = 'P0002';
  end if;
  if pr.status <> 'pending' then
    raise exception 'This payment was already reviewed' using errcode = '22023';
  end if;

  update public.payment_proofs
     set status = 'rejected',
         reject_reason = coalesce(left(nullif(trim(p_reason), ''), 300), 'Your doctor could not find this payment.'),
         reviewed_at = now()
   where id = p_id;
end;
$$;

revoke all on function public.reject_payment_proof(uuid, text) from public, anon;
grant execute on function public.reject_payment_proof(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 5. get_public_rx: same as 0004, plus the latest proof's status for the patient
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.get_public_rx(p_id text, p_pin text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  rx                public.prescriptions;
  v_status          text;
  base              jsonb;
  is_owner          boolean;
  doc_info          jsonb;
  v_payment_methods jsonb;
  v_proof           jsonb;
  has_pin           boolean;
  pin_matches       boolean;
  is_locked_by_pin  boolean;
begin
  if p_id is null or p_id !~ '^[A-Za-z0-9_-]{21}$' then
    return null;
  end if;

  select * into rx from public.prescriptions where id = p_id;
  if not found then
    return null;
  end if;

  v_status := case when rx.payment_status = 'paid' then 'paid' else 'unpaid' end;
  is_owner := (auth.uid() is not null and (rx.doctor_id = auth.uid() or public.is_admin()));

  has_pin := (rx.pin is not null and rx.pin <> '');
  pin_matches := (has_pin and p_pin is not null and trim(p_pin) = rx.pin);
  is_locked_by_pin := (v_status = 'paid' and has_pin and not is_owner and not pin_matches);

  doc_info := coalesce(rx.doctor_snapshot, public.doctor_letterhead(rx.doctor_id));

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',             pm.id,
        'provider',       pm.provider,
        'account_name',   pm.account_name,
        'account_number', pm.account_number,
        'qr_image_url',   pm.qr_image_url
      ) order by pm.created_at asc
    ),
    '[]'::jsonb
  ) into v_payment_methods
  from public.doctor_payment_methods pm
  where pm.doctor_id = rx.doctor_id and pm.is_active = true;

  -- Latest proof of payment (status only; the receipt itself stays private)
  select jsonb_build_object(
           'status',        pp.status,
           'reject_reason', pp.reject_reason,
           'submitted_at',  pp.created_at,
           'reference_end', right(pp.reference_norm, 4)
         )
    into v_proof
    from public.payment_proofs pp
   where pp.prescription_id = rx.id
   order by pp.created_at desc
   limit 1;

  base := jsonb_build_object(
    'id',               rx.id,
    'status',           v_status,
    'amount',           rx.amount,
    'created_at',       rx.created_at,
    'medicine_count',   jsonb_array_length(rx.medicines),
    'patient_hint',     public.mask_name(rx.patient_name),
    'is_owner',         is_owner,
    'doctor',           doc_info,
    'payment_methods',  v_payment_methods,
    'payment_proof',    v_proof,
    'requires_pin',     has_pin,
    'is_locked_by_pin', is_locked_by_pin
  );

  if is_owner then
    base := base || jsonb_build_object('pin', rx.pin);
  end if;

  if v_status <> 'paid' and not is_owner then
    return base;
  end if;

  if is_locked_by_pin then
    return base || jsonb_build_object('paid_at', rx.paid_at);
  end if;

  return base || jsonb_build_object(
    'paid_at',            rx.paid_at,
    'is_doctor_preview',  (v_status <> 'paid' and is_owner),
    'diagnosis',          rx.diagnosis,
    'notes',              rx.notes,
    'medicines',          rx.medicines,
    'patient', jsonb_build_object(
      'name',    rx.patient_name,
      'dob',     rx.patient_dob,
      'sex',     rx.patient_sex,
      'address', rx.patient_address,
      'contact', rx.patient_contact
    ),
    'doctor',          doc_info,
    'payment_methods', v_payment_methods
  );
end;
$$;

revoke all on function public.get_public_rx(text, text) from public;
grant execute on function public.get_public_rx(text, text) to anon, authenticated;
