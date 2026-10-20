-- Migration: 0003_prescription_pin.sql
-- Adds PIN protection to prescriptions so that after a patient pays,
-- they must enter the Doctor's PIN to open/view the prescription.

-- 1. Add pin column to public.prescriptions (4 to 6 numeric digits)
alter table public.prescriptions
  add column if not exists pin text check (pin is null or pin ~ '^\d{4,6}$');

-- 2. Grant insert on column pin to authenticated doctors
grant insert (pin) on public.prescriptions to authenticated;

-- 3. Drop previous get_public_rx function signatures to avoid parameter mismatch
drop function if exists public.get_public_rx(text);
drop function if exists public.get_public_rx(text, text);

-- 4. Recreate get_public_rx with optional p_pin parameter
create or replace function public.get_public_rx(p_id text, p_pin text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  rx                public.prescriptions;
  doc               public.profiles;
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

  select * into doc from public.profiles where id = rx.doctor_id;
  v_status := case when rx.payment_status = 'paid' then 'paid' else 'unpaid' end;
  is_owner := (auth.uid() is not null and (rx.doctor_id = auth.uid() or public.is_admin()));

  has_pin := (rx.pin is not null and rx.pin <> '');
  pin_matches := (has_pin and p_pin is not null and trim(p_pin) = rx.pin);
  -- A paid prescription is locked by PIN if a PIN is set and caller is not owner and provided PIN does not match
  is_locked_by_pin := (v_status = 'paid' and has_pin and not is_owner and not pin_matches);

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

  -- Fetch active payment QR codes configured by this doctor
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

  -- Base payload
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

  -- If doctor/owner, include the PIN in the payload
  if is_owner then
    base := base || jsonb_build_object('pin', rx.pin);
  end if;

  -- If unpaid and NOT owner, withhold sensitive patient clinical details:
  if v_status <> 'paid' and not is_owner then
    return base;
  end if;

  -- If paid but locked by PIN, withhold sensitive details
  if is_locked_by_pin then
    return base || jsonb_build_object(
      'paid_at', rx.paid_at
    );
  end if;

  -- Unlocked! Return full clinical details
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

-- 5. Helper function to verify PIN
create or replace function public.verify_rx_pin(p_id text, p_pin text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pin text;
begin
  if p_id is null or p_pin is null then
    return false;
  end if;
  select pin into v_pin from public.prescriptions where id = p_id;
  if not found or v_pin is null then
    return false;
  end if;
  return trim(p_pin) = v_pin;
end;
$$;

revoke all on function public.verify_rx_pin(text, text) from public;
grant execute on function public.verify_rx_pin(text, text) to anon, authenticated;
