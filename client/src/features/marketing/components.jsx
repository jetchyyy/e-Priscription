import { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';

/** Adds the `js` class (so entrances may hide content) and reveals [data-reveal] / .shutter once in view. */
export function useSiteMotion() {
  const ref = useRef(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    root.classList.add('js');
    const targets = root.querySelectorAll('[data-reveal], .shutter');
    if (!('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-in'));
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      }),
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );
    targets.forEach((el) => io.observe(el));
    // Never leave content hidden if the observer misses something.
    const t = setTimeout(() => targets.forEach((el) => el.classList.add('is-in')), 6000);
    return () => { io.disconnect(); clearTimeout(t); };
  }, []);
  return ref;
}

const MOODS = ['happy', 'celebrate', 'thinking'];
const VB_W = 256; // width of Ody's art box, in drawing units
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const wide = () => window.matchMedia('(min-width: 1280px)').matches;

/**
 * Ody, drawn only with the approved art. Everything moves by translation (no squash, no effects):
 * idle float, a cheer when it celebrates, a sway while it thinks, hops, a wave, and, where there is
 * room (`spar`), a practice duel against a training target in the grammar of anime fight scenes: it throws
 * its spear, then focus lines, a dash with afterimages, a flurry with hit sparks and shake, a leap, a slam and a freeze.
 * All expressions are stacked so a change crossfades instead of popping.
 */
