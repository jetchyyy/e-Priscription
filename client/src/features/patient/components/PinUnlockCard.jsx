import { useState } from 'react';
import { CheckCircle2, KeyRound, Lock, ShieldCheck, ArrowRight } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { formatPeso } from '../../../lib/utils';
import { verifyRxPin } from '../api';
import { toast } from 'sonner';

export function PinUnlockCard({ rx, onUnlocked }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanPin = pin.trim();
    if (!cleanPin) {
      setError('Please enter the PIN');
      return;
    }
    if (!/^\d{4,6}$/.test(cleanPin)) {
      setError('PIN must be 4 to 6 digits');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const isValid = await verifyRxPin(rx.id, cleanPin);
      if (isValid) {
        toast.success('PIN verified! Prescription unlocked.');
        onUnlocked(cleanPin);
      } else {
        setError('Incorrect PIN. Please re-check the PIN given by your doctor.');
        toast.error('Incorrect PIN. Please check with your doctor.');
      }
    } catch (err) {
      setError(err?.message || 'Could not verify PIN. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sticky top-20 mx-auto max-w-md rounded-3xl bg-white/95 p-6 text-center shadow-paper ring-1 ring-ink-100 backdrop-blur-xl sm:p-8">
      {/* Payment Confirmed Badge */}
      <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        Payment Confirmed ({formatPeso(rx.amount)})
      </div>

      <div className="mt-4 flex justify-center">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-200 shadow-sm">
          <KeyRound className="h-7 w-7" aria-hidden="true" />
        </span>
      </div>

      <h2 className="mt-4 text-2xl font-semibold text-ink-900">Enter Security PIN</h2>
      <p className="mt-2 text-sm text-ink-600 leading-relaxed">
        Dr. <strong>{rx.doctor?.full_name || 'your doctor'}</strong> protected this prescription with a security PIN.
        Enter the PIN to open and view your prescription details.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="rx-pin-input" className="sr-only">
            Security PIN
          </label>
          <input
            id="rx-pin-input"
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            autoFocus
            autoComplete="one-time-code"
            value={pin}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '');
              setPin(val);
              if (error) setError('');
            }}
            placeholder="• • • •"
            className={`w-full rounded-2xl border bg-ink-50/50 py-3 text-center font-mono text-2xl font-bold tracking-widest text-ink-900 shadow-inner transition focus:bg-white focus:outline-none focus:ring-2 ${
              error
                ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200'
                : 'border-ink-200 focus:border-brand-500 focus:ring-brand-100'
            }`}
          />
          {error && (
            <p role="alert" className="mt-2 text-xs font-medium text-rose-600">
              {error}
            </p>
          )}
        </div>

        <Button type="submit" size="lg" className="w-full gap-2" loading={loading} disabled={pin.length < 4}>
          <span>Open prescription</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </form>

      <div className="mt-6 border-t border-ink-100 pt-4 text-xs text-ink-500">
        <p className="font-medium text-ink-700">Didn't receive your PIN?</p>
        <p className="mt-1">
          Please contact <strong>{rx.doctor?.clinic_name || 'the clinic'}</strong>
          {rx.doctor?.phone ? ` at ${rx.doctor.phone}` : rx.doctor?.email ? ` (${rx.doctor.email})` : ''} to get your unlock PIN.
        </p>
      </div>
    </div>
  );
}
