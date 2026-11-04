-- Saving the online payment rules failed with "UPDATE requires a WHERE clause": Supabase's safeupdate guard
-- refuses a bare UPDATE from API calls, even on this one-row table. Target the single row explicitly.
create or replace function public.admin_set_gateway_settings(
  p_enabled boolean, p_manual_fallback boolean, p_hold_days integer, p_min_payout numeric, p_payout_fee numeric
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
  update public.gateway_settings
     set enabled = p_enabled, manual_fallback = p_manual_fallback, hold_days = p_hold_days,
         min_payout = p_min_payout, payout_fee = p_payout_fee, updated_at = now(), updated_by = auth.uid()
   where id;
end;
$$;

revoke all on function public.admin_set_gateway_settings(boolean, boolean, integer, numeric, numeric) from public, anon;
grant execute on function public.admin_set_gateway_settings(boolean, boolean, integer, numeric, numeric) to authenticated;
