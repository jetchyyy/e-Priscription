-- Migration: 0004_verified_profile_and_rx_snapshot.sql
--
-- 1. Verified credentials are locked once a doctor is approved. Name, PRC license no., specialty, PDEA S2 no.
--    and the license file can then change only through an administrator-reviewed change request.
--    PTR no. and clinic details stay directly editable (they change in the normal course of practice).
-- 2. Every prescription stores a snapshot of the doctor's letterhead at the moment it is issued, so later
--    profile edits never alter a prescription that was already sent (the "cannot be changed" promise in the FAQ
--    and the Terms and Conditions).

-- ---------------------------------------------------------------------------------------------------------
-- 1a. Guard: approved doctors cannot change verified fields directly
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.guard_verified_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Admin actions (review_doctor, review_profile_change), server-side jobs (service role) and direct database
  -- access with no user token (SQL editor, migrations, seed_admin.sql) may change anything. Requests from the
  -- app always carry a token with the role anon or authenticated, so they get the checks below.
  if coalesce(auth.role(), '') in ('', 'service_role') or public.is_admin() then
    return new;
  end if;

  -- Nobody but an admin may change who someone is or whether they are approved.
  if new.role is distinct from old.role
     or new.status is distinct from old.status
     or new.reject_reason is distinct from old.reject_reason
     or new.reviewed_at is distinct from old.reviewed_at
     or new.reviewed_by is distinct from old.reviewed_by
     or new.email is distinct from old.email then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  if old.role = 'doctor' and old.status = 'approved' and (
       new.full_name         is distinct from old.full_name
    or new.prc_no            is distinct from old.prc_no
    or new.specialty         is distinct from old.specialty
    or new.s2_no             is distinct from old.s2_no
    or new.license_file_path is distinct from old.license_file_path
  ) then
    raise exception 'Your name, PRC license no., specialty and S2 no. are verified. Submit a change request to update them.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Security fix: Supabase grants table-wide UPDATE to `authenticated` by default, so the column grant in 0001
-- did not stop a signed-in user from changing their own role or status. Remove the table-wide right and grant
-- back only the columns a user may edit (the trigger below adds the approval rules on top).
revoke update on public.profiles from anon, authenticated;
grant update (full_name, specialty, prc_no, ptr_no, s2_no, clinic_name, clinic_address, phone, license_file_path)
  on public.profiles to authenticated;

drop trigger if exists profiles_guard_verified on public.profiles;
create trigger profiles_guard_verified
  before update on public.profiles
  for each row execute function public.guard_verified_profile();

-- ---------------------------------------------------------------------------------------------------------
-- 1b. Change requests for verified fields
-- ---------------------------------------------------------------------------------------------------------
create table if not exists public.profile_change_requests (
  id                uuid primary key default gen_random_uuid(),
  doctor_id         uuid not null references public.profiles (id) on delete cascade,
  changes           jsonb not null,                -- only the requested fields, new values
  previous          jsonb not null,                -- the same fields as they were when requested
  reason            text check (char_length(reason) <= 500),
  license_file_path text,                          -- new supporting document in the private "licenses" bucket
  status            text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  review_note       text check (char_length(review_note) <= 500),
  created_at        timestamptz not null default now(),
  reviewed_at       timestamptz,
  reviewed_by       uuid references public.profiles (id)
);

create index if not exists pcr_doctor_idx on public.profile_change_requests (doctor_id, created_at desc);
create index if not exists pcr_status_idx on public.profile_change_requests (status);
-- One open request per doctor at a time
create unique index if not exists pcr_one_pending_per_doctor
  on public.profile_change_requests (doctor_id) where status = 'pending';

alter table public.profile_change_requests enable row level security;

drop policy if exists pcr_select_own on public.profile_change_requests;
create policy pcr_select_own on public.profile_change_requests
  for select to authenticated using (doctor_id = auth.uid());

drop policy if exists pcr_select_admin on public.profile_change_requests;
create policy pcr_select_admin on public.profile_change_requests
  for select to authenticated using (public.is_admin());

-- Writes only through the functions below
revoke all on public.profile_change_requests from anon, authenticated;
grant select on public.profile_change_requests to authenticated;

