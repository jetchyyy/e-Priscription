import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Camera, Check, CheckCircle2, ChevronLeft, FileUp, Gift, MailCheck } from 'lucide-react';
import { AuthShell, AuthField, PhoneField } from '../../auth/components/AuthShell';
import { Button } from '../../../components/ui/Button';
import { friendlyAuthError } from '../../auth/api';
import { lookupReferral, registerDoctor } from '../api';
import { registerFields } from '../schemas';
import { Turnstile } from '../../../components/Turnstile';
import '../register.css';

const STEPS = [
  ['Create your account', 'A few easy questions, about 3 minutes.'],
  ['Upload your PRC license', 'A photo or PDF of your PRC ID.'],
  ['An administrator checks it', 'We email you when you are approved.'],
  ['Send your first prescription', 'Write it, share the link, get paid to your QR.'],
];

const SPECIALTIES = [
  'General Practitioner', 'Internal Medicine', 'Pediatrics', 'Obstetrics & Gynecology', 'Family Medicine',
  'Cardiology', 'Dermatology', 'ENT – Otolaryngology', 'Ophthalmology', 'Orthopedics', 'Psychiatry',
  'Surgery', 'Dentistry',
];

// The invite link is /doctor/register?ref=CODE. The code is kept in case the doctor leaves and comes back later.
const REF_KEY = 'ereseta.referral_code';
const REF_PATTERN = /^[A-Z0-9]{4,20}$/;
// Answers so far, so a doctor who closes the app picks up where they stopped. Never the password or the photo.
const DRAFT_KEY = 'ereseta.register_draft';
const DRAFT_SKIP = ['password', 'confirmPassword', 'licenseFile', 'acceptTerms'];

function savedReferral(fromUrl) {
  const code = (fromUrl ?? '').trim().toUpperCase();
  try {
    if (REF_PATTERN.test(code)) {
      localStorage.setItem(REF_KEY, code);
      return code;
    }
    const kept = localStorage.getItem(REF_KEY) ?? '';
    return REF_PATTERN.test(kept) ? kept : '';
  } catch {
    return REF_PATTERN.test(code) ? code : '';
  }
}

function readDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null'); } catch { return null; }
}

function writeDraft(values, stepId) {
  const kept = Object.fromEntries(Object.entries(values).filter(([k]) => !DRAFT_SKIP.includes(k)));
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ values: kept, stepId })); } catch { /* storage blocked */ }
}

function forgetDraft() {
  try { localStorage.removeItem(REF_KEY); localStorage.removeItem(DRAFT_KEY); } catch { /* storage blocked */ }
}

const EMPTY = {
  fullName: '', specialty: '', prcNo: '', hasS2: null, s2No: '', hasPtr: null, ptrNo: '',
  clinicName: '', clinicAddress: '', phone: '', invited: null, referralCode: '',
  licenseFile: null, email: '', password: '', confirmPassword: '', acceptTerms: false,
};

/**
 * One question per screen. `fields` are checked with the registration schema before moving on;
 * `skip` hides a screen that does not apply.
 */
const QUESTIONS = [
  { id: 'welcome', fields: [] },
  { id: 'name', fields: ['fullName'], label: 'Name' },
  { id: 'specialty', fields: ['specialty'], label: 'Specialty' },
  { id: 'prc', fields: ['prcNo'], label: 'PRC license no.' },
  { id: 's2', fields: ['s2No'], label: 'S2 license no.' },
  { id: 'ptr', fields: ['ptrNo'], label: 'PTR no.' },
  { id: 'clinicName', fields: ['clinicName'], label: 'Clinic' },
  { id: 'clinicAddress', fields: ['clinicAddress'], label: 'Clinic address' },
  { id: 'phone', fields: ['phone'], label: 'Contact number' },
  { id: 'referral', fields: ['referralCode'], label: 'Invited by', skip: (_v, fromLink) => fromLink },
  { id: 'license', fields: ['licenseFile'], label: 'PRC ID' },
  { id: 'account', fields: ['email', 'password', 'confirmPassword'], label: 'Email' },
  { id: 'review', fields: ['acceptTerms'] },
];

// The yes/no screens: an answer is needed, and "Yes" needs the number that goes with it.
const FOLLOW_UPS = [
  ['hasS2', 's2No', 'Type your S2 license number'],
  ['hasPtr', 'ptrNo', 'Type your PTR number'],
  ['invited', 'referralCode', 'Type the invite code'],
];

