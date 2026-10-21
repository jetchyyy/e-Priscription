import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, ExternalLink, KeyRound, Plus, RefreshCw, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input, Select, Textarea } from '../../../components/ui/Input';
import { MedicineFields } from '../components/MedicineFields';
import { PlanUsageNotice, myPlanQuery, usageLevel } from '../components/PlanUsage';
import { isLimitError } from '../../billing/api';
import { CopyLinkButton, ShareLinkButton } from '../components/CopyLinkButton';
import { createPrescription } from '../api';
import { emptyMedicine, prescriptionSchema } from '../schemas';
import { useAuthStore } from '../../../store/authStore';
import { env } from '../../../config/env';
import { doctorTitle, formatPeso, rxLink } from '../../../lib/utils';
import { Ody, RxSlip } from '../../marketing/components';
import { Modal } from '../../../components/ui/Modal';

const generatePin = () => String(Math.floor(1000 + Math.random() * 9000));

const defaults = () => ({
  patientName: '', patientSex: '', patientDob: '', patientContact: '', patientAddress: '',
  diagnosis: '', notes: '', amount: env.defaultFee, pin: generatePin(), medicines: [{ ...emptyMedicine }],
});

function Section({ title, children, tourId }) {
  return (
    <div data-tour={tourId} className="rounded-[20px] border border-[#dce1e8] bg-white p-6 sm:p-7 space-y-5">
      <h2 className="font-display text-xl font-semibold text-[#152839]">
        {title}
      </h2>
      {children}
    </div>
  );
}

