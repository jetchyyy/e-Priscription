import { Link, Navigate } from 'react-router-dom';
import { AuthShell } from '../components/AuthShell';
import { LoginForm } from '../components/LoginForm';
import { homeFor, useAuthStore } from '../../../store/authStore';
import { PageLoader } from '../../../components/ui/Spinner';

export default function LoginPage() {
  const { session, profile, loading } = useAuthStore();
  // The installed app opens on /login. Until the saved session is checked, keep the launch splash up
  // (PageLoader holds it) so a signed-in user goes straight to their dashboard without seeing this form.
  if (loading) return <PageLoader label="Checking your session" />;
  if (session && profile) return <Navigate to={homeFor(profile)} replace />;

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
        </>
      )}
    >
      <LoginForm />
    </AuthShell>
  );
}
