// "Ask Hipcastle" — the homepage assistant. Answers stream from /api/chat (Server-Sent Events);
// the server uses Claude when configured and its built-in FAQ engine otherwise.
import { Fragment, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api.js';
import { useSite } from '../context/SiteContext.jsx';
import { waLink } from '../format.js';
import { Icon } from './icons.jsx';
import { Captcha, Honeypot } from './BotGuard.jsx';

const STORE = 'hipcastle_chat';
const load = () => { try { return JSON.parse(sessionStorage.getItem(STORE)) || {}; } catch { return {}; } };
const save = (v) => { try { sessionStorage.setItem(STORE, JSON.stringify(v)); } catch { /* private mode */ } };

/** Open the assistant from anywhere: window.dispatchEvent(new CustomEvent('hipcastle:chat', { detail: { ask } })). */
export const openChat = (ask) => window.dispatchEvent(new CustomEvent('hipcastle:chat', { detail: { ask } }));

// ---- Safe text rendering: paragraphs, bullet lists, **bold**, [links](/x), bare /paths and URLs. Never raw HTML.
const TOKEN = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s)]+|(?<![\w/])\/(?:[a-z0-9-]+)(?:\/[a-z0-9-]+)*(?:#[a-z-]+)?(?![\w/])|[\w.+-]+@[\w-]+\.[\w.]+)/gi;
function linkFor(href, label, key) {
  if (href.startsWith('/')) return <Link key={key} to={href}>{label}</Link>;
  if (/^https?:\/\//.test(href)) return <a key={key} href={href} target="_blank" rel="noopener noreferrer">{label}</a>;
  if (href.includes('@')) return <a key={key} href={`mailto:${href}`}>{label}</a>;
  return label;
}
function inline(text, k) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const key = `${k}-${m.index}`;
    if (t.startsWith('**')) out.push(<strong key={key}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith('[')) { const [, label, href] = t.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/); out.push(linkFor(href, label, key)); }
    else { const clean = t.replace(/[.,;:!?]+$/, ''); out.push(linkFor(clean, clean, key)); if (clean !== t) out.push(t.slice(clean.length)); }
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
const BULLET = /^\s*([-*•]|\d+[.)])\s+/;
export function ChatText({ text }) {
  const out = [];
  text.trim().split(/\n{2,}/).forEach((b, i) => {
    // Split each block into runs of plain lines and list lines.
    let run = null;
    const flush = () => {
      if (!run) return;
      const k = `${i}-${out.length}`;
      if (run.list) {
        const Tag = /^\s*\d/.test(run.lines[0]) ? 'ol' : 'ul';
        out.push(<Tag key={k}>{run.lines.map((l, j) => <li key={j}>{inline(l.replace(BULLET, ''), `${k}-${j}`)}</li>)}</Tag>);
      } else if (run.lines.length === 1 && /^#{1,4}\s/.test(run.lines[0])) {
        out.push(<p key={k}><strong>{run.lines[0].replace(/^#+\s*/, '')}</strong></p>);
      } else {
        out.push(<p key={k}>{run.lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l, `${k}-${j}`)}</Fragment>)}</p>);
      }
      run = null;
    };
    for (const line of b.split('\n')) {
      const list = BULLET.test(line);
      if (!run || run.list !== list) { flush(); run = { list, lines: [] }; }
      run.lines.push(line);
    }
    flush();
  });
  return out;
}

// ---- SSE over fetch (EventSource can't POST)
async function streamChat(payload, on) {
  const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.error || 'The assistant is unavailable right now.', res.status);
  }
  const redacted = res.headers.get('X-Content-Redacted');
  if (redacted) window.dispatchEvent(new CustomEvent('hipcastle:redacted', { detail: redacted.split(',') }));
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const event = frame.match(/^event: (.+)$/m)?.[1];
      const data = frame.match(/^data: (.+)$/m)?.[1];
      if (event && data) on(event, JSON.parse(data));
    }
  }
}

