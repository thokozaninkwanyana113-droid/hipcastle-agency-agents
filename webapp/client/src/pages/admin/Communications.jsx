// Command Centre → Communications plan: every message the system sends, by client-journey stage.
import { useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { ErrorBox, Loader } from '../../components/ui.jsx';
import { useFetch } from '../../useFetch.js';
import { dateTime } from '../../format.js';
import { PanelHead } from './shared.jsx';

export default function Communications() {
  const { user } = useAuth();
  const { data, error, loading, setData } = useFetch('/admin/communications');
  const [err, setErr] = useState(null);
  if (loading && !data) return <Loader />;
  if (error) return <ErrorBox error={error} />;
  const toggle = async (tp) => {
    setErr(null);
    try { setData(await api(`/admin/communications/${tp.id}`, { method: 'PATCH', body: { enabled: !tp.enabled } })); } catch (e) { setErr(e); }
  };
  return (
    <>
      <PanelHead title="Communications plan" sub="Every message Hipcastle sends, in client-journey order. Transactional messages go immediately; nudges and digests wait for SA business hours (Mon–Fri 08:00–17:00, excluding public holidays)." />
      <div className="alert alert--info">
        {data.business_hours_now ? '🟢 Inside business hours — follow-ups are going out now.' : `🌙 Outside business hours — follow-ups are held until ${dateTime(data.next_business_slot.replace(' ', 'T') + 'Z')} SAST.`}
        {data.held_for_business_hours > 0 && ` ${data.held_for_business_hours} message(s) waiting.`}
      </div>
      <ErrorBox error={err} />
      <div className="comms-principles card">
        <h3>Principles</h3>
        <ul>
          <li><strong>One clear next step</strong> per message, in plain South African English, from a reply-to address a person reads.</li>
          <li><strong>Speed:</strong> enquiries answered within 1 business day; support targets of 4 hours (urgent) to 3 business days (low).</li>
          <li><strong>No surprises:</strong> every invoice, payment, approval and status change is confirmed in writing and visible in the portal.</li>
          <li><strong>Respect:</strong> nudges only during business hours, a maximum of two payment reminders, one enquiry follow-up — never a sequence.</li>
          <li><strong>POPIA:</strong> marketing (newsletter) only with double opt-in and one-click unsubscribe; service messages only about the client’s own engagement.</li>
        </ul>
      </div>
      {data.stages.map((st) => (
        <div key={st.stage} className="card comms-stage">
          <h3>{st.stage}</h3>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Message</th><th>To</th><th>When</th><th>Timing</th><th>Sent (30d)</th><th>On</th></tr></thead>
              <tbody>
                {st.touchpoints.map((tp) => (
                  <tr key={tp.id} className={tp.enabled ? '' : 'is-off'}>
                    <td><a href={`/admin/emails?preview=${tp.id}`}><code>{tp.id}</code></a>{tp.businessHours && <small>🕘 business hours</small>}</td>
                    <td>{tp.audience}</td>
                    <td>{tp.trigger}</td>
                    <td className="small">{tp.timing}</td>
                    <td>{tp.sent_30d}{tp.failed_30d > 0 && <small className="text-error"> {tp.failed_30d} failed</small>}</td>
                    <td>{tp.essential
                      ? <span className="muted small" title="Essential messages can’t be switched off">Always</span>
                      : <label className="switch"><input type="checkbox" checked={tp.enabled} disabled={user.role !== 'admin'} onChange={() => toggle(tp)} aria-label={`${tp.id} ${tp.enabled ? 'on' : 'off'}`} /><span>{tp.enabled ? 'On' : 'Off'}</span></label>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}
