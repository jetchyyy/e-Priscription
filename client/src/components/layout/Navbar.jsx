import { Menu, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../ui/Logo';
import { Badge } from '../ui/Badge';
import { useAuthStore } from '../../store/authStore';

export function Navbar({ onMenu }) {
  const profile = useAuthStore((s) => s.profile);
  const signOut = useAuthStore((s) => s.signOut);
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-30 border-b border-ink-100 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          onClick={onMenu}
          aria-label="Open navigation menu"
          className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-xl text-ink-700 hover:bg-ink-100 lg:hidden"
        >
          <Menu className="h-6 w-6" />
        </button>
        <Logo to={profile?.role === 'admin' ? '/admin' : '/doctor'} />
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="max-w-[14rem] truncate text-sm font-semibold text-ink-900">{profile?.full_name || profile?.email}</p>
            <p className="max-w-[14rem] truncate text-xs text-ink-500">{profile?.email}</p>
          </div>
          <Badge tone={profile?.role === 'admin' ? 'info' : 'success'} dot={false} className="hidden sm:inline-flex">
            {profile?.role === 'admin' ? 'Super Admin' : 'Doctor'}
          </Badge>
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Sign out"
            className="inline-flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-ink-700 hover:bg-ink-100"
          >
            <LogOut className="h-5 w-5" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
