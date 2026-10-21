import { Suspense, lazy } from 'react';
import { createBrowserRouter, Outlet } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { RequireRole } from '../components/guards/RequireRole';
import { PageLoader } from '../components/ui/Spinner';
import { RouteErrorFallback } from '../components/ui/ErrorBoundary';

// Each portal is its own chunk.
const Landing = lazy(() => import('../pages/Landing'));
const Pricing = lazy(() => import('../pages/Pricing'));
const Terms = lazy(() => import('../pages/Terms'));
const Privacy = lazy(() => import('../pages/Privacy'));
const SampleRx = lazy(() => import('../pages/SampleRx'));
const NotFound = lazy(() => import('../pages/NotFound'));
const LoginPage = lazy(() => import('../features/auth/pages/LoginPage'));
const AdminLoginPage = lazy(() => import('../features/admin/pages/AdminLoginPage'));

const AdminDashboard = lazy(() => import('../features/admin/pages/AdminDashboard'));
const AdminBilling = lazy(() => import('../features/admin/pages/AdminBilling'));

const DoctorRegister = lazy(() => import('../features/doctor/pages/DoctorRegister'));
const DoctorPending = lazy(() => import('../features/doctor/pages/DoctorPending'));
const DoctorDashboard = lazy(() => import('../features/doctor/pages/DoctorDashboard'));
const CreatePrescription = lazy(() => import('../features/doctor/pages/CreatePrescription'));
const DoctorProfile = lazy(() => import('../features/doctor/pages/DoctorProfile'));
const DoctorQrManagement = lazy(() => import('../features/doctor/pages/DoctorQrManagement'));
const DoctorPlan = lazy(() => import('../features/doctor/pages/DoctorPlan'));
const DoctorClinic = lazy(() => import('../features/doctor/pages/DoctorClinic'));

const PrescriptionView = lazy(() => import('../features/patient/pages/PrescriptionView'));
const MockPay = lazy(() => import('../features/patient/pages/MockPay'));

function Root() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Outlet />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <RouteErrorFallback />,
    children: [
      { path: '/', element: <Landing /> },
      { path: '/pricing', element: <Pricing /> },
      { path: '/terms', element: <Terms /> },
      { path: '/privacy', element: <Privacy /> },
      { path: '/sample', element: <SampleRx /> },
      { path: '/login', element: <LoginPage /> },

      // Patient portal (public, no login)
      { path: '/rx/:id', element: <PrescriptionView /> },
      { path: '/mock-pay/:reference', element: <MockPay /> },

      // Doctor portal
      { path: '/doctor/register', element: <DoctorRegister /> },
      { path: '/doctor/pending', element: <RequireRole role="doctor"><DoctorPending /></RequireRole> },
      {
        element: <RequireRole role="doctor" approved><AppShell /></RequireRole>,
        children: [
          { path: '/doctor', element: <DoctorDashboard /> },
          { path: '/doctor/new', element: <CreatePrescription /> },
          { path: '/doctor/profile', element: <DoctorProfile /> },
          { path: '/doctor/qr-codes', element: <DoctorQrManagement /> },
          { path: '/doctor/plan', element: <DoctorPlan /> },
          { path: '/doctor/clinic', element: <DoctorClinic /> },
        ],
      },

      // Super admin portal
      {
        element: <RequireRole role="admin"><AppShell /></RequireRole>,
        children: [
          { path: '/admin', element: <AdminDashboard /> },
          { path: '/admin/billing', element: <AdminBilling /> },
        ],
      },

      { path: '*', element: <NotFound /> },
    ],
  },
]);