function checkFields(values, fields) {
  if (!fields.length) return {};
  for (const [flag, key, msg] of FOLLOW_UPS) {
    if (!fields.includes(key)) continue;
    if (values[flag] == null) return { [key]: 'Tap one of the answers to continue' };
    if (values[flag] && !String(values[key] ?? '').trim()) return { [key]: msg };
  }
  const pick = Object.fromEntries(fields.map((f) => [f, true]));
  const r = registerFields.pick(pick).safeParse(values);
  const errors = {};
  if (!r.success) {
    for (const issue of r.error.issues) {
      const k = issue.path[0];
      if (!errors[k]) errors[k] = issue.message;
    }
  }
  if (fields.includes('confirmPassword') && !errors.confirmPassword && values.confirmPassword !== values.password) {
    errors.confirmPassword = 'Passwords do not match';
  }
  return errors;
}

/** A yes/no question answered by tapping one of two big buttons. */
function Choice({ value, onChange, yes = 'Yes', no = 'No' }) {
  return (
    <div className="wiz__choices wiz__choices--two" role="radiogroup">
      {[[true, yes], [false, no]].map(([v, label]) => (
        <button key={label} type="button" role="radio" aria-checked={value === v}
          className={`wiz__choice${value === v ? ' is-on' : ''}`} onClick={() => onChange(v)}>
          {value === v && <Check className="wiz__tick" aria-hidden="true" />}{label}
        </button>
      ))}
    </div>
  );
}

function ChoiceError({ error }) {
  return error ? <p role="alert" className="afield__err">{error}</p> : null;
}

