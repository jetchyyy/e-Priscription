import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { AuthField } from './AuthShell';
import { loginSchema } from '../schemas';
import { friendlyAuthError, signIn } from '../api';
import { homeFor } from '../../../store/authStore';

export function LoginForm() {
  const navigate = useNavigate();
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
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="aform">
      {serverError && <div role="alert" className="aform__error">{serverError}</div>}
      <AuthField
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="you@clinic.ph"
        error={errors.email?.message}
        {...register('email')}
      />
      <AuthField
        label="Password"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <button type="submit" className="btn aform__submit" disabled={isSubmitting}>
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
