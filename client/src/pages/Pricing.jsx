import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import '../features/marketing/site.css';
import {
  Closer, DepartmentsCard, Faq, PhoneRx, RxSlip, SiteFooter, SiteNav, useSiteMotion,
} from '../features/marketing/components';
import { CONTACT_EMAIL, limitRows, peso, recommend, yearlyPrice } from '../features/marketing/plans';
import { usePublicPlans } from '../features/billing/usePlans';

const signup = (plan) => `/doctor/register?plan=${plan.id}`;

function priceFor(plan, yearly) {
  if (!plan.monthly) return { big: '₱0', small: 'forever', note: 'No card needed' };
  const saved = plan.monthly * 12 - plan.yearly;
  return yearly
    ? { big: peso(plan.yearly), small: 'a year', note: saved > 0 ? `${peso(saved)} less than paying monthly` : 'Paid once a year' }
    : { big: peso(plan.monthly), small: 'a month', note: 'Billed monthly, cancel any time' };
}

function Steps({ plans, yearly, setYearly }) {
  return (
    <section className="p-hero wrap" aria-labelledby="pricing-h">
      <div className="steps">
        <div className="steps__head">
          <h1 id="pricing-h" data-reveal>Simple plans, clear limits</h1>
          <p className="steps__lead" data-reveal style={{ '--i': 1 }}>
            Each plan is a number of prescriptions a month. Security, PRC checks and QR payments come with all of them.
          </p>
          <div className="billing" role="group" aria-label="Billing period" data-reveal style={{ '--i': 2 }}>
            <button type="button" aria-pressed={!yearly} onClick={() => setYearly(false)}>Monthly</button>
            <button type="button" aria-pressed={yearly} onClick={() => setYearly(true)}>Yearly, 2 months free</button>
          </div>
        </div>
        {plans.map((plan, i) => {
          const p = priceFor(plan, yearly);
          return (
            <article className="tile" key={plan.id} data-reveal style={{ '--i': i }} aria-labelledby={`tile-${plan.id}`}>
              <div className="tile__body">
                <h2 id={`tile-${plan.id}`}>{plan.name}</h2>
                <p className="tile__price num">{p.big}<small>{p.small}</small></p>
                <p className="tile__note">{p.note}</p>
                <p className="tile__limit num">{plan.rxLimit.toLocaleString('en-PH')} prescriptions a month</p>
                <ul>
                  {plan.lines.map((l) => <li key={l}><span className="o-dot" aria-hidden="true" />{l}</li>)}
                </ul>
              </div>
              <Link to={signup(plan)} className="tile__strip">
                {plan.cta}<span className="arrow" aria-hidden="true">→</span>
              </Link>
            </article>
          );
        })}
      </div>
      <div className="p-more">
        <p>Prices in Philippine pesos, VAT included. Patients pay the access fee you set, straight to your QR.</p>
        <p>
          More than 1,500 prescriptions or 15 doctors?{' '}
          <a className="link" href={`mailto:${CONTACT_EMAIL}?subject=E-Prescription%20for%20our%20hospital`}>Talk to us about a hospital plan</a>
        </p>
      </div>
    </section>
  );
}

