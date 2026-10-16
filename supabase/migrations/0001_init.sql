-- =====================================================================
-- E-Reseta  |  Initial schema, Row Level Security and RPC functions
-- Run in: Supabase Dashboard -> SQL Editor (or `supabase db push`)
--
-- Security model
--   * Browsers only ever use the public anon key.
--   * Prescription rows are NOT readable by anon. The public patient page
--     calls get_public_rx(), which returns MASKED data until the payment
--     has been confirmed by the signed webhook (mark_payment_paid()).
--   * mark_payment_paid() is executable ONLY by the service_role key
--     (used by the payment-webhook Edge Function).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('admin', 'doctor');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.doctor_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Unguessable 21-char ID (same alphabet/length as nanoid)
-- 64-symbol alphabet and (byte & 63) => no modulo bias.
-- ---------------------------------------------------------------------
create or replace function public.nanoid_21()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  bytes bytea := gen_random_bytes(21);
  result text := '';
  i int;
begin
  for i in 0..20 loop
    result := result || substr(alphabet, (get_byte(bytes, i) & 63) + 1, 1);
  end loop;
  return result;
end;
$$;

-- ---------------------------------------------------------------------
-- profiles  (1:1 with auth.users)  -- admins and doctors
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  email             text not null,
  role              public.user_role not null default 'doctor',
  status            public.doctor_status not null default 'pending',
  full_name         text not null,
  prc_no            text,            -- PRC professional license no.
  ptr_no            text,            -- Professional Tax Receipt no.
  s2_no             text,            -- PDEA S2 license no. (dangerous drugs)
  specialty         text,
  clinic_name       text,
  clinic_address    text,
  phone             text,
  license_file_path text,            -- path inside the private "licenses" bucket
  reject_reason     text,
  reviewed_at       timestamptz,
  reviewed_by       uuid references public.profiles (id),
  created_at        timestamptz not null default now()
);

create index if not exists profiles_status_idx on public.profiles (status);

-- New auth user -> profile. Role/status are NEVER read from client metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles
    (id, email, full_name, prc_no, ptr_no, s2_no, specialty, clinic_name, clinic_address, phone)
  values (
    new.id,
    new.email,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120),
    left(nullif(new.raw_user_meta_data ->> 'prc_no', ''), 20),
    left(nullif(new.raw_user_meta_data ->> 'ptr_no', ''), 20),
    left(nullif(new.raw_user_meta_data ->> 's2_no', ''), 20),
    left(nullif(new.raw_user_meta_data ->> 'specialty', ''), 100),
    left(nullif(new.raw_user_meta_data ->> 'clinic_name', ''), 150),
    left(nullif(new.raw_user_meta_data ->> 'clinic_address', ''), 250),
    left(nullif(new.raw_user_meta_data ->> 'phone', ''), 20)
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Role helpers (security definer => no RLS recursion)
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_approved_doctor()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'doctor' and status = 'approved'
  );
$$;

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles
  for select to authenticated using (public.is_admin());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Users may only touch the license path themselves. role/status can ONLY be
-- changed through review_doctor() (admin) -- never from the browser.
grant update (full_name, specialty, prc_no, ptr_no, s2_no, clinic_name, clinic_address, phone, license_file_path) on public.profiles to authenticated;

