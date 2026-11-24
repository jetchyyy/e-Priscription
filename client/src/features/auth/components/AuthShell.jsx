import { forwardRef, useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import '../../marketing/site.css';
import { Lockup, RxSlip } from '../../marketing/components';

/**
 * Sign-in shell: navy side with the O and a drawn prescription (or, with `steps`, the road to a first
 * prescription), warm form side. The side stays in view while a long form scrolls.
 * Ody is deliberately absent: the mascot guide keeps it off login forms.
 */
export function AuthShell({ title, lead, tabTitle, sideTitle, sideText, steps, current = 0, children, footer }) {
  useEffect(() => { document.title = `${tabTitle ?? title} · E-Prescription by ODYSSEY`; }, [tabTitle, title]);
  return (
    <div className="ody auth">
      <aside className="auth__side on-navy">
        <Lockup light />
        <div className="auth__sidetext">
          <h2>{sideTitle}</h2>
          <p>{sideText}</p>
        </div>
        {steps ? (
          <ol className="auth__steps" aria-label="How registration works">
            {steps.map(([t, d], i) => (
              <li key={t} className={i < current ? 'is-done' : i === current ? 'is-current' : undefined} aria-current={i === current ? 'step' : undefined}>
                <span className="o-dot" aria-hidden="true" />
                <span><b>{t}</b>{d}</span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="auth__o" aria-hidden="true">
            <div className="o-letter o-letter--on-navy">
              <div className="o-letter__rim">
                <div className="o-letter__counter o-letter__counter--centre"><RxSlip stage="paid" /></div>
              </div>
            </div>
          </div>
        )}
      </aside>

      <main className="auth__main">
        <div className="auth__bar">
          <span className="auth__mobilelogo"><Lockup /></span>
          <Link to="/" className="link auth__back">Back to site</Link>
        </div>
        <div className="auth__box">
          {title && <h1>{title}</h1>}
          {lead && <p className="auth__lead">{lead}</p>}
          {children}
          <div className="auth__footer">{footer}</div>
        </div>
        <p className="auth__legal">Protected under the Data Privacy Act of 2012 (RA 10173).</p>
      </main>
    </div>
  );
}

export const AuthField = forwardRef(function AuthField({ label, error, type = 'text', id, ...props }, ref) {
  const auto = useId();
  const _id = id ?? auto;
  const [show, setShow] = useState(false);
  const isPw = type === 'password';
  return (
    <div className="afield">
      <label htmlFor={_id}>{label}</label>
      <div className={`afield__control${error ? ' has-error' : ''}`}>
        <input
          ref={ref}
          id={_id}
          type={isPw && show ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${_id}-err` : undefined}
          {...props}
        />
        {isPw && (
          <button type="button" className="afield__toggle" onClick={() => setShow((v) => !v)} aria-pressed={show}>
            {show ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      {error && <p id={`${_id}-err`} role="alert" className="afield__err">{error}</p>}
    </div>
  );
});

/** The Philippine flag, drawn so it looks the same on every phone (Windows shows flag emoji as letters). */
function PhFlag() {
  return (
    <svg className="aphone__flag" viewBox="0 0 30 15" aria-hidden="true">
      <rect width="30" height="7.5" fill="#0038a8" />
      <rect y="7.5" width="30" height="7.5" fill="#ce1126" />
      <path d="M0 0 13 7.5 0 15z" fill="#fff" />
      <circle cx="4.6" cy="7.5" r="1.7" fill="#fcd116" />
    </svg>
  );
}

/** Local digits as typed after +63: no spaces, no leading 0 or 63. */
const phLocal = (v) => String(v ?? '').replace(/\D/g, '').replace(/^(63|0)/, '').slice(0, 10);
const phSpaced = (d) => (d.length <= 3 ? d : d.length <= 6 ? `${d.slice(0, 3)} ${d.slice(3)}` : `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`);

/**
 * A phone number with the country fixed to the Philippines: flag and +63 in front, the doctor types the rest.
 * `value` and `onChange` use the full number (+639171234567), which the PH number check accepts.
 */
export function PhoneField({ label, error, value, onChange, id, placeholder = '917 123 4567', ...props }) {
  const auto = useId();
  const _id = id ?? auto;
  const local = phLocal(value);
  return (
    <div className="afield">
      <label htmlFor={_id}>{label}</label>
      <div className={`afield__control aphone${error ? ' has-error' : ''}`}>
        <span className="aphone__cc" aria-label="Philippines, +63"><PhFlag />+63</span>
        <input
          id={_id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder={placeholder}
          value={phSpaced(local)}
          onChange={(e) => { const d = phLocal(e.target.value); onChange(d ? `+63${d}` : ''); }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${_id}-err` : undefined}
          {...props}
        />
      </div>
      {error && <p id={`${_id}-err`} role="alert" className="afield__err">{error}</p>}
    </div>
  );
}
