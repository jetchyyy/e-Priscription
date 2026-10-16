import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { CheckCircle2, FileUp, MailCheck } from 'lucide-react';
import { PublicLayout } from '../../../components/layout/PublicLayout';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input, Select } from '../../../components/ui/Input';
import { friendlyAuthError } from '../../auth/api';
import { registerDoctor } from '../api';
import { registerSchema } from '../schemas';

const SPECIALTIES = [
  'General Practitioner', 'Internal Medicine', 'Pediatrics', 'Obstetrics & Gynecology', 'Family Medicine',
  'Cardiology', 'Dermatology', 'ENT – Otolaryngology', 'Ophthalmology', 'Orthopedics', 'Psychiatry',
  'Surgery', 'Dentistry', 'Other',
];

function Section({ title, children }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-1 font-display text-lg font-semibold text-ink-900">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export default function DoctorRegister() {
  const [result, setResult] = useState(null);
  const [serverError, setServerError] = useState('');
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { specialty: '', ptrNo: '', s2No: '' },
  });
  const file = watch('licenseFile')?.[0];

  const onSubmit = async (values) => {
    setServerError('');
    try {
      setResult(await registerDoctor(values));
    } catch (err) {
      setServerError(friendlyAuthError(err));
    }
  };

  if (result) {
    return (
      <PublicLayout maxWidth="max-w-xl">
        <Card className="mt-6 animate-pop text-center sm:!p-10">
          {result.needsEmailConfirm ? (
            <MailCheck className="mx-auto h-16 w-16 text-brand-600" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" aria-hidden="true" />
          )}
          <h1 className="mt-4 text-2xl font-semibold">
            {result.needsEmailConfirm ? 'Check your email' : 'Registration submitted'}
          </h1>
          <p className="mt-2 text-ink-600">
            {result.needsEmailConfirm
              ? 'We sent a confirmation link to your email. After confirming, sign in to finish uploading your PRC license.'
              : 'Your account is now awaiting approval by the administrator. You will be able to sign in and issue prescriptions once approved.'}
          </p>
          <Link to="/login"><Button className="mt-6" size="lg">Go to sign in</Button></Link>
        </Card>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout maxWidth="max-w-3xl">
      <div className="mb-6">
        <span className="eyebrow">For licensed doctors</span>
        <h1 className="mt-3 text-3xl font-semibold text-ink-900 sm:text-4xl">Doctor registration</h1>
        <p className="mt-2 text-ink-600">
          Your PRC license is verified by our administrator before you can issue prescriptions.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Card className="space-y-8 sm:!p-8">
          {serverError && (
            <div role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">{serverError}</div>
          )}

          <Section title="Account">
            <Input wrapperClassName="sm:col-span-2" label="Full name" required autoComplete="name" placeholder="Juan Dela Cruz, MD"
              error={errors.fullName?.message} {...register('fullName')} />
            <Input wrapperClassName="sm:col-span-2" label="Email" type="email" required autoComplete="email" inputMode="email"
              error={errors.email?.message} {...register('email')} />
            <Input label="Password" type="password" required autoComplete="new-password"
              hint="8+ characters with a letter and a number" error={errors.password?.message} {...register('password')} />
            <Input label="Confirm password" type="password" required autoComplete="new-password"
              error={errors.confirmPassword?.message} {...register('confirmPassword')} />
          </Section>

          <Section title="Professional details">
            <Input label="PRC license no." required inputMode="numeric" placeholder="0123456"
              error={errors.prcNo?.message} {...register('prcNo')} />
            <Select label="Specialty" required error={errors.specialty?.message} {...register('specialty')}>
              <option value="">Select specialty…</option>
              {SPECIALTIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            <Input label="PTR no. (optional)" inputMode="numeric" hint="Professional Tax Receipt — shown on prescriptions"
              error={errors.ptrNo?.message} {...register('ptrNo')} />
            <Input label="S2 license no. (optional)" hint="Only if you prescribe dangerous drugs"
              error={errors.s2No?.message} {...register('s2No')} />
          </Section>

          <Section title="Clinic">
            <Input wrapperClassName="sm:col-span-2" label="Clinic / hospital name" required
              error={errors.clinicName?.message} {...register('clinicName')} />
            <Input wrapperClassName="sm:col-span-2" label="Clinic address" required autoComplete="street-address"
              placeholder="Unit / Street, Barangay, City, Province"
              error={errors.clinicAddress?.message} {...register('clinicAddress')} />
            <Input label="Contact number" required type="tel" autoComplete="tel" placeholder="0917 123 4567"
              error={errors.phone?.message} {...register('phone')} />
          </Section>

          <fieldset>
            <legend className="mb-3 font-display text-lg font-semibold text-ink-900">PRC license document</legend>
            <label htmlFor="licenseFile"
              className="flex min-h-[7rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink-300 bg-ink-50/60 px-4 py-6 text-center transition hover:border-brand-400 hover:bg-brand-50/50 focus-within:ring-4 focus-within:ring-brand-500/20">
              <FileUp className="h-7 w-7 text-brand-600" aria-hidden="true" />
              <span className="text-sm font-medium text-ink-800">{file ? file.name : 'Tap to upload a photo or PDF of your PRC ID'}</span>
              <span className="text-xs text-ink-500">JPG, PNG or PDF · max 5 MB · stored privately</span>
              <input id="licenseFile" type="file" accept="image/jpeg,image/png,application/pdf" className="sr-only"
                aria-describedby={errors.licenseFile ? 'licenseFile-err' : undefined} {...register('licenseFile')} />
            </label>
            {errors.licenseFile && <p id="licenseFile-err" role="alert" className="mt-1.5 text-sm text-rose-600">{errors.licenseFile.message}</p>}
          </fieldset>

          <div className="space-y-3">
            <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>Submit for approval</Button>
            <p className="text-center text-xs leading-relaxed text-ink-500">
              By registering you agree that your information is collected to verify your professional license, in line with the Data Privacy Act of 2012 (RA 10173).
            </p>
            <p className="text-center text-sm text-ink-600">
              Already registered? <Link to="/login" className="font-semibold text-brand-700 hover:underline">Sign in</Link>
            </p>
          </div>
        </Card>
      </form>
    </PublicLayout>
  );
}
