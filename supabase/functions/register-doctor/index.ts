import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/http.ts';

type RegisterDoctorPayload = {
  email: string;
  password?: string;
  fullName: string;
  prcNo: string;
  ptrNo?: string | null;
  s2No?: string | null;
  specialty?: string | null;
  clinicName?: string | null;
  clinicAddress?: string | null;
  phone?: string | null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const body: RegisterDoctorPayload = await req.json().catch(() => null);
    if (!body || !body.email || !body.password || !body.fullName || !body.prcNo) {
      return json({ error: 'Missing required registration fields (email, password, full name, PRC license number)' }, 400);
    }

    const email = body.email.trim().toLowerCase();
    const password = body.password;
    const fullName = body.fullName.trim();
    const prcNo = body.prcNo.trim();

    if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) {
      return json({ error: 'Please enter a valid email address' }, 400);
    }

    if (password.length < 8) {
      return json({ error: 'Password must be at least 8 characters long' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Missing SUPABASE_URL or service role secret key in Edge Function environment');
      return json({ error: 'Server configuration error' }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Check if a profile or auth user already exists with this email
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingProfile) {
      return json({ error: 'An account with this email already exists' }, 409);
    }

    // Safely create the auth user using Supabase GoTrue Admin API
    // This properly generates auth.identities, salt, and GoTrue user metadata,
    // and email_confirm: true bypasses free-tier SMTP rate limits safely.
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        prc_no: prcNo,
        ptr_no: body.ptrNo?.trim() || '',
        s2_no: body.s2No?.trim() || '',
        specialty: body.specialty?.trim() || '',
        clinic_name: body.clinicName?.trim() || '',
        clinic_address: body.clinicAddress?.trim() || '',
        phone: body.phone?.trim() || '',
      },
    });

    if (error) {
      console.error('Failed to create doctor via admin.createUser:', error.message);
      return json({ error: error.message }, 400);
    }

    return json({
      success: true,
      userId: data.user.id,
      email: data.user.email,
    });
  } catch (err) {
    console.error('Unexpected error during doctor registration:', err);
    return json({ error: 'An unexpected error occurred during registration' }, 500);
  }
});
