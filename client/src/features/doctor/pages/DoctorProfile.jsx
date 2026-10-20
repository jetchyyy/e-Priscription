import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { IdCard, Save, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input, Select } from '../../../components/ui/Input';
import { useAuthStore } from '../../../store/authStore';
import { updateDoctorProfile } from '../api';
import { doctorTitle } from '../../../lib/utils';
import { RxSlip } from '../../marketing/components';

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
      await updateDoctorProfile(values);
      await refreshProfile();
      reset(values);
      toast.success('Details saved');
    } catch (err) {
      toast.error(err?.message || 'Failed to update credentials. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[32px] font-bold text-[#152839]">Doctor and clinic details</h1>
        <p className="mt-1 text-sm text-[#45546a]">
          These credentials print on every prescription you issue.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-12 items-start">
        {/* Form Column (cols 1 to 7) */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 lg:col-span-7">
          {/* Professional Identity & Licenses (data-tour="license-fields") */}
          <div data-tour="license-fields" className="rounded-[20px] border border-[#dce1e8] bg-white p-6 space-y-4">
            <h2 className="font-display text-xl font-semibold text-[#152839]">
              Professional identity and licenses
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
                hint="Required by PRC and FDA"
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
          </div>

          {/* Clinic Details (data-tour="clinic-panel") */}
          <div data-tour="clinic-panel" className="rounded-[20px] border border-[#dce1e8] bg-white p-6 space-y-4">
            <h2 className="font-display text-xl font-semibold text-[#152839]">
              Clinic
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
          </div>

          {/* Save button container (data-tour="profile-save") */}
          <div data-tour="profile-save" className="pt-2">
            <Button type="submit" variant="primary" size="lg" loading={saving}>
              <Save className="h-4 w-4" /> Save changes
            </Button>
          </div>
        </form>

        {/* Live Preview Column (cols 8 to 12) */}
        <div className="hidden lg:block lg:col-span-5 sticky top-24">
          <div className="rounded-[20px] border border-[#dce1e8] bg-white p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#dce1e8]">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#5f6a7c]">
                Letterhead preview
              </span>
              <span className="h-2 w-1.5 rounded-[47%/35.6%] bg-[#ff6f07]" />
            </div>

            <RxSlip
              stage="written"
              clinicName={live.clinicName}
              doctorName={live.fullName}
              specialty={live.specialty}
              prcNo={live.prcNo}
              ptrNo={live.ptrNo}
            />

            <div className="rounded-[16px] bg-[#f9f8f3] p-4 text-xs text-[#5f6a7c] border border-[#dce1e8]">
              <p className="font-semibold text-[#152839]">PRC and FDA Compliance Note</p>
              <p className="mt-1">
                Under Philippine regulations, prescriptions without a legible physician name, PRC license number,
                and clinic address cannot be dispensed by licensed pharmacies.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
