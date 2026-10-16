import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { LayoutDashboard, FilePlus2, ShieldCheck, Stethoscope, QrCode } from 'lucide-react';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { useAuthStore } from '../../store/authStore';

const doctorNav = [
  { to: '/doctor', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/doctor/new', label: 'New prescription', icon: FilePlus2 },
  { to: '/doctor/profile', label: 'Doctor & Clinic Details', icon: Stethoscope },
  { to: '/doctor/qr-codes', label: 'Payment QR Codes', icon: QrCode },
];
const adminNav = [{ to: '/admin', label: 'Doctor approvals', icon: ShieldCheck, end: true }];

export function AppShell() {
  const role = useAuthStore((s) => s.profile?.role);
  const [drawer, setDrawer] = useState(false);

  return (
    <div className="min-h-screen bg-ink-50">
      <Navbar onMenu={() => setDrawer(true)} />
      <div className="mx-auto flex max-w-7xl">
        <Sidebar items={role === 'admin' ? adminNav : doctorNav} open={drawer} onClose={() => setDrawer(false)} />
        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
