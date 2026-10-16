import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { loginSchema } from '../schemas';
import { friendlyAuthError, signIn } from '../api';
import { homeFor } from '../../../store/authStore';

export function LoginForm() {
  const navigate = useNavigate();
  const [showPw, setShowPw] = useState(false);
  const [serverError, setServerError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });

  const onSubmit = async ({ email, password }) => {
    setServerError('');
    try {
      const profile = await signIn(email, password);
      navigate(homeFor(profile), { replace: true });
    } catch (err) {
      setServerError(friendlyAuthError(err));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {serverError && (
        <div role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
          {serverError}
        </div>
      )}
      <div className="relative">
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@clinic.ph"
          className="pl-10"
          error={errors.email?.message}
          {...register('email')}
        />
        <Mail className="pointer-events-none absolute left-3.5 top-[2.45rem] h-4 w-4 text-ink-400" aria-hidden="true" />
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
        <Lock className="pointer-events-none absolute left-3.5 top-[2.45rem] h-4 w-4 text-ink-400" aria-hidden="true" />
        <button
          type="button"
          onClick={() => setShowPw((v) => !v)}
          aria-label={showPw ? 'Hide password' : 'Show password'}
          className="absolute right-1 top-[1.65rem] inline-flex h-11 w-11 items-center justify-center rounded-lg text-ink-400 hover:text-ink-700"
        >
          {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
        Sign in
      </Button>
      <p className="text-center text-sm text-ink-500">
        New doctor?{' '}
        <Link to="/doctor/register" className="font-semibold text-brand-700 hover:underline">
          Register for an account
        </Link>
      </p>
    </form>
  );
}
