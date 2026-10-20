import { useState, useEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../../components/ui/Button';

/**
 * Coachmark component: renders spotlight SVG scrim, pulsing target ring,
 * orange directional arrow, and floating dialog bubble.
 */
export function Coachmark({
  step,
  stepIndex,
  totalSteps = 9,
  targetEl,
  targetNotFound = false,
  onNext,
  onBack,
  onSkip,
  onFinish,
  dontShowAgain,
  setDontShowAgain,
}) {
  const [targetRect, setTargetRect] = useState(null);
  const [bubblePos, setBubblePos] = useState({ top: 0, left: 0, placement: 'bottom' });
  const bubbleRef = useRef(null);
  const titleId = useId();
  const descId = useId();

  // Scroll target element into view comfortably and measure bounding box
  useEffect(() => {
    if (!targetEl) {
      setTargetRect(null);
      return;
    }

    targetEl.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'center',
      inline: 'nearest',
    });

    const update = () => {
      const r = targetEl.getBoundingClientRect();
      setTargetRect({
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
        bottom: r.bottom,
        right: r.right,
      });
    };

    // Update after scroll settle
    update();
    const timer = setTimeout(update, 250);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [targetEl, step.id]);

  // Calculate bubble position based on targetRect
  useEffect(() => {
    if (!targetRect || !bubbleRef.current) return;

    const b = bubbleRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (vw < 640) {
      // Mobile bottom sheet
      return;
    }

    const pad = 16;
    const targetMidX = targetRect.left + targetRect.width / 2;
    let left = targetMidX - b.width / 2;
    left = Math.max(pad, Math.min(vw - b.width - pad, left));

    let top = targetRect.bottom + 16;
    let placement = 'bottom';

    // If bottom overflows or target is in bottom half, check if top placement fits better
    const spaceBelow = vh - targetRect.bottom - pad;
    const spaceAbove = targetRect.top - pad;

    if (spaceBelow < b.height && spaceAbove >= b.height) {
      top = targetRect.top - b.height - 16;
      placement = 'top';
    } else if (spaceBelow < b.height && spaceAbove < b.height) {
      // Fallback: clamp within viewport
      top = Math.max(pad, Math.min(vh - b.height - pad, targetRect.bottom + 16));
      placement = top < targetRect.top ? 'top' : 'bottom';
    }

    setBubblePos({ top, left, placement });
  }, [targetRect]);

  // Keyboard navigation & trap
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onSkip();
      } else if (e.key === 'ArrowRight') {
        if (step.isLast) onFinish();
        else onNext();
      } else if (e.key === 'ArrowLeft' && stepIndex > 1) {
        onBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [step, stepIndex, onNext, onBack, onSkip, onFinish]);

  // Focus trap inside bubble
  useEffect(() => {
    bubbleRef.current?.focus();
  }, [step.id]);

  const pad = 8;
  const rad = 14;

  const content = (
    <>
      {/* Spotlight Scrim */}
      {targetRect && (
        <svg className="ody-tour-scrim" width="100%" height="100%">
          <defs>
            <mask id="ody-tour-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              <rect
                x={targetRect.left - pad}
                y={targetRect.top - pad}
                width={targetRect.width + pad * 2}
                height={targetRect.height + pad * 2}
                rx={rad}
                ry={rad}
                fill="black"
              />
            </mask>
          </defs>
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="#152839"
            fillOpacity="0.55"
            mask="url(#ody-tour-mask)"
          />
        </svg>
      )}

      {/* Pulsing Ring around Target */}
      {targetRect && (
        <div
          className="ody-tour-ring"
          style={{
            top: `${targetRect.top - pad}px`,
            left: `${targetRect.left - pad}px`,
            width: `${targetRect.width + pad * 2}px`,
            height: `${targetRect.height + pad * 2}px`,
            borderRadius: `${rad}px`,
          }}
        />
      )}

      {/* Arrow SVG between bubble and target */}
      {targetRect && window.innerWidth >= 640 && (
        <svg className="ody-tour-arrow" style={{ inset: 0, width: '100vw', height: '100vh' }}>
          {bubblePos.placement === 'bottom' ? (
            <path
              d={`M ${bubblePos.left + 180} ${bubblePos.top} Q ${bubblePos.left + 180} ${targetRect.bottom + 4}, ${targetRect.left + targetRect.width / 2} ${targetRect.bottom + 4}`}
              fill="none"
              stroke="#ff6f07"
              strokeWidth="3"
              strokeLinecap="round"
            />
          ) : (
            <path
              d={`M ${bubblePos.left + 180} ${bubblePos.top + 100} Q ${bubblePos.left + 180} ${targetRect.top - 4}, ${targetRect.left + targetRect.width / 2} ${targetRect.top - 4}`}
              fill="none"
              stroke="#ff6f07"
              strokeWidth="3"
              strokeLinecap="round"
            />
          )}
        </svg>
      )}

      {/* Bubble */}
      <div
        ref={bubbleRef}
        role="dialog"
        tabIndex={-1}
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="ody-tour-bubble"
        style={
          window.innerWidth >= 640 && targetRect
            ? { top: `${bubblePos.top}px`, left: `${bubblePos.left}px` }
            : !targetRect
            ? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
            : undefined
        }
      >
        <div className="space-y-3">
          {/* Progress dots & Step counter */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#5f6a7c]">
              Step {stepIndex} of {totalSteps}
            </span>
            <div className="flex items-center gap-1.5" aria-hidden="true">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <span
                  key={i}
                  className={`inline-block h-2 w-1.5 rounded-[47%/35.6%] ${
                    i + 1 === stepIndex ? 'bg-[#ff6f07]' : 'bg-[#dce1e8]'
                  }`}
                />
              ))}
            </div>
          </div>

          <h3 id={titleId} className="font-display text-xl font-bold text-[#152839]">
            {targetNotFound ? 'Can’t find this on screen' : step.title}
          </h3>

          <p id={descId} className="text-sm text-[#45546a]">
            {targetNotFound
              ? 'Can’t find this on the screen. You can skip this step.'
              : step.text}
          </p>

          {/* Don't show again on last step */}
          {step.isLast && (
            <div className="pt-2 flex items-center gap-2">
              <input
                id="dont-show-last"
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="h-4 w-4 rounded text-[#152839] focus:ring-[#ff6f07]"
              />
              <label htmlFor="dont-show-last" className="text-xs text-[#5f6a7c] cursor-pointer">
                Don’t show this again
              </label>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center justify-between pt-3 border-t border-[#dce1e8]">
            <button
              type="button"
              onClick={onSkip}
              className="text-xs font-semibold text-[#5f6a7c] hover:text-[#152839] hover:underline"
            >
              Skip guide
            </button>
            <div className="flex items-center gap-2">
              {stepIndex > 1 && (
                <Button variant="secondary" size="sm" onClick={onBack}>
                  Back
                </Button>
              )}
              {step.isLast ? (
                <Button variant="primary" size="sm" onClick={onFinish}>
                  Finish
                </Button>
              ) : (
                <Button variant="primary" size="sm" onClick={onNext}>
                  Next
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(content, document.body);
}
