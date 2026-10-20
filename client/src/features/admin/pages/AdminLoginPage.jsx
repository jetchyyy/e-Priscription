import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AuthField, AuthShell } from '../../auth/components/AuthShell';
import { loginSchema } from '../../auth/schemas';
import { friendlyAuthError, signIn } from '../../auth/api';
import { useAuthStore } from '../../../store/authStore';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const { session, profile, loading } = useAuthStore();
  const signOut = useAuthStore((s) => s.signOut);
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
        setServerError('This account is not an administrator. Doctors sign in on the doctor page.');
        return;
      }
      navigate('/admin', { replace: true });
    } catch (err) {
      setServerError(friendlyAuthError(err));
    }
  };

  return (
    <AuthShell
      title="Administrator sign in"
      tabTitle="Administrator sign in"
      lead="Restricted to ODYSSEY administrators. Sign-ins and actions here are logged."
      sideTitle="Every doctor checked first"
      sideText="Review PRC licenses, approve doctors and keep the platform trustworthy."
      footer={<p>Are you a doctor? <Link to="/login" className="link">Go to doctor sign in</Link></p>}
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="aform">
        {serverError && <div role="alert" className="aform__error">{serverError}</div>}
        <AuthField
          label="Administrator email"
          type="email"
          autoComplete="email"
          inputMode="email"
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
          {isSubmitting ? 'Signing in…' : 'Sign in to the console'}
        </button>
      </form>
    </AuthShell>
  );
}
