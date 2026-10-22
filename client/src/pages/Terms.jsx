import { Link } from 'react-router-dom';
import { LegalPage } from '../features/marketing/LegalPage';
import { LEGAL } from '../features/marketing/legalInfo';

const S = [
  {
    id: 'about',
    title: 'About these terms',
    body: (
      <>
        <p>
          These Terms and Conditions (“Terms”) govern your use of E-Prescription by ODYSSEY (the “Service”), operated by{' '}
          {LEGAL.company}, {LEGAL.registration}, with address at {LEGAL.address} (“ODYSSEY”, “we”, “us”).
        </p>
        <p>
          By creating an account, opening a prescription link or otherwise using the Service, you agree to these Terms and
          to our <Link to="/privacy" className="link">Privacy Policy</Link>. If you do not agree, do not use the Service.
          Under the Electronic Commerce Act (Republic Act No. 8792), your electronic acceptance has the same effect as a
          signed agreement.
        </p>
      </>
    ),
  },
  {
    id: 'service',
    title: 'What the Service does',
    body: (
      <>
        <p>The Service is software that lets licensed physicians in the Philippines:</p>
        <ul>
          <li>write prescriptions and send them to patients as a secure link;</li>
          <li>set an access fee that the patient pays, through a payment QR the physician provides, before the full prescription is shown; and</li>
          <li>keep a history of the prescriptions they have issued.</li>
        </ul>
        <p>
          <strong>ODYSSEY is not a hospital, clinic, pharmacy or healthcare provider and does not practise medicine.</strong>{' '}
          We do not examine patients, diagnose, prescribe, dispense or give medical advice. Every prescription is written by,
          and is the sole professional responsibility of, the physician who issues it.
        </p>
        <p>
          The Service is not for emergencies. In an emergency, call 911 or go to the nearest hospital.
        </p>
      </>
    ),
  },
  {
    id: 'eligibility',
    title: 'Who may use it',
    body: (
      <>
        <p>
          <strong>Physicians.</strong> Only physicians with a valid Professional Regulation Commission (PRC) license may
          register. You must give accurate details (name, PRC license number, specialty, clinic) and upload proof of your
          license. An administrator reviews every application; we may approve, refuse or revoke access at our discretion,
          including when a license cannot be verified, is suspended or has expired.
        </p>
        <p>
          <strong>Patients.</strong> Patients do not need an account. Anyone who receives a prescription link from their
          physician may open it. If the patient is a minor or cannot act for themselves, the link should be opened by a
          parent, guardian or authorised representative.
        </p>
        <p>You must be at least 18 years old to create an account.</p>
      </>
    ),
  },
  {
    id: 'accounts',
    title: 'Your account and security',
    body: (
      <ul>
        <li>Keep your password and any security PIN confidential. You are responsible for activity under your account.</li>
        <li>Do not share your account. Each physician must use their own account.</li>
        <li>Tell us at once at {LEGAL.email} if you suspect unauthorised access.</li>
        <li>Keep your profile, license and clinic details current. They appear on the prescriptions you issue.</li>
        <li>
          After approval, your name, PRC license number, specialty and PDEA S2 number can be changed only through a change
          request that an administrator reviews, with supporting documents where needed. Your clinic name, address, contact
          number and PTR number you may update yourself.
        </li>
        <li>Changes to your details apply to prescriptions issued afterwards. Prescriptions already issued keep the details they were issued with.</li>
      </ul>
    ),
  },
  {
    id: 'physicians',
    title: 'Physicians’ responsibilities',
    body: (
      <>
        <p>As a physician using the Service, you confirm and agree that you will:</p>
        <ul>
          <li>
            issue prescriptions only within your license and professional competence, after your own clinical assessment, and in
            line with the Medical Act of 1959 (Republic Act No. 2382), the Code of Ethics of the medical profession and any
            applicable rules of the PRC, the Professional Regulatory Board of Medicine and the Department of Health (DOH);
          </li>
          <li>
            write medicines using their generic names as required by the Generics Act of 1988 (Republic Act No. 6675), as amended;
          </li>
          <li>
            <strong>not</strong> use the Service for dangerous drugs or controlled precursors that require the official DOH
            prescription form or other special requirements under the Comprehensive Dangerous Drugs Act of 2002 (Republic Act
            No. 9165) and its regulations. Issue those on the official forms required by law;
          </li>
          <li>
            confirm for yourself that electronic prescriptions are acceptable for your practice, the medicine and the dispensing
            pharmacy under current PRC, DOH and Food and Drug Administration (FDA) rules. We do not guarantee that any pharmacy
            will accept a prescription;
          </li>
          <li>
            obtain whatever consent or give whatever notice the law requires before entering a patient’s information, and act as the
            personal information controller for your patients’ data under the Data Privacy Act of 2012 (see the{' '}
            <Link to="/privacy" className="link">Privacy Policy</Link>);
          </li>
          <li>set fair access fees, tell patients the fee before they pay, and handle any refund requests from your patients; and</li>
          <li>keep your own medical records as the law requires. The Service is not a substitute for your record-keeping duties.</li>
        </ul>
        <p>Prescriptions cannot be edited after they are issued. If something must change, issue a new prescription.</p>
      </>
    ),
  },
  {
    id: 'payments',
    title: 'Access fees and payments',
    body: (
      <>
        <p>
          If the physician accepts online payments, the patient pays through ODYSSEY as described in{' '}
          <a href="#online-payments" className="link">Online payments through ODYSSEY</a>. Otherwise, the rest of this section applies.
        </p>
        <p>
          The patient pays the access fee set by the physician, using the GCash, Maya or bank QR the physician uploaded.
          Payment goes to the physician’s account. ODYSSEY is not a party to that payment, does not hold patients’ money,
          and is not responsible for refunds, disputes or chargebacks between patients and physicians. Payment providers are
          regulated by the Bangko Sentral ng Pilipinas and apply their own terms.
        </p>
        <p>
          After paying, the patient sends the payment reference number and a screenshot of the receipt through the Service.
          The physician checks the payment in their own account and confirms it; only then does the prescription open. The
          Service may read the screenshot automatically to fill in the form, but that reading is not proof of payment.
        </p>
        <ul>
          <li>Physicians must confirm only payments they have actually received, and should review receipts promptly.</li>
          <li>Patients must send genuine receipts. Submitting a fake or altered receipt, or reusing another person’s reference number, is prohibited and may be reported.</li>
          <li>A reference number can be used for one prescription only.</li>
        </ul>
        <p>
          If a payment is made but the prescription does not open, contact the physician first, then us at {LEGAL.email} with
          the reference number.
        </p>
      </>
    ),
  },
  {
    id: 'online-payments',
    title: 'Online payments through ODYSSEY',
    body: (
      <>
        <p>
          A physician may choose to accept online payments. The patient then pays through PayMongo, a payment provider
          regulated by the Bangko Sentral ng Pilipinas, and the prescription opens as soon as PayMongo confirms the payment.
          No receipt needs to be checked.
        </p>
        <h3>ODYSSEY as collecting agent</h3>
        <ul>
          <li>By turning on online payments, the physician appoints ODYSSEY to collect patients’ payments for the physician as the physician’s collecting agent.</li>
          <li>The physician’s share of each payment belongs to the physician and is the physician’s income. ODYSSEY holds it for the physician until it is paid out, and does not treat it as ODYSSEY’s income.</li>
          <li>ODYSSEY’s income is only its service fee on each payment, and what physicians pay ODYSSEY for plans, seats and packs.</li>
          <li>Each physician is responsible for their own taxes on their share, and for any receipt the law requires them to issue to their patients for their professional fee.</li>
        </ul>
        <h3>Fees</h3>
        <ul>
          <li>ODYSSEY charges a service fee on each online payment. The fee depends on the payment method and is shown to the physician in the dashboard and to the patient before paying. PayMongo’s own charge is included in it.</li>
          <li>The physician chooses who pays the fee. If the patient pays it, it is added on top as a convenience fee and the physician receives the full prescription fee. If the physician covers it, the patient pays only the prescription fee and the service fee comes out of the physician’s share.</li>
          <li>Each payment keeps the fee in force when it was made. ODYSSEY will give physicians at least 30 days’ notice of a fee increase.</li>
          <li>ODYSSEY is not registered for VAT and does not charge VAT on its fees.</li>
        </ul>
        <h3>Hold period and payouts</h3>
        <ul>
          <li>The physician’s share becomes available for payout after a hold period, shown in the dashboard (7 days at the time of writing). The hold covers the time PayMongo takes to settle payments and the time in which card payments can be disputed.</li>
          <li>The physician asks for a payout from the dashboard, to a bank or e-wallet account in the physician’s own name. ODYSSEY checks each request before sending it, and may hold a payout while it checks an account that does not match the physician’s verified name.</li>
          <li>The smallest payout and the transfer fee are shown in the dashboard. The transfer fee is taken from the amount sent.</li>
          <li>The dashboard shows every payment, ODYSSEY’s fee, the physician’s share, what is on hold, what is available, every payout and every refund. A monthly statement can be downloaded.</li>
        </ul>
        <h3 id="refunds">Refunds and disputes</h3>
        <ul>
          <li>Refunds are made by ODYSSEY, through PayMongo, back to the account that paid. Service and convenience fees are not refunded: the patient receives the prescription fee back, and the physician’s balance covers it.</li>
          <li>If a refund or a card dispute is larger than the physician’s available balance, the difference is taken from the physician’s next payments.</li>
          <li>A payment that cannot be applied, such as a second payment for a prescription already paid, is refunded in full.</li>
          <li>Refunds for QR Ph payments are claimed by the payer through a link PayMongo provides. The link expires after the period PayMongo sets.</li>
        </ul>
        <p>
          A physician may turn online payments off at any time. Money already collected is still paid out under these terms.
        </p>
      </>
    ),
  },
  {
    id: 'plans',
    title: 'Plans, limits and billing for physicians',
    body: (
      <>
        <p>
          Plans, prices and monthly prescription limits are shown on the <Link to="/pricing" className="link">Pricing</Link>{' '}
          page and are part of these Terms. Prices are in Philippine pesos. ODYSSEY is not registered for VAT, so no VAT is added.
        </p>
        <ul>
          <li>You pay for a plan online through PayMongo from your dashboard. ODYSSEY covers the payment fee. When online payment is unavailable, you may be asked to pay ODYSSEY’s QR and send the receipt instead. A paid plan starts as soon as the payment is confirmed and runs for one month or one year. Plans do not renew by themselves; when a paid period ends, your account moves back to the free plan.</li>
          <li>Monthly limits count the prescriptions you issue in each calendar month, Philippine time. When you reach your limit, you cannot issue new prescriptions until the 1st of the next month or until you upgrade. Links already sent keep working.</li>
          <li>Renewing the same plan adds the new period after the one already paid. Changing to another plan starts the new plan on the day the payment is confirmed; the unused part of the old plan is not refunded or carried over.</li>
          <li>You may also buy packs of extra prescriptions without changing plan. The packs, prices and how long they stay valid are shown in your dashboard when you buy. Bought prescriptions are used only after your monthly limit is reached, oldest expiry first; they are tied to your account (or to your clinic, if its owner bought them), cannot be transferred or refunded, and expire at the end of the validity shown when you bought them.</li>
          <li>Sending a receipt for a payment you did not make, or reusing another person’s receipt, is prohibited and may lead to suspension of your account.</li>
          <li>We will give at least 30 days’ notice of a price increase for your plan. You may cancel before it applies.</li>
          <li>Except where the law requires otherwise, fees already paid are not refundable for partial periods.</li>
        </ul>
        <p>
          Nothing in these Terms limits the rights you have under the Consumer Act of the Philippines (Republic Act No. 7394)
          or the Internet Transactions Act of 2023 (Republic Act No. 11967).
        </p>
      </>
    ),
  },
  {
    id: 'clinics',
    title: 'Clinic accounts',
    body: (
      <>
        <p>
          A physician who buys a clinic plan becomes the clinic owner and may invite other registered physicians to share the plan.
          Each physician keeps their own account, PRC verification, patients, prescriptions and payment QR codes.
        </p>
        <ul>
          <li>The clinic’s monthly prescription limit is shared by all its physicians. The owner may set a lower monthly share for a physician.</li>
          <li>The plan includes a number of physicians. More physicians need extra seats, paid for the rest of the paid period, and the same seats are included when the owner renews.</li>
          <li>The owner sees, for each physician, the number of prescriptions issued and the fees collected in the month. The owner does not see patient names, diagnoses, medicines or notes of other physicians.</li>
          <li>The owner pays for the clinic plan and is responsible for inviting only physicians who agree to join. A physician may leave a clinic at any time; prescriptions they issued stay with them.</li>
          <li>While a physician is in a clinic, their own paid plan, if any, is paused and its remaining days resume when they leave or the clinic’s paid period ends.</li>
          <li>If the clinic’s paid period ends or the clinic is ended, its physicians return to their own plans. Paid days left on a clinic plan are not refunded.</li>
          <li>A physician whose account is suspended or rejected is removed from the clinic. If the owner’s account is suspended, the clinic ends.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    body: (
      <>
        <p>You must not:</p>
        <ul>
          <li>issue false, fraudulent or forged prescriptions, or prescriptions in someone else’s name;</li>
          <li>use the Service to sell or promote medicines, or for any purpose prohibited by law;</li>
          <li>try to access other users’ data, bypass the payment step or security PIN, or probe, scan or overload the Service;</li>
          <li>upload malicious code, or reverse engineer the Service except where the law allows; or</li>
          <li>commit any act punishable under the Cybercrime Prevention Act of 2012 (Republic Act No. 10175).</li>
        </ul>
        <p>We may report unlawful activity to the proper authorities and cooperate with lawful requests.</p>
      </>
    ),
  },
  {
    id: 'ip',
    title: 'Intellectual property',
    body: (
      <p>
        The Service, its software, the ODYSSEY name and logo, and the Ody mascot belong to ODYSSEY and are protected by the
        Intellectual Property Code of the Philippines (Republic Act No. 8293). We give you a limited, non-exclusive,
        non-transferable right to use the Service under these Terms. Physicians keep their rights in the content they enter
        and give us the permission we need to host and display it to deliver the Service.
      </p>
    ),
  },
  {
    id: 'availability',
    title: 'Availability and changes',
    body: (
      <p>
        We work to keep the Service available and secure, but it may sometimes be interrupted for maintenance, updates or
        reasons outside our control. We may change or improve features. If a change materially reduces what a paid plan
        includes, we will tell you in advance and you may cancel.
      </p>
    ),
  },
  {
    id: 'liability',
    title: 'Disclaimers and limitation of liability',
    body: (
      <>
        <p>
          The Service is provided “as is”. To the extent the law allows, we do not warrant that it will be uninterrupted or
          error-free, or that a prescription will be accepted by a particular pharmacy.
        </p>
        <p>
          To the extent the law allows, ODYSSEY is not liable for the medical content of any prescription, for clinical
          decisions, for disputes between physicians and patients, or for indirect or consequential loss. Our total liability
          to a physician for any claim related to the Service is limited to the fees that physician paid us in the 12 months
          before the claim.
        </p>
        <p>
          Nothing in these Terms excludes liability that cannot be excluded under Philippine law, including liability for
          fraud, gross negligence, wilful misconduct, or under the Data Privacy Act of 2012 and the Consumer Act.
        </p>
      </>
    ),
  },
  {
    id: 'indemnity',
    title: 'Physician indemnity',
    body: (
      <p>
        Physicians agree to hold ODYSSEY free from claims by third parties, including patients and regulators, that arise from
        the prescriptions they issue, their professional conduct or their breach of these Terms, except to the extent the claim
        is caused by our own fault.
      </p>
    ),
  },
  {
    id: 'termination',
    title: 'Suspension and termination',
    body: (
      <>
        <p>
          You may close your account at any time by contacting {LEGAL.email}. We may suspend or close an account if the
          license cannot be verified or is no longer valid, if these Terms are seriously breached, or if required by law or a
          lawful order. Where possible we will tell you why and give you a chance to respond.
        </p>
        <p>
          After closure we keep records only as the <Link to="/privacy" className="link">Privacy Policy</Link> and the law
          require. Prescription links already sent may remain viewable for the retention period stated there.
        </p>
      </>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to these terms',
    body: (
      <p>
        We may update these Terms. We will post the new version here with a new “last updated” date and, for material
        changes, notify physicians by email or in the Service at least 15 days before they take effect. Continuing to use
        the Service after that date means you accept the updated Terms.
      </p>
    ),
  },
  {
    id: 'law',
    title: 'Governing law and disputes',
    body: (
      <p>
        These Terms are governed by the laws of the Republic of the Philippines. We encourage you to contact us first so we
        can try to resolve any concern. Disputes that cannot be settled amicably shall be brought before the proper courts of{' '}
        {LEGAL.venue}, without prejudice to any right you have to bring a complaint before the Department of Trade and
        Industry, the National Privacy Commission or another government agency with jurisdiction.
      </p>
    ),
  },
  {
    id: 'contact',
    title: 'Contact',
    body: (
      <p>
        {LEGAL.company}<br />
        {LEGAL.address}<br />
        {LEGAL.email}
      </p>
    ),
  },
];

export default function Terms() {
  return (
    <LegalPage
      title="Terms and Conditions"
      lead="The rules for using E-Prescription by ODYSSEY, for physicians and for patients who open a prescription link."
      effective={LEGAL.effective}
      updated={LEGAL.updated}
      sections={S}
      other={{ to: '/privacy', label: 'Read the Privacy Policy' }}
    />
  );
}