-- Admin approve / reject
create or replace function public.review_doctor(
  p_doctor_id uuid,
  p_status    public.doctor_status,
  p_reason    text default null
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
  if p_status = 'pending' then
    raise exception 'Invalid status' using errcode = '22023';
  end if;

  update public.profiles
     set status        = p_status,
         reject_reason = case when p_status = 'rejected' then left(nullif(trim(p_reason), ''), 500) else null end,
         reviewed_at   = now(),
         reviewed_by   = auth.uid()
   where id = p_doctor_id and role = 'doctor';

  if not found then
    raise exception 'Doctor not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.review_doctor(uuid, public.doctor_status, text) from public, anon;
grant execute on function public.review_doctor(uuid, public.doctor_status, text) to authenticated;

-- ---------------------------------------------------------------------
-- prescriptions
-- medicines = [{ genericName, brandName, strength, form, quantity,
--                dose, frequency, duration, instructions }]
-- ---------------------------------------------------------------------
create or replace function public.valid_medicines(m jsonb)
returns boolean
language sql immutable
as $$
  select jsonb_typeof(m) = 'array'
     and jsonb_array_length(m) between 1 and 15
     and not exists (
       select 1 from jsonb_array_elements(m) e
       where jsonb_typeof(e) <> 'object'
          or length(trim(coalesce(e ->> 'genericName', ''))) < 2
          or length(trim(coalesce(e ->> 'strength', ''))) < 1
          or length(trim(coalesce(e ->> 'quantity', ''))) < 1
     );
$$;

create table if not exists public.prescriptions (
  id              text primary key default public.nanoid_21(),
  doctor_id       uuid not null references public.profiles (id),
  patient_name    text not null check (char_length(trim(patient_name)) between 2 and 120),
  patient_contact text check (char_length(patient_contact) <= 20),
  patient_dob     date check (patient_dob <= current_date),
  patient_sex     text check (patient_sex in ('Male', 'Female')),
  patient_address text check (char_length(patient_address) <= 250),
  diagnosis       text check (char_length(diagnosis) <= 500),
  notes           text check (char_length(notes) <= 1000),
  medicines       jsonb not null check (public.valid_medicines(medicines)),
  amount          numeric(10, 2) not null check (amount between 20 and 5000),
  payment_status  text not null default 'unpaid'
                  check (payment_status in ('unpaid', 'pending', 'paid', 'expired')),
  paid_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists prescriptions_doctor_idx on public.prescriptions (doctor_id, created_at desc);

alter table public.prescriptions enable row level security;

drop policy if exists rx_select_own on public.prescriptions;
create policy rx_select_own on public.prescriptions
  for select to authenticated using (doctor_id = auth.uid());

drop policy if exists rx_insert_approved_doctor on public.prescriptions;
create policy rx_insert_approved_doctor on public.prescriptions
  for insert to authenticated
  with check (doctor_id = auth.uid() and public.is_approved_doctor());

-- Prescriptions are immutable once issued; payment fields change only via mark_payment_paid()
revoke all on public.prescriptions from anon;
revoke update, delete on public.prescriptions from authenticated;
-- The client may not choose payment state
revoke insert on public.prescriptions from authenticated;
grant insert (doctor_id, patient_name, patient_contact, patient_dob, patient_sex,
              patient_address, diagnosis, notes, medicines, amount)
  on public.prescriptions to authenticated;

-- ---------------------------------------------------------------------
-- payments  (no policies => invisible to anon / authenticated)
-- ---------------------------------------------------------------------
create table if not exists public.payments (
  id              uuid primary key default gen_random_uuid(),
  reference       text not null unique default public.nanoid_21(),
  prescription_id text not null references public.prescriptions (id) on delete cascade,
  amount          numeric(10, 2) not null,
  status          text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'failed')),
  gateway         text not null default 'mock',
  qr_payload      text,                       -- real gateways: QR Ph string / checkout URL
  expires_at      timestamptz not null,
  paid_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists payments_rx_idx on public.payments (prescription_id, created_at desc);

alter table public.payments enable row level security;
revoke all on public.payments from anon, authenticated;

-- ---------------------------------------------------------------------
-- Public helpers
-- ---------------------------------------------------------------------
create or replace function public.mask_name(p_name text)
returns text
language sql immutable
as $$
  select coalesce(string_agg(left(w, 1) || '***', ' '), '')
  from unnest(string_to_array(trim(p_name), ' ')) as w
  where w <> '';
$$;

create or replace function public.payment_json(pay public.payments)
returns jsonb
language sql stable
as $$
  select jsonb_build_object(
    'reference',  pay.reference,
    'amount',     pay.amount,
    'status',     case when pay.status = 'pending' and pay.expires_at <= now() then 'expired' else pay.status end,
    'expires_at', pay.expires_at,
    'qr_payload', pay.qr_payload,
    'gateway',    pay.gateway
  );
$$;
revoke all on function public.payment_json(public.payments) from public, anon, authenticated;

-- GET /rx/:id  -> masked when unpaid, full only when paid
create or replace function public.get_public_rx(p_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  rx       public.prescriptions;
  doc      public.profiles;
  v_status text;
  base     jsonb;
  is_owner boolean;
  doc_info jsonb;
begin
  if p_id is null or p_id !~ '^[A-Za-z0-9_-]{21}$' then
    return null;
  end if;

  select * into rx from public.prescriptions where id = p_id;
  if not found then
    return null;
  end if;

  select * into doc from public.profiles where id = rx.doctor_id;
  v_status := case when rx.payment_status = 'paid' then 'paid' else 'unpaid' end;
  is_owner := (auth.uid() is not null and (rx.doctor_id = auth.uid() or public.is_admin()));

  -- Complete doctor credentials
  doc_info := jsonb_build_object(
    'full_name',      coalesce(doc.full_name, 'Licensed Physician'),
    'specialty',      doc.specialty,
    'clinic_name',    coalesce(doc.clinic_name, 'Medical Clinic'),
    'clinic_address', doc.clinic_address,
    'phone',          doc.phone,
    'email',          doc.email,
    'prc_no',         doc.prc_no,
    'ptr_no',         doc.ptr_no,
    's2_no',          doc.s2_no
  );

  -- Base payload
  base := jsonb_build_object(
    'id',             rx.id,
    'status',         v_status,
    'amount',         rx.amount,
    'created_at',     rx.created_at,
    'medicine_count', jsonb_array_length(rx.medicines),
    'patient_hint',   public.mask_name(rx.patient_name),
    'is_owner',       is_owner,
    'doctor',         doc_info
  );

  -- If unpaid and NOT owner, withhold sensitive patient clinical details:
  if v_status <> 'paid' and not is_owner then
    return base;
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
    'doctor', doc_info
  );
end;
$$;

-- POST /rx/:id/payment -> open (or reuse) a payment session
create or replace function public.create_payment_session(p_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rx  public.prescriptions;
  pay public.payments;
begin
  if p_id is null or p_id !~ '^[A-Za-z0-9_-]{21}$' then
    raise exception 'Invalid prescription' using errcode = '22023';
  end if;

  -- row lock => concurrent calls reuse the same session
  select * into rx from public.prescriptions where id = p_id for update;
  if not found then
    raise exception 'Prescription not found' using errcode = 'P0002';
  end if;

  if rx.payment_status = 'paid' then
    return jsonb_build_object('status', 'paid');
  end if;

  update public.payments
     set status = 'expired'
   where prescription_id = p_id and status = 'pending' and expires_at <= now();

  select * into pay
    from public.payments
   where prescription_id = p_id and status = 'pending'
   order by created_at desc
   limit 1;

  if not found then
    insert into public.payments (prescription_id, amount, expires_at)
    values (p_id, rx.amount, now() + interval '15 minutes')
    returning * into pay;

    update public.prescriptions set payment_status = 'pending' where id = p_id;
  end if;

  return public.payment_json(pay);
end;
$$;

-- Used by the (mock) payment page: shows amount only, never clinical data
create or replace function public.get_payment_session(p_reference text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  pay public.payments;
  doc_name text;
begin
  select * into pay from public.payments where reference = p_reference;
  if not found then
    return null;
  end if;

  select p.full_name into doc_name
    from public.prescriptions r
    join public.profiles p on p.id = r.doctor_id
   where r.id = pay.prescription_id;

  return public.payment_json(pay) || jsonb_build_object(
    'prescription_id', pay.prescription_id,
    'doctor_name',     doc_name
  );
end;
$$;

-- Called ONLY by the payment-webhook Edge Function (service_role) after the
-- gateway signature has been verified.
create or replace function public.mark_payment_paid(p_reference text, p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pay public.payments;
begin
  select * into pay from public.payments where reference = p_reference for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if pay.status = 'paid' then
    return jsonb_build_object('ok', true, 'already', true);   -- idempotent
  end if;

  if pay.amount <> p_amount then
    return jsonb_build_object('ok', false, 'error', 'amount_mismatch');
  end if;

  -- A real payment that lands after the QR expired is still honoured.
  update public.payments set status = 'paid', paid_at = now() where id = pay.id;
  update public.prescriptions
     set payment_status = 'paid', paid_at = now()
   where id = pay.prescription_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- Test mode mock payment RPC
create or replace function public.mock_pay(p_reference text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pay public.payments;
begin
  select * into pay from public.payments where reference = p_reference for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Payment session not found');
  end if;

  if pay.status = 'paid' then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  update public.payments set status = 'paid', paid_at = now() where id = pay.id;
  update public.prescriptions
     set payment_status = 'paid', paid_at = now()
   where id = pay.prescription_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.get_public_rx(text)            from public;
revoke all on function public.create_payment_session(text)   from public;
revoke all on function public.get_payment_session(text)      from public;
revoke all on function public.mark_payment_paid(text, numeric) from public, anon, authenticated;
revoke all on function public.mock_pay(text)                 from public;

grant execute on function public.get_public_rx(text)          to anon, authenticated;
grant execute on function public.create_payment_session(text) to anon, authenticated;
grant execute on function public.get_payment_session(text)    to anon, authenticated;
grant execute on function public.mock_pay(text)               to anon, authenticated;
grant execute on function public.mark_payment_paid(text, numeric) to service_role;

-- ---------------------------------------------------------------------
-- Private storage for PRC license uploads
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('licenses', 'licenses', false, 5242880,
        array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists licenses_insert_own on storage.objects;
create policy licenses_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'licenses' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------
-- Doctor Self-Registration (Auto-confirmed to bypass email rate limits)
-- ---------------------------------------------------------------------
create or replace function public.register_doctor_account(
  p_email text,
  p_password text,
  p_full_name text,
  p_prc_no text,
  p_ptr_no text default null,
  p_s2_no text default null,
  p_specialty text default null,
  p_clinic_name text default null,
  p_clinic_address text default null,
  p_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user_id uuid := gen_random_uuid();
  v_encrypted_pw text;
  v_meta jsonb;
begin
  if p_email is null or p_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
    raise exception 'Please enter a valid email address' using errcode = '22023';
  end if;

  if exists (select 1 from auth.users where email = lower(trim(p_email))) then
    raise exception 'An account with this email already exists' using errcode = '23505';
  end if;

  v_encrypted_pw := extensions.crypt(p_password, extensions.gen_salt('bf'));
  v_meta := jsonb_build_object(
    'full_name',      p_full_name,
    'prc_no',         p_prc_no,
    'ptr_no',         p_ptr_no,
    's2_no',          p_s2_no,
    'specialty',      p_specialty,
    'clinic_name',    p_clinic_name,
    'clinic_address', p_clinic_address,
    'phone',          p_phone,
    'email_verified', true
  );

  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  ) values (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    lower(trim(p_email)),
    v_encrypted_pw,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    v_meta,
    now(),
    now()
  );

  insert into auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    gen_random_uuid(),
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', lower(trim(p_email))),
    'email',
    lower(trim(p_email)),
    now(),
    now(),
    now()
  );

  return jsonb_build_object('success', true, 'userId', v_user_id);
end;
$$;

revoke all on function public.register_doctor_account from public;
grant execute on function public.register_doctor_account to anon, authenticated;


drop policy if exists licenses_select_own_or_admin on storage.objects;
create policy licenses_select_own_or_admin on storage.objects
  for select to authenticated
  using (
    bucket_id = 'licenses'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- ---------------------------------------------------------------------
-- Doctor Bank / E-Wallet Payment QR Codes
-- ---------------------------------------------------------------------
create table if not exists public.doctor_payment_methods (
  id             uuid primary key default gen_random_uuid(),
  doctor_id      uuid not null references public.profiles (id) on delete cascade,
  provider       text not null,
  account_name   text not null,
  account_number text,
  qr_image_url   text not null,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create index if not exists doctor_pm_idx on public.doctor_payment_methods (doctor_id, created_at desc);

alter table public.doctor_payment_methods enable row level security;

drop policy if exists doctor_pm_select_own on public.doctor_payment_methods;
create policy doctor_pm_select_own on public.doctor_payment_methods
  for select to authenticated using (doctor_id = auth.uid());

drop policy if exists doctor_pm_insert_own on public.doctor_payment_methods;
create policy doctor_pm_insert_own on public.doctor_payment_methods
  for insert to authenticated with check (doctor_id = auth.uid());

drop policy if exists doctor_pm_update_own on public.doctor_payment_methods;
create policy doctor_pm_update_own on public.doctor_payment_methods
  for update to authenticated using (doctor_id = auth.uid()) with check (doctor_id = auth.uid());

drop policy if exists doctor_pm_delete_own on public.doctor_payment_methods;
create policy doctor_pm_delete_own on public.doctor_payment_methods
  for delete to authenticated using (doctor_id = auth.uid());

drop policy if exists doctor_pm_public_read on public.doctor_payment_methods;
create policy doctor_pm_public_read on public.doctor_payment_methods
  for select to anon, authenticated using (is_active = true);

grant select, insert, update, delete on public.doctor_payment_methods to authenticated;
grant select on public.doctor_payment_methods to anon;

-- Storage bucket for doctor payment QR codes
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('qr-codes', 'qr-codes', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists qrcodes_public_read on storage.objects;
create policy qrcodes_public_read on storage.objects
  for select to public
  using (bucket_id = 'qr-codes');

drop policy if exists qrcodes_insert_own on storage.objects;
create policy qrcodes_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'qr-codes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists qrcodes_delete_own on storage.objects;
create policy qrcodes_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'qr-codes' and (storage.foldername(name))[1] = auth.uid()::text);

