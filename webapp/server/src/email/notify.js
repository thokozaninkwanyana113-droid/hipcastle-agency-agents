// Business events → emails. Each helper loads what the template needs and queues the
// customer email and/or the team alert. All of them are fire-and-forget.
import { db, row } from '../db.js';
import { notifyTeam, sendEmail } from './mailer.js';

const ORDER = `SELECT o.*, st.name AS tier_name, st.billing, s.name AS service_name
  FROM orders o JOIN service_tiers st ON st.id = o.tier_id JOIN services s ON s.id = st.service_id WHERE o.id = ?`;
const loadOrder = (id) => row(db.prepare(ORDER).get(id));
const loadUser = (id) => row(db.prepare('SELECT id, name, email, company, role FROM users WHERE id = ?').get(id));
const safe = (fn) => (...args) => { try { return fn(...args); } catch (err) { console.error('email hook failed', err); return null; } };

export const onLead = safe((lead, service) => {
  sendEmail('lead.autoreply', lead.email, { lead, service }, { name: lead.name, ref: `lead-${lead.id}` });
  notifyTeam('lead.notify', { lead, service }, { ref: `lead-${lead.id}` });
});

export const onRegister = safe((user) => sendEmail('user.welcome', user.email, { user }, { name: user.name }));

export const onOrderCreated = safe((orderId) => {
  const order = loadOrder(orderId);
  const user = loadUser(order.user_id);
  const invoice = row(db.prepare('SELECT * FROM invoices WHERE order_id = ? ORDER BY id LIMIT 1').get(orderId));
  sendEmail('order.confirmation', user.email, { user, order, invoice }, { name: user.name, ref: order.reference });
  notifyTeam('order.notify', { user, order }, { ref: order.reference });
});

export const onOrderStatus = safe((orderId, status) => {
  if (!['active', 'in_review', 'completed', 'cancelled'].includes(status)) return;
  const order = loadOrder(orderId);
  const user = loadUser(order.user_id);
  sendEmail('order.status', user.email, { user, order, status }, { name: user.name, ref: order.reference });
});

export const onInvoiceIssued = safe((invoiceId) => {
  const invoice = row(db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId));
  const order = loadOrder(invoice.order_id);
  const user = loadUser(order.user_id);
  sendEmail('invoice.issued', user.email, { user, order, invoice }, { name: user.name, ref: invoice.number });
});

export const onInvoiceOverdue = safe((invoiceNumber) => {
  const invoice = row(db.prepare('SELECT * FROM invoices WHERE number = ?').get(invoiceNumber));
  const order = loadOrder(invoice.order_id);
  const user = loadUser(order.user_id);
  sendEmail('invoice.reminder', user.email, { user, order, invoice }, { name: user.name, ref: invoice.number });
});

export const onPayment = safe((paymentRef, status) => {
  const payment = row(db.prepare('SELECT * FROM payments WHERE reference = ?').get(paymentRef));
  const invoice = row(db.prepare('SELECT * FROM invoices WHERE id = ?').get(payment.invoice_id));
  const order = loadOrder(invoice.order_id);
  const user = loadUser(order.user_id);
  if (status === 'complete') {
    sendEmail('payment.receipt', user.email, { user, order, invoice, payment }, { name: user.name, ref: payment.reference });
    notifyTeam('payment.notify', { user, order, invoice, payment }, { ref: payment.reference });
  } else if (status === 'failed') {
    sendEmail('payment.failed', user.email, { user, order, invoice, payment }, { name: user.name, ref: payment.reference });
  }
});

export const onMessage = safe((orderId, author, body) => {
  const order = loadOrder(orderId);
  const client = loadUser(order.user_id);
  if (author.id === client.id) {
    notifyTeam('message.new', { recipient: null, author, order, body, toTeam: true }, { ref: order.reference });
  } else {
    sendEmail('message.new', client.email, { recipient: client, author, order, body, toTeam: false }, { name: client.name, ref: order.reference });
  }
});

export const onTestimonialSubmitted = safe((t) => notifyTeam('testimonial.notify', { t }, { ref: `review-${t.id}` }));
export const onTestimonialApproved = safe((t) => t.email && sendEmail('testimonial.thanks', t.email, { t }, { name: t.author, ref: `review-${t.id}` }));
export const onSubscribe = safe((email) => sendEmail('newsletter.welcome', email, {}, { ref: 'newsletter' }));
