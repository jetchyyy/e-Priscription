import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, BadgeCheck, EyeOff, FilePenLine, Link2, Lock, QrCode, ShieldCheck, Smartphone, Stethoscope, UserRound,
} from 'lucide-react';
import { Logo } from '../components/ui/Logo';
import { Button } from '../components/ui/Button';
import { extractRxId } from '../lib/utils';

const steps = [
  { icon: FilePenLine, title: 'Doctor writes the Rx', text: 'Fill in the patient, diagnosis and medicines. A unique secure link is created instantly.' },
  { icon: Link2, title: 'Share the link', text: 'Send it by Viber, Messenger or SMS. No app or account needed for the patient.' },
  { icon: QrCode, title: 'Patient pays by QR', text: 'Scan with GCash, Maya or any bank app. The prescription unlocks automatically.' },
];

const features = [
  { icon: EyeOff, title: 'Content never leaves the server early', text: 'Unpaid links return only a masked preview. The blur is for looks — the data simply isn’t there.' },
  { icon: BadgeCheck, title: 'PRC-verified doctors only', text: 'Every doctor is reviewed by an administrator before they can issue a single prescription.' },
  { icon: ShieldCheck, title: 'Built for RA 10173', text: 'Private license storage, no prescription content in logs, and role-based access everywhere.' },
  { icon: Smartphone, title: 'Made for phones', text: 'Fast, touch-friendly and readable at 375px — where Filipino patients actually open links.' },
];

