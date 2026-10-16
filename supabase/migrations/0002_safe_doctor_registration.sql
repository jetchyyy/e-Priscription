-- =====================================================================
-- E-Reseta  |  Deprecate direct SQL auth.users insertion
-- Doctor registration is now handled via the Edge Function:
--   supabase/functions/register-doctor
-- using Supabase GoTrue Admin API (auth.admin.createUser).
-- =====================================================================

-- Drop the old insecure/direct-SQL-insert RPC function
drop function if exists public.register_doctor_account(
  text, text, text, text, text, text, text, text, text, text
);
