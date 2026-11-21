// What the Operator "sees": a compact, read-only snapshot of the whole business.
import { db, row, rows } from '../db.js';
import { getSettings } from '../settings.js';
import { growthReport } from '../analytics.js';

const n = (sql, ...p) => db.prepare(sql).get(...p).n ?? 0;
const rand = (c) => Math.round((c || 0) / 100);

export function snapshot() {
  const s = getSettings();
  const g = growthReport(30);
  const sastHour = new Date(Date.now() + 2 * 3600e3).getUTCHours();
  return {
    today: new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10),
    weekday: new Date(Date.now() + 2 * 3600e3).toLocaleDateString('en-ZA', { weekday: 'long', timeZone: 'UTC' }),
    sast_hour: sastHour,
    business: { name: s.business_name, city: s.address_locality, vat_registered: s.vat_registered, focus: s.operator_focus || null, monthly_ad_budget_rand: s.operator_monthly_ad_budget || 0, booking_url: s.booking_url || null },
    sales: {
      new_leads: n("SELECT COUNT(*) n FROM leads WHERE status = 'new'"),
      leads_30d: n("SELECT COUNT(*) n FROM leads WHERE created_at >= datetime('now','-30 days')"),
      won_30d: n("SELECT COUNT(*) n FROM leads WHERE status = 'won' AND created_at >= datetime('now','-30 days')"),
      waiting_over_a_day: rows(db.prepare(`SELECT l.id, l.name, l.company, l.preferred_contact, s.name AS service, l.created_at FROM leads l LEFT JOIN services s ON s.id = l.service_id
        WHERE l.status = 'new' AND l.created_at <= datetime('now','-1 day') ORDER BY l.created_at LIMIT 10`).all()),
      unpaid_new_orders: rows(db.prepare(`SELECT o.id, o.reference, u.name AS client, s.name AS service, st.name AS tier, o.price_cents, o.created_at FROM orders o
        JOIN users u ON u.id = o.user_id JOIN service_tiers st ON st.id = o.tier_id JOIN services s ON s.id = st.service_id
        WHERE o.status = 'pending' ORDER BY o.created_at LIMIT 10`).all()).map((o) => ({ ...o, price_rand: rand(o.price_cents), price_cents: undefined })),
    },
    finance: {
      revenue_30d_rand: rand(n("SELECT COALESCE(SUM(subtotal_cents),0) n FROM invoices WHERE status = 'paid' AND paid_at >= datetime('now','-30 days')")),
      monthly_recurring_rand: rand(n(`SELECT COALESCE(SUM(o.price_cents),0) n FROM orders o JOIN service_tiers st ON st.id = o.tier_id
        WHERE st.billing = 'monthly' AND o.status IN ('active','in_review')`)),
      outstanding_rand: rand(n("SELECT COALESCE(SUM(amount_cents),0) n FROM invoices WHERE status = 'unpaid'")),
      overdue: rows(db.prepare(`SELECT i.number, i.amount_cents, i.due_at, u.name AS client, o.id AS order_id FROM invoices i JOIN orders o ON o.id = i.order_id JOIN users u ON u.id = o.user_id
        WHERE i.status = 'unpaid' AND i.due_at < date('now') ORDER BY i.due_at LIMIT 10`).all()).map((i) => ({ ...i, amount_rand: rand(i.amount_cents), amount_cents: undefined })),
      autopay_active: n("SELECT COUNT(*) n FROM orders WHERE autopay_status = 'active'"),
    },
    delivery: {
      active_projects: n("SELECT COUNT(*) n FROM orders WHERE status IN ('active','in_review') AND pipeline_kind = 'project'"),
      active_retainers: n("SELECT COUNT(*) n FROM orders WHERE status IN ('active','in_review') AND pipeline_kind = 'retainer'"),
      overdue_milestones: rows(db.prepare(`SELECT o.reference, m.title, m.due_date FROM milestones m JOIN orders o ON o.id = m.order_id
        WHERE m.status NOT IN ('done') AND m.client_task = 0 AND m.status <> 'awaiting_client' AND m.due_date < date('now') AND o.status IN ('active','in_review') ORDER BY m.due_date LIMIT 10`).all()),
      waiting_on_clients: n("SELECT COUNT(*) n FROM milestones m JOIN orders o ON o.id = m.order_id WHERE m.status = 'awaiting_client' AND o.status IN ('active','in_review')"),
    },
    support: {
      open_tickets: n("SELECT COUNT(*) n FROM tickets WHERE status IN ('open','pending_client')"),
      past_target: n("SELECT COUNT(*) n FROM tickets WHERE status = 'open' AND first_response_at IS NULL AND sla_due_at < datetime('now')"),
      csat_90d: db.prepare("SELECT ROUND(AVG(csat_score),1) n FROM tickets WHERE csat_score IS NOT NULL AND created_at >= datetime('now','-90 days')").get().n,
    },
    retention: {
      care_plans_active: n("SELECT COUNT(*) n FROM orders o JOIN service_tiers st ON st.id = o.tier_id WHERE st.plan = 'care' AND o.status IN ('active','in_review')"),
      detractors_30d: rows(db.prepare(`SELECT o.id AS order_id, o.reference, u.name AS client, o.nps_score, o.nps_comment FROM orders o JOIN users u ON u.id = o.user_id
        WHERE o.nps_score IS NOT NULL AND o.nps_score <= 6 AND o.feedback_at >= datetime('now','-30 days')`).all()),
      promoters_without_review: rows(db.prepare(`SELECT o.id AS order_id, o.reference, u.id AS client_id, u.name AS client FROM orders o JOIN users u ON u.id = o.user_id
        WHERE o.nps_score >= 9 AND NOT EXISTS (SELECT 1 FROM testimonials t WHERE t.user_id = u.id) ORDER BY o.feedback_at DESC LIMIT 10`).all()),
    },
    marketing: {
      visitors_30d: g.totals.visitors, leads_from_web_30d: g.totals.leads, paid_orders_30d: g.totals.paid,
      top_sources: g.funnel.slice(0, 8).map((f) => ({ source: f.source, visitors: f.visitors, leads: f.leads, paid: f.paid, revenue_rand: rand(f.revenue_cents) })),
      top_pages: g.top_pages.slice(0, 8).map((p) => ({ page: p.key, visitors: p.visitors })),
      published_posts: n("SELECT COUNT(*) n FROM posts WHERE status = 'published'"),
      days_since_last_post: db.prepare("SELECT CAST(julianday('now') - julianday(MAX(published_at)) AS INTEGER) n FROM posts WHERE status = 'published'").get().n,
      draft_posts: n("SELECT COUNT(*) n FROM posts WHERE status = 'draft'"),
      subscribers: n("SELECT COUNT(*) n FROM newsletter_subscribers WHERE status = 'active'"),
      unanswered_chat_questions: rows(db.prepare(`SELECT q.content AS question FROM chat_messages a
        JOIN chat_messages q ON q.id = (SELECT MAX(id) FROM chat_messages WHERE session_id = a.session_id AND role = 'user' AND id < a.id)
        WHERE a.role = 'assistant' AND (a.answered = 0 OR a.helpful = 0) AND a.created_at >= datetime('now','-30 days') ORDER BY a.id DESC LIMIT 10`).all()).map((r) => r.question.slice(0, 200)),
    },
    open_operator_actions: n("SELECT COUNT(*) n FROM operator_actions WHERE status IN ('proposed','approved')"),
  };
}

/** The catalogue in brief (for proposing campaigns and content with correct prices). */
export const catalogBrief = () => rows(db.prepare(`SELECT s.slug, s.name, s.tagline,
    (SELECT json_group_array(json_object('tier', st.name, 'plan', st.plan, 'price_rand', st.price_cents / 100, 'billing', st.billing))
      FROM service_tiers st WHERE st.service_id = s.id) AS packages
  FROM services s WHERE s.is_active = 1 ORDER BY s.sort_order`).all()).map((r) => ({ ...r, packages: JSON.parse(r.packages) }));

export const leadDetail = (id) => row(db.prepare(`SELECT l.id, l.name, l.company, l.email, l.phone, l.province, l.budget, l.preferred_contact, l.status, l.source, l.created_at,
  s.name AS service, s.slug AS service_slug, substr(l.message, 1, 1500) AS message FROM leads l LEFT JOIN services s ON s.id = l.service_id WHERE l.id = ?`).get(id));
