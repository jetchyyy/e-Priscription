import { useState } from 'react';
import { Check, Compass } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Ody } from '../marketing/components';

/**
 * Step 1: Welcome Modal (Task 2: centred dialog with Ody happy at 120px and real data checklist).
 */
export function WelcomeModal({
  open,
  onClose,
  onStart,
  doctorLastName = 'Doctor',
  checklist = { clinicReady: false, qrReady: false, rxReady: false },
  onDismissForever,
}) {
  const [dontShow, setDontShow] = useState(false);

  const handleStart = () => {
    if (dontShow) {
      onDismissForever?.();
    }
    onStart();
  };

  const handleExplore = () => {
    if (dontShow) {
      onDismissForever?.();
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={handleExplore} size="md">
      <div className="text-center pt-2 pb-1 space-y-6">
        <div className="flex justify-center">
          <Ody mood="happy" alt="Ody mascot" className="w-[120px]" />
        </div>

        <div>
          <h2 className="font-display text-2xl font-bold text-[#152839]">
            Welcome, Dr. {doctorLastName}
          </h2>
          <p className="mt-2 text-sm text-[#45546a]">
            Three things get you ready to send your first prescription.
          </p>
        </div>

        {/* Real data checklist */}
        <div className="rounded-[18px] border border-[#dce1e8] bg-[#f9f8f3] p-4 text-left space-y-3">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                checklist.clinicReady
                  ? 'bg-[#152839] text-[#f9f8f3]'
                  : 'border border-[#dce1e8] bg-white text-transparent'
              }`}
            >
              <Check className="h-3.5 w-3.5" />
            </span>
            <span className={`text-sm ${checklist.clinicReady ? 'font-medium text-[#152839]' : 'text-[#45546a]'}`}>
              Clinic details complete (PRC, PTR, clinic name and address)
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                checklist.qrReady
                  ? 'bg-[#152839] text-[#f9f8f3]'
                  : 'border border-[#dce1e8] bg-white text-transparent'
              }`}
            >
              <Check className="h-3.5 w-3.5" />
            </span>
            <span className={`text-sm ${checklist.qrReady ? 'font-medium text-[#152839]' : 'text-[#45546a]'}`}>
              At least one payment QR switched on
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                checklist.rxReady
                  ? 'bg-[#152839] text-[#f9f8f3]'
                  : 'border border-[#dce1e8] bg-white text-transparent'
              }`}
            >
              <Check className="h-3.5 w-3.5" />
            </span>
            <span className={`text-sm ${checklist.rxReady ? 'font-medium text-[#152839]' : 'text-[#45546a]'}`}>
              First prescription sent
            </span>
          </div>
        </div>

        {/* Don't show again checkbox */}
        <div className="flex items-center justify-center gap-2 pt-1">
          <input
            id="dont-show-welcome"
            type="checkbox"
            checked={dontShow}
            onChange={(e) => setDontShow(e.target.checked)}
            className="h-4 w-4 rounded text-[#152839] focus:ring-[#ff6f07]"
          />
          <label htmlFor="dont-show-welcome" className="text-xs text-[#5f6a7c] cursor-pointer">
            Don’t show this again
          </label>
        </div>

        {/* Buttons */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-center gap-3 pt-2">
          <Button variant="secondary" onClick={handleExplore}>
            I’ll explore on my own
          </Button>
          <Button variant="accent" onClick={handleStart}>
            <Compass className="h-4 w-4" /> Show me around
          </Button>
        </div>
      </div>
    </Modal>
  );
}
