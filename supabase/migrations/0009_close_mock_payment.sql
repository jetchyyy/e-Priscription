-- Migration: 0009_close_mock_payment.sql   (independent of 0006-0008; apply before going live)
--
-- 0001 let anyone call mock_pay(), the test-mode "pay" button. With a payment session from create_payment_session(),
-- anyone holding a prescription link could mark it paid without paying, skipping the doctor's confirmation (0005).
-- Payments are now confirmed only by the prescription's doctor (confirm_payment_proof) or, later, by a signed
-- gateway webhook, so the browser must not reach these functions at all. They stay for the service role, which a
-- future gateway integration may use.

revoke all on function public.mock_pay(text)               from public, anon, authenticated;
revoke all on function public.create_payment_session(text) from public, anon, authenticated;
revoke all on function public.get_payment_session(text)    from public, anon, authenticated;

grant execute on function public.mock_pay(text)               to service_role;
grant execute on function public.create_payment_session(text) to service_role;
grant execute on function public.get_payment_session(text)    to service_role;
