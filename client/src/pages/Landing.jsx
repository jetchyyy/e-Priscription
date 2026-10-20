import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { extractRxId } from '../lib/utils';
import '../features/marketing/site.css';
import {
  Closer, Faq, Ody, PayCard, PhoneRx, RxSlip, SiteFooter, SiteNav, useSiteMotion,
} from '../features/marketing/components';
import { PLANS, peso } from '../features/marketing/plans';

/* ---------- hero: the link, and the moment it is paid ---------- */
function SentPanel({ state, simulate }) {
  const status = {
    waiting: ['Waiting for payment', '₱50 access fee · link sent by Viber at 10:31 AM'],
    checking: ['Receipt received', 'GCash ref. 1234 567 890123 · you confirm it in your app'],
    paid: ['Paid · prescription open', 'GCash ₱50 at 10:42 AM · opened on the patient’s phone'],
  }[state];

  return (
    <div className="hero__scene">
      <div className="panel" data-ui>
        <div className="panel__top">
          <span className="panel__title">Prescription sent</span>
          <span className="panel__meta num">Rx 2026-1048</span>
        </div>
        <div className="panel__link">
          <code>eprescription.ph/rx/Vt3kQ9…a7Lm</code>
          <span className="panel__chip">Copied</span>
        </div>
        <dl className="panel__rows">
          <dt>Patient</dt><dd>Juan Santos</dd>
          <dt>Sent to</dt><dd>Viber, +63 917 ••• 2210</dd>
          <dt>Security PIN</dt><dd>On, 4 digits</dd>
        </dl>
        <div className="status" data-state={state} role="status" aria-live="polite">
          <span className="status__dot" aria-hidden="true" />
          <span><b>{status[0]}</b>{status[1]}</span>
        </div>
        <div className="panel__actions">
          <button type="button" className="btn" onClick={simulate} disabled={state === 'checking'}>
            {state === 'paid' ? 'Run it again' : 'Show the patient paying'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  const [state, setState] = useState('waiting');
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const simulate = () => {
    if (state !== 'waiting') { setState('waiting'); return; }
    setState('checking');
    timer.current = setTimeout(() => setState('paid'), 1400);
  };
  const mood = state === 'paid' ? 'celebrate' : state === 'checking' ? 'thinking' : 'happy';

  return (
    <section className="hero wrap" aria-labelledby="hero-h">
      <div className="hero__text">
        <h1 id="hero-h">Prescriptions, sent as a&nbsp;link</h1>
        <p className="hero__lead">
          Write the Rx in your clinic, send it by Viber or SMS, and your patient pays by GCash or Maya QR to open it.
          For PRC-licensed doctors in the Philippines.
        </p>
        <div className="hero__actions">
          <Link to="/doctor/register" className="btn btn--accent">Start free</Link>
          <Link to="/pricing" className="link">See plans and limits</Link>
        </div>
      </div>
      <div className="hero__ody">
        <Ody enter spar mood={mood} alt={state === 'paid' ? 'Ody celebrating: the prescription was paid and opened' : 'Ody, the ODYSSEY mascot, welcoming you'} />
      </div>
      <div className="hero__stage" aria-label="Example: a prescription link waiting for payment">
        <div className="o-letter">
          <div className="o-letter__rim">
            <div className="o-letter__counter">
              <SentPanel state={state} simulate={simulate} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- how a Rx travels ---------- */
const TRIP = [
  ['written', 'First you write it.', 'Patient, medicines by generic name, strength, quantity and Sig, with your PRC and PTR numbers.'],
  ['sent', 'Then it goes as a link.', 'Copy it into Viber, Messenger or SMS. Until it is paid the server sends only a masked preview.'],
  ['paid', 'Your patient pays to open it.', 'They pay your QR with GCash, Maya or a bank app and send the receipt. You confirm it, and the Rx opens on their phone.'],
  ['filled', 'The pharmacy reads it in full.', 'The patient shows it on screen or prints it. Your signature and license numbers stay on it.'],
];

function Travel() {
  return (
    <section className="travel" id="how" aria-labelledby="how-h">
      {TRIP.map(([stage, clause, detail], i) => (
        <div className="travel__field" key={stage}>
          <div className="travel__head">
            {i === 0 && <h2 id="how-h" data-reveal>How a prescription travels</h2>}
          </div>
          <div className="travel__card">
            <div data-reveal style={{ '--i': 1 }}><RxSlip stage={stage} /></div>
          </div>
          <div className="travel__txt">
            <p className="travel__clause" data-reveal style={{ '--i': 2 }}>{clause}</p>
            <p className="travel__detail" data-reveal style={{ '--i': 3 }}>{detail}</p>
          </div>
        </div>
      ))}
    </section>
  );
}

/* ---------- four desks on the O ---------- */
function DoctorDesk() {
  return (
    <div className="mini" data-ui>
      <div className="mini__title">Today’s prescriptions <span>3 of 250</span></div>
      <table>
        <tbody>
          <tr><td>Juan Santos<br /><span className="muted">10:31 AM</span></td><td>Paid ₱50</td></tr>
          <tr><td>Ana Reyes<br /><span className="muted">11:05 AM</span></td><td className="muted">Waiting</td></tr>
          <tr><td>Pedro Cruz<br /><span className="muted">1:48 PM</span></td><td>Paid ₱50</td></tr>
        </tbody>
      </table>
      <span className="mini__btn">New prescription</span>
    </div>
  );
}
function AdminReview() {
  return (
    <div className="mini" data-ui>
      <div className="mini__title">Doctors to review <span>2 pending</span></div>
      <table>
        <tbody>
          <tr><td>Dr. Liza Manalo<br /><span className="muted">PRC 0145522 · Internal medicine</span></td><td>Review</td></tr>
          <tr><td>Dr. Ramon Uy<br /><span className="muted">PRC 0098317 · Family medicine</span></td><td>Review</td></tr>
        </tbody>
      </table>
      <span className="mini__btn">Open license</span>
    </div>
  );
}

const DESKS = [
  { name: 'The doctor’s desk', disc: 'var(--sand)', View: DoctorDesk, title: 'Write, send, follow up', text: 'Every prescription you sent, with who has paid and who has not. Start a new one from the same screen.' },
  { name: 'The patient’s phone', disc: 'var(--navy)', View: PhoneRx, title: 'No app, no account', text: 'The link opens in any phone browser. Until it is paid, the server returns a masked preview: the blur is only for looks.' },
  { name: 'Your payment QR', disc: 'var(--mist)', View: PayCard, title: 'The fee goes to your QR', text: 'Upload your own GCash, Maya or bank QR and set the access fee. You can keep several and switch them on or off.' },
  { name: 'The admin review', disc: 'var(--white)', View: AdminReview, title: 'Licensed doctors only', text: 'An administrator checks each PRC license before that doctor can issue a single prescription.' },
];

function Desks() {
  const [i, setI] = useState(0);
  const d = DESKS[i];
  const View = d.View;
  return (
    <section className="show wrap" aria-labelledby="desks-h">
      <div className="show__inner grid">
        <div className="show__stage">
          <div className="show__disc" style={{ '--disc': d.disc }} aria-hidden="true" />
          <div className="show__object" key={d.name}><View /></div>
        </div>
        <ul className="show__list" data-reveal>
          <li><h2 id="desks-h">One system, four desks</h2></li>
          {DESKS.map((x, k) => (
            <li key={x.name}>
              <button type="button" aria-pressed={k === i} onClick={() => setI(k)}>
                <span className="o-dot" aria-hidden="true" />{x.name}
              </button>
            </li>
          ))}
        </ul>
        <div className="show__fact" aria-live="polite">
          <h3>{d.title}</h3>
          <p>{d.text}</p>
        </div>
      </div>
    </section>
  );
}

/* ---------- the small points ---------- */
const POINTS = [
  ['Masked until paid', 'Unpaid links carry no clinical data at all, so nothing leaks from the network tab.'],
  ['Security PIN', 'Add a 4 to 6 digit PIN you tell the patient in person. Paid links still need it.'],
  ['PRC-verified', 'Doctors are approved by an administrator after a license check.'],
  ['Generic names first', 'Each medicine is written generic first, brand in brackets, as RA 6675 asks.'],
  ['Your letterhead', 'Clinic name, address, specialty, PRC, PTR and S2 numbers on every slip.'],
  ['Print or save as PDF', 'The patient can print a clean copy for the pharmacy counter.'],
  ['Pays to your QR', 'GCash, Maya and the major banks. The access fee is yours to set.'],
  ['Made for phones', 'Readable at 375 pixels wide, where most patients open their link.'],
  ['Private storage', 'Licenses sit in a private bucket. Prescription content is never written to logs.'],
];

function Points() {
  return (
    <section className="points wrap grid" id="features" aria-labelledby="features-h">
      <figure className="points__art shutter" aria-label="A prescription open on a patient’s phone">
        <div className="o-shape">
          <div className="o-letter">
            <div className="o-letter__rim">
              <div className="o-letter__counter o-letter__counter--centre"><PhoneRx /></div>
            </div>
          </div>
        </div>
        <figcaption>How the Rx looks on your patient’s phone once it is paid.</figcaption>
      </figure>
      <div className="points__body">
        <h2 id="features-h" data-reveal>What every plan includes</h2>
        <p className="points__lead" data-reveal style={{ '--i': 1 }}>
          Security and the Philippine Rx format are not paid extras. These come with Starter as well as Clinic.
        </p>
        <ul>
          {POINTS.map(([t, d], k) => (
            <li key={t} data-reveal style={{ '--i': k % 3 }}>
              <h3><span className="o-dot" aria-hidden="true" />{t}</h3>
              <p>{d}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------- two plans, two fields ---------- */
function Duo() {
  const [, solo, clinic] = PLANS;
  return (
    <section className="duo" aria-label="Plans">
      <div className="duo__field">
        <h2 data-reveal>{clinic.name}</h2>
        <p className="duo__who" data-reveal style={{ '--i': 1 }}>{clinic.who}</p>
        <p className="duo__incl" data-reveal style={{ '--i': 2 }}>
          1,500 prescriptions a month shared by up to five doctors, ten payment QRs, a letterhead for each doctor,
          a clinic admin and an onboarding call.
        </p>
        <div className="duo__foot">
          <p className="duo__price num">{peso(clinic.monthly)}<small>a month</small></p>
          <Link to="/pricing" className="btn btn--light">Compare</Link>
        </div>
      </div>
      <div className="duo__field">
        <h2 data-reveal>{solo.name}</h2>
        <p className="duo__who" data-reveal style={{ '--i': 1 }}>{solo.who}</p>
        <p className="duo__incl" data-reveal style={{ '--i': 2 }}>
          250 prescriptions a month, three payment QRs, your full history, your own clinic letterhead and CSV export.
          Starter is free for 20 prescriptions a month if you want to try it first.
        </p>
        <div className="duo__foot">
          <p className="duo__price num">{peso(solo.monthly)}<small>a month</small></p>
          <Link to="/doctor/register" className="btn">Start free</Link>
        </div>
      </div>
    </section>
  );
}

/* ---------- patients: the real link opener ---------- */
function Patients() {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const open = (e) => {
    e.preventDefault();
    const id = extractRxId(value);
    if (!id) return setError('That doesn’t look like a prescription link. Paste the full link your doctor sent.');
    navigate(`/rx/${id}`);
  };
  return (
    <section className="patients wrap grid" id="patients" aria-labelledby="patients-h">
      <div className="patients__text">
        <h2 id="patients-h" data-reveal>Got a link from your doctor?</h2>
        <p className="patients__lead" data-reveal style={{ '--i': 1 }}>
          You do not need an account or an app. Paste the link here, or simply tap it in your messages.
        </p>
        <form onSubmit={open} noValidate data-reveal style={{ '--i': 2 }}>
          <label htmlFor="rx-input">Prescription link</label>
          <div className="field">
            <input
              id="rx-input"
              value={value}
              onChange={(e) => { setValue(e.target.value); setError(''); }}
              placeholder="Paste the link your doctor sent"
              inputMode="url"
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'rx-input-err' : undefined}
            />
            <button type="submit" className="btn">Open</button>
          </div>
          {error && <p id="rx-input-err" role="alert" className="form-err">{error}</p>}
        </form>
        <ul className="patients__steps" data-reveal style={{ '--i': 3 }}>
          <li><span className="o-dot" style={{ '--c': 'var(--navy)' }} aria-hidden="true" />You see your doctor’s name and the fee before you pay.</li>
          <li><span className="o-dot" style={{ '--c': 'var(--orange)' }} aria-hidden="true" />Pay with GCash, Maya or your bank app by scanning the QR.</li>
          <li><span className="o-dot" style={{ '--c': 'var(--harbor)' }} aria-hidden="true" />Send the receipt. Your prescription opens as soon as your doctor confirms the payment.</li>
        </ul>
      </div>
      <figure className="patients__photo" data-reveal style={{ '--i': 1 }} aria-label="What the patient sees before paying">
        <div className="o-shape o-shape--art" style={{ '--bg': 'var(--mist)' }}>
          <PayCard />
        </div>
        <figcaption>What opens when a patient taps your link.</figcaption>
      </figure>
    </section>
  );
}

const QUESTIONS = [
  ['Is an e-prescription valid at Philippine pharmacies?', 'The slip follows the Philippine Rx layout with your PRC and PTR numbers and generic names. Check current PRC, DOH and FDA rules for your specialty, and keep dangerous drugs that need an S2 yellow prescription on paper.'],
  ['Who receives the access fee?', 'You do. Patients pay the fee you set into the GCash, Maya or bank QR you uploaded. Your plan is billed separately.'],
  ['What does the patient see before paying?', 'Your name, the clinic and the fee. The medicines, diagnosis and full patient name are not sent to their phone until payment is confirmed.'],
  ['How is the patient’s payment confirmed?', 'For now, by you. Your patient pays your QR and sends the reference number and a screenshot of the receipt. You check the payment in your own e-wallet or bank app and tap “Payment received”, and the prescription opens on their phone. Automatic confirmation through a payment gateway is planned.'],
  ['Can I change a prescription after sending it?', 'No. Prescriptions cannot be edited once issued, so the pharmacy sees exactly what you signed. Write a new one if something changes.'],
  ['Can I change my name or PRC number after I am approved?', 'Your name, PRC license number, specialty and S2 number are checked by an administrator, so after approval you change them through a request with your current PRC ID. Clinic name, address, contact number and PTR you can update yourself at any time. Prescriptions you already sent keep the details they were issued with.'],
  ['How long does approval take?', 'An administrator reviews your PRC license after you register. You can sign in while you wait and see your status.'],
  ['What happens to patient data?', 'It is stored with row-level security, licenses sit in private storage and prescription content is never logged, in line with the Data Privacy Act (RA 10173).'],
  ['Can my clinic staff use it?', 'On the Clinic plan up to five doctors share one account and a clinic admin can see everyone’s history and reports.'],
];

export default function Landing() {
  const ref = useSiteMotion();
  useEffect(() => { document.title = 'E-Prescription by ODYSSEY · Prescriptions sent as a link'; }, []);
  return (
    <div className="ody" ref={ref}>
      <SiteNav />
      <main>
        <Hero />
        <Travel />
        <Desks />
        <Points />
        <Duo />
        <Patients />
        <Faq id="faq" title="Questions doctors ask" intro="Short answers to what doctors ask before they register." items={QUESTIONS} />
        <Closer />
      </main>
      <SiteFooter />
    </div>
  );
}
