import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { ErrorBox, Loader, Progress, Status } from '../components/ui.jsx';
import { date, money } from '../format.js';
import { useFetch } from '../useFetch.js';

export default function Portal() {
  const { user, isStaff } = useAuth();
  const { data: orders, error, loading } = useFetch('/orders');
  const mine = orders?.filter((o) => o.user_id === user.id) ?? [];
  const active = mine.filter((o) => ['active', 'in_review'].includes(o.status)).length;

  return (
    <section className="section portal">
      <div className="container">
        <div className="portal__head">
          <div>
            <span className="eyebrow">Client portal</span>
            <h1>Hello, {user.name.split(' ')[0]}</h1>
          </div>
          <div className="portal__actions">
            {isStaff && <Link to="/admin" className="btn btn--outline">Admin dashboard</Link>}
            <Link to="/account" className="btn btn--ghost">Account settings</Link>
            <Link to="/pricing" className="btn btn--primary">New engagement</Link>
          </div>
        </div>
        <div className="kpis">
          <div className="kpi"><span>Engagements</span><strong>{mine.length}</strong></div>
          <div className="kpi"><span>In progress</span><strong>{active}</strong></div>
          <div className="kpi"><span>Completed</span><strong>{mine.filter((o) => o.status === 'completed').length}</strong></div>
          <div className="kpi"><span>Total committed</span><strong>{money(mine.filter((o) => o.status !== 'cancelled').reduce((a, o) => a + o.price_cents, 0))}</strong></div>
        </div>
        {loading && <Loader />}
        <ErrorBox error={error} />
        {orders && mine.length === 0 && (
          <div className="card empty-state">
            <span>🏰</span>
            <h2>No engagements yet</h2>
            <p>Pick a service and tier to get your first project underway.</p>
            <Link to="/services" className="btn btn--primary">Browse services</Link>
          </div>
        )}
        <div className="order-list">
          {mine.map((o) => (
            <Link key={o.id} to={`/portal/orders/${o.id}`} className="order-row card">
              <span className="order-row__icon">{o.service_icon}</span>
              <div className="order-row__main">
                <strong>{o.service_name} — {o.tier_name}</strong>
                <small>{o.reference} · started {date(o.created_at)} · due {date(o.due_date)}</small>
                <Progress value={o.progress} />
              </div>
              <div className="order-row__side">
                <Status value={o.status} />
                <span>{money(o.price_cents)}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
