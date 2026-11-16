// Support-desk emails (fire-and-forget; never throw into the request).
import { db, row } from '../db.js';
import { notifyTeam, sendEmail } from './mailer.js';

const SLA = { urgent: 4, high: 24, normal: 48, low: 72 };
const ticket = (id) => row(db.prepare('SELECT * FROM tickets WHERE id = ?').get(id));
const user = (id) => row(db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(id));
const safe = (fn) => (...a) => { try { return fn(...a); } catch (e) { console.error('support email failed', e); return null; } };

export const ticketCreated = safe((tid) => {
  const t = ticket(tid); const u = user(t.user_id);
  const body = db.prepare('SELECT body FROM ticket_messages WHERE ticket_id = ? ORDER BY id LIMIT 1').get(tid)?.body || '';
  const hours = SLA[t.priority];
  sendEmail('ticket.created', u.email, { user: u, ticket: t, hours }, { name: u.name, ref: t.reference });
  notifyTeam('ticket.notify', { user: u, ticket: t, body, hours }, { ref: t.reference });
});

export const ticketReply = safe((tid, author, body) => {
  const t = ticket(tid);
  const client = user(t.user_id);
  if (author.id === client.id) {
    const assignee = t.assigned_to && user(t.assigned_to);
    if (assignee) sendEmail('ticket.reply', assignee.email, { to: assignee, author, ticket: t, body, staffView: true }, { name: assignee.name, ref: t.reference, team: true });
    else notifyTeam('ticket.reply', { to: { name: 'team' }, author, ticket: t, body, staffView: true }, { ref: t.reference });
  } else {
    sendEmail('ticket.reply', client.email, { to: client, author: { name: `${author.name.split(' ')[0]} (Hipcastle)` }, ticket: t, body, staffView: false }, { name: client.name, ref: t.reference });
  }
});

export const ticketResolved = safe((tid) => {
  const t = ticket(tid); const u = user(t.user_id);
  sendEmail('ticket.resolved', u.email, { user: u, ticket: t }, { name: u.name, ref: t.reference });
});

export const slaDigest = safe((tickets) => notifyTeam('ticket.sla', { tickets }, { ref: 'support-sla' }));
export const chatHandoff = safe((lead, transcript) => {
  const recent = db.prepare("SELECT 1 FROM emails WHERE template = 'lead.autoreply' AND to_email = ? AND created_at > datetime('now','-1 day')").get(lead.email.toLowerCase());
  if (!recent) sendEmail('lead.autoreply', lead.email, { lead, service: null }, { name: lead.name, ref: `lead-${lead.id}` });
  notifyTeam('chat.handoff', { lead, transcript }, { ref: `lead-${lead.id}` });
});
