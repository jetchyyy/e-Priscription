import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/Button';
import { Input, Select, Textarea } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { useAuthStore } from '../../../store/authStore';
import { cancelProfileChange, fetchMyChangeRequests, requestProfileChange, updateDoctorProfile } from '../api';
import { RxSlip } from '../../marketing/components';
import { formatShortDate } from '../../../lib/utils';

const SPECIALTIES = [
  'General Practitioner',
  'Internal Medicine',
  'Pediatrics',
  'Obstetrics & Gynecology',
  'Family Medicine',
  'Cardiology',
  'Dermatology',
  'ENT – Otolaryngology',
  'Ophthalmology',
  'Orthopedics',
  'Psychiatry',
  'Surgery',
  'Dentistry',
  'Other',
];

const LABELS = { full_name: 'Full name and degree', prc_no: 'PRC license no.', specialty: 'Medical specialty', s2_no: 'PDEA S2 license no.' };
const LICENSE_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

function VerifiedRow({ label, value }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[200px_1fr] sm:gap-4">
      <dt className="text-sm text-[#45546a]">{label}</dt>
      <dd className="text-[15px] font-medium text-[#152839]">{value || <span className="text-[#5f6a7c]">Not provided</span>}</dd>
    </div>
  );
}

/** Modal form: the doctor proposes new values for verified fields; an administrator reviews them. */
function ChangeRequestModal({ open, onClose, profile }) {
  const qc = useQueryClient();
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const { register, handleSubmit, watch, reset } = useForm({
    defaultValues: {
      full_name: profile?.full_name ?? '',
      prc_no: profile?.prc_no ?? '',
      specialty: profile?.specialty ?? '',
      s2_no: profile?.s2_no ?? '',
      reason: '',
    },
  });

  useEffect(() => {
    if (open) {
      reset({ full_name: profile?.full_name ?? '', prc_no: profile?.prc_no ?? '', specialty: profile?.specialty ?? '', s2_no: profile?.s2_no ?? '', reason: '' });
      setFile(null);
      setError('');
    }
  }, [open, profile, reset]);

  const values = watch();
  const changed = Object.keys(LABELS).filter((k) => (values[k] ?? '').trim() !== (profile?.[k] ?? ''));
  const needsDocument = changed.includes('full_name') || changed.includes('prc_no');

  const send = useMutation({
    mutationFn: requestProfileChange,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['doctor', 'change-requests'] });
      toast.success('Change request sent. An administrator will review it.');
      onClose();
    },
    onError: (e) => setError(e?.message || 'Could not send the request. Please try again.'),
  });

  const onSubmit = (v) => {
    setError('');
    if (!changed.length) return setError('Change at least one detail before sending.');
    if (needsDocument && !file) return setError('Attach a photo or PDF of your current PRC ID for a name or PRC number change.');
    if (file && (!LICENSE_TYPES.includes(file.type) || file.size > 5 * 1024 * 1024)) return setError('Use a JPG, PNG or PDF file of 5 MB or less.');
    const changes = Object.fromEntries(changed.map((k) => [k, v[k].trim()]));
    send.mutate({ changes, reason: v.reason.trim(), file: needsDocument ? file : null });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Request a change to verified details"
      description="An administrator checks the change before it appears on new prescriptions. Prescriptions you already sent keep the details they were issued with."
      footer={(
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={send.isPending} onClick={handleSubmit(onSubmit)}>Send request</Button>
        </div>
      )}
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {error && <div role="alert" className="rounded-[16px] bg-[#fbe9e1] p-4 text-sm text-[#7a2406]">{error}</div>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input wrapperClassName="sm:col-span-2" label={LABELS.full_name} {...register('full_name')} />
          <Select label={LABELS.specialty} {...register('specialty')}>
            <option value="">Select specialty…</option>
            {SPECIALTIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Input label={LABELS.prc_no} inputMode="numeric" {...register('prc_no')} />
          <Input label={LABELS.s2_no} hint="Leave empty if you do not hold one" {...register('s2_no')} />
        </div>

        {needsDocument && (
          <div>
            <label htmlFor="change-doc" className="mb-1.5 block text-sm font-medium text-[#152839]">
              Current PRC ID <span className="text-[#b8470a]" aria-hidden="true">*</span>
            </label>
            <input
              id="change-doc"
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full rounded-[16px] border border-dashed border-[#c8d0db] bg-[#f9f8f3] p-3 text-sm text-[#152839]"
            />
            <p className="mt-1.5 text-xs text-[#5f6a7c]">Needed for a name or PRC number change. JPG, PNG or PDF, up to 5 MB.</p>
          </div>
        )}

        <Textarea label="Reason for the change" rows={2} maxLength={500}
          placeholder="e.g. Name changed after marriage; new specialty certification" {...register('reason')} />

        {changed.length > 0 && (
          <p className="text-sm text-[#45546a]">
            You are changing: {changed.map((k) => LABELS[k]).join(', ')}.
          </p>
        )}
      </form>
    </Modal>
  );
}

export default function DoctorProfile() {
  const { profile, refreshProfile } = useAuthStore();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const verifiedLocked = profile?.status === 'approved';

  const requests = useQuery({
    queryKey: ['doctor', 'change-requests'],
    queryFn: fetchMyChangeRequests,
    enabled: verifiedLocked,
  });
  const latest = requests.data?.[0];
  const pending = latest?.status === 'pending' ? latest : null;

  const cancel = useMutation({
    mutationFn: cancelProfileChange,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['doctor', 'change-requests'] }); toast.success('Change request withdrawn'); },
    onError: (e) => toast.error(e?.message || 'Could not withdraw the request.'),
  });

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { isDirty },
  } = useForm({
    values: {
      fullName: profile?.full_name ?? '',
      specialty: profile?.specialty ?? '',
      prcNo: profile?.prc_no ?? '',
      ptrNo: profile?.ptr_no ?? '',
      s2No: profile?.s2_no ?? '',
      clinicName: profile?.clinic_name ?? '',
      clinicAddress: profile?.clinic_address ?? '',
      phone: profile?.phone ?? '',
    },
  });

  const live = watch();

  const onSubmit = async (values) => {
    setSaving(true);
    try {
      await updateDoctorProfile(values, { verifiedLocked });
      await refreshProfile();
      reset(values);
      toast.success('Details saved');
    } catch (err) {
      toast.error(err?.message || 'Could not save your details. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[32px] font-bold text-[#152839]">Doctor and clinic details</h1>
        <p className="mt-1 text-sm text-[#45546a]">
          These details print on every new prescription you issue. Prescriptions already sent keep the details they were issued with.
        </p>
      </div>

      <div className="grid items-start gap-8 lg:grid-cols-12">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 lg:col-span-7">
          {verifiedLocked ? (
            <section data-tour="license-fields" aria-labelledby="verified-h" className="space-y-4 rounded-[20px] border border-[#dce1e8] bg-white p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 id="verified-h" className="font-display text-xl font-semibold text-[#152839]">Verified identity and licenses</h2>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-[#45546a]">
                    <Lock className="h-4 w-4" aria-hidden="true" /> Checked by an administrator. Change these through a request.
                  </p>
                </div>
                <Button variant="secondary" onClick={() => setRequesting(true)} disabled={Boolean(pending)}>Request a change</Button>
              </div>

              <dl className="space-y-1">
                <VerifiedRow label={LABELS.full_name} value={profile?.full_name} />
                <VerifiedRow label={LABELS.specialty} value={profile?.specialty} />
                <VerifiedRow label={LABELS.prc_no} value={profile?.prc_no} />
                <VerifiedRow label={LABELS.s2_no} value={profile?.s2_no} />
              </dl>

              {pending && (
                <div role="status" className="rounded-[16px] bg-[#ece7de] p-4 text-sm text-[#152839]">
                  <p className="font-semibold">Change requested on {formatShortDate(pending.created_at)}, waiting for review</p>
                  <ul className="mt-2 space-y-1">
                    {Object.entries(pending.changes).map(([k, v]) => (
                      <li key={k}>{LABELS[k]}: <span className="text-[#45546a]">{pending.previous?.[k] || 'none'}</span> → <strong>{v || 'none'}</strong></li>
                    ))}
                  </ul>
                  <button type="button" className="mt-3 font-semibold text-[#b8470a] underline-offset-2 hover:underline"
                    onClick={() => cancel.mutate(pending.id)} disabled={cancel.isPending}>
                    Withdraw request
                  </button>
                </div>
              )}
              {!pending && latest?.status === 'rejected' && (
                <div className="rounded-[16px] bg-[#fbe9e1] p-4 text-sm text-[#7a2406]">
                  <p className="font-semibold">Your last change request was not approved</p>
                  {latest.review_note && <p className="mt-1">{latest.review_note}</p>}
                </div>
              )}
              {!pending && latest?.status === 'approved' && latest.reviewed_at && (
                <p className="text-sm text-[#45546a]">Your last change request was approved on {formatShortDate(latest.reviewed_at)}.</p>
              )}
            </section>
          ) : (
            <section data-tour="license-fields" className="space-y-4 rounded-[20px] border border-[#dce1e8] bg-white p-6">
              <h2 className="font-display text-xl font-semibold text-[#152839]">Professional identity and licenses</h2>
              <p className="text-sm text-[#45546a]">You can edit these until an administrator approves your account. After that, changes go through a request.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label={LABELS.full_name} required placeholder="Juan Dela Cruz, MD" wrapperClassName="sm:col-span-2" {...register('fullName', { required: true })} />
                <Select label={LABELS.specialty} {...register('specialty')}>
                  <option value="">Select specialty…</option>
                  {SPECIALTIES.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
                <Input label={LABELS.prc_no} required placeholder="0123456" {...register('prcNo', { required: true })} />
                <Input label={LABELS.s2_no} placeholder="S2-XXXX-XXXX" hint="Only if you prescribe dangerous drugs" {...register('s2No')} />
              </div>
            </section>
          )}

          <section data-tour="clinic-panel" aria-labelledby="clinic-h" className="space-y-4 rounded-[20px] border border-[#dce1e8] bg-white p-6">
            <div>
              <h2 id="clinic-h" className="font-display text-xl font-semibold text-[#152839]">Clinic and tax receipt</h2>
              <p className="mt-1 text-sm text-[#45546a]">You can update these yourself at any time.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Clinic or hospital name" required placeholder="e.g. St. Jude Family Medical Clinic" wrapperClassName="sm:col-span-2"
                {...register('clinicName', { required: true })} />
              <Input label="Clinic address" required placeholder="Room / Unit, Building, Street, City" wrapperClassName="sm:col-span-2"
                {...register('clinicAddress', { required: true })} />
              <Input label="Clinic telephone / mobile" placeholder="0917 123 4567 / (02) 8123 4567" {...register('phone')} />
              <Input label="PTR no. (Professional Tax Receipt)" placeholder="7654321" hint="Renewed every year with your LGU" {...register('ptrNo')} />
            </div>
          </section>

          <div data-tour="profile-save" className="pt-2">
            <Button type="submit" variant="primary" size="lg" loading={saving} disabled={!isDirty}>
              <Save className="h-4 w-4" aria-hidden="true" /> Save changes
            </Button>
          </div>
        </form>

        <div className="sticky top-24 hidden lg:col-span-5 lg:block">
          <div className="space-y-4 rounded-[20px] border border-[#dce1e8] bg-white p-6">
            <h2 className="font-display text-base font-semibold text-[#152839]">Letterhead on new prescriptions</h2>
            <RxSlip
              stage="written"
              clinicName={live.clinicName}
              doctorName={verifiedLocked ? profile?.full_name : live.fullName}
              specialty={verifiedLocked ? profile?.specialty : live.specialty}
              prcNo={verifiedLocked ? profile?.prc_no : live.prcNo}
              ptrNo={live.ptrNo}
            />
            <p className="rounded-[16px] bg-[#f9f8f3] p-4 text-xs text-[#5f6a7c]">
              Pharmacies need a legible physician name, PRC license number and clinic address on the prescription.
            </p>
          </div>
        </div>
      </div>

      {verifiedLocked && <ChangeRequestModal open={requesting} onClose={() => setRequesting(false)} profile={profile} />}
    </div>
  );
}
