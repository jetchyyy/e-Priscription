# API map

With Supabase there is no hand-written Express layer. The endpoints in the original spec map to:

| Spec endpoint | Implementation | Access |
|---|---|---|
| `POST /api/auth/doctor/register` | Edge Function `register-doctor` (`admin.createUser` + `handle_new_user` trigger, status `pending`) + license upload to `licenses` bucket | Public |
| `POST /api/auth/login` | `supabase.auth.signInWithPassword()`; app routes by `profiles.role/status` | Public |
| `GET /api/admin/doctors` | `select * from profiles where role='doctor'` (RLS `profiles_select_admin`) | Admin |
| `PATCH /api/admin/doctors/:id/status` | RPC `review_doctor(p_doctor_id, p_status, p_reason)` | Admin |
| `POST /api/prescriptions` | `insert into prescriptions` (RLS: approved doctor, own `doctor_id`); id from `nanoid_21()` | Approved doctor |
| `GET /api/prescriptions/mine` | `select … from prescriptions` (RLS `rx_select_own`) | Doctor |
| `GET /api/rx/:id` | RPC `get_public_rx(p_id)` → masked when unpaid, full when paid | Public |
| `POST /api/rx/:id/payment` | RPC `create_payment_session(p_id)` (reuses a live session; 15 min expiry) | Public |
| `GET /api/rx/:id/payment-status` | The client polls `get_public_rx` every 3 s while `status = 'unpaid'` | Public |
| `POST /api/webhooks/payment` | Edge Function `payment-webhook` → RPC `mark_payment_paid` (service_role only) | Gateway only |
| — (test only) | Edge Function `mock-gateway` signs & posts a `payment.paid` event | Test mode |

## Masked vs full payload of `get_public_rx`

Unpaid:
```json
{ "id": "…21 chars…", "status": "unpaid", "amount": 50, "created_at": "…",
  "medicine_count": 2, "patient_hint": "J*** S***",
  "doctor": { "full_name": "…", "specialty": "…", "clinic_name": "…" } }
```
Paid adds: `diagnosis`, `notes`, `medicines[]`, `patient{name,dob,sex,address,contact}`,
and `doctor{prc_no,ptr_no,s2_no,clinic_address,phone}`.

## Validation
Zod on the client (`features/*/schemas.js`). Server side, the same limits are enforced by Postgres
`CHECK` constraints and `valid_medicines()` — a tampered client cannot bypass them.
