import { Link } from 'react-router-dom';
import { PageHeader } from '../components/ui.jsx';
import Seo from '../components/Seo.jsx';
import { useSite } from '../context/SiteContext.jsx';

export function Privacy() {
  const s = useSite();
  return (
    <>
      <Seo title="Privacy Policy (POPIA)" description={`How ${s.business_name} collects, uses and protects personal information under South Africa’s Protection of Personal Information Act (POPIA).`} />
      <PageHeader eyebrow="Legal" title="Privacy policy & POPIA notice" />
      <section className="section">
        <div className="container container--narrow card legal prose">
          <p className="muted small">This notice explains how {s.legal_name || s.business_name} (“we”) processes personal information in terms of the Protection of Personal Information Act 4 of 2013 (POPIA). Have it reviewed by your legal adviser before launch.</p>
          <h2>1. Who we are</h2>
          <p>{s.legal_name || s.business_name}{s.company_reg_no ? ` (registration ${s.company_reg_no})` : ''}, {s.address_locality}, {s.address_region}, South Africa. Information Officer contact: <a href={`mailto:${s.email}`}>{s.email}</a>.</p>
          <h2>2. What we collect</h2>
          <ul>
            <li>Contact details you give us: name, email, phone number, business name and province.</li>
            <li>Project information: briefs, messages and files you share in the client portal.</li>
            <li>Billing records: invoices and payment status. <strong>We never receive or store your card or banking credentials</strong> — payments are processed by PayFast and Ozow.</li>
            <li>Technical data needed to run the site securely, such as server logs.</li>
          </ul>
          <h2>3. Why we use it</h2>
          <p>To respond to enquiries, deliver and invoice the services you order, provide support, meet legal and tax obligations, and — only with your opt-in consent — send our newsletter.</p>
          <h2>4. Sharing</h2>
          <p>We share information only with operators who help us deliver the service (hosting, payment gateways, email) under written agreements requiring appropriate security safeguards. We do not sell personal information.</p>
          <h2>5. Retention & security</h2>
          <p>We keep records only as long as needed for the purposes above or as required by law (for example, tax records). Our website analytics use no cookies and store no personal information: we count page views and daily visitors using a code that changes every day, and keep where you first found us (for example a Google search or a campaign link) in your own browser so it can be attached to an enquiry, account or order you submit. Browsers sending Do Not Track or Global Privacy Control are not counted. Conversations with the website assistant are kept for 180 days to answer follow-ups and improve our help, then deleted automatically; if AI answers are switched on, your chat messages are processed by our AI provider (Anthropic) to generate replies. Support tickets are kept for the life of your client relationship. We use encrypted connections, access controls, hashed passwords and regular backups.</p>
          <h2>6. Your rights</h2>
          <p>You may request access to, correction of, or deletion of your personal information, object to processing, and withdraw marketing consent at any time. You may also lodge a complaint with the Information Regulator of South Africa.</p>
          <h2>7. Contact</h2>
          <p>Email <a href={`mailto:${s.email}`}>{s.email}</a> or use our <Link to="/contact">contact page</Link>.</p>
        </div>
      </section>
    </>
  );
}

export function Terms() {
  const s = useSite();
  return (
    <>
      <Seo title="Terms of Service" description={`Terms of engagement for ${s.business_name}: deposits, retainers, cancellations, intellectual property and payments in rand.`} />
      <PageHeader eyebrow="Legal" title="Terms of service" />
      <section className="section">
        <div className="container container--narrow card legal prose">
          <p className="muted small">Summary terms of engagement. Have them reviewed by your legal adviser before launch.</p>
          <h2>1. Packages & pricing</h2>
          <p>All prices are in South African rand{s.vat_registered ? ` and exclude VAT at ${s.vat_rate}%, which is added to invoices` : ''}. Scope is as described for each Essential, Growth or Enterprise package; changes in scope are quoted separately.</p>
          <h2>2. Payment</h2>
          <p>Once-off projects require a 50% deposit before work starts, with the balance due on delivery. Retainers are billed monthly in advance. Invoices are payable within 7 days via PayFast, Ozow or EFT.</p>
          <h2>3. Cancellation</h2>
          <p>Orders may be cancelled free of charge before the deposit is paid. Retainers may be cancelled with 30 days’ written notice. Deposits cover work already scheduled and are non-refundable once work has started, except where required by the Consumer Protection Act.</p>
          <h2>4. Your responsibilities</h2>
          <p>Provide content, access and feedback promptly. Delivery timelines assume timely input.</p>
          <h2>5. Intellectual property</h2>
          <p>Ownership of deliverables transfers to you on payment in full. We may show non-confidential work in our portfolio unless you ask us not to.</p>
          <h2>6. Liability</h2>
          <p>Our total liability is limited to the fees paid for the relevant package, except where the law does not allow such a limitation.</p>
          <h2>7. Governing law</h2>
          <p>These terms are governed by the laws of the Republic of South Africa.</p>
        </div>
      </section>
    </>
  );
}