function Handoff({ sessionId, onDone, onCancel }) {
  const [f, setF] = useState({ name: '', email: '', phone: '', preferred_contact: 'email', note: '', consent: false, website: '', captcha_token: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api(`/chat/${sessionId}/handoff`, { method: 'POST', body: f });
      onDone(f.name);
    } catch (ex) { setErr(Object.values(ex.fields || {})[0] || ex.message); }
    setBusy(false);
  };
  return (
    <form className="chat__handoff" onSubmit={submit}>
      <p className="chat__handoff-title"><strong>Talk to a person</strong> — we’ll reply within one business day, with this conversation attached.</p>
      <input aria-label="Your name" placeholder="Your name" required minLength={2} value={f.name} onChange={set('name')} autoComplete="name" />
      <input aria-label="Email" type="email" placeholder="Email" required value={f.email} onChange={set('email')} autoComplete="email" />
      <input aria-label="Phone (optional)" placeholder="Phone (optional)" value={f.phone} onChange={set('phone')} autoComplete="tel" />
      <select aria-label="Preferred contact" value={f.preferred_contact} onChange={set('preferred_contact')}>
        <option value="email">Contact me by email</option><option value="phone">Call me</option><option value="whatsapp">WhatsApp me</option>
      </select>
      <textarea aria-label="Anything else? (optional)" placeholder="Anything else we should know? (optional)" rows={2} value={f.note} onChange={set('note')} maxLength={1000} />
      <label className="chat__consent"><input type="checkbox" checked={f.consent} onChange={set('consent')} required /> I agree that Hipcastle may contact me about my enquiry (<Link to="/privacy">privacy policy</Link>).</label>
      <Honeypot value={f.website} onChange={(v) => setF((s) => ({ ...s, website: v }))} />
      <Captcha onToken={(t) => setF((s) => ({ ...s, captcha_token: t }))} />
      {err && <p className="chat__error" role="alert">{err}</p>}
      <div className="chat__handoff-actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>Back to chat</button>
        <button className="btn btn--primary btn--sm" disabled={busy}>{busy ? 'Sending…' : 'Send to the team'}</button>
      </div>
    </form>
  );
}

