import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { ErrorBox, Loader, Status } from '../../components/ui.jsx';
import { dateTime, moneyExact } from '../../format.js';
import { useFetch } from '../../useFetch.js';
import { ExportButton, LiveDot, PanelHead, StatusFilter, usePolling } from './shared.jsx';

export default function Payments() {
  const { user } = useAuth();
  const [status, setStatus] = useState('');
  const [gateway, setGateway] = useState('');
  const { data, error, loading, reload } = useFetch(`/admin/payments?status=${status}&gateway=${gateway}`);
  const [open, setOpen] = useState(null);
  const [detail, setDetail] = useState(null);
  const [err, setErr] = useState(null);
  usePolling(reload);

  const show = async (ref) => {
    if (open === ref) { setOpen(null); return; }
    setOpen(ref); setDetail(null);
    setDetail(await api(`/admin/payments/${ref}`));
  };
  const resolve = async (p, s) => {
    const note = window.prompt(`Reconciliation note for marking ${p.reference} as ${s} (e.g. "Confirmed in PayFast dashboard")`);
    if (!note) return;
    setErr(null);
    try { await api(`/admin/payments/${p.reference}/resolve`, { method: 'POST', body: { status: s, note } }); reload(); } catch (e) { setErr(e); }
  };
  const refunded = async (p) => {
    const note = window.prompt(`Gateway refund reference for ${p.reference}:`);
    if (!note) return;
    setErr(null);
    try { await api(`/admin/payments/${p.reference}/refunded`, { method: 'POST', body: { note } }); reload(); } catch (e) { setErr(e); }
  };
  const total = data?.filter((p) => p.status === 'complete').reduce((a, p) => a + p.amount_cents, 0) ?? 0;

  return (
    <>
      <PanelHead title="Payments" sub="Every PayFast and Ozow transaction, its gateway notification and reconciliation status.">
        <LiveDot />{user.role === 'admin' && <ExportButton kind="payments" />}
      </PanelHead>
      <div className="toolbar">
        <StatusFilter value={status} onChange={setStatus} options={['complete', 'pending', 'initiated', 'failed', 'cancelled', 'abandoned']} label="Payment status" />
        <select className="input input--sm" aria-label="Gateway" value={gateway} onChange={(e) => setGateway(e.target.value)}>
          <option value="">All gateways</option><option value="payfast">PayFast</option><option value="ozow">Ozow</option><option value="simulated">Simulated</option><option value="manual">Manual</option>
        </select>
      </div>
      <ErrorBox error={error || err} />
      {loading && !data && <Loader />}
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>Reference</th><th>Client</th><th>Invoice</th><th>Gateway</th><th>Amount</th><th>Updated</th><th>Status</th><th /></tr></thead>
          <tbody>
            {data?.map((p) => (
              <Fragment key={p.reference}>
                <tr>
                  <td><button className="btn--link" onClick={() => show(p.reference)}><code>{p.reference}</code></button>{p.is_test ? <small>test</small> : null}</td>
                  <td>{p.client_name}</td>
                  <td><Link to={`/portal/orders/${p.order_id}`}>{p.invoice_number}</Link><small>{p.order_ref}</small></td>
                  <td>{p.gateway}{p.gateway_txn_id && <small>{p.gateway_txn_id}</small>}</td>
                  <td>{moneyExact(p.amount_cents)}</td>
                  <td className="nowrap">{dateTime(p.updated_at)}</td>
                  <td>
                    <Status value={p.status} />{p.status_message && <small>{p.status_message}</small>}
                    {p.needs_refund ? <span className="health health--bad">Refund needed</span> : null}
                    {p.refunded_at && <small>Refunded: {p.refund_note}</small>}
                  </td>
                  <td className="nowrap">
                    {user.role === 'admin' && p.needs_refund ? <button className="btn btn--outline btn--sm" onClick={() => refunded(p)}>Mark refunded</button> : null}
                    {user.role === 'admin' && ['initiated', 'pending'].includes(p.status) && (
                      <><button className="btn btn--text btn--sm" onClick={() => resolve(p, 'complete')}>Mark paid</button>
                        <button className="btn btn--text btn--sm" onClick={() => resolve(p, 'failed')}>Mark failed</button></>
                    )}
                  </td>
                </tr>
                {open === p.reference && (
                  <tr><td colSpan={8}>
                    {!detail ? <Loader /> : detail.raw_notify
                      ? <pre className="code-block">{JSON.stringify(detail.raw_notify, null, 2)}</pre>
                      : <p className="muted small">No gateway notification received yet.</p>}
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
          <tfoot><tr><th colSpan={4}>Completed in view</th><th>{moneyExact(total)}</th><th colSpan={3} /></tr></tfoot>
        </table>
        {data?.length === 0 && <p className="empty">No payments yet.</p>}
      </div>
    </>
  );
}
