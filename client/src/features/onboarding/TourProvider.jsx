import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { SETUP_STEPS } from './steps';
import { WelcomeModal } from './WelcomeModal';
import { Coachmark } from './Coachmark';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Ody } from '../marketing/components';
import { useAuthStore } from '../../store/authStore';
import { fetchMyPrescriptions, fetchMyPaymentMethods } from '../doctor/api';
import './onboarding.css';

const TourContext = createContext(null);

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used within TourProvider');
  return ctx;
}

export function TourProvider({ children }) {
  const profile = useAuthStore((s) => s.profile);
  const navigate = useNavigate();
  const location = useLocation();

  const [isOpen, setIsOpen] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0); // 0 = welcome modal, 1..8 = steps
  const [targetEl, setTargetEl] = useState(null);
  const [targetNotFound, setTargetNotFound] = useState(false);
  const [closingModalOpen, setClosingModalOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const userId = profile?.id;
  const storageKey = userId ? `eprx:setup-guide:v1:${userId}` : null;

  // Real data for checklist
  const { data: prescriptions } = useQuery({
    queryKey: ['doctor', 'prescriptions'],
    queryFn: fetchMyPrescriptions,
    enabled: Boolean(profile?.role === 'doctor'),
  });

  const { data: paymentMethods } = useQuery({
    queryKey: ['doctor', 'payment-methods'],
    queryFn: fetchMyPaymentMethods,
    enabled: Boolean(profile?.role === 'doctor'),
  });

  const checklist = {
    clinicReady: Boolean(profile?.clinic_name && profile?.clinic_address && profile?.prc_no),
    qrReady: Boolean(paymentMethods?.some((m) => m.is_active)),
    rxReady: Boolean(prescriptions?.length > 0),
  };

  // Check localStorage if tour was dismissed
  const isDismissed = useCallback(() => {
    if (!storageKey) return false;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return false;
      const data = JSON.parse(raw);
      return Boolean(data.dismissed);
    } catch {
      return false;
    }
  }, [storageKey]);

  const saveDismissed = useCallback(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ dismissed: true, updatedAt: new Date().toISOString() }),
      );
    } catch (e) {
      console.warn('Could not save tour dismissal', e);
    }
  }, [storageKey]);

  // Auto-open on first /doctor visit after approval
  useEffect(() => {
    if (
      profile?.role === 'doctor' &&
      profile?.status === 'approved' &&
      location.pathname === '/doctor'
    ) {
      if (!isDismissed() && !isOpen) {
        // Open welcome modal automatically
        setIsOpen(true);
        setCurrentStepIndex(0);
      }
    }
  }, [profile?.role, profile?.status, location.pathname, isDismissed]);

  // Manual open (ignores don't show)
  const open = useCallback(() => {
    setCurrentStepIndex(0);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setTargetEl(null);
    if (dontShowAgain) {
      saveDismissed();
    }
  }, [dontShowAgain, saveDismissed]);

  const currentStep = SETUP_STEPS[currentStepIndex];

  // Navigate and find targets
  useEffect(() => {
    if (!isOpen || currentStepIndex === 0) {
      setTargetEl(null);
      setTargetNotFound(false);
      return;
    }

    const step = SETUP_STEPS[currentStepIndex];
    if (!step) return;

    // Navigate to step path if different
    if (step.path && location.pathname !== step.path) {
      navigate(step.path);
    }

    // Wait and poll for target element
    setTargetNotFound(false);
    let attempts = 0;
    const maxAttempts = 30; // 3 seconds at 100ms
    const interval = setInterval(() => {
      attempts += 1;
      const el = document.querySelector(`[data-tour="${step.tourTarget}"]`);
      if (el) {
        clearInterval(interval);
        setTargetEl(el);
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        setTargetEl(null);
        setTargetNotFound(true);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isOpen, currentStepIndex, location.pathname, navigate]);

  const handleNext = () => {
    const step = SETUP_STEPS[currentStepIndex];
    if (step?.nextPath) {
      navigate(step.nextPath);
    }
    if (currentStepIndex < SETUP_STEPS.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 1) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  const handleFinish = () => {
    if (dontShowAgain) {
      saveDismissed();
    }
    close();
    setClosingModalOpen(true);
  };

  const doctorLastName = profile?.full_name
    ? profile.full_name.replace(/^dr\.\s*/i, '').split(' ').slice(-1)[0]
    : 'Doctor';

  return (
    <TourContext.Provider value={{ isOpen, open, close }}>
      {children}

      {/* Step 1: Welcome modal */}
      {isOpen && currentStepIndex === 0 && (
        <WelcomeModal
          open
          onClose={close}
          onStart={() => setCurrentStepIndex(1)}
          doctorLastName={doctorLastName}
          checklist={checklist}
          onDismissForever={saveDismissed}
        />
      )}

      {/* Steps 2 to 9: Coachmark */}
      {isOpen && currentStepIndex > 0 && currentStep && (
        <Coachmark
          step={currentStep}
          stepIndex={currentStep.stepNumber}
          totalSteps={9}
          targetEl={targetEl}
          targetNotFound={targetNotFound}
          onNext={handleNext}
          onBack={handleBack}
          onSkip={close}
          onFinish={handleFinish}
          dontShowAgain={dontShowAgain}
          setDontShowAgain={setDontShowAgain}
        />
      )}

      {/* Closing celebration dialog (Task 2 step 9) */}
      <Modal open={closingModalOpen} onClose={() => setClosingModalOpen(false)} size="md">
        <div className="text-center py-4 space-y-5">
          <div className="flex justify-center">
            <Ody mood="celebrate" alt="Ody mascot celebrating" className="w-[120px]" />
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold text-[#152839]">You’re set up</h2>
            <p className="mt-2 text-sm text-[#45546a]">
              Your first prescription is one click away.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3">
            <Button
              variant="secondary"
              onClick={() => {
                setClosingModalOpen(false);
                navigate('/doctor');
              }}
            >
              Back to dashboard
            </Button>
            <Button
              variant="accent"
              onClick={() => {
                setClosingModalOpen(false);
                navigate('/doctor/new');
              }}
            >
              Write a prescription
            </Button>
          </div>
        </div>
      </Modal>
    </TourContext.Provider>
  );
}
