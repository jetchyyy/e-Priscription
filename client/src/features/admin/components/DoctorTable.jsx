import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { DoctorStatusBadge } from '../../../components/ui/Badge';
import { formatShortDate } from '../../../lib/utils';

/** Desktop table (hidden below md, where DoctorCard is used). */
export function DoctorTable({ doctors, onReview }) {
  return (
    <div className="hidden overflow-hidden rounded-[20px] border border-[#dce1e8] bg-white md:block">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Doctor registrations</caption>
        <thead className="bg-[#f9f8f3] text-xs font-semibold uppercase tracking-wider text-[#5f6a7c] border-b border-[#dce1e8]">
          <tr>
            <th scope="col" className="px-6 py-3.5">Doctor</th>
            <th scope="col" className="px-6 py-3.5">PRC no.</th>
            <th scope="col" className="px-6 py-3.5">Specialty</th>
            <th scope="col" className="px-6 py-3.5">Clinic</th>
            <th scope="col" className="px-6 py-3.5">Submitted</th>
            <th scope="col" className="px-6 py-3.5">Status</th>
            <th scope="col" className="px-6 py-3.5 text-right"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#dce1e8]">
          {doctors.map((d) => (
            <tr key={d.id} className="hover:bg-[#f9f8f3]/60 transition">
              <td className="px-6 py-4">
                <p className="font-semibold text-[#152839]">{d.full_name}</p>
                <p className="text-xs text-[#5f6a7c]">{d.email}</p>
              </td>
              <td className="px-6 py-4 font-mono text-xs text-[#5f6a7c]">{d.prc_no}</td>
              <td className="px-6 py-4 text-[#45546a]">{d.specialty}</td>
              <td className="max-w-[12rem] truncate px-6 py-4 text-[#45546a]">{d.clinic_name}</td>
              <td className="px-6 py-4 text-[#5f6a7c] whitespace-nowrap">{formatShortDate(d.created_at)}</td>
              <td className="px-6 py-4 whitespace-nowrap"><DoctorStatusBadge status={d.status} /></td>
              <td className="px-6 py-4 text-right">
                <Button size="sm" variant={d.status === 'pending' ? 'primary' : 'secondary'} onClick={() => onReview(d)}>
                  {d.status === 'pending' ? 'Review' : 'View'}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
