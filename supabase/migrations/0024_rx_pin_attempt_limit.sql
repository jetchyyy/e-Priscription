-- Migration: 0024_rx_pin_attempt_limit.sql   (needs 0003, 0012)
--
-- The security PIN is 4 to 6 digits and both PIN checks (verify_rx_pin, get_public_rx) are open to the anon key,
-- so anyone with a prescription link could try every PIN in minutes. This limits it:
--
--   * 5 wrong PINs within 15 minutes lock that prescription's PIN for 15 minutes.
--   * While locked, every PIN is refused, the right one too. The right PIN clears the count.
--   * verify_rx_pin answers 'ok', 'wrong' or 'locked'; get_public_rx returns pin_locked_until.
--
-- The count is per prescription, not per visitor (the database does not see the visitor's IP), so someone with
-- the link could keep it locked. They would still need the link, which only the patient and the doctor have.
-- Both functions now write, so they are VOLATILE (PostgREST runs STABLE functions read-only).

create table if not exists public.rx_pin_attempts (
  prescription_id text primary key references public.prescriptions (id) on delete cascade,
  failures        int not null default 0,
  first_failed_at timestamptz,
  locked_until    timestamptz
);

alter table public.rx_pin_attempts enable row level security;
revoke all on public.rx_pin_attempts from anon, authenticated;

-- 'ok' (right PIN, count cleared), 'wrong', or 'locked'.
create or replace function public.rx_pin_try(p_id text, p_pin text, p_actual text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  a public.rx_pin_attempts;
begin
  select * into a from public.rx_pin_attempts where prescription_id = p_id for update;
  if found and a.locked_until > now() then
    return 'locked';
  end if;

  if p_actual is not null and trim(coalesce(p_pin, '')) = p_actual then
    if found then
      delete from public.rx_pin_attempts where prescription_id = p_id;
    end if;
    return 'ok';
  end if;

  insert into public.rx_pin_attempts as t (prescription_id, failures, first_failed_at)
  values (p_id, 1, now())
  on conflict (prescription_id) do update set
    failures        = case when t.first_failed_at < now() - interval '15 minutes' or t.locked_until is not null
                           then 1 else t.failures + 1 end,
    first_failed_at = case when t.first_failed_at < now() - interval '15 minutes' or t.locked_until is not null
                           then now() else t.first_failed_at end,
    locked_until    = null
  returning * into a;

  if a.failures >= 5 then
    update public.rx_pin_attempts
       set locked_until = now() + interval '15 minutes', failures = 0, first_failed_at = null
     where prescription_id = p_id;
    return 'locked';
  end if;
  return 'wrong';
end;
$$;

revoke all on function public.rx_pin_try(text, text, text) from public, anon, authenticated;

-- Now answers 'ok', 'wrong' or 'locked' instead of true/false. It cannot raise an error for 'locked': that would
-- roll back the lock it just wrote.
drop function if exists public.verify_rx_pin(text, text);
create function public.verify_rx_pin(p_id text, p_pin text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_pin text;
begin
  if p_id is null or p_pin is null then
    return 'wrong';
  end if;
  select pin into v_pin from public.prescriptions where id = p_id;
  if not found or v_pin is null or v_pin = '' then
    return 'wrong';
  end if;
  return public.rx_pin_try(p_id, p_pin, v_pin);
end;
$$;

revoke all on function public.verify_rx_pin(text, text) from public;
grant execute on function public.verify_rx_pin(text, text) to anon, authenticated;

-- Same as 0012, plus the PIN limit.
create or replace function public.get_public_rx(p_id text, p_pin text default null)
returns jsonb
language plpgsql
volatile
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
  v_try             text;
  v_locked_until    timestamptz;
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
  -- Only a paid prescription opened by someone other than its doctor checks the PIN, and every check counts
  -- toward the limit (public.rx_pin_try). While locked, even the right PIN does not open it.
  pin_matches := false;
  if v_status = 'paid' and has_pin and not is_owner and p_pin is not null and trim(p_pin) <> '' then
    v_try := public.rx_pin_try(rx.id, p_pin, rx.pin);
    pin_matches := (v_try = 'ok');
  end if;
  if v_status = 'paid' and has_pin and not is_owner then
    select locked_until into v_locked_until
      from public.rx_pin_attempts where prescription_id = rx.id and locked_until > now();
  end if;
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
    'is_locked_by_pin', is_locked_by_pin,
    'pin_locked_until', v_locked_until
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