export default function DoctorRegister() {
  const [params] = useSearchParams();
  const [initialRef] = useState(() => savedReferral(params.get('ref')));
  const [draft] = useState(readDraft);
  const [values, setValues] = useState(() => ({
    ...EMPTY,
    ...(draft?.values ?? {}),
    ...(initialRef ? { referralCode: initialRef, invited: true } : {}),
  }));
  const [stepId, setStepId] = useState(() => draft?.stepId ?? 'welcome');
  const [errors, setErrors] = useState({});
  const [reviewing, setReviewing] = useState(() => draft?.stepId === 'review');
  const [otherSpecialty, setOtherSpecialty] = useState(() => Boolean(draft?.values?.specialty) && !SPECIALTIES.includes(draft.values.specialty));
  const [inviter, setInviter] = useState(null);
  const [result, setResult] = useState(null);
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const turnstile = useRef(null);
  const body = useRef(null);
  const cameraInput = useRef(null);
  const fileInput = useRef(null);

  const fromLink = Boolean(initialRef) && Boolean(inviter?.name);
  const steps = useMemo(() => QUESTIONS.filter((q) => !q.skip?.(values, fromLink)), [values, fromLink]);
  const index = Math.max(0, steps.findIndex((q) => q.id === stepId));
  const step = steps[index];
  const refCode = (values.referralCode ?? '').trim().toUpperCase();

  useEffect(() => {
    if (!REF_PATTERN.test(refCode)) { setInviter(null); return undefined; }
    let live = true;
    const t = setTimeout(() => {
      lookupReferral(refCode).then((r) => { if (live) setInviter(r); }).catch(() => { if (live) setInviter(null); });
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [refCode]);

  useEffect(() => { if (!result) writeDraft(values, step.id); }, [values, step.id, result]);

  // A new question: bring it to the top and put the cursor in its first box, so the keyboard is already open.
  useEffect(() => {
    window.scrollTo({ top: 0 });
    const first = body.current?.querySelector('input:not([type=file]):not([type=checkbox]), button.wiz__choice');
    if (first && first.tagName === 'INPUT') first.focus({ preventScroll: true });
  }, [step.id]);

  const preview = useMemo(() => {
    const f = values.licenseFile?.[0];
    return f && f.type.startsWith('image/') ? URL.createObjectURL(f) : null;
  }, [values.licenseFile]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const set = (key, val) => {
    setValues((v) => ({ ...v, [key]: val }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const goTo = (id) => { setErrors({}); setServerError(''); setStepId(id); };

  const next = () => {
    const errs = checkFields(values, step.fields);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    if (step.id === 'review') { submit(); return; }
    goTo(reviewing ? 'review' : steps[index + 1].id);
    if (steps[index + 1]?.id === 'review') setReviewing(true);
  };

  const back = () => {
    if (reviewing && step.id !== 'review') { goTo('review'); return; }
    if (index > 0) goTo(steps[index - 1].id);
  };

  const submit = async () => {
    // Every earlier answer is checked again: a draft from an earlier visit has no password or photo yet.
    for (const q of steps) {
      const errs = checkFields(values, q.fields);
      if (Object.keys(errs).length) { setErrors(errs); setStepId(q.id); return; }
    }
    setServerError('');
    setSubmitting(true);
    try {
      setResult(await registerDoctor(values, () => turnstile.current?.takeToken() ?? null));
      forgetDraft();
    } catch (err) {
      const msg = friendlyAuthError(err);
      if (/already exists/i.test(msg)) { setErrors({ email: msg }); setStepId('account'); }
      else setServerError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const pickFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) set('licenseFile', [f]);
  };

  const field = (key, props) => (
    <AuthField value={values[key] ?? ''} error={errors[key]} onChange={(e) => set(key, e.target.value)} {...props} />
  );

  if (result) {
    return (
      <AuthShell
        tabTitle="Registration submitted"
        sideTitle="What happens next"
        sideText="An administrator checks your PRC license, then you can send your first prescription."
        steps={STEPS}
        current={result.needsEmailConfirm ? 1 : 2}
      >
        <div className="text-center space-y-4 py-8">
          {result.needsEmailConfirm ? (
            <MailCheck className="mx-auto h-16 w-16 text-[#ff6f07]" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="mx-auto h-16 w-16 text-[#152839]" aria-hidden="true" />
          )}
          <h1 className="font-display text-2xl font-bold text-[#152839]">
            {result.needsEmailConfirm ? 'Check your email' : 'You’re all set, Doc'}
          </h1>
          <p className="text-sm text-[#45546a]">
            {result.needsEmailConfirm
              ? 'We sent a confirmation link to your email. After confirming, sign in to finish uploading your PRC license.'
              : 'An administrator will check your PRC license. We will email you once you are approved, then you can sign in and send prescriptions.'}
          </p>
          <div className="pt-4">
            <Link to="/login">
              <Button variant="primary" size="lg">Go to sign in</Button>
            </Link>
          </div>
        </div>
      </AuthShell>
    );
  }

  const first = values.fullName.trim().split(/\s+/)[0];
  const total = steps.length - 1;
  const file = values.licenseFile?.[0];
  const summary = (id) => {
    switch (id) {
      case 's2': return values.hasS2 ? values.s2No : 'None';
      case 'ptr': return values.hasPtr ? values.ptrNo : 'None';
      case 'referral': return values.invited ? `${refCode}${inviter?.name ? ` · Dr. ${inviter.name}` : ''}` : 'No';
      case 'license': return file?.name ?? 'Not added yet';
      case 'account': return values.email;
      default: return values[QUESTIONS.find((q) => q.id === id).fields[0]];
    }
  };

  let content;
  switch (step.id) {
    case 'welcome':
      content = (
        <>
          {fromLink && (
            <p role="status" className="wiz__invite">
              <Gift className="h-5 w-5 shrink-0 text-[#ff6f07]" aria-hidden="true" />
              Dr. {inviter.name} invited you to E-Prescription.
            </p>
          )}
          <h1 className="wiz__q">Let’s get you set up, Doc.</h1>
          <p className="wiz__help">
            We’ll ask a few easy questions, one at a time. It takes about 3 minutes.
            Keep your <b>PRC ID</b> nearby; you’ll take a photo of it.
          </p>
          {draft?.values?.fullName && stepId === 'welcome' && (
            <p className="wiz__help">Your earlier answers are saved. Continue to pick up where you left off.</p>
          )}
        </>
      );
      break;
    case 'name':
      content = (
        <>
          <h1 className="wiz__q">What’s your full name?</h1>
          <p className="wiz__help">As it appears on your PRC ID. This prints on your prescriptions.</p>
          {field('fullName', { label: 'Full name', autoComplete: 'name', placeholder: 'Juan Dela Cruz, MD' })}
        </>
      );
      break;
    case 'specialty':
      content = (
        <>
          <h1 className="wiz__q">{first ? `Nice to meet you, Dr. ${first}. ` : ''}What’s your specialty?</h1>
          <p className="wiz__help">Tap one.</p>
          <div className="wiz__choices" role="radiogroup" aria-label="Specialty">
            {SPECIALTIES.map((s) => {
              const on = !otherSpecialty && values.specialty === s;
              return (
                <button key={s} type="button" role="radio" aria-checked={on} className={`wiz__choice${on ? ' is-on' : ''}`}
                  onClick={() => { setOtherSpecialty(false); set('specialty', s); }}>
                  {on && <Check className="wiz__tick" aria-hidden="true" />}{s}
                </button>
              );
            })}
            <button type="button" role="radio" aria-checked={otherSpecialty} className={`wiz__choice${otherSpecialty ? ' is-on' : ''}`}
              onClick={() => { setOtherSpecialty(true); if (SPECIALTIES.includes(values.specialty)) set('specialty', ''); }}>
              {otherSpecialty && <Check className="wiz__tick" aria-hidden="true" />}Something else
            </button>
          </div>
          {otherSpecialty && field('specialty', { label: 'Type your specialty', autoFocus: true })}
          {!otherSpecialty && errors.specialty && <p role="alert" className="afield__err">Tap your specialty to continue</p>}
        </>
      );
      break;
    case 'prc':
      content = (
        <>
          <h1 className="wiz__q">What’s your PRC license number?</h1>
          <p className="wiz__help">The number on the front of your PRC ID, usually 7 digits.</p>
          {field('prcNo', { label: 'PRC license no.', inputMode: 'numeric', placeholder: '0123456', autoComplete: 'off' })}
        </>
      );
      break;
    case 's2':
      content = (
        <>
          <h1 className="wiz__q">Do you prescribe dangerous drugs?</h1>
          <p className="wiz__help">Only doctors with an S2 license from PDEA can. Most doctors can tap “No”.</p>
          <Choice value={values.hasS2} onChange={(v) => { set('hasS2', v); if (!v) set('s2No', ''); }} yes="Yes, I have an S2" no="No" />
          {values.hasS2 == null && <ChoiceError error={errors.s2No} />}
          {values.hasS2 && field('s2No', { label: 'S2 license no.', autoComplete: 'off', autoFocus: true })}
        </>
      );
      break;
    case 'ptr':
      content = (
        <>
          <h1 className="wiz__q">Do you have a PTR number?</h1>
          <p className="wiz__help">Your Professional Tax Receipt. You can add it later in your profile.</p>
          <Choice value={values.hasPtr} onChange={(v) => { set('hasPtr', v); if (!v) set('ptrNo', ''); }} yes="Yes" no="Skip for now" />
          {values.hasPtr == null && <ChoiceError error={errors.ptrNo} />}
          {values.hasPtr && field('ptrNo', { label: 'PTR no.', inputMode: 'numeric', autoComplete: 'off', autoFocus: true })}
        </>
      );
      break;
    case 'clinicName':
      content = (
        <>
          <h1 className="wiz__q">Where do you see patients?</h1>
          <p className="wiz__help">Your clinic or hospital name. It prints on the top of your prescriptions.</p>
          {field('clinicName', { label: 'Clinic or hospital name', placeholder: 'Dela Cruz Family Clinic' })}
        </>
      );
      break;
    case 'clinicAddress':
      content = (
        <>
          <h1 className="wiz__q">What’s the clinic address?</h1>
          <p className="wiz__help">Street, barangay and city are enough.</p>
          {field('clinicAddress', { label: 'Clinic address', autoComplete: 'street-address', placeholder: 'Unit / Street, Barangay, City' })}
        </>
      );
      break;
    case 'phone':
      content = (
        <>
          <h1 className="wiz__q">What number can patients reach you on?</h1>
          <p className="wiz__help">A mobile or clinic landline. It prints on your prescriptions.</p>
          <PhoneField label="Mobile or clinic number" value={values.phone} error={errors.phone} onChange={(v) => set('phone', v)} />
        </>
      );
      break;
    case 'referral':
      content = (
        <>
          <h1 className="wiz__q">Did a doctor invite you?</h1>
          <p className="wiz__help">If a colleague sent you an invite code, enter it so they get credit.</p>
          <Choice value={values.invited} onChange={(v) => { set('invited', v); if (!v) set('referralCode', ''); }} yes="Yes, I have a code" no="No" />
          {values.invited == null && <ChoiceError error={errors.referralCode} />}
          {values.invited && (
            <>
              {field('referralCode', {
                label: 'Invite code', autoCapitalize: 'characters', autoComplete: 'off', spellCheck: false,
                placeholder: 'e.g. 7KQ4M2XA', maxLength: 20, autoFocus: true,
              })}
              {inviter?.name && (
                <p role="status" className="wiz__ok"><Check className="h-4 w-4" aria-hidden="true" /> Invited by Dr. {inviter.name}</p>
              )}
            </>
          )}
        </>
      );
      break;
    case 'license':
      content = (
        <>
          <h1 className="wiz__q">Now, a photo of your PRC ID.</h1>
          <p className="wiz__help">An administrator checks it before you can prescribe. Make sure your name and number are readable.</p>
          {file ? (
            <div className="wiz__file">
              {preview ? <img src={preview} alt="Your PRC ID" /> : <p className="wiz__filename"><FileUp className="h-5 w-5" aria-hidden="true" /> {file.name}</p>}
              <button type="button" className="link" onClick={() => cameraInput.current?.click()}>Retake photo</button>
            </div>
          ) : (
            <div className="wiz__choices wiz__choices--two">
              <button type="button" className="wiz__choice wiz__choice--big" onClick={() => cameraInput.current?.click()}>
                <Camera className="h-6 w-6" aria-hidden="true" /> Take a photo
              </button>
              <button type="button" className="wiz__choice wiz__choice--big" onClick={() => fileInput.current?.click()}>
                <FileUp className="h-6 w-6" aria-hidden="true" /> Choose a file
              </button>
            </div>
          )}
          <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={pickFile} />
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,application/pdf" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={pickFile} />
          <p className="wiz__help wiz__help--small">JPG, PNG or PDF, up to 5 MB.</p>
          {errors.licenseFile && <p role="alert" className="afield__err">{errors.licenseFile}</p>}
        </>
      );
      break;
    case 'account':
      content = (
        <>
          <h1 className="wiz__q">Last step: how you’ll sign in.</h1>
          <p className="wiz__help">We’ll email you here when your account is approved.</p>
          <div className="wiz__fields">
            {field('email', { label: 'Email', type: 'email', autoComplete: 'email', inputMode: 'email', placeholder: 'you@clinic.ph' })}
            {field('password', { label: 'Create a password', type: 'password', autoComplete: 'new-password', placeholder: '8+ characters, with a number' })}
            {field('confirmPassword', { label: 'Type it again', type: 'password', autoComplete: 'new-password' })}
          </div>
        </>
      );
      break;
    default: // review
      content = (
        <>
          <h1 className="wiz__q">Does this look right?</h1>
          <p className="wiz__help">Tap anything to change it.</p>
          <ul className="wiz__review">
            {steps.filter((q) => q.label).map((q) => (
              <li key={q.id}>
                <button type="button" onClick={() => goTo(q.id)}>
                  <span>{q.label}</span><b>{summary(q.id) || '—'}</b><em>Edit</em>
                </button>
              </li>
            ))}
          </ul>
          <div className="consent">
            <label className={`consent__box${errors.acceptTerms ? ' has-error' : ''}`}>
              <input type="checkbox" checked={values.acceptTerms} onChange={(e) => set('acceptTerms', e.target.checked)}
                aria-invalid={errors.acceptTerms ? true : undefined}
                aria-describedby={errors.acceptTerms ? 'acceptTerms-err' : undefined} />
              <span>
                I have read and agree to the{' '}
                <a href="/terms" target="_blank" rel="noreferrer" className="link">Terms and Conditions</a> and the{' '}
                <a href="/privacy" target="_blank" rel="noreferrer" className="link">Privacy Policy</a>, including the use
                of my license details to verify my registration.
              </span>
            </label>
            {errors.acceptTerms && <p id="acceptTerms-err" role="alert" className="consent__err">{errors.acceptTerms}</p>}
          </div>
          {serverError && <div role="alert" className="aform__error">{serverError}</div>}
          <Turnstile ref={turnstile} action="register" className="flex justify-center" />
        </>
      );
  }

  const cta = step.id === 'welcome' ? (draft?.values?.fullName ? 'Continue' : 'Let’s start')
    : step.id === 'review' ? 'Create my account'
      : reviewing ? 'Save' : 'Continue';

  return (
    <AuthShell
      tabTitle="Create your account"
      sideTitle="Write prescriptions. Get paid directly."
      sideText="An administrator checks your PRC license, then you can send your first prescription."
      steps={STEPS}
      current={0}
      footer={step.id === 'welcome' && (
        <p>Already registered? <Link to="/login" className="link">Sign in</Link></p>
      )}
    >
      <form className="wiz" noValidate onSubmit={(e) => { e.preventDefault(); next(); }}>
        {index > 0 && (
          <div className="wiz__top">
            <button type="button" className="wiz__back" onClick={back}>
              <ChevronLeft className="h-5 w-5" aria-hidden="true" /> Back
            </button>
            <div className="wiz__bar" role="progressbar" aria-label="Signup progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={index}>
              <i style={{ width: `${(index / total) * 100}%` }} />
            </div>
          </div>
        )}
        <div className="wiz__body" key={step.id} ref={body}>{content}</div>
        <button type="submit" className="btn aform__submit wiz__next" disabled={submitting}>
          {submitting ? 'Creating your account…' : cta}
        </button>
      </form>
    </AuthShell>
  );
}