export default function Landing() {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const open = (e) => {
    e.preventDefault();
    const id = extractRxId(value);
    if (!id) return setError('That doesn’t look like a prescription link. Paste the full link your doctor sent.');
    navigate(`/rx/${id}`);
  };

  return (
    <div className="mesh-bg min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <nav aria-label="Account" className="flex items-center gap-2">
          <Link to="/doctor/register" className="hidden sm:block"><Button variant="ghost">Doctor sign up</Button></Link>
          <Link to="/login"><Button variant="secondary">Doctor Login</Button></Link>
          <Link to="/admin/login">
            <Button variant="dark" className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-brand-300" /> Superadmin
            </Button>
          </Link>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-8 sm:px-6 lg:grid-cols-2 lg:pt-16">
          <div>
            <span className="eyebrow"><span aria-hidden="true">🇵🇭</span> Made for Philippine clinics</span>
            <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.08] text-ink-900 sm:text-6xl">
              The modern <span className="bg-gradient-to-r from-brand-600 to-brand-400 bg-clip-text text-transparent">Rx</span>,<br />
              delivered as a secure link.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-600">
              Licensed doctors issue prescriptions in seconds. Patients open a link, pay by QR, and their prescription
              unlocks — no printing, no lost papers.
            </p>

            <form onSubmit={open} className="mt-8 max-w-xl" aria-labelledby="patient-h">
              <h2 id="patient-h" className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-700">
                <UserRound className="h-4 w-4 text-brand-600" aria-hidden="true" /> I’m a patient — open my prescription
              </h2>
              <div className="glass flex flex-col gap-2 rounded-2xl p-2 shadow-card sm:flex-row">
                <label htmlFor="rx-input" className="sr-only">Prescription link</label>
                <input
                  id="rx-input"
                  value={value}
                  onChange={(e) => { setValue(e.target.value); setError(''); }}
                  placeholder="Paste your prescription link"
                  className="min-h-12 flex-1 rounded-xl bg-white px-4 text-[15px] placeholder:text-ink-400 focus:outline-none focus:ring-4 focus:ring-brand-500/20"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? 'rx-input-err' : undefined}
                />
                <Button type="submit" size="lg">Open <ArrowRight className="h-4 w-4" aria-hidden="true" /></Button>
              </div>
              {error && <p id="rx-input-err" role="alert" className="mt-2 text-sm text-rose-600">{error}</p>}
            </form>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/doctor/register"><Button variant="secondary" size="lg"><Stethoscope className="h-5 w-5" aria-hidden="true" /> Register as a doctor</Button></Link>
              <Link to="/sample"><Button variant="ghost" size="lg">See a sample Rx</Button></Link>
            </div>
          </div>

          {/* Hero illustration */}
          <div className="relative mx-auto w-full max-w-md" aria-hidden="true">
            <div className="absolute -inset-6 rounded-[3rem] bg-gradient-to-br from-brand-300/40 via-transparent to-gold-300/40 blur-2xl" />
            <div className="relative animate-float rounded-3xl bg-white p-6 shadow-paper ring-1 ring-ink-100">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-rx text-lg font-bold text-brand-900">Dela Cruz Family Clinic</p>
                  <p className="text-xs text-ink-500">Dr. Maria Dela Cruz · Pediatrics</p>
                </div>
                <span className="font-rx text-5xl font-bold leading-none text-brand-600">℞</span>
              </div>
              <div className="relative mt-5 space-y-3 blur-[5px]">
                {[80, 64, 72].map((w, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="h-3 rounded bg-ink-300" style={{ width: `${w}%` }} />
                    <div className="h-2.5 rounded bg-ink-200" style={{ width: `${w - 25}%` }} />
                  </div>
                ))}
              </div>
              <div className="absolute inset-x-6 bottom-6 flex items-center gap-3 rounded-2xl bg-ink-900 p-3 text-white shadow-xl">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white">
                  <QrCode className="h-8 w-8 text-ink-900" />
                </span>
                <div className="min-w-0 text-left">
                  <p className="flex items-center gap-1.5 text-sm font-semibold"><Lock className="h-3.5 w-3.5 text-brand-300" /> Locked</p>
                  <p className="text-xs text-white/70">Scan to pay ₱50 and unlock</p>
                </div>
              </div>
              <div className="h-24" />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="how-h">
          <div className="max-w-2xl">
            <span className="eyebrow">How it works</span>
            <h2 id="how-h" className="mt-3 text-3xl font-semibold text-ink-900 sm:text-4xl">From clinic to pharmacy in three steps</h2>
          </div>
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {steps.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="group relative rounded-3xl bg-white p-6 shadow-card ring-1 ring-ink-100 transition hover:-translate-y-1 hover:shadow-paper">
                <span className="absolute right-5 top-4 font-rx text-6xl font-bold text-brand-600/10">{i + 1}</span>
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-glow">
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-lg font-semibold text-ink-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Security */}
        <section className="px-4 pb-20 sm:px-6" aria-labelledby="sec-h">
          <div className="dark-panel mx-auto max-w-6xl overflow-hidden rounded-[2rem] p-8 text-white sm:p-12">
            <h2 id="sec-h" className="max-w-xl font-display text-3xl font-semibold sm:text-4xl">
              Health data deserves <span className="text-brand-300">real</span> security.
            </h2>
            <div className="mt-10 grid gap-6 sm:grid-cols-2">
              {features.map(({ icon: Icon, title, text }) => (
                <div key={title} className="flex gap-4 rounded-2xl bg-white/5 p-5 ring-1 ring-white/10 backdrop-blur">
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-400/15 text-brand-300 ring-1 ring-brand-300/30">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="font-semibold">{title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-white/70">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-ink-200/70 px-4 py-8 text-center text-xs leading-relaxed text-ink-500">
        <p>© {new Date().getFullYear()} E-Reseta. Prescriptions contain personal health information protected under the Data Privacy Act of 2012 (RA 10173).</p>
        <p className="mt-1">
          E-Reseta is a software platform and does not replace a physician’s professional judgment.
          {' · '}
          <Link to="/admin/login" className="underline decoration-ink-300 underline-offset-2 hover:text-ink-700">
            Super Admin Portal
          </Link>
        </p>
      </footer>
    </div>
  );
}
