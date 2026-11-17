import { useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import Seo from '../../components/Seo.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useFetch } from '../../useFetch.js';
import Overview from './Overview.jsx';
import System from './System.jsx';
import Activity from './Activity.jsx';
import Payments from './Payments.jsx';
import { Engagements, Invoices, Leads, Users } from './Operations.jsx';
import { BlogAdmin, Subscribers, TestimonialsAdmin } from './Content.jsx';
import Catalog from './Catalog.jsx';
import Settings from './Settings.jsx';
import SeoCentre from './SeoCentre.jsx';
import Emails from './Emails.jsx';
import PipelineBoard from './PipelineBoard.jsx';
import Playbooks from './Playbooks.jsx';
import { Conversations, SupportDesk } from './CustomerCare.jsx';
import CarePlans from './CarePlans.jsx';
import Growth from './Growth.jsx';

const NAV = [
  ['Monitor', [['', 'Overview', '📊'], ['growth', 'Growth & acquisition', '📈'], ['system', 'System & processes', '🖥️'], ['activity', 'Activity log', '📜'], ['payments', 'Payments', '💳'], ['emails', 'Emails', '✉️']]],
  ['Operate', [['pipeline', 'Delivery pipeline', '🚦'], ['engagements', 'Engagements', '📁'], ['support', 'Support desk', '🎧'], ['care', 'Care plans', '🛟'], ['conversations', 'Assistant chats', '💬'], ['leads', 'Leads & CRM', '🎯'], ['clients', 'Users & clients', '👥'], ['invoices', 'Invoices', '🧾']]],
  ['Content', [['blog', 'Blog', '✍️'], ['testimonials', 'Testimonials', '⭐'], ['catalog', 'Services & pricing', '🏷️'], ['subscribers', 'Subscribers', '📬']]],
  ['Configure', [['playbooks', 'Delivery playbooks', '📘'], ['seo', 'SEO, AEO & GEO', '🔎'], ['settings', 'Settings', '⚙️']]],
];

export default function CommandCentre() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const { data: ov } = useFetch('/admin/overview');
  const badges = { support: ov?.open_tickets, leads: ov?.new_leads, testimonials: ov?.pending_testimonials, invoices: ov?.overdue_invoices };
  return (
    <div className="cc">
      <Seo title="Command Centre" noindex />
      <aside className={`cc__side ${open ? 'cc__side--open' : ''}`} aria-label="Command Centre navigation">
        <div className="cc__brand"><img src="/favicon.svg" width="36" height="36" alt="" className="cc__brand-mark" /><div><strong>Command Centre</strong><small>{user.name} · {user.role}</small></div></div>
        {NAV.map(([group, items]) => (
          <div key={group} className="cc__group">
            <span className="cc__group-label">{group}</span>
            {items.map(([path, label, icon]) => (
              <NavLink key={path} end to={`/admin${path && `/${path}`}`} className="cc__link" onClick={() => setOpen(false)}>
                <span aria-hidden="true">{icon}</span>{label}
                {badges[path] > 0 && <span className="cc__badge">{badges[path]}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </aside>
      <div className="cc__main">
        <button className="btn btn--ghost btn--sm cc__menu" onClick={() => setOpen(!open)} aria-expanded={open}>☰ Sections</button>
        <Routes>
          <Route index element={<Overview />} />
          <Route path="growth" element={<Growth />} />
          <Route path="system" element={<System />} />
          <Route path="activity" element={<Activity />} />
          <Route path="payments" element={<Payments />} />
          <Route path="emails" element={<Emails />} />
          <Route path="pipeline" element={<PipelineBoard />} />
          <Route path="playbooks" element={<Playbooks />} />
          <Route path="engagements" element={<Engagements />} />
          <Route path="orders" element={<Engagements />} />
          <Route path="leads" element={<Leads />} />
          <Route path="support" element={<SupportDesk />} />
          <Route path="care" element={<CarePlans />} />
          <Route path="conversations" element={<Conversations />} />
          <Route path="clients" element={<Users />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="blog/*" element={<BlogAdmin />} />
          <Route path="testimonials" element={<TestimonialsAdmin />} />
          <Route path="catalog" element={<Catalog />} />
          <Route path="subscribers" element={<Subscribers />} />
          <Route path="seo" element={<SeoCentre />} />
          <Route path="settings" element={<Settings />} />
        </Routes>
      </div>
    </div>
  );
}
