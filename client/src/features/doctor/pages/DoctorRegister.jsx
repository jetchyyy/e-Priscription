import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { CheckCircle2, MailCheck } from 'lucide-react';
import { AuthShell } from '../../auth/components/AuthShell';
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
    <div className="space-y-4 pt-2">
      <h2 className="font-display text-xl font-semibold text-[#152839] border-b border-[#dce1e8] pb-2">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
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
      <AuthShell
        sideTitle="What happens next"
        sideText="An administrator checks your PRC license, then you can send your first prescription."
      >
        <div className="text-center space-y-4 py-8">
          {result.needsEmailConfirm ? (
            <MailCheck className="mx-auto h-16 w-16 text-[#ff6f07]" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="mx-auto h-16 w-16 text-[#152839]" aria-hidden="true" />
          )}
          <h1 className="font-display text-2xl font-bold text-[#152839]">
            {result.needsEmailConfirm ? 'Check your email' : 'Registration submitted'}
          </h1>
          <p className="text-sm text-[#45546a]">
            {result.needsEmailConfirm
              ? 'We sent a confirmation link to your email. After confirming, sign in to finish uploading your PRC license.'
              : 'Your account is now awaiting approval by the administrator. You will be able to sign in and issue prescriptions once approved.'}
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

  return (
    <AuthShell
      sideTitle="Write prescriptions. Get paid directly."
      sideText="An administrator checks your PRC license, then you can send your first prescription."
    >
      <div className="max-w-[560px] w-full">
        <h1 className="font-display text-[32px] font-bold text-[#152839]">Create your account</h1>
        <p className="mt-1 text-sm text-[#45546a]">
          PRC-licensed physicians can register here to issue e-prescriptions.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-6">
          {serverError && (
            <div role="alert" className="rounded-[18px] border border-[#f3c2af] bg-[#fbe9e1] p-4 text-sm text-[#7a2406]">
              {serverError}
            </div>
          )}

          <Section title="Account">
            <Input wrapperClassName="sm:col-span-2" label="Full name" required autoComplete="name" placeholder="Juan Dela Cruz, MD"
              error={errors.fullName?.message} {...register('fullName')} />
            <Input wrapperClassName="sm:col-span-2" label="Email" type="email" required autoComplete="email" inputMode="email"
              error={errors.email?.message} {...register('email')} />
            <Input label="Password" type="password" required autoComplete="new-password"
              hint="8+ characters" error={errors.password?.message} {...register('password')} />
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
            <Input label="PTR no. (optional)" inputMode="numeric" hint="Professional Tax Receipt"
              error={errors.ptrNo?.message} {...register('ptrNo')} />
            <Input label="S2 license no. (optional)" hint="Dangerous drugs only"
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

          <div className="space-y-2">
            <label className="block text-sm font-medium text-[#152839]">PRC license document</label>
            <label
              htmlFor="licenseFile"
              className="flex min-h-[6rem] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[18px] border border-dashed border-[#dce1e8] bg-[#f9f8f3] p-4 text-center transition hover:border-[#152839]"
            >
              <span className="text-sm font-semibold text-[#152839]">
                {file ? file.name : 'Tap to upload a photo or PDF of your PRC ID'}
              </span>
              <span className="text-xs text-[#5f6a7c]">JPG, PNG or PDF · max 5 MB</span>
              <input
                id="licenseFile"
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                className="sr-only"
                {...register('licenseFile')}
              />
            </label>
            {errors.licenseFile && (
              <p role="alert" className="text-xs text-[#a3330a]">{errors.licenseFile.message}</p>
            )}
          </div>

          <div className="space-y-3 pt-2">
            <Button type="submit" variant="accent" size="lg" className="w-full" loading={isSubmitting}>
              Create account
            </Button>
            <p className="text-center text-xs text-[#5f6a7c]">
              Personal data is collected solely to verify professional license standing under RA 10173.
            </p>
            <p className="text-center text-sm text-[#45546a]">
              Already registered? <Link to="/login" className="font-semibold text-[#152839] hover:underline">Sign in</Link>
            </p>
          </div>
        </form>
      </div>
    </AuthShell>
  );
}
