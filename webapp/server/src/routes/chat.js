import { Router } from 'express';
import { db, row, rows } from '../db.js';
import { body, z } from '../validate.js';
import { botCheck } from '../botcheck.js';
import { attributionFrom } from '../analytics.js';
import { guardFields } from '../guard.js';
import { logEvent } from '../events.js';
import { chatHandoff } from '../email/support-notify.js';
import { answer, chatMode, getOrCreateSession, SUGGESTIONS, transcript } from '../chat.js';
import { buildChunks, CATEGORIES, search } from '../kb.js';
import { getSettings } from '../settings.js';

const r = Router();

// ---- Help Centre (same knowledge as the chatbot)
r.get('/help', (_req, res) => {
  const chunks = buildChunks();
  res.json({ categories: CATEGORIES.map(([key, label]) => ({ key, label, items: chunks.filter((c) => c.category === key).map(({ id, title, body: text, link }) => ({ id, title, body: text, link })) })).filter((c) => c.items.length) });
});
r.get('/help/search', (req, res) => {
  const q = String(req.query.q || '').slice(0, 200);
  res.json(search(q, buildChunks(), 8).map(({ id, title, body: text, link, category }) => ({ id, title, body: text, link, category })));
});

// ---- Chat
r.get('/chat/status', (_req, res) => {
  const s = getSettings();
  res.json({
    mode: chatMode(),
    greeting: `Hi! I'm the ${s.business_name} assistant. Ask me about our services, prices, payments or how delivery works.`,
    suggestions: SUGGESTIONS,
    whatsapp: s.whatsapp || null,
  });
});

r.post('/chat', body(z.object({
  session_id: z.string().max(64).optional().default(''),
  message: z.string().trim().min(1).max(800, 'Please keep messages under 800 characters'),
  page: z.string().max(200).optional().default('/'),
})), guardFields('message'), async (req, res) => {
  const session = getOrCreateSession(req.body.session_id, { ip: req.ip, page: req.body.page });
  if (session.message_count >= 60) return res.status(429).json({ error: 'This conversation is very long — please start a new chat or contact us directly.' });
  res.set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders?.();
  const emit = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  emit('meta', { session_id: session.id, mode: chatMode() });
  try {
    await answer({ session, message: req.body.message, emit });
  } catch (err) {
    console.error(err);
    emit('error', { error: 'Sorry, something went wrong. Please try again or contact us.' });
  }
  res.end();
});

r.post('/chat/:sid/feedback', body(z.object({ message_id: z.number().int().positive(), helpful: z.boolean() })), (req, res) => {
  const info = db.prepare(`UPDATE chat_messages SET helpful = ? WHERE id = ? AND session_id = ? AND role = 'assistant'`)
    .run(req.body.helpful ? 1 : 0, req.body.message_id, req.params.sid);
  if (!info.changes) return res.status(404).json({ error: 'Message not found' });
  res.json({ ok: true });
});

// Hand the conversation to a person: creates a lead (with the transcript) and the usual lead emails.
r.post('/chat/:sid/handoff', botCheck('chat handoff'), body(z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional().default(''),
  preferred_contact: z.enum(['email', 'phone', 'whatsapp']).optional().default('email'),
  note: z.string().trim().max(1000).optional().default(''),
  consent: z.literal(true, { message: 'Please agree to be contacted' }),
})), guardFields('note'), (req, res) => {
  const session = row(db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(req.params.sid));
  if (!session) return res.status(404).json({ error: 'Chat not found' });
  if (session.handoff_lead_id) return res.json({ ok: true, lead_id: session.handoff_lead_id });
  const b = req.body;
  const convo = transcript(session.id, 12).map((m) => `${m.role === 'user' ? 'Visitor' : 'Assistant'}: ${m.content.slice(0, 400)}`).join('\n');
  const message = `${b.note || 'Requested a person via the website chatbot.'}\n\n--- Chat transcript ---\n${convo}`.slice(0, 4900);
  const attr = attributionFrom(req);
  const lead = row(db.prepare(`INSERT INTO leads (name, email, phone, preferred_contact, source, message, attribution)
    VALUES (?, ?, ?, ?, 'chatbot', ?, ?) RETURNING id`).get(b.name, b.email.toLowerCase(), b.phone, b.preferred_contact, message, attr ? JSON.stringify(attr) : null));
  db.prepare('UPDATE chat_sessions SET handoff_lead_id = ? WHERE id = ?').run(lead.id, session.id);
  logEvent('chat.handoff', `Chatbot handoff: ${b.name} wants a person (${b.preferred_contact})`, { ref: String(lead.id) });
  chatHandoff({ ...b, email: b.email.toLowerCase(), id: lead.id, message: b.note || 'Requested a person via the website chatbot.' }, transcript(session.id, 12));
  res.status(201).json({ ok: true, lead_id: lead.id });
});

export default r;
