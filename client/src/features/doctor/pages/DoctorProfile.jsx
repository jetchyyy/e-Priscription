import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { CheckCircle2, IdCard, Save, Stethoscope, Building2, Phone, FileCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input, Select } from '../../../components/ui/Input';
import { useAuthStore } from '../../../store/authStore';
import { updateDoctorProfile } from '../api';
import { doctorTitle } from '../../../lib/utils';

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

export default function DoctorProfile() {
  const { profile, refreshProfile } = useAuthStore();
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
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
      await updateDoctorProfile(values);
      await refreshProfile();
      toast.success('Doctor & clinic credentials updated successfully!');
    } catch (err) {
      toast.error(err?.message || 'Failed to update credentials. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900 sm:text-3xl">Doctor &amp; Clinic Credentials</h1>
        <p className="mt-1 text-ink-600">
          These details are automatically printed on every Philippine prescription (℞) you issue.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Form Column */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 lg:col-span-2">
          {/* Identity & License */}
          <Card className="space-y-4 sm:!p-6">
            <h2 className="flex items-center gap-2 text-base font-semibold text-ink-900">
              <IdCard className="h-5 w-5 text-brand-600" /> Professional Identity &amp; Licenses
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Full name & degree"
                required
                placeholder="Juan Dela Cruz, MD"
                wrapperClassName="sm:col-span-2"
                {...register('fullName', { required: true })}
              />

              <Select label="Medical specialty" {...register('specialty')}>
                <option value="">Select specialty…</option>
                {SPECIALTIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>

              <Input
                label="PRC license no."
                required
                placeholder="0123456"
                hint="Required by PRC &amp; FDA"
                {...register('prcNo', { required: true })}
              />

              <Input
                label="PTR no. (Professional Tax Receipt)"
                placeholder="7654321"
                hint="Annual LGU PTR"
                {...register('ptrNo')}
              />

              <Input
                label="PDEA S2 license no."
                placeholder="S2-XXXX-XXXX"
                hint="Required if prescribing dangerous drugs"
                {...register('s2No')}
              />
            </div>
          </Card>

          {/* Clinic Details */}
          <Card className="space-y-4 sm:!p-6">
            <h2 className="flex items-center gap-2 text-base font-semibold text-ink-900">
              <Building2 className="h-5 w-5 text-brand-600" /> Clinic / Hospital Header
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Clinic or hospital name"
                required
                placeholder="e.g. St. Jude Family Medical Clinic"
                wrapperClassName="sm:col-span-2"
                {...register('clinicName', { required: true })}
              />

              <Input
                label="Clinic address"
                required
                placeholder="Room / Unit, Building, Street, City"
                wrapperClassName="sm:col-span-2"
                {...register('clinicAddress', { required: true })}
              />

              <Input
                label="Clinic telephone / mobile"
                placeholder="0917 123 4567 / (02) 8123 4567"
                wrapperClassName="sm:col-span-2"
                {...register('phone')}
              />
            </div>
          </Card>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button type="submit" size="lg" loading={saving}>
              <Save className="h-4 w-4" /> Save Credentials
            </Button>
          </div>
        </form>

        {/* Live Preview Column */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
            Live Prescription Preview
          </h2>

          <div className="rx-paper overflow-hidden rounded-2xl p-5 text-xs text-ink-800 shadow-paper ring-1 ring-ink-200">
            {/* Header Preview */}
            <div className="text-center">
              <p className="font-rx text-base font-bold text-brand-900">
                {live.clinicName || 'Clinic Name'}
              </p>
              <p className="mt-1 font-semibold text-ink-900">{doctorTitle(live.fullName || 'Doctor Name')}</p>
              {live.specialty && (
                <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-700">
                  {live.specialty}
                </p>
              )}
              <p className="mt-1 text-[11px] text-ink-500">
                {[live.clinicAddress || 'Clinic Address', live.phone && `Tel: ${live.phone}`]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>

            <div className="my-3 border-y border-double border-brand-600/40" />

            <div className="my-4 text-center font-rx text-3xl font-bold text-brand-600">℞</div>

            <p className="text-center italic text-ink-400">[ Patient medications will appear here ]</p>

            {/* Signature Preview */}
            <div className="mt-6 border-t border-ink-200 pt-4 text-center">
              <p className="font-script text-xl text-ink-800">{live.fullName || 'Doctor Signature'}</p>
              <div className="mx-auto my-1 w-32 border-t border-ink-800" />
              <p className="font-semibold text-ink-900">{doctorTitle(live.fullName || 'Doctor Name')}</p>
              <div className="mt-1 space-y-0.5 text-[10px] text-ink-600">
                <p>
                  PRC Lic. No.: <span className="font-semibold text-ink-800">{live.prcNo || '—'}</span>
                </p>
                {live.ptrNo && (
                  <p>
                    PTR No.: <span className="font-semibold text-ink-800">{live.ptrNo}</span>
                  </p>
                )}
                {live.s2No && (
                  <p>
                    S2 No.: <span className="font-semibold text-ink-800">{live.s2No}</span>
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-amber-50 p-3.5 text-xs text-amber-800 ring-1 ring-amber-200">
            <p className="font-semibold">PRC &amp; FDA Compliance Note</p>
            <p className="mt-1">
              Under Philippine regulations, prescriptions without a legible physician name, PRC license number,
              and clinic address cannot be dispensed by licensed pharmacies.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
