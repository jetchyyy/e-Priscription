import { cn } from '../../lib/utils';

const tones = {
  neutral: 'bg-ink-100 text-ink-700 ring-ink-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
  danger: 'bg-rose-50 text-rose-700 ring-rose-200',
  info: 'bg-brand-50 text-brand-700 ring-brand-200',
};

export function Badge({ tone = 'neutral', className, children, dot = true }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        tones[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
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
  return status === 'paid' ? <Badge tone="success">Paid</Badge> : <Badge tone="warning">Unpaid</Badge>;
}
