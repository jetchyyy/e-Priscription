// POST /api/register-doctor
// Creates the doctor's account through the Auth admin API (confirmed email, proper identities and metadata).
// The profile row is created by the on_auth_user_created trigger; role and status are never read from here.
// referral_code is linked to the referrer by on_auth_user_created_referral (0016); unknown codes are ignored.
import type { Env } from '../env';
import { json, readJson } from '../http';
import { adminCreateUser } from '../supabase';

type Body = {
  email?: string; password?: string; fullName?: string; prcNo?: string; ptrNo?: string | null; s2No?: string | null;
  specialty?: string | null; clinicName?: string | null; clinicAddress?: string | null; phone?: string | null;
  referralCode?: string | null;
};

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function registerDoctor(req: Request, env: Env): Promise<Response> {
  const body = await readJson<Body>(req);
  if (!body?.email || !body.password || !body.fullName || !body.prcNo) {
    return json({ error: 'Missing required registration fields (email, password, full name, PRC license number)' }, 400);
  }

  const email = body.email.trim().toLowerCase();
  if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) {
    return json({ error: 'Please enter a valid email address' }, 400);
  }
  if (typeof body.password !== 'string' || body.password.length < 8) {
    return json({ error: 'Password must be at least 8 characters long' }, 400);
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('register-doctor: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set');
    return json({ error: 'Server configuration error' }, 500);
  }

  // A taken email is reported by the Auth API itself (email_exists), so there is no separate lookup.
  const { data, error } = await adminCreateUser(env, {
    email,
    password: body.password,
    email_confirm: true,
    user_metadata: {
      full_name: clean(body.fullName, 120),
      prc_no: clean(body.prcNo, 20),
      ptr_no: clean(body.ptrNo, 20),
      s2_no: clean(body.s2No, 20),
      specialty: clean(body.specialty, 100),
      clinic_name: clean(body.clinicName, 150),
      clinic_address: clean(body.clinicAddress, 250),
      phone: clean(body.phone, 20),
      referral_code: clean(body.referralCode, 20).toUpperCase(),
    },
  });

  if (error || !data) {
    console.error('register-doctor: createUser failed:', error?.code, error?.message);
    if (!error || error.code === 'network' || Number(error.code) >= 500) {
      return json({ error: 'An unexpected error occurred during registration' }, 500);
    }
    const exists = /already (been )?registered|already exists|email_exists/i.test(`${error?.message} ${error?.code}`);
    return json({ error: exists ? 'An account with this email already exists' : (error?.message ?? 'Registration failed') }, exists ? 409 : 400);
  }

  return json({ success: true, userId: data.id, email: data.email });
}
