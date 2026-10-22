import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { LayoutDashboard, FilePlus2, ShieldCheck, Stethoscope, QrCode, Gauge, ReceiptText, Building2, Wallet, Landmark } from 'lucide-react';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { useAuthStore } from '../../store/authStore';

import { TourProvider, useTour } from '../../features/onboarding/TourProvider';

const doctorNav = [
  { to: '/doctor', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/doctor/new', label: 'New prescription', icon: FilePlus2, tourId: 'nav-new' },
  { to: '/doctor/profile', label: 'Doctor & Clinic Details', icon: Stethoscope, tourId: 'nav-profile' },
  { to: '/doctor/qr-codes', label: 'Payment QR Codes', icon: QrCode, tourId: 'nav-qr' },
  { to: '/doctor/earnings', label: 'Earnings and payouts', icon: Wallet },
  { to: '/doctor/plan', label: 'Plan and usage', icon: Gauge },
  { to: '/doctor/clinic', label: 'Clinic', icon: Building2 },
];
const adminNav = [
  { to: '/admin', label: 'Doctor approvals', icon: ShieldCheck, end: true },
  { to: '/admin/billing', label: 'Plans and billing', icon: ReceiptText },
  { to: '/admin/money', label: 'Money and payouts', icon: Landmark },
];

function AppShellInner() {
  const role = useAuthStore((s) => s.profile?.role);
  const [drawer, setDrawer] = useState(false);
  const tour = useTour();

  const handleOpenGuide = () => {
    tour.open();
  };

  return (
    <div className="ody ody-app min-h-screen bg-[#f9f8f3] text-[#152839]">
      <Navbar onMenu={() => setDrawer(true)} onOpenGuide={handleOpenGuide} />
      <div className="mx-auto flex max-w-7xl">
        <Sidebar
          items={role === 'admin' ? adminNav : doctorNav}
          open={drawer}
          onClose={() => setDrawer(false)}
          onOpenGuide={role === 'doctor' ? handleOpenGuide : undefined}
        />
        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function AppShell() {
  const role = useAuthStore((s) => s.profile?.role);

  if (role === 'doctor') {
    return (
      <TourProvider>
        <AppShellInner />
      </TourProvider>
    );
  }

  return (
    <TourProvider>
      <AppShellInner />
    </TourProvider>
  );
}
