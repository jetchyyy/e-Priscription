import { Link, Navigate } from 'react-router-dom';
import { ShieldCheck, Stethoscope, QrCode } from 'lucide-react';
import { Logo } from '../../../components/ui/Logo';
import { LoginForm } from '../components/LoginForm';
import { homeFor, useAuthStore } from '../../../store/authStore';

const perks = [
  { icon: Stethoscope, text: 'Issue Rx prescriptions in under a minute' },
  { icon: QrCode, text: 'Patients unlock by paying through QR' },
  { icon: ShieldCheck, text: 'Prescription data withheld until payment is verified' },
];

export default function LoginPage() {
  const { session, profile, loading } = useAuthStore();
  if (!loading && session && profile) return <Navigate to={homeFor(profile)} replace />;

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="dark-panel relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex">
        <Logo light />
        <div className="relative">
          <span className="pointer-events-none absolute -left-8 -top-40 select-none font-rx text-[22rem] font-bold leading-none text-white/[0.04]" aria-hidden="true">℞</span>
          <h1 className="relative max-w-md font-display text-4xl font-semibold leading-tight">
            Prescriptions, <span className="text-brand-300">modernized</span> for Philippine clinics.
          </h1>
          <ul className="relative mt-8 space-y-4">
            {perks.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-white/80">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
                  <Icon className="h-5 w-5 text-brand-300" aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/50">Protected under the Data Privacy Act of 2012 (RA 10173)</p>
      </aside>

      <main className="mesh-bg flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden"><Logo /></div>
          <h1 className="font-display text-3xl font-semibold text-ink-900">Welcome back</h1>
          <p className="mt-1.5 text-ink-500">Sign in as a doctor or administrator.</p>
          <div className="mt-8 rounded-3xl bg-white/80 p-6 shadow-card ring-1 ring-ink-100 backdrop-blur sm:p-8">
            <LoginForm />
          </div>
          <p className="mt-6 text-center text-xs text-ink-500">
            Are you a patient? Open the prescription link your doctor sent you — no account needed.
          </p>
          <div className="mt-4 text-center">
            <Link
              to="/admin/login"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-400 hover:text-brand-700 transition"
            >
              <ShieldCheck className="h-3.5 w-3.5" /> Super Admin Portal Login &rarr;
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
