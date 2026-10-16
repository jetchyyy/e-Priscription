import { ChevronRight } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { DoctorStatusBadge } from '../../../components/ui/Badge';
import { formatShortDate } from '../../../lib/utils';

/** Mobile stacked card for a single doctor registration. */
export function DoctorCard({ doctor, onReview }) {
  return (
    <Card className="!p-4">
      <button type="button" onClick={() => onReview(doctor)} className="flex w-full items-center gap-3 text-left" aria-label={`Review ${doctor.full_name}`}>
        <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-100 to-brand-200 font-display text-lg font-semibold text-brand-800">
          {doctor.full_name?.[0]?.toUpperCase() ?? '?'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate font-semibold text-ink-900">{doctor.full_name}</span>
            <DoctorStatusBadge status={doctor.status} />
          </span>
          <span className="block truncate text-sm text-ink-500">{doctor.specialty} · PRC {doctor.prc_no}</span>
          <span className="block truncate text-xs text-ink-400">{doctor.clinic_name} · {formatShortDate(doctor.created_at)}</span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-ink-400" aria-hidden="true" />
      </button>
    </Card>
  );
}
