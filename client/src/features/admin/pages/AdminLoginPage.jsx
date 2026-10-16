import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Lock, Mail, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { loginSchema } from '../../auth/schemas';
import { friendlyAuthError, signIn } from '../../auth/api';
import { useAuthStore } from '../../../store/authStore';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const { session, profile, loading } = useAuthStore();
  const signOut = useAuthStore((s) => s.signOut);
  const [showPw, setShowPw] = useState(false);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  if (!loading && session && profile?.role === 'admin') {
    return <Navigate to="/admin" replace />;
  }

  const onSubmit = async ({ email, password }) => {
    setServerError('');
    try {
      const profile = await signIn(email, password);
      if (!profile || profile.role !== 'admin') {
        await signOut();
        setServerError('Access denied: This account is not a Super Administrator. Please use the Doctor Portal.');
        return;
      }
      navigate('/admin', { replace: true });
    } catch (err) {
      setServerError(friendlyAuthError(err));
    }
  };

  return (
    <div className="mesh-bg flex min-h-screen flex-col items-center justify-center px-4 py-12 sm:px-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-1.5 text-xs font-semibold text-ink-600 shadow-sm ring-1 ring-ink-200 backdrop-blur transition hover:bg-white hover:text-ink-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Main Site
          </Link>
        </div>

        <div className="overflow-hidden rounded-3xl bg-white shadow-paper ring-1 ring-ink-200">
          {/* Admin Header Banner */}
          <div className="dark-panel p-6 text-white sm:p-8">
            <div className="flex items-center justify-between">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
                <ShieldCheck className="h-6 w-6 text-brand-300" />
              </span>
              <span className="rounded-full bg-brand-500/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand-300 ring-1 ring-brand-400/40">
                Restricted Portal
              </span>
            </div>
            <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Super Admin Portal
            </h1>
            <p className="mt-1 text-sm text-white/70">
              Administrative management &amp; doctor verification console.
            </p>
          </div>

          {/* Form */}
          <div className="p-6 sm:p-8">
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
              {serverError && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl bg-rose-50 p-3.5 text-sm font-medium text-rose-700 ring-1 ring-rose-200"
                >
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                  <span>{serverError}</span>
                </div>
              )}

              <div className="relative">
                <Input
                  label="Administrator Email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="admin@ereseta.ph"
                  className="pl-10"
                  error={errors.email?.message}
                  {...register('email')}
                />
                <Mail
                  className="pointer-events-none absolute left-3.5 top-[2.45rem] h-4 w-4 text-ink-400"
                  aria-hidden="true"
                />
              </div>

              <div className="relative">
                <Input
                  label="Password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="px-10"
                  error={errors.password?.message}
                  {...register('password')}
                />
                <Lock
                  className="pointer-events-none absolute left-3.5 top-[2.45rem] h-4 w-4 text-ink-400"
                  aria-hidden="true"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  className="absolute right-1 top-[1.65rem] inline-flex h-11 w-11 items-center justify-center rounded-lg text-ink-400 hover:text-ink-700"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              <Button type="submit" size="lg" variant="dark" className="mt-2 w-full" loading={isSubmitting}>
                Sign in to Admin Console
              </Button>
            </form>

            <div className="mt-6 border-t border-ink-100 pt-5 text-center">
              <p className="text-xs text-ink-500">
                Are you a doctor?{' '}
                <Link to="/login" className="font-semibold text-brand-700 hover:underline">
                  Go to Doctor Portal Login
                </Link>
              </p>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-ink-400">
          Protected under RA 10173 (Data Privacy Act of 2012). All administrative logins and actions are monitored.
        </p>
      </div>
    </div>
  );
}
