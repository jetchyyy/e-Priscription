import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { DoctorStatusBadge } from '../../../components/ui/Badge';
import { formatShortDate } from '../../../lib/utils';

/** Desktop table (hidden below md, where DoctorCard is used). */
export function DoctorTable({ doctors, onReview }) {
  return (
    <Card className="hidden overflow-hidden !p-0 md:block">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Doctor registrations</caption>
        <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
          <tr>
            <th scope="col" className="px-5 py-3 font-semibold">Doctor</th>
            <th scope="col" className="px-5 py-3 font-semibold">PRC no.</th>
            <th scope="col" className="px-5 py-3 font-semibold">Specialty</th>
            <th scope="col" className="px-5 py-3 font-semibold">Clinic</th>
            <th scope="col" className="px-5 py-3 font-semibold">Submitted</th>
            <th scope="col" className="px-5 py-3 font-semibold">Status</th>
            <th scope="col" className="px-5 py-3"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {doctors.map((d) => (
            <tr key={d.id} className="transition hover:bg-ink-50/60">
              <td className="px-5 py-3.5">
                <p className="font-medium text-ink-900">{d.full_name}</p>
                <p className="text-xs text-ink-500">{d.email}</p>
              </td>
              <td className="px-5 py-3.5 font-mono text-ink-700">{d.prc_no}</td>
              <td className="px-5 py-3.5 text-ink-600">{d.specialty}</td>
              <td className="max-w-[12rem] truncate px-5 py-3.5 text-ink-600">{d.clinic_name}</td>
              <td className="px-5 py-3.5 text-ink-600">{formatShortDate(d.created_at)}</td>
              <td className="px-5 py-3.5"><DoctorStatusBadge status={d.status} /></td>
              <td className="px-5 py-3.5 text-right">
                <Button size="sm" variant={d.status === 'pending' ? 'primary' : 'secondary'} onClick={() => onReview(d)}>
                  {d.status === 'pending' ? 'Review' : 'View'}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