export default function CreatePrescription() {
  const qc = useQueryClient();
  const profile = useAuthStore((s) => s.profile);
  const [created, setCreated] = useState(null);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);

  const {
    register, control, handleSubmit, watch, reset, setValue,
    formState: { errors },
  } = useForm({ resolver: zodResolver(prescriptionSchema), defaultValues: defaults() });

  const formValues = watch();
  const { data: plan } = useQuery(myPlanQuery);
  const atLimit = usageLevel(plan) === 'out';

  const mutation = useMutation({
    mutationFn: createPrescription,
    onSuccess: (id, values) => {
      qc.invalidateQueries({ queryKey: ['doctor', 'prescriptions'] });
      qc.invalidateQueries({ queryKey: myPlanQuery.queryKey });
      setCreated({ id, patient: values.patientName, amount: values.amount, pin: values.pin });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: (e) => {
      if (isLimitError(e)) qc.invalidateQueries({ queryKey: myPlanQuery.queryKey });
      toast.error(e?.message || 'Could not create the prescription. Please try again.');
    },
  });

  // Allowed Ody moment (section 11.5: "prescription sent" with Ody celebrate at 140px)
  if (created) {
    const link = rxLink(created.id);
    return (
      <div className="mx-auto max-w-xl py-6">
        <div className="rounded-[20px] border border-[#dce1e8] bg-white p-8 text-center sm:p-10 space-y-6">
          <div className="flex justify-center">
            <Ody mood="celebrate" alt="Ody mascot celebrating" className="w-[140px]" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-[#152839]">Prescription created</h1>
            <p className="mt-2 text-sm text-[#45546a]">
              Send the link to your patient. It opens once they pay.
            </p>
          </div>

          <div className="rounded-[18px] border border-[#dce1e8] bg-[#f9f8f3] p-3">
            <label htmlFor="rx-link" className="sr-only">Prescription link</label>
            <input
              id="rx-link"
              readOnly
              value={link}
              onFocus={(e) => e.target.select()}
              className="w-full bg-transparent px-2 py-1 text-center font-mono text-sm text-[#152839] focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap justify-center gap-2.5">
            <CopyLinkButton link={link} variant="primary" label="Copy link" />
            <ShareLinkButton link={link} size="md" />
            <a href={link} target="_blank" rel="noreferrer">
              <Button variant="secondary"><ExternalLink className="h-4 w-4" aria-hidden="true" /> Preview</Button>
            </a>
          </div>

          <div className="rounded-[18px] border border-[#ece7de] bg-[#f9f8f3] p-5 text-left space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#5f6a7c]">Prescription Security PIN</span>
              <span className="font-mono text-2xl font-bold tracking-widest text-[#152839]">{created.pin}</span>
            </div>
            <p className="text-xs text-[#5f6a7c]">
              Tell your patient this PIN in person. They will enter it after paying to view their prescription.
            </p>
          </div>

          <div className="pt-4 border-t border-[#dce1e8] flex flex-wrap items-center justify-center gap-4">
            <Button variant="secondary" onClick={() => { reset(defaults()); setCreated(null); }}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Write another
            </Button>
            <Link to="/doctor" className="text-sm font-semibold text-[#152839] hover:underline">
              Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Calculate patient age helper
  const patientAge = formValues.patientDob
    ? `${Math.floor((new Date() - new Date(formValues.patientDob)) / (365.25 * 24 * 60 * 60 * 1000))} y`
    : '';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] font-bold text-[#152839]">New prescription</h1>
          <p className="mt-1 text-sm text-[#45546a]">
            Fill in patient and medicine details. Prescriptions cannot be edited after they are created.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMobilePreviewOpen(true)}
          className="inline-flex items-center gap-2 rounded-full border border-[#dce1e8] bg-white px-4 py-2 text-sm font-semibold text-[#152839] hover:bg-[#ece7de] xl:hidden"
        >
          <Eye className="h-4 w-4 text-[#ff6f07]" /> Preview slip
        </button>
      </div>

      <PlanUsageNotice />

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-12 items-start">
        {/* Form in columns 1 to 7 on desktop */}
        <form
          onSubmit={handleSubmit((v) => mutation.mutate(v))}
          noValidate
          className="xl:col-span-7 space-y-6"
        >
          {/* Doctor header reminder */}
          <div className="rounded-[20px] border border-[#dce1e8] bg-white p-5 flex items-start justify-between gap-4">
            <div className="text-sm text-[#45546a]">
              <p className="font-semibold text-[#152839]">Prescribing Doctor: {doctorTitle(profile?.full_name ?? '')}</p>
              <p>{profile?.clinic_name || 'Clinic'} · PRC Lic. {profile?.prc_no || '—'}</p>
            </div>
            <Link to="/doctor/profile" className="text-xs font-semibold text-[#b8470a] hover:underline whitespace-nowrap">
              Edit details &rarr;
            </Link>
          </div>

          {/* Section 1: Patient (data-tour="rx-patient") */}
          <Section title="Patient details" tourId="rx-patient">
            <div className="grid gap-4 sm:grid-cols-6">
              <Input
                wrapperClassName="sm:col-span-6"
                label="Full name"
                required
                autoComplete="off"
                placeholder="e.g. Juan Santos"
                error={errors.patientName?.message}
                {...register('patientName')}
              />
              <Select
                wrapperClassName="sm:col-span-2"
                label="Sex"
                error={errors.patientSex?.message}
                {...register('patientSex')}
              >
                <option value="">Select sex…</option>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
              </Select>
              <Input
                wrapperClassName="sm:col-span-2"
                label="Date of birth"
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                error={errors.patientDob?.message}
                {...register('patientDob')}
              />
              <Input
                wrapperClassName="sm:col-span-2"
                label="Contact number"
                type="tel"
                placeholder="0917 123 4567"
                error={errors.patientContact?.message}
                {...register('patientContact')}
              />
              <Input
                wrapperClassName="sm:col-span-6"
                label="Address"
                placeholder="Street, Barangay, City"
                error={errors.patientAddress?.message}
                {...register('patientAddress')}
              />
            </div>
          </Section>

          {/* Section 2: Diagnosis and notes */}
          <Section title="Diagnosis and notes">
            <div className="grid gap-4">
              <Input
                label="Diagnosis"
                placeholder="e.g. Acute tonsillitis"
                error={errors.diagnosis?.message}
                {...register('diagnosis')}
              />
              <Textarea
                label="Doctor’s notes (optional)"
                placeholder="Advice, follow-up, precautions…"
                error={errors.notes?.message}
                {...register('notes')}
              />
            </div>
          </Section>

          {/* Section 3: Medicines (data-tour="rx-medicines") */}
          <Section title="Medicines" tourId="rx-medicines">
            <p className="text-xs text-[#5f6a7c] -mt-2 mb-3">
              Write the generic name first under Republic Act 6675 (Generics Act).
            </p>
            <MedicineFields control={control} register={register} errors={errors} watch={watch} />
          </Section>

          {/* Section 4: Access fee & security PIN (data-tour="rx-fee") */}
          <Section title="Access fee and security PIN" tourId="rx-fee">
            <div className="grid gap-6 sm:grid-cols-2">
              <Input
                label="Fee patient pays to unlock (₱)"
                type="number"
                inputMode="decimal"
                step="1"
                min="20"
                max="5000"
                hint="Between ₱20 and ₱5,000"
                error={errors.amount?.message}
                {...register('amount', { valueAsNumber: true })}
              />

              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#152839]">
                  Security PIN
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={6}
                    inputMode="numeric"
                    placeholder="4-6 digits"
                    className="w-full rounded-[18px] border border-[#dce1e8] bg-white px-4 py-2.5 font-mono text-base font-bold tracking-widest text-[#152839] focus:outline-none focus:border-[#ff6f07] focus:ring-2 focus:ring-[#ff6f07]/20"
                    {...register('pin')}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setValue('pin', generatePin(), { shouldValidate: true })}
                    title="Generate new PIN"
                    className="shrink-0"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                {errors.pin ? (
                  <p className="mt-1.5 text-xs text-[#a3330a]">{errors.pin.message}</p>
                ) : (
                  <p className="mt-1.5 text-xs text-[#5f6a7c]">
                    Tell your patient this PIN so they can open their prescription after payment.
                  </p>
                )}
              </div>
            </div>
          </Section>

          {/* Action button container (data-tour="rx-create") */}
          <div data-tour="rx-create" className="space-y-2 pt-2">
            <Button
              type="submit"
              variant="accent"
              size="lg"
              className="w-full sm:w-auto"
              loading={mutation.isPending}
              disabled={atLimit}
            >
              Create prescription
            </Button>
            <p className="text-xs text-[#5f6a7c]">
              {atLimit
                ? <>This month’s limit is reached. <Link to="/doctor/plan" className="font-semibold text-[#b8470a] underline">Upgrade your plan</Link> to create it.</>
                : 'Prescriptions cannot be edited after they are created.'}
            </p>
          </div>
        </form>

        {/* Live preview sticky on desktop (columns 8 to 12) */}
        <div className="hidden xl:block xl:col-span-5 sticky top-24">
          <div className="rounded-[20px] border border-[#dce1e8] bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#dce1e8]">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#5f6a7c]">Live prescription preview</span>
              <span className="h-2 w-1.5 rounded-[47%/35.6%] bg-[#ff6f07]" />
            </div>
            <RxSlip
              stage="written"
              clinicName={profile?.clinic_name}
              doctorName={profile?.full_name}
              specialty={profile?.specialty}
              prcNo={profile?.prc_no}
              ptrNo={profile?.ptr_no}
              patientName={formValues.patientName}
              patientAge={patientAge}
              medicines={formValues.medicines}
              diagnosis={formValues.diagnosis}
            />
          </div>
        </div>
      </div>

      {/* Modal preview on small screens */}
      <Modal
        open={mobilePreviewOpen}
        onClose={() => setMobilePreviewOpen(false)}
        title="Prescription preview"
        size="md"
      >
        <RxSlip
          stage="written"
          clinicName={profile?.clinic_name}
          doctorName={profile?.full_name}
          specialty={profile?.specialty}
          prcNo={profile?.prc_no}
          ptrNo={profile?.ptr_no}
          patientName={formValues.patientName}
          patientAge={patientAge}
          medicines={formValues.medicines}
          diagnosis={formValues.diagnosis}
        />
      </Modal>
    </div>
  );
}
