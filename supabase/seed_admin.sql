-- =====================================================================
-- Create the Super Admin (there is NO public admin signup)
--
-- 1. Supabase Dashboard -> Authentication -> Users -> "Add user"
--      email: your admin email, password: a strong one, tick "Auto Confirm User"
-- 2. Replace the email below and run this in the SQL Editor.
-- =====================================================================
update public.profiles
   set role = 'admin',
       status = 'approved',
       full_name = coalesce(nullif(full_name, ''), 'Super Admin')
 where email = 'admin@example.com';   -- <-- change me
