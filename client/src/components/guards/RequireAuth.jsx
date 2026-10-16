import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { PageLoader } from '../ui/Spinner';

export function RequireAuth({ redirectTo = '/login', children }) {
  const { session, loading } = useAuthStore();
  const location = useLocation();
  if (loading) return <PageLoader label="Checking your session" />;
  if (!session) return <Navigate to={redirectTo} replace state={{ from: location.pathname }} />;
  return children;
}
