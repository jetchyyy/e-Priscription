import { Navigate } from 'react-router-dom';
import { homeFor, useAuthStore } from '../../store/authStore';
import { RequireAuth } from './RequireAuth';

/**
 * Role guard. `approved` additionally requires an approved doctor account.
 * (The database enforces the same rules with RLS - this is only for UX.)
 */
export function RequireRole({ role, approved = false, children }) {
  const profile = useAuthStore((s) => s.profile);
  const fallback = role === 'admin' ? '/admin/login' : '/login';

  return (
    <RequireAuth redirectTo={fallback}>
      {!profile || profile.role !== role ? (
        <Navigate to={role === 'admin' ? '/admin/login' : homeFor(profile)} replace />
      ) : approved && profile.status !== 'approved' ? (
        <Navigate to="/doctor/pending" replace />
      ) : (
        children
      )}
    </RequireAuth>
  );
}
