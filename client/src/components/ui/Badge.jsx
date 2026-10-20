import { cn } from '../../lib/utils';

const tones = {
  neutral: 'text-[#45546a]',
  success: 'text-[#152839]',
  warning: 'text-[#b8470a]',
  danger: 'text-[#a3330a]',
  info: 'text-[#152839]',
};

const dotColors = {
  neutral: 'bg-[#5f6a7c]',
  success: 'bg-[#152839]',
  warning: 'bg-[#ff6f07]',
  danger: 'bg-[#b8470a]',
  info: 'bg-[#152839]',
};

export function Badge({ tone = 'neutral', className, children, dot = true }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium',
        tones[tone],
        className,
      )}
    >
      {dot && (
        <span
          className={cn(
            'inline-block h-2 w-1.5 rounded-[47%/35.6%]',
            dotColors[tone] || 'bg-[#152839]',
          )}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}

export const DOCTOR_STATUS = {
  pending: { tone: 'warning', label: 'Pending' },
  approved: { tone: 'success', label: 'Approved' },
  rejected: { tone: 'danger', label: 'Rejected' },
};

export function DoctorStatusBadge({ status }) {
  const s = DOCTOR_STATUS[status] ?? DOCTOR_STATUS.pending;
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function PaymentBadge({ status }) {
  return status === 'paid' ? (
    <Badge tone="success">Paid</Badge>
  ) : (
    <Badge tone="warning">Waiting for payment</Badge>
  );
}