function Calculator({ plans, yearly }) {
  const [rx, setRx] = useState(120);
  const [doctors, setDoctors] = useState(1);
  const { plan, extraDoctors } = recommend(rx, doctors, plans);
  const max = 2000;

  let price = 0;
  let perRx = null;
  if (plan) {
    const extra = (extraDoctors || 0) * (plan.extraDoctor || 0);
    const monthly = plan.monthly + extra;
    price = yearly ? plan.yearly + yearlyPrice(extra) : monthly;
    perRx = rx > 0 && monthly > 0 ? (yearly ? price / 12 : monthly) / rx : 0;
  }
  const use = plan ? Math.min(100, Math.round((rx / plan.rxLimit) * 100)) : 100;

  return (
    <section className="calc wrap grid" aria-labelledby="calc-h">
      <div className="calc__controls">
        <h2 id="calc-h" data-reveal>Find your plan</h2>
        <p className="calc__lead" data-reveal style={{ '--i': 1 }}>
          Move the slider to the number of prescriptions your clinic writes in a usual month.
        </p>
        <div className="ctl" data-reveal style={{ '--i': 2 }}>
          <label htmlFor="rx-range">
            Prescriptions a month <output htmlFor="rx-range" className="num">{rx.toLocaleString('en-PH')}</output>
          </label>
          <input
            id="rx-range"
            type="range"
            min="0"
            max={max}
            step="10"
            value={rx}
            onChange={(e) => setRx(Number(e.target.value))}
          />
          <div className="ctl__scale num" aria-hidden="true"><span>0</span><span>1,000</span><span>2,000</span></div>
        </div>
        <div className="ctl" data-reveal style={{ '--i': 3 }}>
          <span id="doc-label" style={{ fontWeight: 600 }}>Doctors using it</span>
          <div className="stepper" role="group" aria-labelledby="doc-label">
            <button type="button" onClick={() => setDoctors((d) => Math.max(1, d - 1))} disabled={doctors <= 1} aria-label="One fewer doctor">−</button>
            <span className="num" aria-live="polite">{doctors} {doctors === 1 ? 'doctor' : 'doctors'}</span>
            <button type="button" onClick={() => setDoctors((d) => Math.min(20, d + 1))} disabled={doctors >= 20} aria-label="One more doctor">+</button>
          </div>
        </div>
      </div>
      <div className="calc__frame" data-reveal style={{ '--i': 1 }}>
        <div className="frame">
          <div className="frame__rim">
            <div className="frame__counter">
              <div className="calc__answer" aria-live="polite">
                {plan ? (
                  <>
                    <p className="calc__plan">{plan.name}{extraDoctors ? ` + ${extraDoctors} extra ${extraDoctors === 1 ? 'doctor' : 'doctors'}` : ''}</p>
                    <p className="calc__price num">{peso(price)}<small>{yearly ? 'a year' : 'a month'}</small></p>
                    <p className="calc__per num">
                      {perRx ? `About ${peso(perRx.toFixed(2))} per prescription` : `Free while you stay under ${plan.rxLimit.toLocaleString('en-PH')} a month`}
                    </p>
                    <div className="calc__use" style={{ '--use': `${use}%` }}><i /></div>
                    <p className="calc__usenote num">Uses {use}% of the {plan.rxLimit.toLocaleString('en-PH')} included</p>
                    <Link to={signup(plan)} className="btn">{plan.cta}</Link>
                  </>
                ) : (
                  <>
                    <p className="calc__plan">Hospital plan</p>
                    <p className="calc__price">Let’s talk</p>
                    <p className="calc__per">Above 1,500 prescriptions or 15 doctors we size the plan with you.</p>
                    <a className="btn" href={`mailto:${CONTACT_EMAIL}?subject=E-Prescription%20hospital%20plan`}>Email us</a>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Limits({ plans, yearly }) {
  const rec = Math.max(0, plans.findIndex((p) => p.id === 'solo'));
  const rows = limitRows(plans);
  return (
    <section className="limits wrap" aria-labelledby="limits-h">
      <h2 id="limits-h" data-reveal>Every limit, side by side</h2>
      <p className="limits__lead" data-reveal style={{ '--i': 1 }}>
        Limits reset on the first day of each month, Manila time. Unused prescriptions do not carry over.
      </p>
      <table className="ltable" data-reveal style={{ '--i': 2 }}>
        <caption className="sr-only">Plan limits compared</caption>
        <thead>
          <tr>
            <th scope="col"><span className="sr-only">Limit</span></th>
            {plans.map((p, i) => {
              const pr = priceFor(p, yearly);
              return (
                <th scope="col" key={p.id} className={i === rec ? 'rec' : undefined}>
                  <b>{p.name}</b>
                  <span className="num">{pr.big}<small>{pr.small}</small></span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              {row.values.map((v, i) => <td key={i} className={i === rec ? 'rec' : undefined}>{v}</td>)}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td />
            {plans.map((p, i) => (
              <td key={p.id} className={i === rec ? 'rec' : undefined}>
                <Link to={signup(p)} className={i === rec ? 'btn' : 'btn btn--light'}>{p.cta}</Link>
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
      <div className="lblocks">
        {plans.map((p, i) => {
          const pr = priceFor(p, yearly);
          return (
            <div className={`lblock${i === rec ? ' rec' : ''}`} key={p.id}>
              <h3>{p.name}</h3>
              <p className="lblock__price num">{pr.big} {pr.small}</p>
              <dl>
                {rows.map((row) => (
                  <div key={row.label}><dt>{row.label}</dt><dd>{row.values[i]}</dd></div>
                ))}
              </dl>
              <Link to={signup(p)} className="btn">{p.cta}</Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AtLimit() {
  return (
    <section className="atlimit on-navy" aria-labelledby="atlimit-h">
      <div className="wrap grid">
        <div style={{ gridColumn: '1 / span 5' }}>
          <h2 id="atlimit-h" data-reveal>When you reach your limit</h2>
          <p className="atlimit__lead" data-reveal style={{ '--i': 1 }}>
            Nothing you already sent stops working. Here is exactly what changes.
          </p>
          <div className="usage" data-ui data-reveal style={{ '--i': 2 }}>
            <div className="usage__top"><span>This month</span><span className="num">205 of 250</span></div>
            <div className="usage__bar"><i /></div>
            <p>You have 45 prescriptions left this month. Links you already sent keep working.</p>
            <span className="usage__btn">Move up to Clinic</span>
          </div>
        </div>
        <ol>
          {[
            ['At 80% we tell you', 'Your dashboard shows how many prescriptions are left this month, and when the count starts again.'],
            ['At 100% new ones pause', 'You cannot issue new prescriptions until the 1st. Links already sent still open, and patients can still pay.'],
            ['Upgrade or top up', 'Choose a bigger plan, or just buy a pack of extra prescriptions, from your dashboard and pay by QR. It takes effect as soon as ODYSSEY confirms your payment.'],
          ].map(([t, d], i) => (
            <li key={t} data-reveal style={{ '--i': i }}>
              <span className="o-dot" aria-hidden="true" />
              <div><b>{t}</b><p>{d}</p></div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Pharmacies() {
  return (
    <section className="pharm wrap grid" aria-labelledby="pharm-h">
      <div className="pharm__text">
        <h2 id="pharm-h" data-reveal>Any pharmacy, any plan</h2>
        <p data-reveal style={{ '--i': 1 }}>
          The slip follows the usual Philippine Rx layout, so the counter reads it the way it reads paper.
          The patient shows it on screen or prints it. No plan limits where it can be filled.
        </p>
      </div>
      <figure data-reveal style={{ '--i': 1 }} aria-label="A printed prescription">
        <div className="o-shape o-shape--art" style={{ '--bg': 'var(--sand)' }}>
          <RxSlip stage="filled" />
        </div>
        <figcaption>Printed for the counter.</figcaption>
      </figure>
      <figure data-reveal style={{ '--i': 2 }} aria-label="A prescription on a phone">
        <div className="o-shape o-shape--art" style={{ '--bg': 'var(--navy)' }}>
          <PhoneRx />
        </div>
        <figcaption>Or shown on the patient’s phone.</figcaption>
      </figure>
    </section>
  );
}

function Hospitals() {
  return (
    <section className="patients wrap grid" aria-labelledby="hosp-h">
      <figure className="patients__photo" data-reveal style={{ gridColumn: '1 / span 5', gridRow: 1 }} aria-label="Departments under one hospital account">
        <div className="o-shape o-shape--art" style={{ '--bg': 'var(--navy)' }}>
          <DepartmentsCard />
        </div>
        <figcaption>Every department under one account, billed by invoice.</figcaption>
      </figure>
      <div className="patients__text" style={{ gridColumn: '7 / span 6', gridRow: 1 }}>
        <h2 id="hosp-h" data-reveal>Hospitals and networks</h2>
        <p className="patients__lead" data-reveal style={{ '--i': 1 }}>
          For more than 1,500 prescriptions a month or more than 15 doctors, ODYSSEY plans the setup with you:
          departments, sign-in with your existing accounts, billing by invoice and a named contact.
        </p>
        <ul className="patients__steps" data-reveal style={{ '--i': 2 }}>
          <li><span className="o-dot" style={{ '--c': 'var(--navy)' }} aria-hidden="true" />We start by mapping how prescriptions move through your wards and pharmacy today.</li>
          <li><span className="o-dot" style={{ '--c': 'var(--orange)' }} aria-hidden="true" />You get a written scope, a timeline and a fixed monthly price before anything is built.</li>
          <li><span className="o-dot" style={{ '--c': 'var(--harbor)' }} aria-hidden="true" />We stay on after launch, as ODYSSEY does with every system it builds.</li>
        </ul>
        <p style={{ marginTop: 32 }} data-reveal>
          <a className="btn" href={`mailto:${CONTACT_EMAIL}?subject=E-Prescription%20for%20our%20hospital`}>Talk to us</a>
        </p>
      </div>
    </section>
  );
}

const BILLING_QS = [
  ['Is Starter really free?', 'Yes, with no card needed. It covers a small number of prescriptions a month for one doctor, and you can upgrade when you need more.'],
  ['How do I pay for a plan?', 'From your dashboard: choose a plan, scan ODYSSEY’s GCash, Maya or bank QR, and send the receipt. Your plan starts once we confirm the payment, usually within one business day.'],
  ['Do my patients pay ODYSSEY?', 'No. Patients pay the access fee you set into your own QR. Your plan is a separate subscription.'],
  ['What counts as one prescription?', 'Each Rx you issue counts once, however many medicines it lists and however often the patient opens it.'],
  ['Can I buy more prescriptions without upgrading?', 'Yes. From your dashboard, buy a pack of extra prescriptions by QR. They are used after your monthly limit runs out and stay valid for the time shown on the pack, so a busy month does not force a bigger plan.'],
  ['How do clinic accounts work?', 'A doctor buys the Clinic plan and becomes the owner. The owner invites colleagues by email; each keeps their own account, patients and QR. Everyone shares the clinic’s monthly prescriptions, and the owner can cap one doctor’s share. The owner sees counts and fees only, never patient details. More than five doctors need extra seats.'],
  ['Can I move between plans?', 'Any time. A new plan starts on the day we confirm your payment and runs for a month or a year from then. When a paid plan ends, you move back to Starter.'],
  ['What if I cancel?', 'You keep read access to your history for 90 days and can export it. Links already sent keep opening for patients.'],
];

export default function Pricing() {
  const ref = useSiteMotion();
  const [yearly, setYearly] = useState(false);
  const plans = usePublicPlans();
  const free = plans.find((p) => !p.monthly);
  useEffect(() => { document.title = 'Pricing and limits · E-Prescription by ODYSSEY'; }, []);
  return (
    <div className="ody" ref={ref}>
      <SiteNav />
      <main>
        <Steps plans={plans} yearly={yearly} setYearly={setYearly} />
        <Calculator plans={plans} yearly={yearly} />
        <Limits plans={plans} yearly={yearly} />
        <Pharmacies />
        <AtLimit />
        <Hospitals />
        <Faq id="billing" title="Billing questions" items={BILLING_QS} />
        <Closer title={`Start on ${free?.name ?? 'Starter'}, free`}>
          Register with your PRC license and send up to {free?.rxLimit ?? 20} prescriptions a month at no cost. Move up a plan when your clinic needs it.
        </Closer>
      </main>
      <SiteFooter />
    </div>
  );
}
