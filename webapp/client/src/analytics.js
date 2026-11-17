// First-party, cookie-free analytics. Nothing personal is stored: the server counts page views
// and daily unique visitors with a hash that changes every day. "Where you first came from"
// (UTM tags / referring site) stays in this browser and is attached to enquiries, sign-ups and
// orders so we can tell which channels bring clients. Do Not Track / GPC are honoured.
const TOUCH = 'hc_touch';   // this visit's entry source (sessionStorage)
const FIRST = 'hc_attr';    // first-ever touch (localStorage)
const UTM = ['utm_source', 'utm_medium', 'utm_campaign'];

const optedOut = () => navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true;
const read = (store, key) => { try { return JSON.parse(store.getItem(key)); } catch { return null; } };
const write = (store, key, v) => { try { store.setItem(key, JSON.stringify(v)); } catch { /* private mode */ } };

/** Capture the entry source once per visit, and the first-ever touch once per browser. */
function touch() {
  let t = read(sessionStorage, TOUCH);
  if (!t) {
    const q = new URLSearchParams(window.location.search);
    t = { referrer: document.referrer || '', landing: window.location.pathname };
    for (const k of UTM) if (q.get(k)) t[k] = q.get(k).slice(0, 80);
    write(sessionStorage, TOUCH, t);
    if (!read(localStorage, FIRST)) write(localStorage, FIRST, { ...t, first_seen: new Date().toISOString().slice(0, 10) });
  }
  return t;
}

export function trackPage(path) {
  if (optedOut() || path.startsWith('/admin')) return;
  const t = touch();
  fetch('/api/t', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, touch: t }) }).catch(() => {});
}

/** Header value sent with form submissions so leads, sign-ups and orders record their source. */
export function attributionHeader() {
  if (optedOut()) return null;
  touch();
  const a = read(localStorage, FIRST);
  if (!a) return null;
  return btoa(unescape(encodeURIComponent(JSON.stringify(a))));
}
