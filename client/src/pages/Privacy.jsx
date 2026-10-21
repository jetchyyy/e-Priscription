import { Link } from 'react-router-dom';
import { LegalPage } from '../features/marketing/LegalPage';
import { LEGAL } from '../features/marketing/legalInfo';

const S = [
  {
    id: 'scope',
    title: 'Who we are and what this covers',
    body: (
      <>
        <p>
          This Privacy Policy explains how {LEGAL.company} (“ODYSSEY”, “we”, “us”), {LEGAL.address}, handles personal
          information in E-Prescription by ODYSSEY (the “Service”), in line with the Data Privacy Act of 2012 (Republic Act
          No. 10173), its Implementing Rules and Regulations, and the issuances of the National Privacy Commission (NPC).
        </p>
        <p>It applies to physicians who use the Service, patients who open a prescription link, and visitors to our website.</p>
      </>
    ),
  },
  {
    id: 'roles',
    title: 'Who is responsible for your data',
    body: (
      <>
        <p>The Data Privacy Act distinguishes who decides how data is used (the controller) from who processes it on their behalf.</p>
        <ul>
          <li>
            <strong>Prescriptions and patient details:</strong> the physician who writes the prescription is the personal
            information controller. ODYSSEY processes this information for the physician, as a personal information processor,
            only to deliver the Service and under the physician’s instructions.
          </li>
          <li>
            <strong>Physician accounts, licenses, billing, and website visits:</strong> ODYSSEY is the personal information
            controller.
          </li>
        </ul>
        <p>Patients who want to exercise their rights over a prescription may contact their physician or us. We will help or pass the request on.</p>
      </>
    ),
  },
  {
    id: 'collect',
    title: 'What we collect',
    body: (
      <>
        <h3>From physicians</h3>
        <ul>
          <li>Name, email, password (stored only as a secure hash), contact number.</li>
          <li>PRC license number and a copy of the license, PTR number, PDEA S2 license number if given, specialty.</li>
          <li>Requests to change verified details, with the reason and any supporting document you upload, and the administrator’s decision.</li>
          <li>Clinic or hospital name and address, shown on the prescriptions you issue.</li>
          <li>Payment QR codes, provider, account name and number you choose to add, so patients can pay you.</li>
          <li>Plan, billing and transaction records, including the receipt screenshot and reference number you send when you pay for a plan.</li>
          <li>Clinic membership: the clinic you belong to, invitations sent to your email, and any monthly prescription share the clinic owner sets for you.</li>
        </ul>
        <h3>About patients, entered by the physician</h3>
        <ul>
          <li>Full name, sex, date of birth or age, contact number and address.</li>
          <li>Diagnosis, medicines (generic and brand name, strength, quantity, directions) and physician’s notes.</li>
        </ul>
        <p>
          Health information is <strong>sensitive personal information</strong> under Section 3(l) of the Data Privacy Act and
          is given the highest protection in the Service.
        </p>
        <h3>When a patient opens a link</h3>
        <ul>
          <li>Payment status, amount, payment reference and time of payment. We do not receive card numbers or e-wallet passwords; the payment provider handles those.</li>
          <li>
            The reference number and the receipt screenshot the patient sends as proof of payment. A screenshot may show the
            payer’s name and part of their mobile or account number. It is read on the patient’s own device to fill in the
            form, stored privately, and shown only to the prescribing physician (and our administrators when resolving a
            dispute).
          </li>
          <li>The time the prescription was opened, and whether a security PIN was entered correctly.</li>
        </ul>
        <h3>Technical information</h3>
        <ul>
          <li>Device, browser, IP address and security logs needed to keep the Service safe. Prescription contents are never written to our logs.</li>
          <li>Items stored in your browser (see “Cookies and browser storage” below).</li>
        </ul>
      </>
    ),
  },
  {
    id: 'purposes',
    title: 'Why we use it, and on what legal basis',
    body: (
      <>
        <ul>
          <li>
            <strong>To verify physicians and run their accounts</strong>: to perform our contract with the physician and to
            protect patients by allowing only licensed physicians (Sections 12(b) and 12(f)).
          </li>
          <li>
            <strong>To create, deliver and show prescriptions</strong>: processing of sensitive personal information for medical
            treatment by a medical practitioner (Section 13(e)), and with the patient’s consent where the physician relies on it
            (Section 13(a)).
          </li>
          <li><strong>To confirm payments</strong> so the prescription opens: to deliver the Service the patient asked for.</li>
          <li><strong>To bill physicians</strong> and keep tax and accounting records: our contract and legal obligations (Sections 12(b) and 12(c)).</li>
          <li><strong>To keep the Service secure</strong>, prevent fraud and investigate misuse: our legitimate interests (Section 12(f)).</li>
          <li><strong>To answer lawful orders</strong> from courts or government agencies: legal obligation (Sections 12(c) and 13(b)).</li>
        </ul>
        <p>
          We do not sell personal information. We do not use prescription or patient data for advertising, and we do not use it
          to train artificial intelligence models.
        </p>
      </>
    ),
  },
  {
    id: 'sharing',
    title: 'Who we share it with',
    body: (
      <>
        <ul>
          <li><strong>The physician and the patient</strong> the prescription belongs to. A pharmacy sees it only when the patient shows or prints it.</li>
          <li><strong>Payment providers</strong> (e-wallets and banks the physician chose), only the data needed to process and confirm the payment.</li>
          <li>
            <strong>Service providers that host and run the Service for us</strong>, such as our cloud database and hosting
            provider and our email provider. They act under written agreements, process data only on our instructions and must
            protect it as the Data Privacy Act requires.
          </li>
          <li>
            <strong>The clinic owner</strong>, if you belong to a clinic: the owner sees how many prescriptions you issued and the fees you
            collected each month, and your name and email. The owner does not see your patients’ names, diagnoses or medicines.
          </li>
          <li><strong>Government agencies, courts or law enforcement</strong> when the law or a lawful order requires it.</li>
        </ul>
        <p>
          <strong>Data stored outside the Philippines.</strong> Our cloud provider may store data on servers outside the
          Philippines. When that happens we remain accountable for it under Section 21 of the Data Privacy Act and require the
          same level of protection by contract.
        </p>
      </>
    ),
  },
  {
    id: 'security',
    title: 'How we protect it',
    body: (
      <>
        <p>We apply organisational, physical and technical measures appropriate to health data, including:</p>
        <ul>
          <li>Encryption of data in transit, and access control on every database table so each user sees only their own records.</li>
          <li>An unpaid prescription link returns only a masked preview. The full prescription is not sent until payment is confirmed.</li>
          <li>An optional security PIN that the physician gives the patient in person.</li>
          <li>Licenses kept in private storage, readable only by the physician and our administrators through short-lived links.</li>
          <li>Prescriptions cannot be edited after they are issued, and each keeps a copy of the physician’s details as they were at that moment.</li>
          <li>Verified credentials (name, PRC, specialty, S2) can change only after an administrator reviews a request.</li>
          <li>Staff access only on a need-to-know basis, under confidentiality obligations.</li>
        </ul>
        <p>
          <strong>Breaches.</strong> If a personal data breach is likely to give rise to a real risk of serious harm, we will
          notify the National Privacy Commission and affected data subjects within 72 hours of knowing about it, as NPC rules
          require, and tell physicians whose patients are affected so they can meet their own duties.
        </p>
      </>
    ),
  },
  {
    id: 'retention',
    title: 'How long we keep it',
    body: (
      <ul>
        <li>
          <strong>Prescriptions and patient details</strong>: for as long as the physician’s account is active and for the
          period the physician must keep medical records under applicable rules, then deleted or anonymised. Physicians can
          ask us for an export of their records before closing their account.
        </li>
        <li><strong>Physician account and license data</strong>: while the account is active, and up to [period] after closure for legal and dispute purposes.</li>
        <li><strong>Billing and payment records</strong>: for the period required by tax and accounting laws.</li>
        <li><strong>Receipt screenshots sent as proof of payment</strong>: up to [period] after the payment is confirmed or rejected, then deleted.</li>
        <li><strong>Security logs</strong>: up to [period], unless needed for an investigation.</li>
      </ul>
    ),
  },
  {
    id: 'rights',
    title: 'Your rights',
    body: (
      <>
        <p>Under the Data Privacy Act you have the right to:</p>
        <ul>
          <li><strong>be informed</strong> about how your data is processed;</li>
          <li><strong>access</strong> your data and get a copy;</li>
          <li><strong>object</strong> to processing, and withdraw consent where processing is based on consent;</li>
          <li><strong>correct</strong> inaccurate or outdated data;</li>
          <li><strong>erasure or blocking</strong> of data that is unlawfully processed or no longer needed;</li>
          <li><strong>data portability</strong>: receive your data in a common electronic format;</li>
          <li><strong>damages</strong> for harm caused by inaccurate, false or unlawfully obtained data; and</li>
          <li><strong>file a complaint</strong> with the National Privacy Commission.</li>
        </ul>
        <p>
          Some rights have limits. For example, a prescription a physician has already issued is a medical record that may need
          to be kept. Email {LEGAL.dpoEmail} to make a request. We may ask you to prove who you are, and we will answer within
          the period required by NPC rules.
        </p>
      </>
    ),
  },
  {
    id: 'minors',
    title: 'Patients who are minors',
    body: (
      <p>
        Physicians may write prescriptions for minors. In that case the parent, guardian or authorised representative receives
        the link, pays the fee and exercises the minor’s privacy rights. We do not knowingly let anyone under 18 create an account.
      </p>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies and browser storage',
    body: (
      <>
        <p>We use only what is needed to run the Service. We do not use advertising or cross-site tracking cookies.</p>
        <ul>
          <li><strong>Sign-in session</strong>: keeps physicians and administrators signed in. Removed when you sign out.</li>
          <li><strong>Preferences</strong>: for example, whether you closed the setup guide.</li>
        </ul>
        <p>You can clear these in your browser settings. Clearing the session signs you out.</p>
      </>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    body: (
      <p>
        We will post any update here with a new “last updated” date. For material changes we will notify physicians by email
        or in the Service before the change takes effect.
      </p>
    ),
  },
  {
    id: 'contact',
    title: 'Contact our Data Protection Officer',
    body: (
      <>
        <p>
          {LEGAL.dpoName}, Data Protection Officer<br />
          {LEGAL.company}, {LEGAL.address}<br />
          {LEGAL.dpoEmail} · {LEGAL.dpoPhone}
        </p>
        <p>NPC registration: {LEGAL.npcRegistration}</p>
        <p>
          If you are not satisfied with our answer, you may contact the National Privacy Commission at{' '}
          <a className="link" href="https://privacy.gov.ph" rel="noreferrer">privacy.gov.ph</a>. See also our{' '}
          <Link to="/terms" className="link">Terms and Conditions</Link>.
        </p>
      </>
    ),
  },
];

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      lead="How E-Prescription by ODYSSEY collects, uses and protects personal and health information under the Data Privacy Act of 2012."
      effective={LEGAL.effective}
      updated={LEGAL.updated}
      sections={S}
      other={{ to: '/terms', label: 'Read the Terms and Conditions' }}
    />
  );
}
