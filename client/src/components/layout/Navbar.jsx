import { useState, useRef, useEffect } from 'react';
import { Menu, LogOut, Compass, User } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { Logo } from '../ui/Logo';
import { useAuthStore } from '../../store/authStore';

export function Navbar({ onMenu, onOpenGuide }) {
  const profile = useAuthStore((s) => s.profile);
  const signOut = useAuthStore((s) => s.signOut);
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-[#dce1e8] bg-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          onClick={onMenu}
          aria-label="Open navigation menu"
          className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-xl text-[#152839] hover:bg-[#ece7de] lg:hidden"
        >
          <Menu className="h-6 w-6" />
        </button>
        <Logo to={profile?.role === 'admin' ? '/admin' : '/doctor'} />
        <div className="ml-auto flex items-center gap-3">
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setUserMenuOpen((prev) => !prev)}
              aria-expanded={userMenuOpen}
              aria-label="User menu"
              className="flex items-center gap-2 rounded-full border border-[#dce1e8] bg-white py-1.5 pl-3 pr-2 text-sm font-medium text-[#152839] transition hover:bg-[#ece7de]"
            >
              <span className="max-w-[12rem] truncate font-semibold">
                {profile?.full_name || profile?.email}
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#ece7de] text-xs font-bold text-[#152839]">
                {(profile?.full_name || profile?.email || 'U')[0].toUpperCase()}
              </span>
            </button>

            {userMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-56 rounded-2xl border border-[#dce1e8] bg-white p-2 shadow-xl z-50 animate-fade-in"
              >
                <div className="px-3 py-2 border-b border-[#dce1e8] text-xs text-[#5f6a7c]">
                  <p className="font-semibold text-[#152839] truncate">{profile?.full_name}</p>
                  <p className="truncate">{profile?.email}</p>
                  <p className="mt-1 font-medium text-[#152839]">{profile?.role === 'admin' ? 'Administrator' : 'PRC Doctor'}</p>
                </div>
                {profile?.role === 'doctor' && (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setUserMenuOpen(false);
                        onOpenGuide?.();
                      }}
                      className="mt-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-[#152839] hover:bg-[#ece7de]"
                    >
                      <Compass className="h-4 w-4 text-[#ff6f07]" />
                      <span>Show me around</span>
                    </button>
                    <Link
                      to="/doctor/profile"
                      role="menuitem"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-[#152839] hover:bg-[#ece7de]"
                    >
                      <User className="h-4 w-4 text-[#45546a]" />
                      <span>Profile & Clinic</span>
                    </Link>
                  </>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-[#a3330a] hover:bg-[#fbe9e1]"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
