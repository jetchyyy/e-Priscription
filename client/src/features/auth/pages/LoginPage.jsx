import { Link, Navigate } from 'react-router-dom';
import { AuthShell } from '../components/AuthShell';
import { LoginForm } from '../components/LoginForm';
import { homeFor, useAuthStore } from '../../../store/authStore';

export default function LoginPage() {
  const { session, profile, loading } = useAuthStore();
  if (!loading && session && profile) return <Navigate to={homeFor(profile)} replace />;

  return (
    <AuthShell
      title="Sign in"
      lead="Welcome back. Pick up where you left off with your prescriptions."
      sideTitle="Your prescriptions, sent as a link"
      sideText="Write the Rx, send it by Viber or SMS, and see the moment your patient pays and opens it."
      footer={(
        <>
          <p>New doctor? <Link to="/doctor/register" className="link">Register with your PRC license</Link></p>
          <p>Patient? Open the link your doctor sent. You do not need an account.</p>
          <p><Link to="/admin/login" className="link">Administrator sign in</Link></p>
        </>
      )}
    >
      <LoginForm />
    </AuthShell>
  );
}
