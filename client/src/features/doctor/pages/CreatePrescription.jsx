import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, IdCard, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input, Select, Textarea } from '../../../components/ui/Input';
import { MedicineFields } from '../components/MedicineFields';
import { CopyLinkButton, ShareLinkButton } from '../components/CopyLinkButton';
import { createPrescription } from '../api';
import { emptyMedicine, prescriptionSchema } from '../schemas';
import { useAuthStore } from '../../../store/authStore';
import { env } from '../../../config/env';
import { doctorTitle, formatPeso, rxLink } from '../../../lib/utils';

const defaults = () => ({
  patientName: '', patientSex: '', patientDob: '', patientContact: '', patientAddress: '',
  diagnosis: '', notes: '', amount: env.defaultFee, medicines: [{ ...emptyMedicine }],
});

function Section({ number, title, children }) {
  return (
    <Card className="sm:!p-7">
      <h2 className="mb-5 flex items-center gap-3 text-lg font-semibold text-ink-900">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700 ring-1 ring-brand-100">{number}</span>
        {title}
      </h2>
      {children}
    </Card>
  );
}

export default function CreatePrescription() {
  const qc = useQueryClient();
  const profile = useAuthStore((s) => s.profile);
  const [created, setCreated] = useState(null);

  const {
    register, control, handleSubmit, watch, reset,
    formState: { errors },
  } = useForm({ resolver: zodResolver(prescriptionSchema), defaultValues: defaults() });

  const mutation = useMutation({
    mutationFn: createPrescription,
    onSuccess: (id, values) => {
      qc.invalidateQueries({ queryKey: ['doctor', 'prescriptions'] });
      setCreated({ id, patient: values.patientName, amount: values.amount });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: (e) => toast.error(e?.message || 'Could not create the prescription. Please try again.'),
  });

  if (created) {
    const link = rxLink(created.id);
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="animate-pop text-center sm:!p-10">
          <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" aria-hidden="true" />
          <h1 className="mt-4 text-2xl font-semibold text-ink-900">Prescription created</h1>
          <p className="mt-1 text-ink-600">
            Send this secure link to <strong>{created.patient}</strong>. They pay {formatPeso(created.amount)} by QR to unlock it.
          </p>

          <div className="mt-6 rounded-2xl bg-ink-50 p-3 ring-1 ring-ink-200">
            <label htmlFor="rx-link" className="sr-only">Prescription link</label>
            <input id="rx-link" readOnly value={link} onFocus={(e) => e.target.select()}
              className="w-full bg-transparent px-2 py-2 text-center font-mono text-sm text-ink-800 focus:outline-none" />
          </div>

          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <CopyLinkButton link={link} size="lg" variant="primary" />
            <ShareLinkButton link={link} size="lg" />
            <a href={link} target="_blank" rel="noreferrer">
              <Button variant="secondary" size="lg"><ExternalLink className="h-4 w-4" aria-hidden="true" /> Preview</Button>
            </a>
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-3 border-t border-ink-100 pt-6">
            <Button variant="ghost" onClick={() => { reset(defaults()); setCreated(null); }}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Write another
            </Button>
            <Link to="/doctor"><Button variant="ghost">View history</Button></Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900 sm:text-3xl">New prescription</h1>
        <p className="mt-1 text-ink-600">Fill in the details. A unique secure link is generated when you save.</p>
      </div>

      <Card className="flex flex-wrap items-start justify-between gap-4 !bg-brand-50/60 !ring-brand-100">
        <div className="flex items-start gap-4">
          <IdCard className="mt-0.5 h-6 w-6 shrink-0 text-brand-700" aria-hidden="true" />
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-brand-900">Signed as {doctorTitle(profile?.full_name ?? '')}</p>
            <p className="text-brand-800/80">
              {[profile?.specialty, profile?.clinic_name].filter(Boolean).join(' · ') || 'Medical Clinic'}
            </p>
            {profile?.clinic_address && (
              <p className="text-xs text-brand-800/75">
                {[profile?.clinic_address, profile?.phone && `Tel: ${profile.phone}`].filter(Boolean).join(' · ')}
              </p>
            )}
            <p className="font-medium text-brand-900/90">
              PRC {profile?.prc_no || 'Pending'}{profile?.ptr_no ? ` · PTR ${profile.ptr_no}` : ''}{profile?.s2_no ? ` · S2 ${profile.s2_no}` : ''}
            </p>
            <p className="mt-1 text-xs text-brand-800/70">These clinic and license details are automatically stamped on the prescription.</p>
          </div>
        </div>
        <Link
          to="/doctor/profile"
          className="rounded-lg bg-white/80 px-3 py-1.5 text-xs font-semibold text-brand-700 shadow-sm ring-1 ring-brand-200 transition hover:bg-white hover:text-brand-900"
        >
          Edit Doctor Details &rarr;
        </Link>
      </Card>

      <Section number="1" title="Patient">
        <div className="grid gap-4 sm:grid-cols-6">
          <Input wrapperClassName="sm:col-span-6" label="Patient full name" required autoComplete="off"
            error={errors.patientName?.message} {...register('patientName')} />
          <Select wrapperClassName="sm:col-span-2" label="Sex" error={errors.patientSex?.message} {...register('patientSex')}>
            <option value="">Not specified</option>
            <option value="Female">Female</option>
            <option value="Male">Male</option>
          </Select>
          <Input wrapperClassName="sm:col-span-2" label="Date of birth" type="date" max={new Date().toISOString().slice(0, 10)}
            error={errors.patientDob?.message} {...register('patientDob')} />
          <Input wrapperClassName="sm:col-span-2" label="Contact number" type="tel" placeholder="0917 123 4567"
            error={errors.patientContact?.message} {...register('patientContact')} />
          <Input wrapperClassName="sm:col-span-6" label="Address" placeholder="Street, Barangay, City"
            error={errors.patientAddress?.message} {...register('patientAddress')} />
        </div>
      </Section>

      <Section number="2" title="Diagnosis & notes">
        <div className="grid gap-4">
          <Input label="Diagnosis" placeholder="e.g. Acute tonsillitis" error={errors.diagnosis?.message} {...register('diagnosis')} />
          <Textarea label="Doctor’s notes (optional)" placeholder="Advice, follow-up, precautions…"
            error={errors.notes?.message} {...register('notes')} />
        </div>
      </Section>

      <Section number="3" title="Medicines">
        <MedicineFields control={control} register={register} errors={errors} watch={watch} />
      </Section>

      <Section number="4" title="Access fee">
        <div className="max-w-xs">
          <Input label="Fee the patient pays to unlock (₱)" type="number" inputMode="decimal" step="1" min="20" max="5000"
            hint="Between ₱20 and ₱5,000" error={errors.amount?.message}
            {...register('amount', { valueAsNumber: true })} />
        </div>
      </Section>

      <div className="sticky bottom-0 -mx-4 border-t border-ink-100 bg-white/90 px-4 py-3 backdrop-blur-xl sm:mx-0 sm:rounded-2xl sm:border sm:px-5">
        <Button type="submit" size="lg" className="w-full sm:w-auto" loading={mutation.isPending}>
          Create prescription &amp; get link
        </Button>
      </div>
    </form>
  );
}
