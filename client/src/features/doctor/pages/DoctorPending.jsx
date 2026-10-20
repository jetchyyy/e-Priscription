import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { LogOut, RefreshCw, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/Button';
import { useAuthStore } from '../../../store/authStore';
import { uploadLicense } from '../api';
import { LICENSE_TYPES } from '../schemas';
import { Ody, Lockup } from '../../marketing/components';

const STEPS = [
  { id: 'reg', label: 'Registered' },
  { id: 'upload', label: 'License uploaded' },
  { id: 'review', label: 'Admin review' },
  { id: 'approved', label: 'Approved' },
];

/** Shown to doctors who are signed in but not yet approved (or rejected). Follows section 11.8. */
export default function DoctorPending() {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const session = useAuthStore((s) => s.session);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const signOut = useAuthStore((s) => s.signOut);
  const [checking, setChecking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { register, handleSubmit, watch } = useForm();
  const file = watch('file')?.[0];

  if (profile?.status === 'approved') return <Navigate to="/doctor" replace />;
  const rejected = profile?.status === 'rejected';

  // Determine current step in the linked steps
  const currentStep = rejected
    ? 2
    : !profile?.license_file_path
    ? 1
    : 2;

  const onRefresh = async () => {
    setChecking(true);
    const p = await refreshProfile();
    setChecking(false);
    if (p?.status === 'pending') toast.info('We’ll email you when you’re approved.');
  };

  const onUpload = async ({ file: files }) => {
    const f = files?.[0];
    if (!f) return;
    if (!LICENSE_TYPES.includes(f.type) || f.size > 5 * 1024 * 1024) {
      return toast.error('Use a JPG, PNG or PDF file up to 5 MB.');
    }
    setUploading(true);
    try {
      await uploadLicense(session.user.id, f);
      await refreshProfile();
      toast.success('License uploaded. Thank you!');
    } catch {
      toast.error('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="ody min-h-screen bg-[#f9f8f3] text-[#152839] flex flex-col justify-between p-4 sm:p-8">
      <header className="mx-auto w-full max-w-4xl py-4 flex items-center justify-between">
        <Lockup />
        <button
          type="button"
          onClick={async () => {
            await signOut();
            navigate('/login', { replace: true });
          }}
          className="text-sm font-medium text-[#45546a] hover:text-[#152839] flex items-center gap-1.5"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </header>

      <main className="mx-auto w-full max-w-2xl py-8">
        <div className="rounded-[20px] border border-[#dce1e8] bg-white p-6 sm:p-10 text-center space-y-6">
          {/* Linked steps row (section 11.8: rounded shapes sharing one wall) */}
          <div className="flex items-center justify-center overflow-x-auto pb-2">
            <div className="inline-flex rounded-full border border-[#dce1e8] bg-[#f9f8f3] p-1">
              {STEPS.map((s, idx) => (
                <span
                  key={s.id}
                  className={`rounded-full px-3.5 py-1 text-xs font-semibold transition ${
                    idx === currentStep
                      ? 'bg-[#ff6f07] text-[#152839]'
                      : idx < currentStep
                      ? 'bg-[#152839] text-[#f9f8f3]'
                      : 'text-[#5f6a7c]'
                  }`}
                >
                  {s.label}
                </span>
              ))}
            </div>
          </div>

          {/* Allowed Ody moment (section 11.8: Ody thinking at 100px) */}
          {!rejected && (
            <div className="flex justify-center pt-2">
              <Ody mood="thinking" alt="Ody mascot thinking" className="w-[100px]" />
            </div>
          )}

          <div>
            <h1 className="font-display text-2xl font-bold text-[#152839]">
              {rejected ? 'Registration not approved' : "We're checking your PRC license"}
            </h1>
            <p className="mt-2 text-sm text-[#45546a]">
              {rejected
                ? 'The administrator could not approve your registration.'
                : 'This usually takes one to two business days. We’ll email you when you’re approved.'}
            </p>
          </div>

          {rejected && profile?.reject_reason && (
            <div className="rounded-[18px] border border-[#f3c2af] bg-[#fbe9e1] p-4 text-left text-sm text-[#7a2406]">
              <strong>Reason:</strong> {profile.reject_reason}
            </div>
          )}

          {!profile?.license_file_path && (
            <form
              onSubmit={handleSubmit(onUpload)}
              className="rounded-[18px] border border-[#dce1e8] bg-[#f9f8f3] p-5 text-left space-y-3"
            >
              <p className="flex items-center gap-2 text-sm font-semibold text-[#152839]">
                <UploadCloud className="h-4 w-4 text-[#ff6f07]" aria-hidden="true" /> PRC license still needed
              </p>
              <p className="text-xs text-[#5f6a7c]">
                Upload a JPG, PNG or PDF photo of your PRC ID (up to 5 MB).
              </p>
              <input
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                aria-label="PRC license file"
                className="block w-full text-sm file:mr-3 file:min-h-10 file:rounded-full file:border-0 file:bg-[#152839] file:px-4 file:text-sm file:font-semibold file:text-[#f9f8f3] cursor-pointer"
                {...register('file')}
              />
              <Button type="submit" variant="primary" size="sm" loading={uploading} disabled={!file}>
                Upload license
              </Button>
            </form>
          )}

          <div className="pt-4 border-t border-[#dce1e8] flex justify-center gap-3">
            <Button variant="secondary" onClick={onRefresh} loading={checking}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Check status
            </Button>
          </div>
        </div>
      </main>

      <footer className="text-center text-xs text-[#5f6a7c] py-4">
        Protected under the Data Privacy Act of 2012 (RA 10173).
      </footer>
    </div>
  );
}
