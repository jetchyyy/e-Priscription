import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, RefreshCw, Eye, FilePlus2, FlaskConical, ChevronDown, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/Button';
import { Input, Select, Textarea } from '../../../components/ui/Input';
import { MedicineFields } from '../components/MedicineFields';
import { LabTestFields } from '../components/LabTestFields';
import { PlanUsageNotice, myPlanQuery, usageLevel } from '../components/PlanUsage';
import { isLimitError } from '../../billing/api';
import { CopyLinkButton, ShareLinkButton } from '../components/CopyLinkButton';
import { createPrescription } from '../api';
import { emptyLabTest, emptyMedicine, labRequestSchema, prescriptionSchema } from '../schemas';
import { useAuthStore } from '../../../store/authStore';
import { env } from '../../../config/env';
import { doctorTitle, formatPeso, rxLink } from '../../../lib/utils';
import { Ody, RxSlip } from '../../marketing/components';
import { Modal } from '../../../components/ui/Modal';

const generatePin = () => String(Math.floor(1000 + Math.random() * 9000));

const defaults = (kind = 'rx') => ({
  kind,
  patientName: '', patientSex: '', patientDob: '', patientContact: '', patientAddress: '',
  diagnosis: '', notes: '', amount: env.defaultFee, pin: generatePin(),
  medicines: [{ ...emptyMedicine }], labTests: [{ ...emptyLabTest }],
});

// Validate against the schema of the document being written (prescription or lab request).
const resolver = (values, ctx, opts) =>
  zodResolver(values.kind === 'lab' ? labRequestSchema : prescriptionSchema)(values, ctx, opts);

const ROUTES = { rx: '/doctor/new', lab: '/doctor/lab-request' };
const names = (kind) => (kind === 'lab'
  ? { doc: 'lab request', Doc: 'Lab request' }
  : { doc: 'prescription', Doc: 'Prescription' });

const ageFrom = (dob) => (dob
  ? `${Math.floor((new Date() - new Date(dob)) / (365.25 * 24 * 60 * 60 * 1000))} y`
  : '');

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

function StepHeading({ n, children }) {
  return (
    <h2 className="flex items-center gap-3 font-display text-lg font-semibold text-[#152839]">
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#152839] text-sm font-bold text-[#f9f8f3]" aria-hidden="true">
        {n}
      </span>
      <span><span className="sr-only">{n}. </span>{children}</span>
    </h2>
  );
}

