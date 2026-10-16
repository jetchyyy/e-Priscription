import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Hourglass, LogOut, RefreshCw, UploadCloud, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { PublicLayout } from '../../../components/layout/PublicLayout';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { useAuthStore } from '../../../store/authStore';
import { uploadLicense } from '../api';
import { LICENSE_TYPES } from '../schemas';

/** Shown to doctors who are signed in but not yet approved (or rejected). */
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

  const onRefresh = async () => {
    setChecking(true);
    const p = await refreshProfile();
    setChecking(false);
    if (p?.status === 'pending') toast.info('Still pending. We’ll notify you once reviewed.');
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
    <PublicLayout maxWidth="max-w-xl">
      <Card className="mt-6 text-center sm:!p-10">
        <span className={`mx-auto inline-flex h-20 w-20 items-center justify-center rounded-3xl ${rejected ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
          {rejected ? <XCircle className="h-10 w-10" aria-hidden="true" /> : <Hourglass className="h-10 w-10 animate-pulse" aria-hidden="true" />}
        </span>
        <h1 className="mt-5 text-2xl font-semibold text-ink-900">
          {rejected ? 'Registration not approved' : 'Awaiting approval'}
        </h1>
        <p className="mt-2 text-ink-600">
          {rejected
            ? 'The administrator could not approve your registration.'
            : <>Hi <strong>{profile?.full_name}</strong>, your registration is being reviewed. You can issue prescriptions as soon as your PRC license is verified.</>}
        </p>
        {rejected && profile?.reject_reason && (
          <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-left text-sm text-rose-800 ring-1 ring-rose-200">
            <strong>Reason:</strong> {profile.reject_reason}
          </p>
        )}

        {!profile?.license_file_path && (
          <form onSubmit={handleSubmit(onUpload)} className="mt-6 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/60 p-4 text-left">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
              <UploadCloud className="h-4 w-4" aria-hidden="true" /> PRC license still needed
            </p>
            <p className="mt-1 text-xs text-amber-900/80">Upload a photo or PDF of your PRC ID so we can verify you.</p>
            <input type="file" accept="image/jpeg,image/png,application/pdf" aria-label="PRC license file"
              className="mt-3 block w-full text-sm file:mr-3 file:min-h-10 file:rounded-lg file:border-0 file:bg-ink-900 file:px-4 file:text-sm file:font-medium file:text-white"
              {...register('file')} />
            <Button type="submit" size="sm" className="mt-3" loading={uploading} disabled={!file}>Upload license</Button>
          </form>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button variant="secondary" onClick={onRefresh} loading={checking}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Check status
          </Button>
          <Button variant="ghost" onClick={async () => { await signOut(); navigate('/login', { replace: true }); }}>
            <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
          </Button>
        </div>
      </Card>
    </PublicLayout>
  );
}
