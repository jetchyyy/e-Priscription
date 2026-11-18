-- Migration: 0017_audit_log_without_actor.sql   (needs 0014)
--
-- Fix: write_audit_log() failed with 'record "v_prof" is not assigned yet' whenever no user was signed in
-- (auth.uid() is null and no actor is passed). That is the case for the PayMongo webhook (service role),
-- a patient starting an online checkout, and changes made in the SQL editor (seed_admin.sql). Because the audit
-- runs inside the same transaction, the original change failed with it: online payments could not be started
-- or marked paid. The profile is now read into plain variables, which start as null.
create or replace function public.write_audit_log(
  p_category    text,
  p_action      text,
  p_entity_type text,
  p_entity_id   text,
  p_summary     text,
  p_metadata    jsonb default '{}'::jsonb,
  p_actor_id    uuid default null,
  p_actor_role  text default null,
  p_actor_label text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := coalesce(p_actor_id, auth.uid());
  v_prof_role  text;
  v_prof_name  text;
  v_prof_email text;
  v_role       text;
  v_label      text;
begin
  if v_uid is not null then
    select role::text, full_name, email
      into v_prof_role, v_prof_name, v_prof_email
      from public.profiles
     where id = v_uid;
  end if;

  v_role := coalesce(
    p_actor_role,
    case when v_prof_role in ('admin', 'doctor') then v_prof_role else null end,
    'system'
  );
  v_label := left(coalesce(
    nullif(trim(p_actor_label), ''),
    nullif(trim(v_prof_name), ''),
    nullif(trim(v_prof_email), ''),
    case when v_role = 'patient' then 'Patient' else 'System' end
  ), 160);

  insert into public.audit_logs (
    actor_id, actor_role, actor_label, category, action, entity_type, entity_id, summary, metadata
  ) values (
    v_uid,
    v_role,
    v_label,
    p_category,
    left(p_action, 80),
    left(p_entity_type, 60),
    left(coalesce(nullif(p_entity_id, ''), 'unknown'), 120),
    left(p_summary, 400),
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.write_audit_log(text, text, text, text, text, jsonb, uuid, text, text) from public, anon, authenticated;
