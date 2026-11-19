-- Migration: 0020_open_intents_for_confirm.sql   (needs 0010)
--
-- The Worker's 15-minute job asks PayMongo about embedded payments still open, in case PayMongo's webhook was
-- missed (worker/src/confirm.ts). This lists them: Payment Intent ids (pi_...) from the last 2 hours.
create or replace function public.cron_open_intents()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(checkout_session_id order by created_at desc), '[]'::jsonb)
    from (select checkout_session_id, created_at from public.gateway_payments
           where status = 'open' and checkout_session_id like 'pi\_%'
             and created_at > now() - interval '2 hours'
           order by created_at desc limit 50) g;
$$;

revoke all on function public.cron_open_intents() from public, anon, authenticated;
grant execute on function public.cron_open_intents() to service_role;
