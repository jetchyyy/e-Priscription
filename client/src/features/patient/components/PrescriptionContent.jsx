import { buildSig, computeAge, doctorTitle, formatDate } from '../../../lib/utils';
import { cn } from '../../../lib/utils';

const qty = (q = '') => (/^\d+$/.test(String(q).trim()) ? `#${String(q).trim()}` : String(q).trim());

function Cred({ label, value }) {
  if (!value) return null;
  return (
    <span className="whitespace-nowrap">
      <span className="text-ink-500">{label}</span>{' '}
      <span className="font-semibold text-ink-800">{value}</span>
    </span>
  );
}

function PatientLine({ label, children, className }) {
  return (
    <div className={cn('flex items-baseline gap-2 border-b border-dotted border-ink-300 pb-1', className)}>
      <dt className="shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className="min-w-0 flex-1 break-words font-medium text-ink-900">{children || '—'}</dd>
    </div>
  );
}

/**
 * Philippine-style Rx prescription sheet:
 * clinic header, patient block, large ℞, medicines (Generic (Brand) · Strength · Form · Disp · Sig),
 * signature with PRC / PTR / S2 numbers.
 */
export function PrescriptionContent({ rx, className, animate = false }) {
  const doctor = rx.doctor ?? {};
  const patient = rx.patient ?? {};
  const age = computeAge(patient.dob);

  return (
    <article
      id="rx-print"
      aria-label="Prescription"
      className={cn(
        'rx-paper relative overflow-hidden rounded-2xl text-[15px] text-ink-800 shadow-paper ring-1 ring-ink-200',
        animate && 'animate-unlock',
        className,
      )}
    >
      <div className="h-2 bg-gradient-to-r from-brand-600 via-brand-400 to-gold-400" />

      <header className="px-5 pb-4 pt-6 text-center sm:px-10">
        <h2 className="font-rx text-2xl font-bold leading-tight text-brand-900 sm:text-3xl">
          {doctor.clinic_name || 'Medical Clinic'}
        </h2>
        <p className="mt-2 font-semibold text-ink-900">{doctorTitle(doctor.full_name ?? '')}</p>
        {doctor.specialty && (
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-700">{doctor.specialty}</p>
        )}
        <p className="mt-2 text-sm text-ink-600">
          {[
            doctor.clinic_address,
            doctor.phone && `Tel/Mobile: ${doctor.phone}`,
            doctor.email && `Email: ${doctor.email}`,
          ].filter(Boolean).join(' · ')}
        </p>
      </header>

      <div className="mx-5 border-y-[3px] border-double border-brand-600/50 sm:mx-10" />

      <section className="px-5 pt-5 sm:px-10">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-6">
          <PatientLine label="Patient" className="sm:col-span-4">{patient.name}</PatientLine>
          <PatientLine label="Date" className="sm:col-span-2">{formatDate(rx.created_at)}</PatientLine>
          <PatientLine label="Age" className="sm:col-span-2">{age != null ? `${age} yrs` : ''}</PatientLine>
          <PatientLine label="Sex" className="sm:col-span-2">{patient.sex}</PatientLine>
          <PatientLine label="Contact" className="sm:col-span-2">{patient.contact}</PatientLine>
          <PatientLine label="Address" className="sm:col-span-6">{patient.address}</PatientLine>
          {rx.diagnosis && <PatientLine label="Diagnosis" className="sm:col-span-6">{rx.diagnosis}</PatientLine>}
        </dl>
      </section>

      <section className="px-5 pb-2 pt-3 sm:px-10">
        <div className="font-rx text-6xl font-bold leading-none text-brand-600 sm:text-7xl" aria-label="Rx">℞</div>

        <ol className="mt-2 space-y-5">
          {(rx.medicines ?? []).map((m, i) => (
            <li key={i} className="pl-1">
              <div className="flex items-baseline justify-between gap-4">
                <p className="min-w-0 break-words">
                  <span className="font-semibold text-ink-900">
                    {i + 1}. {m.genericName}
                  </span>
                  {m.brandName && <span className="text-ink-600"> ({m.brandName})</span>}
                  <span className="text-ink-700"> — {[m.strength, m.form].filter(Boolean).join(' ')}</span>
                </p>
                <p className="shrink-0 font-semibold text-ink-900">Disp: {qty(m.quantity)}</p>
              </div>
              <p className="mt-1 pl-5 text-ink-700">
                <span className="font-semibold italic text-brand-700">Sig:</span> {buildSig(m)}
              </p>
            </li>
          ))}
        </ol>

        {rx.notes && (
          <div className="mt-6 rounded-xl border border-dashed border-ink-300 bg-white/60 px-4 py-3 text-sm">
            <span className="font-semibold text-ink-800">Doctor’s notes: </span>
            <span className="text-ink-700">{rx.notes}</span>
          </div>
        )}
      </section>

      <footer className="px-5 pb-6 pt-8 sm:px-10">
        <div className="ml-auto w-full max-w-xs text-center">
          <p className="font-script text-3xl leading-none text-ink-800">{doctor.full_name}</p>
          <div className="mt-1 border-t-2 border-ink-800" />
          <p className="mt-1 text-sm font-semibold text-ink-900">{doctorTitle(doctor.full_name ?? '')}</p>
          <p className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-0.5 text-xs">
            <Cred label="PRC Lic. No." value={doctor.prc_no || 'On file'} />
            <Cred label="PTR No." value={doctor.ptr_no} />
            <Cred label="S2 No." value={doctor.s2_no} />
          </p>
        </div>

        <div className="mt-6 border-t border-ink-200 pt-3 text-[11px] leading-relaxed text-ink-500">
          <p>
            Generic prescribing per RA 6675 (Generics Act of 1988), as amended by RA 9502. Electronically issued via
            E-Reseta · Ref: <span className="font-mono">{rx.id}</span>
          </p>
          <p>Contains personal and sensitive personal information protected under RA 10173 (Data Privacy Act of 2012).</p>
        </div>
      </footer>
    </article>
  );
}
