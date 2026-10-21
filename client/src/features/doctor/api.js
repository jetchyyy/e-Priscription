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

/** Fields an administrator verifies. Once a doctor is approved they change only through a change request. */
export const VERIFIED_FIELDS = ['full_name', 'prc_no', 'specialty', 's2_no'];

/**
 * Saves the doctor's own details. When `verifiedLocked` is true (approved doctors) only the directly editable
 * fields are sent; the database rejects changes to verified fields anyway.
 */
export async function updateDoctorProfile(values, { verifiedLocked = false } = {}) {
  const supabase = db();
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error('Your session expired. Please sign in again.');

  const clean = (v) => (v && String(v).trim() ? String(v).trim() : null);
  const editable = {
    ptr_no: clean(values.ptrNo),
    clinic_name: clean(values.clinicName),
    clinic_address: clean(values.clinicAddress),
    phone: clean(values.phone),
  };
  const payload = verifiedLocked ? editable : {
    ...editable,
    full_name: values.fullName ? String(values.fullName).trim() : undefined,
    specialty: clean(values.specialty),
    prc_no: clean(values.prcNo),
    s2_no: clean(values.s2No),
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



// ---------------------------------------------------------------------------------------------------------
// Change requests for verified details (name, PRC no., specialty, S2 no.)
// ---------------------------------------------------------------------------------------------------------

/** Latest change requests for the signed-in doctor, newest first. */
export async function fetchMyChangeRequests() {
  const { data, error } = await db()
    .from('profile_change_requests')
    .select('id, changes, previous, reason, status, review_note, created_at, reviewed_at')
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) throw error;
  return data;
}

/**
 * Sends a change request. `changes` uses database column names (see VERIFIED_FIELDS).
 * A name or PRC number change needs `file`, a current PRC ID; it is stored in the doctor's private folder
 * and attached to the request, not to the profile, until an administrator approves it.
 */
export async function requestProfileChange({ changes, reason, file }) {
  const supabase = db();
  let path = null;
  if (file) {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) throw new Error('Your session expired. Please sign in again.');
    path = `${userId}/${Date.now()}-change-request.${EXT[file.type] ?? 'bin'}`;
    const { error: upErr } = await supabase.storage.from('licenses').upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) throw upErr;
  }
  const { data, error } = await supabase.rpc('request_profile_change', {
    p_changes: changes,
    p_reason: reason || null,
    p_license_path: path,
  });
  if (error) throw error;
  return data;
}

export async function cancelProfileChange(id) {
  const { error } = await db().rpc('cancel_profile_change', { p_id: id });
  if (error) throw error;
}

