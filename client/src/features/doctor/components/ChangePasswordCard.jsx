import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Check, KeyRound, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useAuthStore } from '../../../store/authStore';
import { db } from '../../../lib/supabase';
import { friendlyAuthError } from '../../auth/api';
import { Turnstile } from '../../../components/Turnstile';

/** Rules a new password must pass. Shown to the doctor as a live checklist. */
export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 10 characters', test: (pw) => pw.length >= 10 },
  { id: 'upper', label: 'One uppercase letter (A–Z)', test: (pw) => /[A-Z]/.test(pw) },
  { id: 'lower', label: 'One lowercase letter (a–z)', test: (pw) => /[a-z]/.test(pw) },
  { id: 'number', label: 'One number (0–9)', test: (pw) => /\d/.test(pw) },
  { id: 'symbol', label: 'One symbol, e.g. ! @ # $ %', test: (pw) => /[^A-Za-z0-9\s]/.test(pw) },
  { id: 'nospace', label: 'No spaces', test: (pw) => pw.length > 0 && !/\s/.test(pw) },
];

export function checkPassword(pw, { current = '', confirm = '' } = {}) {
  const items = [
    ...PASSWORD_RULES.map((r) => ({ id: r.id, label: r.label, ok: r.test(pw) })),
    { id: 'different', label: 'Different from your current password', ok: pw.length > 0 && pw !== current },
    { id: 'match', label: 'Both new passwords match', ok: pw.length > 0 && pw === confirm },
  ];
  return { items, ok: items.every((i) => i.ok), passed: items.filter((i) => i.ok).length };
}

function PasswordInput({ label, value, onChange, autoComplete, error }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        label={label}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        error={error}
        className="pr-20"
        required
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-pressed={show}
        aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        className="absolute right-3 top-[34px] rounded-full px-2 py-1.5 text-sm font-semibold text-[#45546a] hover:text-[#152839]"
      >
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

const METER = ['#e5e7eb', '#d9480f', '#d9480f', '#e8a20c', '#e8a20c', '#2f9e44'];

export function ChangePasswordCard() {
  const email = useAuthStore((s) => s.session?.user?.email);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [currentError, setCurrentError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const turnstile = useRef(null);
  const sectionRef = useRef(null);
  const { hash } = useLocation();

  // The account menu links here with #change-password.
  useEffect(() => {
    if (hash === '#change-password') sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash]);

  const check = checkPassword(next, { current, confirm });
  const strength = PASSWORD_RULES.filter((r) => r.test(next)).length; // 0–6
  const meterLevel = next ? Math.max(1, Math.min(5, strength - 1)) : 0;
  const strengthLabel = !next ? '' : strength === PASSWORD_RULES.length ? 'Strong' : strength >= 4 ? 'Fair' : 'Weak';

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setCurrentError('');
    if (!current) return setCurrentError('Enter your current password');
    if (!check.ok) return setError('Your new password does not meet every item on the checklist yet.');
    if (!email) return setError('Your session has expired. Sign in again, then change your password.');

    setSaving(true);
    try {
      const supabase = db();
      // Confirm it is really the doctor before changing the password.
      // This is a sign-in, so Supabase's bot protection asks for a Turnstile token here too.
      const captchaToken = await turnstile.current?.takeToken();
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email, password: current, ...(captchaToken ? { options: { captchaToken } } : {}),
      });
      if (authErr) {
        if (/invalid login credentials/i.test(authErr.message)) setCurrentError('Your current password is incorrect');
        else setError(friendlyAuthError(authErr));
        return;
      }
      const { error: updErr } = await supabase.auth.updateUser({ password: next });
      if (updErr) {
        setError(/weak|pwned|leaked/i.test(updErr.message)
          ? 'This password appears in known data leaks. Please choose a different one.'
          : friendlyAuthError(updErr));
        return;
      }
      setCurrent('');
      setNext('');
      setConfirm('');
      toast.success('Password changed. Use your new password the next time you sign in.');
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section ref={sectionRef} id="change-password" aria-labelledby="password-h" className="scroll-mt-24 space-y-4 rounded-[20px] border border-[#dce1e8] bg-white p-6">
      <div>
        <h2 id="password-h" className="flex items-center gap-2 font-display text-xl font-semibold text-[#152839]">
          <KeyRound className="h-5 w-5" aria-hidden="true" /> Change password
        </h2>
        <p className="mt-1 text-sm text-[#45546a]">Use a strong password you do not use on any other site.</p>
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {error && <div role="alert" className="rounded-[16px] bg-[#fbe9e1] p-4 text-sm text-[#7a2406]">{error}</div>}

        <PasswordInput label="Current password" value={current} autoComplete="current-password" error={currentError}
          onChange={(v) => { setCurrent(v); setCurrentError(''); }} />

        <div className="grid gap-4 sm:grid-cols-2">
          <PasswordInput label="New password" value={next} onChange={setNext} autoComplete="new-password" />
          <PasswordInput label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        </div>

        <div className="rounded-[16px] bg-[#f9f8f3] p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-[#152839]">Your new password needs</p>
            {strengthLabel && (
              <span className="text-xs font-semibold" style={{ color: METER[meterLevel] }} aria-live="polite">
                {strengthLabel}
              </span>
            )}
          </div>
          <div className="mt-2 flex gap-1" aria-hidden="true">
            {[1, 2, 3, 4, 5].map((i) => (
              <span key={i} className="h-1.5 flex-1 rounded-full transition-colors"
                style={{ background: i <= meterLevel ? METER[meterLevel] : METER[0] }} />
            ))}
          </div>
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2" aria-label="Password requirements">
            {check.items.map((item) => (
              <li key={item.id} className={`flex items-start gap-2 text-sm transition-colors ${item.ok ? 'text-[#2b7a3d]' : 'text-[#5f6a7c]'}`}>
                <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${item.ok ? 'bg-[#2f9e44] text-white' : 'bg-[#e5e7eb] text-[#8a94a3]'}`}>
                  {item.ok ? <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" /> : <X className="h-2.5 w-2.5" strokeWidth={3} aria-hidden="true" />}
                </span>
                <span>
                  {item.label}
                  <span className="sr-only">{item.ok ? ' — done' : ' — not yet'}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <Turnstile ref={turnstile} action="change_password" />
        <Button type="submit" variant="primary" loading={saving} disabled={!check.ok || !current}>
          Change password
        </Button>
      </form>
    </section>
  );
}