-- Doctor: submit a request
create or replace function public.request_profile_change(
  p_changes      jsonb,
  p_reason       text default null,
  p_license_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me        public.profiles;
  v_changes jsonb := '{}'::jsonb;
  v_prev    jsonb := '{}'::jsonb;
  v_val     text;
  k         text;
  v_id      uuid;
begin
  if not public.is_approved_doctor() then
    raise exception 'Only approved doctors can request changes. Before approval you can edit your details directly.'
      using errcode = '42501';
  end if;
  select * into me from public.profiles where id = auth.uid();

  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'Nothing to change' using errcode = '22023';
  end if;

  foreach k in array array['full_name', 'prc_no', 'specialty', 's2_no'] loop
    if p_changes ? k then
      v_val := nullif(trim(p_changes ->> k), '');
      if k = 'full_name' and (v_val is null or char_length(v_val) not between 3 and 120) then
        raise exception 'Full name must be 3 to 120 characters' using errcode = '22023';
      elsif k = 'prc_no' and (v_val is null or v_val !~ '^\d{5,10}$') then
        raise exception 'PRC license number should be 5 to 10 digits' using errcode = '22023';
      elsif k = 'specialty' and (v_val is null or char_length(v_val) not between 2 and 100) then
        raise exception 'Choose a specialty' using errcode = '22023';
      elsif k = 's2_no' and v_val is not null and char_length(v_val) > 20 then
        raise exception 'S2 license number is too long' using errcode = '22023';
      end if;

      if v_val is distinct from (to_jsonb(me) ->> k) then
        v_changes := v_changes || jsonb_build_object(k, v_val);
        v_prev    := v_prev    || jsonb_build_object(k, to_jsonb(me) ->> k);
      end if;
    end if;
  end loop;

  if v_changes = '{}'::jsonb then
    raise exception 'These are already your current details' using errcode = '22023';
  end if;

  -- A new name or PRC number needs a supporting document in the doctor's own folder
  if (v_changes ? 'full_name' or v_changes ? 'prc_no') then
    if p_license_path is null or split_part(p_license_path, '/', 1) <> auth.uid()::text then
      raise exception 'Upload your current PRC ID to support a name or PRC number change' using errcode = '22023';
    end if;
  end if;

  begin
    insert into public.profile_change_requests (doctor_id, changes, previous, reason, license_file_path)
    values (auth.uid(), v_changes, v_prev, left(nullif(trim(p_reason), ''), 500), p_license_path)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'You already have a change request waiting for review' using errcode = '23505';
  end;

  return v_id;
end;
$$;

revoke all on function public.request_profile_change(jsonb, text, text) from public, anon;
grant execute on function public.request_profile_change(jsonb, text, text) to authenticated;

-- Doctor: withdraw a pending request
create or replace function public.cancel_profile_change(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profile_change_requests
     set status = 'cancelled', reviewed_at = now()
   where id = p_id and doctor_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.cancel_profile_change(uuid) from public, anon;
grant execute on function public.cancel_profile_change(uuid) to authenticated;

-- Admin: approve or reject. Approval applies the new values to the profile.
create or replace function public.review_profile_change(p_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.profile_change_requests;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select * into req from public.profile_change_requests where id = p_id for update;
  if not found or req.status <> 'pending' then
    raise exception 'Request not found or already reviewed' using errcode = 'P0002';
  end if;

  if p_approve then
    update public.profiles
       set full_name         = case when req.changes ? 'full_name' then req.changes ->> 'full_name' else full_name end,
           prc_no            = case when req.changes ? 'prc_no'    then req.changes ->> 'prc_no'    else prc_no end,
           specialty         = case when req.changes ? 'specialty' then req.changes ->> 'specialty' else specialty end,
           s2_no             = case when req.changes ? 's2_no'     then req.changes ->> 's2_no'     else s2_no end,
           license_file_path = coalesce(req.license_file_path, license_file_path)
     where id = req.doctor_id;
  end if;

  update public.profile_change_requests
     set status      = case when p_approve then 'approved' else 'rejected' end,
         review_note = left(nullif(trim(p_note), ''), 500),
         reviewed_at = now(),
         reviewed_by = auth.uid()
   where id = p_id;
end;
$$;

revoke all on function public.review_profile_change(uuid, boolean, text) from public, anon;
grant execute on function public.review_profile_change(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 2. Prescriptions keep the letterhead they were issued with
-- ---------------------------------------------------------------------------------------------------------
alter table public.prescriptions add column if not exists doctor_snapshot jsonb;

create or replace function public.doctor_letterhead(p_doctor_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'full_name',      coalesce(d.full_name, 'Licensed Physician'),
    'specialty',      d.specialty,
    'clinic_name',    coalesce(d.clinic_name, 'Medical Clinic'),
    'clinic_address', d.clinic_address,
    'phone',          d.phone,
    'email',          d.email,
    'prc_no',         d.prc_no,
    'ptr_no',         d.ptr_no,
    's2_no',          d.s2_no
  )
  from public.profiles d where d.id = p_doctor_id;
$$;

revoke all on function public.doctor_letterhead(uuid) from public, anon, authenticated;

create or replace function public.snapshot_rx_doctor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.doctor_snapshot := public.doctor_letterhead(new.doctor_id);
  return new;
end;
$$;

drop trigger if exists rx_snapshot_doctor on public.prescriptions;
create trigger rx_snapshot_doctor
  before insert on public.prescriptions
  for each row execute function public.snapshot_rx_doctor();

-- Existing prescriptions: best available record is the doctor's details as they are today.
update public.prescriptions p
   set doctor_snapshot = public.doctor_letterhead(p.doctor_id)
 where p.doctor_snapshot is null;

-- get_public_rx: same as 0003, but the letterhead comes from the snapshot.
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

  -- Letterhead as it was when the prescription was issued
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
