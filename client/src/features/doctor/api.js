import { db } from '../../lib/supabase';

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' };

export async function uploadLicense(userId, file) {
  const supabase = db();
  const path = `${userId}/${Date.now()}-license.${EXT[file.type] ?? 'bin'}`;
  const { error: upErr } = await supabase.storage.from('licenses').upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (upErr) throw upErr;
  const { error } = await supabase.from('profiles').update({ license_file_path: path }).eq('id', userId);
  if (error) throw error;
  return path;
}

/**
 * Creates the auth user (profile row is created by a DB trigger, status = pending).
 * If email confirmation is ON there is no session yet, so the license upload
 * is deferred to the "awaiting approval" page.
 */
export async function registerDoctor(values) {
  const supabase = db();

  // 1. Register account via register-doctor Edge Function
  // Safely creates auth.users + auth.identities via GoTrue admin API
  let userId = null;
  let registrationSuccess = false;

  try {
    const { data: edgeData, error: edgeError } = await supabase.functions.invoke('register-doctor', {
      body: {
        email: values.email,
        password: values.password,
        fullName: values.fullName,
        prcNo: values.prcNo,
        ptrNo: values.ptrNo || null,
        s2No: values.s2No || null,
        specialty: values.specialty || null,
        clinicName: values.clinicName || null,
        clinicAddress: values.clinicAddress || null,
        phone: values.phone || null,
      },
    });

    if (edgeError) {
      let errMsg = edgeError.message;
      if (edgeError.context && typeof edgeError.context.json === 'function') {
        try {
          const body = await edgeError.context.json();
          if (body?.error) errMsg = body.error;
        } catch (_) {}
      }
      throw new Error(errMsg);
    }

    if (edgeData?.error) {
      throw new Error(edgeData.error);
    }

    if (edgeData?.userId) {
      userId = edgeData.userId;
      registrationSuccess = true;
    }
  } catch (err) {
    // If the Edge Function is not deployed or unreachable in local dev, fall back to standard signUp
    const isNetworkOrNotFound = /failed to send|not found|404|fetch/i.test(err?.message || '');
    if (!isNetworkOrNotFound && err?.message && !err.message.includes('FunctionsHttpError')) {
      throw err;
    }

    console.warn('Edge Function register-doctor unavailable, falling back to auth.signUp:', err.message);
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: {
          full_name: values.fullName,
          prc_no: values.prcNo,
          ptr_no: values.ptrNo ?? '',
          s2_no: values.s2No ?? '',
          specialty: values.specialty,
          clinic_name: values.clinicName,
          clinic_address: values.clinicAddress,
          phone: values.phone,
        },
      },
    });
    if (signUpError) throw signUpError;
    userId = authData?.user?.id;
    registrationSuccess = true;
  }

  // 2. Upload license document if provided
  let licenseUploaded = false;
  if (values.licenseFile?.[0]) {
    try {
      const { data: sessionData } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });
      if (sessionData?.user) {
        await uploadLicense(sessionData.user.id, values.licenseFile[0]);
        licenseUploaded = true;
      }
    } catch (upErr) {
      console.warn('License upload during registration deferred:', upErr);
    }
  }

  // Ensure user is signed out so pending doctor is not left logged in
  await supabase.auth.signOut();

  return { needsEmailConfirm: false, licenseUploaded };
}

export async function createPrescription(values) {
  const supabase = db();
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error('Your session expired. Please sign in again.');

  const clean = (v) => (v && String(v).trim() ? String(v).trim() : null);
  const { data, error } = await supabase
    .from('prescriptions')
    .insert({
      doctor_id: userId,
      patient_name: values.patientName.trim(),
      patient_contact: clean(values.patientContact),
      patient_dob: clean(values.patientDob),
      patient_sex: clean(values.patientSex),
      patient_address: clean(values.patientAddress),
      diagnosis: clean(values.diagnosis),
      notes: clean(values.notes),
      amount: values.amount,
      pin: clean(values.pin),
      medicines: values.medicines.map((m) => ({
        genericName: m.genericName.trim(),
        brandName: m.brandName?.trim() ?? '',
        strength: m.strength.trim(),
        form: m.form.trim(),
        quantity: m.quantity.trim(),
        dose: m.dose.trim(),
        frequency: m.frequency.trim(),
        duration: m.duration.trim(),
        instructions: m.instructions?.trim() ?? '',
      })),
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function fetchMyPrescriptions() {
  const { data, error } = await db()
    .from('prescriptions')
    .select('id, patient_name, diagnosis, amount, pin, payment_status, created_at, paid_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function updateDoctorProfile(values) {
  const supabase = db();
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error('Your session expired. Please sign in again.');

  const clean = (v) => (v && String(v).trim() ? String(v).trim() : null);
  const payload = {
    full_name: values.fullName ? String(values.fullName).trim() : undefined,
    specialty: clean(values.specialty),
    prc_no: clean(values.prcNo),
    ptr_no: clean(values.ptrNo),
    s2_no: clean(values.s2No),
    clinic_name: clean(values.clinicName),
    clinic_address: clean(values.clinicAddress),
    phone: clean(values.phone),
  };

  // Remove undefined fields
  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

  const { data, error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function fetchMyPaymentMethods() {
  const supabase = db();
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from('doctor_payment_methods')
    .select('*')
    .eq('doctor_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function createPaymentMethod({ provider, accountName, accountNumber, file }) {
  const supabase = db();
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) throw new Error('Session expired. Please sign in again.');

  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const filePath = `${userId}/${Date.now()}-${provider.toLowerCase().replace(/[^a-z0-9]/g, '')}.${ext}`;

  // 1. Upload QR image to public qr-codes bucket
  const { error: uploadError } = await supabase.storage.from('qr-codes').upload(filePath, file, {
    contentType: file.type || 'image/png',
    upsert: false,
  });
  if (uploadError) throw uploadError;

  // 2. Get public URL
  const { data: publicData } = supabase.storage.from('qr-codes').getPublicUrl(filePath);
  const qrImageUrl = publicData.publicUrl;

  // 3. Insert record into doctor_payment_methods
  const { data, error } = await supabase
    .from('doctor_payment_methods')
    .insert({
      doctor_id: userId,
      provider: provider.trim(),
      account_name: accountName.trim(),
      account_number: accountNumber?.trim() || null,
      qr_image_url: qrImageUrl,
      is_active: true,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function togglePaymentMethod(id, isActive) {
  const supabase = db();
  const { data, error } = await supabase
    .from('doctor_payment_methods')
    .update({ is_active: isActive })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deletePaymentMethod(id) {
  const supabase = db();
  const { error } = await supabase
    .from('doctor_payment_methods')
    .delete()
    .eq('id', id);

  if (error) throw error;
  return true;
}


