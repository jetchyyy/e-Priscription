import { ChevronRight } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { DoctorStatusBadge } from '../../../components/ui/Badge';
import { formatShortDate } from '../../../lib/utils';

/** Mobile stacked card for a single doctor registration. */
export function DoctorCard({ doctor, onReview }) {
  return (
    <div className="rounded-[20px] border border-[#dce1e8] bg-white p-4">
      <button type="button" onClick={() => onReview(doctor)} className="flex w-full items-center gap-3 text-left" aria-label={`Review ${doctor.full_name}`}>
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#ece7de] font-display text-base font-bold text-[#152839]">
          {doctor.full_name?.[0]?.toUpperCase() ?? '?'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate font-semibold text-[#152839]">{doctor.full_name}</span>
            <DoctorStatusBadge status={doctor.status} />
          </span>
          <span className="block truncate text-sm text-[#45546a]">{doctor.specialty} · PRC {doctor.prc_no}</span>
          <span className="block truncate text-xs text-[#5f6a7c]">{doctor.clinic_name} · {formatShortDate(doctor.created_at)}</span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-[#5f6a7c]" aria-hidden="true" />
      </button>
    </div>
  );
}