export default function CreatePrescription({ kind = 'rx' }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const [created, setCreated] = useState(null);
  const [review, setReview] = useState(null);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);

  const {
    register, control, handleSubmit, watch, reset, setValue,
    formState: { errors },
  } = useForm({ resolver, defaultValues: defaults(kind) });

  const formValues = watch();
  const isLab = kind === 'lab';
  const { doc: docName } = names(kind);
  const { data: plan } = useQuery(myPlanQuery);
  const atLimit = usageLevel(plan) === 'out';

  const mutation = useMutation({
    mutationFn: createPrescription,
    onSuccess: (id, values) => {
      qc.invalidateQueries({ queryKey: ['doctor', 'prescriptions'] });
      qc.invalidateQueries({ queryKey: myPlanQuery.queryKey });
      setReview(null);
      setCreated({ id, kind: values.kind, patient: values.patientName, amount: values.amount, pin: values.pin });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: (e) => {
      setReview(null);
      if (isLimitError(e)) qc.invalidateQueries({ queryKey: myPlanQuery.queryKey });
      toast.error(e?.message || `Could not create the ${docName}. Please try again.`);
    },
  });

  const startNew = (nextKind) => {
    if (nextKind === kind) {
      reset(defaults(kind));
      setMoreOpen(false);
      setCreated(null);
      window.scrollTo({ top: 0 });
    } else {
      navigate(ROUTES[nextKind]);
    }
  };

  // Allowed Ody moment (section 11.5: "prescription sent" with Ody celebrate at 140px)
  if (created) {
    const link = rxLink(created.id);
    const { doc: createdName, Doc: CreatedName } = names(created.kind);
    return (
      <div className="mx-auto max-w-xl py-6">
        <div className="rounded-[20px] border border-[#dce1e8] bg-white p-6 sm:p-10 space-y-6">
          <div className="text-center">
            <div className="flex justify-center">
              <Ody mood="celebrate" alt="Ody mascot celebrating" className="w-[140px]" />
            </div>
            <h1 className="mt-4 font-display text-2xl font-bold text-[#152839]">{CreatedName} created</h1>
            <p className="mt-2 text-sm text-[#45546a]">
              Two things left to do. The {createdName} opens once your patient pays.
            </p>
          </div>

          <div className="space-y-3 rounded-[18px] border border-[#dce1e8] p-5">
            <StepHeading n={1}>Send this link to your patient</StepHeading>
            <div className="rounded-[18px] border border-[#dce1e8] bg-[#f9f8f3] p-3">
              <label htmlFor="rx-link" className="sr-only">{CreatedName} link</label>
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
            <p className="text-center text-xs text-[#5f6a7c]">You can paste it into Viber, Messenger or SMS.</p>
          </div>

          <div className="space-y-3 rounded-[18px] border border-[#dce1e8] p-5">
            <StepHeading n={2}>Tell your patient this PIN</StepHeading>
            <div className="rounded-[18px] bg-[#f9f8f3] p-4 text-center">
              <span className="sr-only">Security PIN: </span>
              <span className="font-mono text-4xl font-bold tracking-[0.3em] text-[#152839]">{created.pin}</span>
            </div>
            <p className="text-sm text-[#45546a]">
              They enter it after paying to open their {createdName}. Tell them in person.
            </p>
          </div>

          <div className="pt-4 border-t border-[#dce1e8] space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Button variant="secondary" className="w-full" onClick={() => startNew('rx')}>
                <FilePlus2 className="h-4 w-4" aria-hidden="true" /> New prescription
              </Button>
              <Button variant="secondary" className="w-full" onClick={() => startNew('lab')}>
                <FlaskConical className="h-4 w-4" aria-hidden="true" /> New lab request
              </Button>
            </div>
            <div className="text-center">
              <Link to="/doctor" className="text-sm font-semibold text-[#152839] hover:underline">
                Back to home
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Contact and address sit in a disclosure. It stays open while either has a value or an error.
  const moreHasValue = Boolean(formValues.patientContact?.trim() || formValues.patientAddress?.trim());
  const moreHasError = Boolean(errors.patientContact || errors.patientAddress);
  const moreForced = moreHasValue || moreHasError;

  const onValid = (values) => setReview(values);
  const onInvalid = (errs) => {
    if (errs.patientContact || errs.patientAddress) {
      // Open it now so react-hook-form can focus the field inside.
      if (moreRef.current) moreRef.current.open = true;
      setMoreOpen(true);
    }
    toast.error('Please fill in the highlighted fields.');
  };

  const slipProps = (v) => ({
    stage: 'written',
    clinicName: profile?.clinic_name,
    doctorName: profile?.full_name,
    specialty: profile?.specialty,
    prcNo: profile?.prc_no,
    ptrNo: profile?.ptr_no,
    patientName: v.patientName,
    patientAge: ageFrom(v.patientDob),
    medicines: v.medicines,
    labTests: isLab ? v.labTests : undefined,
    diagnosis: v.diagnosis,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] font-bold text-[#152839]">New {docName}</h1>
          <p className="mt-1 text-sm text-[#45546a]">
            Fill in the patient and the {isLab ? 'tests' : 'medicines'}. You can check everything before it is created.
          </p>
          <p className="mt-1 text-xs text-[#5f6a7c]">Each prescription or lab request uses one from your monthly limit.</p>
        </div>
        <button
          type="button"
          onClick={() => setMobilePreviewOpen(true)}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[#dce1e8] bg-white px-4 py-2 text-sm font-semibold text-[#152839] hover:bg-[#ece7de] xl:hidden"
        >
          <Eye className="h-4 w-4 text-[#ff6f07]" /> Preview
        </button>
      </div>

      <PlanUsageNotice />

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-12 items-start">
        {/* Form in columns 1 to 7 on desktop */}
        <form
          onSubmit={handleSubmit(onValid, onInvalid)}
          noValidate
          className="xl:col-span-7 space-y-6"
        >
          {/* Doctor header reminder */}
          <div className="rounded-[20px] border border-[#dce1e8] bg-white p-5 flex items-start justify-between gap-4">
            <div className="text-sm text-[#45546a]">
              <p className="font-semibold text-[#152839]">Doctor: {doctorTitle(profile?.full_name ?? '')}</p>
              <p>{profile?.clinic_name || 'Clinic'} · PRC Lic. {profile?.prc_no || 'not set'}</p>
            </div>
            <Link to="/doctor/profile" className="text-xs font-semibold text-[#b8470a] hover:underline whitespace-nowrap">
              Edit my details
            </Link>
          </div>

          {/* Section 1: Patient (data-tour="rx-patient") */}
          <Section title="1. Patient" tourId="rx-patient">
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
                wrapperClassName="sm:col-span-3"
                label="Sex"
                error={errors.patientSex?.message}
                {...register('patientSex')}
              >
                <option value="">Select sex…</option>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
              </Select>
              <Input
                wrapperClassName="sm:col-span-3"
                label="Date of birth"
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                error={errors.patientDob?.message}
                {...register('patientDob')}
              />
            </div>

            <details
              ref={moreRef}
              open={moreOpen || moreForced}
              onToggle={(e) => setMoreOpen(e.currentTarget.open)}
              className="group rounded-[18px] border border-[#dce1e8] bg-[#f9f8f3]"
            >
              <summary
                onClick={(e) => { if (moreForced) e.preventDefault(); }}
                className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold text-[#152839] [&::-webkit-details-marker]:hidden"
              >
                Add contact and address (optional)
                <ChevronDown className="h-4 w-4 shrink-0 text-[#45546a] transition group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="grid gap-4 px-4 pb-4 sm:grid-cols-6">
                <Input
                  wrapperClassName="sm:col-span-6"
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
            </details>
          </Section>

          {/* Section 2: Diagnosis and notes */}
          <Section title={isLab ? '2. Reason for request' : '2. Diagnosis'}>
            <div className="grid gap-4">
              <Input
                label={isLab ? 'Reason for request' : 'Diagnosis'}
                placeholder={isLab ? 'e.g. Annual check-up' : 'e.g. Acute tonsillitis'}
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

          {/* Section 3: Medicines or tests (data-tour="rx-medicines") */}
          {isLab ? (
            <Section title="3. Laboratory tests" tourId="rx-medicines">
              <p className="text-xs text-[#5f6a7c] -mt-2">Tap a common test to add it, or type your own below.</p>
              <LabTestFields control={control} register={register} errors={errors} watch={watch} setValue={setValue} />
            </Section>
          ) : (
            <Section title="3. Medicines" tourId="rx-medicines">
              <p className="text-xs text-[#5f6a7c] -mt-2 mb-3">
                Write the generic name first (Generics Act, RA 6675). Tap a choice under Frequency and Duration, or type your own.
              </p>
              <MedicineFields control={control} register={register} errors={errors} watch={watch} setValue={setValue} />
            </Section>
          )}

          {/* Section 4: Access fee & security PIN (data-tour="rx-fee") */}
          <Section title="4. Fee and PIN" tourId="rx-fee">
            <div className="grid gap-6 sm:grid-cols-2">
              <Input
                label="Fee your patient pays (₱)"
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
                <label htmlFor="rx-pin" className="mb-1.5 block text-sm font-medium text-[#152839]">
                  Security PIN
                </label>
                <div className="flex gap-2">
                  <input
                    id="rx-pin"
                    type="text"
                    maxLength={6}
                    inputMode="numeric"
                    placeholder="4-6 digits"
                    aria-invalid={errors.pin ? true : undefined}
                    className="w-full min-h-[48px] rounded-[18px] border border-[#dce1e8] bg-white px-4 py-2.5 font-mono text-base font-bold tracking-widest text-[#152839] focus:outline-none focus:border-[#ff6f07] focus:ring-2 focus:ring-[#ff6f07]/20"
                    {...register('pin')}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setValue('pin', generatePin(), { shouldValidate: true })}
                    title="Make a new PIN"
                    aria-label="Make a new PIN"
                    className="shrink-0"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                {errors.pin ? (
                  <p role="alert" className="mt-1.5 text-sm text-[#a3330a]">{errors.pin.message}</p>
                ) : (
                  <p className="mt-1.5 text-xs text-[#5f6a7c]">
                    Your patient needs this PIN to open the {docName} after paying.
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
              disabled={atLimit}
            >
              Review {docName}
            </Button>
            <p className="text-xs text-[#5f6a7c]">
              {atLimit
                ? <>This month’s limit is reached. <Link to="/doctor/plan#packs" className="font-semibold text-[#b8470a] underline">Buy prescriptions</Link> or <Link to="/doctor/plan" className="font-semibold text-[#b8470a] underline">upgrade your plan</Link> to create it.</>
                : 'You will see it once more before it is created.'}
            </p>
          </div>
        </form>

        {/* Live preview sticky on desktop (columns 8 to 12) */}
        <div className="hidden xl:block xl:col-span-5 sticky top-24">
          <div className="rounded-[20px] border border-[#dce1e8] bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#dce1e8]">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#5f6a7c]">Preview</span>
              <span className="h-2 w-1.5 rounded-[47%/35.6%] bg-[#ff6f07]" />
            </div>
            <RxSlip {...slipProps(formValues)} />
          </div>
        </div>
      </div>

      {/* Modal preview on small screens */}
      <Modal
        open={mobilePreviewOpen}
        onClose={() => setMobilePreviewOpen(false)}
        title="Preview"
        size="md"
      >
        <RxSlip {...slipProps(formValues)} />
      </Modal>

      {/* Review step before creating */}
      <Modal
        open={Boolean(review)}
        onClose={() => setReview(null)}
        dismissible={!mutation.isPending}
        title="Check before creating"
        size="md"
        footer={
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => setReview(null)}
              disabled={mutation.isPending}
            >
              Go back and edit
            </Button>
            <Button
              variant="accent"
              className="w-full sm:w-auto"
              loading={mutation.isPending}
              disabled={atLimit}
              onClick={() => review && mutation.mutate(review)}
            >
              Create {docName}
            </Button>
          </div>
        }
      >
        {review && (
          <div className="space-y-4">
            <RxSlip {...slipProps(review)} />
            <dl className="grid grid-cols-2 gap-3">
              <div className="rounded-[18px] border border-[#dce1e8] bg-[#f9f8f3] p-4">
                <dt className="text-xs font-semibold uppercase tracking-wider text-[#5f6a7c]">Fee</dt>
                <dd className="mt-1 font-display text-xl font-bold tabular-nums text-[#152839]">{formatPeso(review.amount)}</dd>
              </div>
              <div className="rounded-[18px] border border-[#dce1e8] bg-[#f9f8f3] p-4">
                <dt className="text-xs font-semibold uppercase tracking-wider text-[#5f6a7c]">PIN</dt>
                <dd className="mt-1 font-mono text-xl font-bold tracking-widest text-[#152839]">{review.pin}</dd>
              </div>
            </dl>
            <p className="flex items-start gap-2 text-sm text-[#7a2406]">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              You cannot edit the {docName} after it is created.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
