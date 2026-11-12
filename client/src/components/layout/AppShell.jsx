import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Home, FilePlus2, FlaskConical, ShieldCheck, Stethoscope, QrCode, Gauge, ReceiptText, Building2, Wallet, Landmark } from 'lucide-react';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { useAuthStore } from '../../store/authStore';

import { TourProvider, useTour } from '../../features/onboarding/TourProvider';

const doctorNav = [
  { to: '/doctor', label: 'Home', icon: Home, end: true },
  { to: '/doctor/new', label: 'New prescription', short: 'Prescription', icon: FilePlus2, tourId: 'nav-new' },
  { to: '/doctor/lab-request', label: 'New lab request', short: 'Lab request', icon: FlaskConical, tourId: 'nav-lab' },
  { heading: 'Account' },
  { to: '/doctor/profile', label: 'My details', icon: Stethoscope, tourId: 'nav-profile' },
  { to: '/doctor/qr-codes', label: 'Payment QR codes', icon: QrCode, tourId: 'nav-qr' },
  { to: '/doctor/earnings', label: 'Earnings', icon: Wallet },
  { to: '/doctor/plan', label: 'Plan', icon: Gauge },
  { to: '/doctor/clinic', label: 'Clinic', icon: Building2 },
];
// Shown in the phone bottom bar; the rest live behind "More".
const DOCTOR_BOTTOM = ['/doctor', '/doctor/new', '/doctor/lab-request'];

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

  const isDoctor = role === 'doctor';

  return (
    <div className="ody ody-app min-h-screen bg-[#f9f8f3] text-[#152839]">
      {/* Doctors open the full menu from "More" in the bottom bar, so the top menu button is not needed. */}
      <Navbar onMenu={isDoctor ? undefined : () => setDrawer(true)} onOpenGuide={handleOpenGuide} />
      <div className="mx-auto flex max-w-7xl">
        <Sidebar
          items={role === 'admin' ? adminNav : doctorNav}
          open={drawer}
          onClose={() => setDrawer(false)}
          onOpenGuide={isDoctor ? handleOpenGuide : undefined}
        />
        <main
          id="main"
          className={`min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 ${isDoctor ? 'pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-6' : ''}`}
        >
          <Outlet />
        </main>
      </div>
      {isDoctor && (
        <BottomNav
          items={doctorNav.filter((item) => DOCTOR_BOTTOM.includes(item.to))}
          onMore={() => setDrawer((open) => !open)}
          moreOpen={drawer}
        />
      )}
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
