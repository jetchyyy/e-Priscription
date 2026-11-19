# Payment flow (PayMongo)

ODYSSEY collects online payments through its own PayMongo account, as the doctors' collecting agent.
Migration `0010_paymongo_gateway.sql` holds all the rules; the Cloudflare Worker (`worker/src`, `/api/*`) only talks to PayMongo.

Payments happen on our own pages (PayMongo Payment Intents), not on PayMongo's hosted checkout page:
QR Ph shows the QR in the page, cards use a card form in the page (card details go from the browser straight to
PayMongo with the public key; the bank's 3-D Secure check opens in a frame), and GCash / Maya open their approval
page in a small window over ours (a full-page redirect if the browser blocks it). `public/pay-done.html` is the
return page for the frame and the window.

```mermaid
sequenceDiagram
  participant P as Patient browser
  participant DB as Supabase (RPC)
  participant C as /api/paymongo-checkout (Worker)
  participant PM as PayMongo
  participant W as /api/payment-webhook (Worker)

  P->>DB: rx_online_options(id) → methods with exact amounts
  P->>C: {type:'rx', rx_id, method}
  C->>DB: gateway_prepare_rx(id, method) [service_role] → amounts, reference
  C->>PM: POST /v1/payment_intents (amount, metadata.reference)
  C->>DB: gateway_attach_session(id, intent_id)
  C->>PM: qrph/gcash/paymaya: POST /v1/payment_methods + /attach
  C-->>P: intent_id, client_key, public_key, next_action (QR image or wallet URL)
  P->>PM: card only: POST /v1/payment_methods + /attach with the public key
  loop every 3 s
    P->>PM: GET /v1/payment_intents/:id?client_key (public key)
  end
  PM->>W: payment.paid + Paymongo-Signature
  W->>DB: gateway_handle_event(event) [service_role]: rx paid + ledger lines
```

## Money rules
- **Fees** (`gateway_fee_rates`, editable in Admin → Money and payouts → Fees and rules): ODYSSEY's all-in fee per method,
  and PayMongo's charge with VAT as an estimate. The real PayMongo charge (amount − net amount) is stored with each payment.
- **Who pays the fee** is each doctor's choice: `pass` adds it on top (doctor gets the full fee), `absorb` takes it from the share.
- **Plans, seats and packs** are paid online too; ODYSSEY absorbs PayMongo's charge.
- **Ledger** (`ledger_entries`) is append-only. Accounts: `doctor`, `odyssey_fee`, `odyssey_sales`, `paymongo_cost`,
  `payout_fee`, `suspense`. Every balance on every screen is a sum of lines. The sum of all lines is the money that
  should be with PayMongo before ODYSSEY's own withdrawals.
- **Weekly cycle** (migration 0018): PayMongo settles to ODYSSEY's wallet every Thursday. A doctor's share of a payment
  made Monday to Sunday (Manila) becomes available on the Saturday after (`payout_saturday()`; `hold_days` adds extra
  days, 0 by default). Every Saturday 08:00 Manila the Worker cron (`0 0 * * SAT` UTC) runs
  `cron_prepare_weekly_payouts()`: one payout per doctor for everything available, at least `min_payout`. An admin checks the
  account names and sends them (Admin → Money → Payouts → Send all ready). PayMongo does not check payout bank accounts.
- **Withholding tax**: PayMongo withholds 0.5% of gross remittances for the BIR (RR 5-2025). When a payment is marked paid,
  a trigger books it: the doctor bears it on their share (`withholding_tax` line on their balance), ODYSSEY on its fee and
  on sales (`withholding_tax` account, a credit on ODYSSEY's BIR 2307). `gateway_settings.withholding_pct` is
  admin-editable; set 0 while PayMongo has ODYSSEY as exempt (under ₱500,000 gross for the year).
- **Payouts**: prepared on Saturday (money leaves the balance at once) → admin sends from the admin page
  (`paymongo-ops` → `POST /v2/batch_transfers` with an Idempotency-Key) → `transfer.outward.successful|failed` webhook.
  A failure, rejection or cancellation puts the money back with a new ledger line.
- **Refunds** (admin): fees are not refunded. A prescription refunds its price from the doctor's balance; a purchase
  refunds what was paid; money held aside refunds in full. QR Ph refunds use `refunds-api.paymongo.com` and return a claim link.
- **Held aside** (`needs_review` + `suspense`): a wrong amount, a second payment for a paid prescription, or a purchase
  that cannot be applied. Nothing is lost; the admin refunds it, or approves the purchase in Payments to verify.

## PayMongo webhook
URL: `https://<your-site>/api/payment-webhook` (one per mode: test and live).
The Worker passes `payment.paid` on as `checkout_session.payment.paid`, matched by the intent id that
`gateway_attach_session` stored, so the database rules did not change. `checkout_session.payment.paid` is still
understood for hosted checkouts opened before the switch.
Events: `payment.paid`, `payment.failed`, `payment.refunded`, `payment.refund.updated`,
`transfer.outward.successful`, `transfer.outward.failed`, `payout.deposited`, `payout.returned`.

## Secrets (Worker secrets via `wrangler secret put`, `.dev.vars` locally; never in `client/.env`)
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYMONGO_SECRET_KEY`, `PAYMONGO_PUBLIC_KEY`, `PAYMONGO_WEBHOOK_SECRET`, `APP_URL`, and optionally
`PAYMONGO_SOURCE_ACCOUNT_NUMBER|NAME|BIC` (the wallet payouts are sent from; otherwise read from `GET /v2/wallets`).

## Manual fallback
Admin → Fees and rules → "Also allow QR and receipt" brings back the old receipt flows (for PayMongo outages).