// ---------------------------------------------------------------------------------------------------------
// Manual payment verification: receipts patients sent for this doctor's prescriptions
// ---------------------------------------------------------------------------------------------------------
export async function fetchPendingPaymentProofs() {
  const { data, error } = await db()
    .from('payment_proofs')
    .select('id, prescription_id, provider, reference_no, amount_read, screenshot_path, created_at, prescription:prescriptions(patient_name, amount, created_at)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

/** Short-lived link to a receipt screenshot (only this prescription's doctor can create it). */
export async function getPaymentProofUrl(path) {
  const { data, error } = await db().storage.from('payment-proofs').createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}

export async function confirmPaymentProof(id) {
  const { error } = await db().rpc('confirm_payment_proof', { p_id: id });
  if (error) throw error;
}

export async function rejectPaymentProof(id, reason) {
  const { error } = await db().rpc('reject_payment_proof', { p_id: id, p_reason: reason || null });
  if (error) throw error;
}

// ---------------------------------------------------------------------------------------------------------
// Subscription plan: usage this month, and paying ODYSSEY for a plan by QR (verified by an admin)
// ---------------------------------------------------------------------------------------------------------

/** Current plan, limits, prescriptions used this month and the latest plan payment (see my_plan()). */
export async function fetchMyPlan() {
  const { data, error } = await db().rpc('my_plan');
  if (error) throw error;
  return data;
}

/** ODYSSEY's own payment QRs, where doctors pay for a plan. */
export async function fetchPlatformPaymentMethods() {
  const { data, error } = await db()
    .from('platform_payment_methods')
    .select('id, provider, account_name, account_number, qr_image_url')
    .eq('is_active', true)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

const PROOF_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

async function uploadPlanProof(file) {
  const supabase = db();
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error('Your session expired. Please sign in again.');
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${PROOF_EXT[file.type] ?? 'png'}`;
  const { error } = await supabase.storage.from('plan-payment-proofs').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}

export async function requestPlan({ planId, period, reference, file, methodId, amountRead, extraSeats = 0 }) {
  const path = await uploadPlanProof(file);
  const { data, error } = await db().rpc('request_plan', {
    p_plan_id: planId,
    p_period: period,
    p_reference: reference,
    p_screenshot_path: path,
    p_method_id: methodId ?? null,
    p_amount_read: amountRead ?? null,
    p_extra_seats: extraSeats,
  });
  if (error) throw error;
  return data;
}

export async function cancelPlanRequest(id) {
  const { error } = await db().rpc('cancel_plan_request', { p_id: id });
  if (error) throw error;
}

// ---------------------------------------------------------------------------------------------------------
// Clinics: several doctors sharing one plan
// ---------------------------------------------------------------------------------------------------------

/** The signed-in doctor's clinic (owner view includes members and invitations), or null. */
export async function fetchMyClinic() {
  const { data, error } = await db().rpc('my_clinic');
  if (error) throw error;
  return data;
}

/** Invitations to join a clinic, sent to this doctor's email. */
export async function fetchMyClinicInvites() {
  const { data, error } = await db().rpc('my_clinic_invites');
  if (error) throw error;
  return data ?? [];
}

export async function respondClinicInvite({ id, accept }) {
  const { error } = await db().rpc('respond_clinic_invite', { p_id: id, p_accept: accept });
  if (error) throw error;
}

export async function inviteDoctor(email) {
  const { error } = await db().rpc('invite_doctor', { p_email: email });
  if (error) throw error;
}

export async function cancelClinicInvite(id) {
  const { error } = await db().rpc('cancel_clinic_invite', { p_id: id });
  if (error) throw error;
}

export async function renameClinic(name) {
  const { error } = await db().rpc('rename_clinic', { p_name: name });
  if (error) throw error;
}

export async function setMemberCap({ doctorId, cap }) {
  const { error } = await db().rpc('set_member_cap', { p_doctor: doctorId, p_cap: cap });
  if (error) throw error;
}

export async function removeClinicMember(doctorId) {
  const { error } = await db().rpc('remove_clinic_member', { p_doctor: doctorId });
  if (error) throw error;
}

export async function transferClinicOwner(doctorId) {
  const { error } = await db().rpc('transfer_clinic_owner', { p_doctor: doctorId });
  if (error) throw error;
}

export async function endClinic() {
  const { error } = await db().rpc('end_clinic');
  if (error) throw error;
}

export async function leaveClinic() {
  const { error } = await db().rpc('leave_clinic');
  if (error) throw error;
}

/** Price of extra doctor seats for the rest of the clinic's paid period. */
export async function quoteExtraSeats(seats) {
  const { data, error } = await db().rpc('quote_extra_seats', { p_seats: seats });
  if (error) throw error;
  return Number(data);
}

export async function requestExtraSeats({ seats, reference, file, methodId, amountRead }) {
  const path = await uploadPlanProof(file);
  const { data, error } = await db().rpc('request_extra_seats', {
    p_seats: seats,
    p_reference: reference,
    p_screenshot_path: path,
    p_method_id: methodId ?? null,
    p_amount_read: amountRead ?? null,
  });
  if (error) throw error;
  return data;
}

/** Buys prescriptions without changing plan. The receipt is checked by an admin, then the credits appear. */
export async function requestRxPack({ packId, quantity = 1, reference, file, methodId, amountRead }) {
  const path = await uploadPlanProof(file);
  const { data, error } = await db().rpc('request_rx_pack', {
    p_pack_id: packId,
    p_quantity: quantity,
    p_reference: reference,
    p_screenshot_path: path,
    p_method_id: methodId ?? null,
    p_amount_read: amountRead ?? null,
  });
  if (error) throw error;
  return data;
}
