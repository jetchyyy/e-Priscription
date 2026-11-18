-- Migration: 0015_doctor_rx_pagination.sql
--
-- Scalable server-side pagination + monthly summary for the doctor dashboard.
--   * Composite cursor indexes on prescriptions for O(1) next/prev traversal across thousands of rows.
--   * doctor_month_summary() computes current Manila-month waiting count & collected amount independently of page size.
--   * doctor_prescriptions_page() supports O(1) keyset navigation (next/prev) and arbitrary page jump ("Go to page").

-- ---------------------------------------------------------------------------------------------------------
-- 1. Composite indexes for keyset pagination
-- ---------------------------------------------------------------------------------------------------------
create index if not exists prescriptions_doctor_cursor_idx
  on public.prescriptions (doctor_id, created_at desc, id desc);

create index if not exists prescriptions_doctor_kind_cursor_idx
  on public.prescriptions (doctor_id, kind, created_at desc, id desc);

create index if not exists prescriptions_doctor_status_cursor_idx
  on public.prescriptions (doctor_id, payment_status, created_at desc, id desc);

-- ---------------------------------------------------------------------------------------------------------
-- 2. Doctor current Manila-month summary (Waiting for payment & Collected this month)
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.doctor_month_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  v_month_start timestamptz := public.manila_month_start(now());
  v_res         jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'waiting_count', (
      select count(*)
        from public.prescriptions p
       where p.doctor_id = v_uid
         and p.created_at >= v_month_start
         and p.payment_status <> 'paid'
    ),
    'collected_amount', (
      select coalesce(sum(p.amount), 0)
        from public.prescriptions p
       where p.doctor_id = v_uid
         and p.payment_status = 'paid'
         and coalesce(p.paid_at, p.created_at) >= v_month_start
    )
  )
  into v_res;

  return v_res;
end;
$$;

