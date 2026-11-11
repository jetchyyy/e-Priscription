-- Migration: 0012_lab_requests.sql
--
-- Lab requests on the prescription pad.
--   * A lab request is a row in public.prescriptions with kind = 'lab'. It lists laboratory tests instead of
--     medicines, and otherwise works like a prescription: letterhead snapshot, PIN, fee, payment, patient link.
--   * Because it is a row in the same table, the existing quota trigger (enforce_rx_quota) and the counting
--     functions apply unchanged: one lab request uses one prescription from the monthly limit, the clinic pool,
--     the doctor's clinic share, or a bought credit, exactly like one prescription.

-- ---------------------------------------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------------------------------------
alter table public.prescriptions
  add column if not exists kind text not null default 'rx' check (kind in ('rx', 'lab'));

alter table public.prescriptions
  add column if not exists lab_tests jsonb;

-- Tests: [{ "name": "Complete Blood Count", "notes": "fasting" }], 1 to 30 of them.
create or replace function public.valid_lab_tests(t jsonb)
returns boolean
language sql immutable
as $$
  select t is not null
     and jsonb_typeof(t) = 'array'
     and jsonb_array_length(t) between 1 and 30
     and not exists (
       select 1 from jsonb_array_elements(t) e
       where jsonb_typeof(e) <> 'object'
          or length(trim(coalesce(e ->> 'name', ''))) not between 2 and 120
          or length(coalesce(e ->> 'notes', '')) > 200
     );
$$;

-- ---------------------------------------------------------------------------------------------------------
-- 2. Content rule depends on the kind
-- ---------------------------------------------------------------------------------------------------------
-- The column check from 0001 required medicines on every row. Replace it with one that depends on the kind.
do $$
declare
  c record;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'public.prescriptions'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%valid_medicines%'
  loop
    execute format('alter table public.prescriptions drop constraint %I', c.conname);
  end loop;
end;
$$;

alter table public.prescriptions drop constraint if exists prescriptions_content_by_kind;
alter table public.prescriptions add constraint prescriptions_content_by_kind check (
  (kind = 'rx'  and public.valid_medicines(medicines) and lab_tests is null)
  or
  (kind = 'lab' and medicines = '[]'::jsonb and public.valid_lab_tests(lab_tests))
);

-- The doctor's browser may set the new columns on insert (payment fields stay server-only).
grant insert (kind, lab_tests) on public.prescriptions to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 3. Patient link: same as 0005, plus the kind and the tests
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
    'kind',             rx.kind,
    'status',           v_status,
    'amount',           rx.amount,
    'created_at',       rx.created_at,
    'medicine_count',   jsonb_array_length(rx.medicines),
    'lab_test_count',   coalesce(jsonb_array_length(rx.lab_tests), 0),
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
    'lab_tests',          coalesce(rx.lab_tests, '[]'::jsonb),
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