export function Ody({ mood = 'happy', className, alt = '', enter = false, spar = false }) {
  const root = useRef(null);
  const busy = useRef(false); // an act (wave or spar) is playing
  const [hop, setHop] = useState(false);
  const [wave, setWave] = useState(0); // bumps per wave; the key restarts the SVG's own animation
  const [waving, setWaving] = useState(false);
  const [act, setAct] = useState(null); // null | 'throw' | 'duel'
  const [actKey, setActKey] = useState(0);

  // Keep a size unit for the target and the flying spear: one drawing unit in pixels.
  useEffect(() => {
    const el = root.current;
    if (!el) return undefined;
    const set = () => el.style.setProperty('--u', `${el.getBoundingClientRect().width / VB_W}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Hop now and then on its own.
  useEffect(() => {
    if (reduced()) return undefined;
    let t;
    const schedule = () => {
      t = setTimeout(() => {
        if (!document.hidden && !busy.current) setHop(true);
        schedule();
      }, 3500 + Math.random() * 5500);
    };
    schedule();
    return () => clearTimeout(t);
  }, []);

  // Wave hello soon after arriving, then at random. Happy face only.
  useEffect(() => {
    if (reduced()) return undefined;
    let t; let end;
    const play = () => {
      if (document.hidden || busy.current) return;
      busy.current = true;
      setWave((n) => n + 1);
      setWaving(true);
      end = setTimeout(() => { setWaving(false); busy.current = false; }, 2500);
    };
    const schedule = (ms) => { t = setTimeout(() => { play(); schedule(9000 + Math.random() * 8000); }, ms); };
    schedule(1600);
    return () => { clearTimeout(t); clearTimeout(end); busy.current = false; };
  }, []);

  // Spear practice: throw (2.6 s), then the duel (4 s). Roughly every half minute.
  useEffect(() => {
    if (!spar || mood !== 'happy' || reduced() || !wide()) return undefined;
    let t1; let t2; let t3;
    const schedule = (ms) => { t1 = setTimeout(run, ms); };
    const run = () => {
      if (document.hidden || busy.current || !wide()) { schedule(6000); return; }
      busy.current = true;
      setActKey((k) => k + 1);
      setAct('throw');
      t2 = setTimeout(() => setAct('duel'), 2600);
      t3 = setTimeout(() => { setAct(null); busy.current = false; schedule(24000 + Math.random() * 16000); }, 6600);
    };
    schedule(7000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); setAct(null); busy.current = false; };
  }, [spar, mood]);

  const showWave = waving && mood === 'happy' && !act;
  const active = act ?? (showWave ? 'wave' : mood);
  const img = (src, key, on) => (
    <img
      key={key}
      src={src}
      alt={on ? alt : ''}
      aria-hidden={on ? undefined : true}
      width="220"
      height="232"
      className={on ? 'is-on' : undefined}
      decoding="async"
    />
  );

  return (
    <span
      ref={root}
      className={`ody-mascot${enter ? ' ody-mascot--enter' : ''}${spar ? ' ody-mascot--spar' : ''}${className ? ` ${className}` : ''}`}
      data-mood={mood}
      data-act={act ?? undefined}
    >
      <span className="ody-mascot__stage">
        {spar && (
          <span className="ody-target" aria-hidden="true">
            <span className="ody-target__post" />
            <svg className="ody-target__disc" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="40" fill="#152839" />
              <circle cx="40" cy="40" r="31" fill="#F9F8F3" />
              <circle cx="40" cy="40" r="22" fill="#FF6F07" />
              <circle cx="40" cy="40" r="11" fill="#152839" />
              <circle cx="40" cy="40" r="4" fill="#F9F8F3" />
            </svg>
          </span>
        )}
        {act === 'duel' && (
          <span className="ody-fx" key={`fx-${actKey}`} aria-hidden="true">
            <FocusLines className="ody-fx__focus ody-fx__focus--start" />
            <FocusLines className="ody-fx__focus ody-fx__focus--apex" />
            <span className="ody-fx__streaks"><i /><i /><i /><i /><i /></span>
            {[1, 2, 3].map((g) => (
              <span key={g} className="ody-fx__ghost" style={{ '--g': g }}>
                <img src="/brand/ody-erx-thinking.svg" alt="" />
              </span>
            ))}
            <Burst className="ody-fx__burst" />
            <span className="ody-fx__ring" />
          </span>
        )}
        <span className="ody-mascot__act">
          <span className="ody-mascot__float">
            <span className="ody-mascot__mood">
              <span
                className={`ody-mascot__hop${hop ? ' is-hop' : ''}`}
                onPointerEnter={() => setHop(true)}
                onAnimationEnd={(e) => { if (e.target === e.currentTarget) setHop(false); }}
              >
                {MOODS.map((m) => img(`/brand/ody-erx-${m}.svg`, m, m === active))}
                {showWave && img('/brand/ody-erx-wave.svg', `wave-${wave}`, true)}
                {act === 'throw' && img('/brand/ody-erx-throw.svg', `throw-${actKey}`, true)}
                {act === 'duel' && img('/brand/ody-erx-duel.svg', `duel-${actKey}`, true)}
              </span>
            </span>
          </span>
        </span>
        {act === 'throw' && (
          <span className="ody-spear" key={`spear-${actKey}`} aria-hidden="true">
            <span className="ody-spear__y"><span className="ody-spear__r"><img src="/brand/ody-spear.svg" alt="" /></span></span>
          </span>
        )}
      </span>
    </span>
  );
}

/** Concentration lines: tapered wedges radiating from a centre, flat navy. */
function FocusLines({ className }) {
  const wedges = Array.from({ length: 20 }, (_, i) => {
    const a = (i / 20) * Math.PI * 2 + (i % 2 ? 0.05 : 0);
    const w = 0.035 + (i % 3) * 0.012;
    const r0 = 70 + (i % 4) * 8; const r1 = 130;
    const p = (r, t) => `${(r * Math.cos(t)).toFixed(1)},${(r * Math.sin(t)).toFixed(1)}`;
    return <polygon key={i} points={`${p(r0, a)} ${p(r1, a - w)} ${p(r1, a + w)}`} />;
  });
  return <svg className={className} viewBox="-130 -130 260 260" fill="#152839">{wedges}</svg>;
}

/** A flat hit spark: orange star with a warm-white core. */
function Burst({ className }) {
  const star = (n, ro, ri) => Array.from({ length: n * 2 }, (_, i) => {
    const r = i % 2 ? ri : ro; const t = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    return `${(r * Math.cos(t)).toFixed(1)},${(r * Math.sin(t)).toFixed(1)}`;
  }).join(' ');
  return (
    <svg className={className} viewBox="-60 -60 120 120">
      <polygon points={star(12, 60, 24)} fill="#FF6F07" />
      <polygon points={star(9, 32, 14)} fill="#F9F8F3" />
    </svg>
  );
}

export function Lockup({ to = '/', light = false }) {
  return (
    <Link to={to} className="lockup" aria-label="E-Prescription by ODYSSEY, home">
      <img src={light ? '/brand/odyssey-monogram-reverse.svg' : '/brand/odyssey-monogram.svg'} alt="" width="70" height="34" />
      <span className="lockup__name">
        <b>E-Prescription</b>
        <span>by ODYSSEY</span>
      </span>
    </Link>
  );
}

const NAV = [
  { to: '/#how', label: 'How it works' },
  { to: '/#features', label: 'Features' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/#patients', label: 'For patients' },
];

export function SiteNav() {
  return (
    <header className="wrap">
      <nav className="nav" aria-label="Main">
        <Lockup />
        <div className="nav__links">
          {NAV.map((n) =>
            n.to.startsWith('/#') ? (
              <a key={n.to} href={n.to} className="hide-sm">{n.label}</a>
            ) : (
              <NavLink key={n.to} to={n.to} className="hide-sm">{n.label}</NavLink>
            ),
          )}
          <Link to="/login" className="hide-sm">Sign in</Link>
          <Link to="/doctor/register" className="btn">Start free</Link>
          <details className="nav__menu">
            <summary aria-label="Menu">Menu</summary>
            <ul>
              {NAV.map((n) => <li key={n.to}><a href={n.to}>{n.label}</a></li>)}
              <li><Link to="/login">Sign in</Link></li>
            </ul>
          </details>
        </div>
      </nav>
    </header>
  );
}

/** The closing field: Ody returns, large, with the one action. */
export function Closer({ title = 'Write your first Rx today', children }) {
  return (
    <section className="closer wrap grid" aria-labelledby="closer-h">
      <div className="closer__ody" data-reveal>
        <Ody mood="happy" alt="Ody, the ODYSSEY mascot, holding the Rod of Asclepius" />
      </div>
      <div className="closer__text">
        <h2 id="closer-h" data-reveal>{title}</h2>
        <p data-reveal style={{ '--i': 1 }}>
          {children ?? 'Register with your PRC license. Once an administrator approves it, you can send your first prescription the same day.'}
        </p>
        <p className="closer__fact" data-reveal style={{ '--i': 2 }}>Free for 20 prescriptions a month</p>
        <div data-reveal style={{ '--i': 3 }}>
          <Link to="/doctor/register" className="btn">Start free</Link>
        </div>
      </div>
    </section>
  );
}

export function Faq({ id = 'faq', title = 'Questions', intro, items }) {
  return (
    <section className="faq wrap grid" aria-labelledby={`${id}-h`} id={id}>
      <div className="faq__head">
        <h2 id={`${id}-h`} data-reveal>{title}</h2>
        {intro && <p data-reveal style={{ '--i': 1 }}>{intro}</p>}
      </div>
      <div className="faq__list">
        {items.map(([q, a], i) => (
          <details key={q} name={id} data-reveal style={{ '--i': i % 4 }} open={i === 0}>
            <summary>{q}<span className="plus" aria-hidden="true" /></summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/** The prescription as it opens on the patient's phone. Drawn, sample data. */
export function PhoneRx() {
  return (
    <div className="mini__phone" data-ui>
      <RxSlip stage="paid" />
    </div>
  );
}

/** What the patient sees before paying. Drawn, sample data. */
export function PayCard() {
  return (
    <div className="mini" data-ui>
      <div className="mini__title">Scan to pay <span>Rx 2026-1048</span></div>
      <div className="mini__qr">
        <QrMark />
        <div>
          <b className="mini__fee">₱50</b>
          <div className="muted">GCash, Maya or any bank app that reads QR Ph</div>
        </div>
      </div>
      <span className="mini__btn">I’ve paid</span>
    </div>
  );
}

/** How a hospital's departments sit under one account. Drawn, sample data. */
export function DepartmentsCard() {
  return (
    <div className="mini" data-ui>
      <div className="mini__title">Departments <span>3 of 12</span></div>
      <table>
        <tbody>
          <tr><td>Pediatrics<br /><span className="muted">6 doctors</span></td><td>412 Rx</td></tr>
          <tr><td>Internal medicine<br /><span className="muted">9 doctors</span></td><td>780 Rx</td></tr>
          <tr><td>Out-patient<br /><span className="muted">11 doctors</span></td><td>1,046 Rx</td></tr>
        </tbody>
      </table>
      <span className="mini__btn">Billed by invoice</span>
    </div>
  );
}

const BIR_VERIFY_URL = 'https://verify.bir.gov.ph/correspondence/c9241e25c7124474aa284e88c4872cc8';

export function SiteFooter() {
  return (
    <footer className="foot wrap on-navy">
      <img
        className="foot__mark"
        src="/brand/odyssey-horizontal-reverse.svg"
        alt="ODYSSEY"
        width="302"
        height="60"
        loading="lazy"
      />
      <div className="foot__cols grid">
        <div className="foot__col">
          <h2>Product</h2>
          <ul>
            <li><a href="/#how">How it works</a></li>
            <li><Link to="/pricing">Pricing and limits</Link></li>
            <li><Link to="/sample">Sample prescription</Link></li>
          </ul>
        </div>
        <div className="foot__col">
          <h2>Doctors</h2>
          <ul>
            <li><Link to="/doctor/register">Register</Link></li>
            <li><Link to="/login">Sign in</Link></li>
          </ul>
        </div>
        <div className="foot__col">
          <h2>Patients</h2>
          <ul>
            <li><a href="/#patients">Open a prescription</a></li>
          </ul>
        </div>
        <div className="foot__col">
          <h2>Legal</h2>
          <ul>
            <li><Link to="/terms">Terms and Conditions</Link></li>
            <li><Link to="/privacy">Privacy Policy</Link></li>
          </ul>
        </div>
        <div className="foot__about">
          <p>E-Prescription is built by ODYSSEY, which designs and builds websites, applications and business systems.</p>
          <p>Prescriptions hold personal health information protected under the Data Privacy Act of 2012 (RA 10173). E-Prescription is software and does not replace a physician’s judgment.</p>
          {/* BIR registration seal, required for businesses selling online. Lettering is drawn light for the navy
              footer and the QR keeps a light tile so it scans. It opens BIR's own verification page (the QR's link). */}
          <a className="foot__seal" href={BIR_VERIFY_URL} target="_blank" rel="noopener noreferrer"
            aria-label="BIR registered business, 2026. Verify on the Bureau of Internal Revenue website (opens in a new tab)">
            <img src="/bir-registered-2026-navy.png" alt="" width="990" height="300" loading="lazy" />
            <span>BIR registered · Tap or scan to verify</span>
          </a>
        </div>
      </div>
      <div className="foot__last">
        <span>© {new Date().getFullYear()} ODYSSEY</span>
        <Link to="/doctor/register" className="btn btn--accent">Start free</Link>
      </div>
    </footer>
  );
}

/** A Philippine Rx slip at one stage of its trip. Supports live custom values for doctor portal preview. */
export function RxSlip({
  stage = 'written',
  className = '',
  clinicName,
  doctorName,
  specialty,
  prcNo,
  ptrNo,
  patientName,
  patientAge,
  date,
  medicines,
  diagnosis,
}) {
  const locked = stage === 'sent';
  const displayClinic = clinicName || 'Dela Cruz Family Clinic';
  const displayDoctor = doctorName
    ? (doctorName.toLowerCase().startsWith('dr') ? doctorName : `Dr. ${doctorName}`)
    : 'Dr. Maria Dela Cruz';
  const displaySpecialty = specialty ? ` · ${specialty}` : ' · Pediatrics';
  const displayPatient = patientName
    ? `${patientName}${patientAge ? `, ${patientAge}` : ''}`
    : 'Juan Santos, 8 y';
  const displayDate = date || '20 Oct 2026';
  const displayPrc = prcNo ? `PRC ${prcNo}` : 'PRC 0123456';
  const displayPtr = ptrNo ? ` · PTR ${ptrNo}` : ' · PTR 7654321';

  return (
    <div className={`rx ${className}`} data-ui>
      <div className="rx__head">
        <div>
          <div className="rx__clinic">{displayClinic}</div>
          <div className="rx__doc">{displayDoctor}{displaySpecialty}</div>
        </div>
        <span className="rx__symbol" aria-hidden="true">℞</span>
      </div>
      <div className="rx__patient"><span>{displayPatient}</span><span className="num">{displayDate}</span></div>
      {diagnosis && (
        <div className="rx__diag text-xs text-[#5f6a7c] pb-2 border-b border-[#dce1e8]">
          <span className="font-semibold text-[#152839]">Dx:</span> {diagnosis}
        </div>
      )}
      <div className={locked ? 'rx__blur' : ''} aria-hidden={locked || undefined}>
        {medicines && medicines.length > 0 && medicines[0]?.genericName ? (
          medicines.map((m, idx) => (
            <div key={idx} className="rx__med">
              <b>{m.genericName}{m.brandName ? ` (${m.brandName})` : ''}</b>
              <span>{[m.strength, m.form].filter(Boolean).join(' ')}{m.quantity ? ` · Disp. ${m.quantity}` : ''}</span>
              {(m.dose || m.frequency || m.instructions) && (
                <div className="rx__sig">
                  Sig: {[m.dose, m.frequency, m.duration, m.instructions].filter(Boolean).join(' ')}
                </div>
              )}
            </div>
          ))
        ) : (
          <>
            <div className="rx__med">
              <b>Amoxicillin (Amoxil)</b>
              <span>250 mg / 5 mL suspension · Disp. 1 bottle</span>
              <div className="rx__sig">Sig: 5 mL three times a day for 7 days</div>
            </div>
            <div className="rx__med">
              <b>Paracetamol (Biogesic)</b>
              <span>120 mg / 5 mL syrup · Disp. 1 bottle</span>
              <div className="rx__sig">Sig: 5 mL every 4 hours if fever</div>
            </div>
          </>
        )}
      </div>
      <div className="rx__foot">
        <span>{displayPrc}{displayPtr}</span>
        <span className="rx__sign">{displayDoctor.replace(/^Dr\.\s*/i, '')}</span>
      </div>
      {stage === 'sent' && <div className="rx__tag">Locked · sent by Viber, 10:31 AM</div>}
      {stage === 'paid' && <div className="rx__tag rx__tag--paid">Paid ₱50 by GCash · open</div>}
      {stage === 'filled' && <div className="rx__tag">Printed at the pharmacy, 4:12 PM</div>}
    </div>
  );
}

/** A drawn payment QR (decorative, not scannable). */
export function QrMark() {
  const cells = [];
  const on = (x, y) => ((x * 7 + y * 13 + x * y) % 5 < 2);
  for (let y = 0; y < 21; y += 1) {
    for (let x = 0; x < 21; x += 1) {
      const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
      if (finder) continue;
      if (on(x, y)) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />);
    }
  }
  const finder = (x, y) => (
    <g key={`f${x}${y}`}>
      <rect x={x} y={y} width="7" height="7" rx="2" />
      <rect x={x + 1} y={y + 1} width="5" height="5" rx="1.4" fill="#fff" />
      <rect x={x + 2} y={y + 2} width="3" height="3" rx=".8" />
    </g>
  );
  return (
    <svg viewBox="0 0 21 21" fill="#152839" aria-hidden="true">
      {cells}
      {finder(0, 0)}{finder(14, 0)}{finder(0, 14)}
    </svg>
  );
}