export default function ChatWidget() {
  const site = useSite();
  const saved = load();
  const [open, setOpen] = useState(!!saved.open);
  const [status, setStatus] = useState(null);
  const [sessionId, setSessionId] = useState(saved.sessionId || '');
  const [messages, setMessages] = useState(saved.messages || []);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [handoff, setHandoff] = useState(false);
  const [handedOff, setHandedOff] = useState(!!saved.handedOff);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const launcherRef = useRef(null);

  useEffect(() => { save({ open, sessionId, messages: messages.slice(-40), handedOff }); }, [open, sessionId, messages, handedOff]);
  useEffect(() => { if (open && !status) api('/chat/status').then(setStatus).catch(() => setStatus({ suggestions: [] })); }, [open, status]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, handoff]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const send = async (text) => {
    const message = text.trim();
    if (!message || busy) return;
    setInput(''); setBusy(true); setHandoff(false);
    setMessages((m) => [...m, { role: 'user', content: message }, { role: 'assistant', content: '', pending: true }]);
    const patch = (fn) => setMessages((m) => { const copy = m.slice(); copy[copy.length - 1] = fn(copy[copy.length - 1]); return copy; });
    try {
      await streamChat({ session_id: sessionId, message, page: window.location.pathname }, (event, data) => {
        if (event === 'meta') setSessionId(data.session_id);
        else if (event === 'delta') patch((a) => ({ ...a, content: a.content + data.text }));
        else if (event === 'done') patch((a) => ({ ...a, pending: false, id: data.message_id, links: data.links, source: data.source }));
        else if (event === 'error') patch((a) => ({ ...a, pending: false, error: true, content: a.content || data.error }));
      });
      patch((a) => ({ ...a, pending: false }));
    } catch (e) {
      patch((a) => ({ ...a, pending: false, error: true, content: e.message }));
    }
    setBusy(false);
    inputRef.current?.focus();
  };

  // Opened from elsewhere on the page (hero / FAQ buttons), optionally with a question.
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    const h = (e) => { setOpen(true); if (e.detail?.ask) sendRef.current(e.detail.ask); };
    window.addEventListener('hipcastle:chat', h);
    return () => window.removeEventListener('hipcastle:chat', h);
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => { if (e.key === 'Escape') { setOpen(false); launcherRef.current?.focus(); } };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);

  const rate = (msg, helpful) => {
    setMessages((m) => m.map((x) => (x === msg ? { ...x, helpful } : x)));
    api(`/chat/${sessionId}/feedback`, { method: 'POST', body: { message_id: msg.id, helpful } }).catch(() => {});
    if (!helpful && !handedOff) setMessages((m) => [...m, { role: 'assistant', local: true, content: 'Sorry that didn’t help. Try rephrasing, or tap **Talk to a person** and our team will follow up.' }]);
  };
  const reset = () => { setMessages([]); setSessionId(''); setHandedOff(false); setHandoff(false); };

  const greeting = status?.greeting || `Hi! I'm the ${site.business_name} assistant. Ask me about our services, prices, payments or how delivery works.`;
  const wa = status?.whatsapp || site.whatsapp;

  return (
    <>
      {!open && (
        <button ref={launcherRef} className="chat-launcher" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded="false">
          <img className="chat-launcher__icon" src="/favicon.svg" width="30" height="30" alt="" aria-hidden="true" />
          <span>Ask Hipcastle</span>
        </button>
      )}
      {open && (
        <section className="chat" role="dialog" aria-modal="false" aria-labelledby="chat-title">
          <header className="chat__head">
            <img className="chat__avatar" src="/favicon.svg" width="38" height="38" alt="" aria-hidden="true" />
            <div className="chat__title">
              <h2 id="chat-title">Ask Hipcastle</h2>
              <p>{status?.mode === 'ai' ? 'AI assistant · answers from our published services & policies' : 'Instant answers from our help centre'}</p>
            </div>
            <div className="chat__head-actions">
              {messages.length > 0 && <button className="chat__icon-btn" onClick={reset} title="Start a new chat" aria-label="Start a new chat">↺</button>}
              <button className="chat__icon-btn" onClick={() => { setOpen(false); setTimeout(() => launcherRef.current?.focus(), 0); }} aria-label="Close chat">✕</button>
            </div>
          </header>

          <div className="chat__body" ref={listRef} aria-live="polite" aria-busy={busy}>
            <div className="chat__msg chat__msg--assistant"><ChatText text={greeting} /></div>
            {messages.length === 0 && status?.suggestions?.length > 0 && (
              <div className="chat__suggestions" aria-label="Suggested questions">
                {status.suggestions.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`chat__msg chat__msg--${m.role} ${m.error ? 'chat__msg--error' : ''}`}>
                {m.role === 'user' ? <p>{m.content}</p> : m.content ? <ChatText text={m.content} /> : <span className="chat__typing" aria-label="Assistant is typing"><i /><i /><i /></span>}
                {m.links?.length > 0 && (
                  <div className="chat__links">{m.links.map((l) => <Link key={l.href} to={l.href} onClick={() => window.innerWidth < 640 && setOpen(false)}>{l.label} →</Link>)}</div>
                )}
                {m.id && !m.pending && (
                  <div className="chat__rate">
                    {m.helpful === undefined ? (
                      <>
                        <span>Helpful?</span>
                        <button onClick={() => rate(m, true)} aria-label="Yes, helpful">👍</button>
                        <button onClick={() => rate(m, false)} aria-label="No, not helpful">👎</button>
                      </>
                    ) : <span>Thanks for the feedback</span>}
                  </div>
                )}
              </div>
            ))}
            {handedOff && <div className="chat__msg chat__msg--system"><p>✅ Sent to the team — we’ll be in touch within one business day.</p></div>}
            {handoff && sessionId && (
              <Handoff sessionId={sessionId} onCancel={() => setHandoff(false)}
                onDone={(name) => { setHandoff(false); setHandedOff(true); setMessages((m) => [...m, { role: 'assistant', local: true, content: `Thanks ${name.split(' ')[0]}! A Hipcastle team member will contact you within one business day. You'll also get a confirmation email.` }]); }} />
            )}
          </div>

          <div className="chat__escalate">
            {!handedOff && sessionId && !handoff && <button onClick={() => setHandoff(true)}>🙋 Talk to a person</button>}
            {wa && <a href={waLink(wa, `Hi ${site.business_name}, I have a question.`)} target="_blank" rel="noopener noreferrer"><Icon name="whatsapp" size={14} /> WhatsApp</a>}
            <Link to="/help">Help centre</Link>
          </div>

          <form className="chat__form" onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <label htmlFor="chat-input" className="sr-only">Your question</label>
            <textarea id="chat-input" ref={inputRef} rows={1} maxLength={800} value={input} placeholder="Ask a question…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }} />
            <button className="btn btn--primary btn--sm" disabled={busy || !input.trim()} aria-label="Send">{busy ? '…' : 'Send'}</button>
          </form>
          <p className="chat__notice">Chats are stored for 180 days to improve our help (<Link to="/privacy">POPIA notice</Link>). Never share passwords, card or banking details here.</p>
        </section>
      )}
    </>
  );
}
