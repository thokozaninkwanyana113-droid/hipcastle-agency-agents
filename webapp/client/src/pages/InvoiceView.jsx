// Printable invoice / SA tax invoice (Save as PDF from the browser's print dialog).
import { Link, useParams } from 'react-router-dom';
import Seo from '../components/Seo.jsx';
import { ErrorBox, Loader } from '../components/ui.jsx';
import { useFetch } from '../useFetch.js';
import { date, moneyExact } from '../format.js';

export default function InvoiceView() {
  const { id, invoiceId } = useParams();
  const { data: d, error, loading } = useFetch(`/orders/${id}/invoices/${invoiceId}`);
  if (loading) return <Loader />;
  if (error) return <div className="container section"><ErrorBox error={error} /></div>;
  const sub = d.subtotal_cents || d.amount_cents;
  return (
    <section className="section invoice-page">
      <Seo title={`${d.title} ${d.number}`} noindex />
      <div className="container container--narrow">
        <div className="invoice-actions no-print">
          <Link to={`/portal/orders/${id}`}>← Back to engagement</Link>
          <button className="btn btn--primary btn--sm" onClick={() => window.print()}>Print / save as PDF</button>
        </div>
        {d.needs_recipient_details && <div className="alert alert--warn no-print">Add your billing address (and VAT number if registered) in <Link to="/account">Account settings</Link> — SARS requires them on tax invoices over R5 000.</div>}
        <article className="card invoice-doc">
          <header className="invoice-doc__head">
            <img src="/brand/hipcastle-logo-192.png" alt={d.supplier.trading_as} width="149" height="96" />
            <div className="invoice-doc__title">
              <h1>{d.title}</h1>
              <dl>
                <div><dt>Number</dt><dd>{d.number}</dd></div>
                <div><dt>Date</dt><dd>{date(d.issued_at)}</dd></div>
                <div><dt>Due</dt><dd>{date(d.due_at)}</dd></div>
                <div><dt>Reference</dt><dd>{d.order_ref}</dd></div>
              </dl>
            </div>
          </header>
          <div className="invoice-doc__parties">
            <div>
              <h2>From</h2>
              <p><strong>{d.supplier.name}</strong>{d.supplier.trading_as !== d.supplier.name && <><br />t/a {d.supplier.trading_as}</>}<br />
                {d.supplier.address}<br />
                {d.supplier.vat_no && <>VAT no. {d.supplier.vat_no}<br /></>}
                {d.supplier.company_reg_no && <>Reg. no. {d.supplier.company_reg_no}<br /></>}
                {d.supplier.email} · {d.supplier.phone}</p>
            </div>
            <div>
              <h2>To</h2>
              <p><strong>{d.recipient.name}</strong>{d.recipient.contact !== d.recipient.name && <><br />Attn: {d.recipient.contact}</>}<br />
                {d.recipient.address && <>{d.recipient.address}<br /></>}
                {d.recipient.vat_no && <>VAT no. {d.recipient.vat_no}<br /></>}
                {d.recipient.email}</p>
            </div>
          </div>
          <table className="invoice-doc__lines">
            <thead><tr><th>Description</th><th>Qty</th><th>Amount (excl. VAT)</th></tr></thead>
            <tbody>{d.lines.map((l, i) => <tr key={i}><td>{l.description}</td><td>{l.quantity}</td><td>{moneyExact(l.total_cents)}</td></tr>)}</tbody>
            <tfoot>
              <tr><th colSpan={2}>Subtotal</th><td>{moneyExact(sub)}</td></tr>
              {d.vat_rate > 0 && <tr><th colSpan={2}>VAT ({d.vat_rate}%)</th><td>{moneyExact(d.vat_cents)}</td></tr>}
              <tr className="invoice-doc__total"><th colSpan={2}>Total (ZAR)</th><td>{moneyExact(d.amount_cents)}</td></tr>
            </tfoot>
          </table>
          <p className={`invoice-doc__status invoice-doc__status--${d.status}`}>
            {d.status === 'paid' ? `PAID ${date(d.paid_at)}${d.payments[0] ? ` · ${d.payments[0].gateway} ${d.payments[0].reference}` : ''}` : d.status === 'void' ? 'VOID' : `Payment due by ${date(d.due_at)} — pay online in your client portal (PayFast or Ozow), or EFT using reference ${d.number}.`}
          </p>
          {!d.vat_rate && <p className="muted small">{d.supplier.trading_as} is not registered for VAT; no VAT has been charged.</p>}
          <footer className="muted small">{d.supplier.website}</footer>
        </article>
      </div>
    </section>
  );
}