revoke all on function public.doctor_month_summary() from public, anon;
grant execute on function public.doctor_month_summary() to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 3. Scalable paginated prescriptions & lab requests RPC
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.doctor_prescriptions_page(
  p_limit     integer default 15,
  p_page      integer default 1,
  p_cursor_at timestamptz default null,
  p_cursor_id text default null,
  p_direction text default 'jump',
  p_search    text default null,
  p_kind      text default 'all',
  p_status    text default 'all'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid              uuid := auth.uid();
  v_limit            integer := least(greatest(coalesce(p_limit, 15), 5), 100);
  v_kind             text := case when p_kind in ('rx', 'lab') then p_kind else 'all' end;
  v_status           text := case when p_status in ('paid', 'waiting') then p_status else 'all' end;
  v_search           text := nullif(trim(p_search), '');
  v_dir              text := case when p_direction in ('next', 'prev', 'jump') then p_direction else 'jump' end;
  v_total_unfiltered bigint;
  v_total_count      bigint;
  v_total_pages      integer;
  v_page             integer;
  v_items            jsonb;
  v_first_at         timestamptz;
  v_first_id         text;
  v_last_at          timestamptz;
  v_last_id          text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select count(*)
    into v_total_unfiltered
    from public.prescriptions p
   where p.doctor_id = v_uid;

  select count(*)
    into v_total_count
    from public.prescriptions p
   where p.doctor_id = v_uid
     and (v_kind = 'all' or p.kind = v_kind)
     and (
       v_status = 'all'
       or (v_status = 'paid' and p.payment_status = 'paid')
       or (v_status = 'waiting' and p.payment_status <> 'paid')
     )
     and (
       v_search is null
       or p.patient_name ilike '%' || v_search || '%'
       or p.id ilike v_search || '%'
     );

  v_total_pages := greatest(ceil(v_total_count::numeric / v_limit)::integer, 1);
  v_page := least(greatest(coalesce(p_page, 1), 1), v_total_pages);

  if v_dir = 'next' and p_cursor_at is not null and p_cursor_id is not null then
    with page_rows as (
      select p.id, p.kind, p.patient_name, p.diagnosis, p.amount, p.pin, p.payment_status, p.created_at, p.paid_at
        from public.prescriptions p
       where p.doctor_id = v_uid
         and (v_kind = 'all' or p.kind = v_kind)
         and (
           v_status = 'all'
           or (v_status = 'paid' and p.payment_status = 'paid')
           or (v_status = 'waiting' and p.payment_status <> 'paid')
         )
         and (
           v_search is null
           or p.patient_name ilike '%' || v_search || '%'
           or p.id ilike v_search || '%'
         )
         and (p.created_at, p.id) < (p_cursor_at, p_cursor_id)
       order by p.created_at desc, p.id desc
       limit v_limit
    )
    select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc, r.id desc), '[]'::jsonb),
           (select r.created_at from page_rows r order by r.created_at desc, r.id desc limit 1),
           (select r.id from page_rows r order by r.created_at desc, r.id desc limit 1),
           (select r.created_at from page_rows r order by r.created_at asc, r.id asc limit 1),
           (select r.id from page_rows r order by r.created_at asc, r.id asc limit 1)
      into v_items, v_first_at, v_first_id, v_last_at, v_last_id
      from page_rows r;
  elsif v_dir = 'prev' and v_page > 1 and p_cursor_at is not null and p_cursor_id is not null then
    with backward as (
      select p.id, p.kind, p.patient_name, p.diagnosis, p.amount, p.pin, p.payment_status, p.created_at, p.paid_at
        from public.prescriptions p
       where p.doctor_id = v_uid
         and (v_kind = 'all' or p.kind = v_kind)
         and (
           v_status = 'all'
           or (v_status = 'paid' and p.payment_status = 'paid')
           or (v_status = 'waiting' and p.payment_status <> 'paid')
         )
         and (
           v_search is null
           or p.patient_name ilike '%' || v_search || '%'
           or p.id ilike v_search || '%'
         )
         and (p.created_at, p.id) > (p_cursor_at, p_cursor_id)
       order by p.created_at asc, p.id asc
       limit v_limit
    ),
    page_rows as (
      select * from backward order by created_at desc, id desc
    )
    select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc, r.id desc), '[]'::jsonb),
           (select r.created_at from page_rows r order by r.created_at desc, r.id desc limit 1),
           (select r.id from page_rows r order by r.created_at desc, r.id desc limit 1),
           (select r.created_at from page_rows r order by r.created_at asc, r.id asc limit 1),
           (select r.id from page_rows r order by r.created_at asc, r.id asc limit 1)
      into v_items, v_first_at, v_first_id, v_last_at, v_last_id
      from page_rows r;
  else
    with page_rows as (
      select p.id, p.kind, p.patient_name, p.diagnosis, p.amount, p.pin, p.payment_status, p.created_at, p.paid_at
        from public.prescriptions p
       where p.doctor_id = v_uid
         and (v_kind = 'all' or p.kind = v_kind)
         and (
           v_status = 'all'
           or (v_status = 'paid' and p.payment_status = 'paid')
           or (v_status = 'waiting' and p.payment_status <> 'paid')
         )
         and (
           v_search is null
           or p.patient_name ilike '%' || v_search || '%'
           or p.id ilike v_search || '%'
         )
       order by p.created_at desc, p.id desc
       limit v_limit
       offset (v_page - 1) * v_limit
    )
    select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc, r.id desc), '[]'::jsonb),
           (select r.created_at from page_rows r order by r.created_at desc, r.id desc limit 1),
           (select r.id from page_rows r order by r.created_at desc, r.id desc limit 1),
           (select r.created_at from page_rows r order by r.created_at asc, r.id asc limit 1),
           (select r.id from page_rows r order by r.created_at asc, r.id asc limit 1)
      into v_items, v_first_at, v_first_id, v_last_at, v_last_id
      from page_rows r;
  end if;

  return jsonb_build_object(
    'items',            v_items,
    'page',             v_page,
    'page_size',        v_limit,
    'total_count',      v_total_count,
    'total_pages',      v_total_pages,
    'total_unfiltered', v_total_unfiltered,
    'has_prev',         v_page > 1,
    'has_next',         v_page < v_total_pages,
    'first_cursor',     case when v_first_at is not null then jsonb_build_object('created_at', v_first_at, 'id', v_first_id) else null end,
    'last_cursor',      case when v_last_at is not null then jsonb_build_object('created_at', v_last_at, 'id', v_last_id) else null end
  );
end;
$$;

revoke all on function public.doctor_prescriptions_page(integer, integer, timestamptz, text, text, text, text, text) from public, anon;
grant execute on function public.doctor_prescriptions_page(integer, integer, timestamptz, text, text, text, text, text) to authenticated;
