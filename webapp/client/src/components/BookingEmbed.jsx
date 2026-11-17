// "Pick a time" for the free strategy session: Cal.com and Calendly embed inline; Microsoft Bookings
// opens in a new tab (it doesn't allow embedding on other sites).
import { useState } from 'react';

const embeddable = (url) => /(^|\.)(cal\.com|calendly\.com)$/.test(new URL(url).hostname);

export default function BookingEmbed({ url, compact = false }) {
  const [show, setShow] = useState(!compact);
  let inline = false;
  try { inline = embeddable(url); } catch { return null; }
  const src = inline ? `${url}${url.includes('?') ? '&' : '?'}embed=true&hide_gdpr_banner=1` : url;
  return (
    <section className="card booking" aria-labelledby="booking-h">
      <div className="booking__head">
        <div>
          <h2 id="booking-h" className="h3">📅 Pick a time for your free strategy session</h2>
          <p className="muted">30 minutes on Google Meet, Teams or a phone call. Choose a slot that suits you — you’ll get a calendar invite straight away.</p>
        </div>
        {(!inline || !show) && (
          inline
            ? <button className="btn btn--primary" onClick={() => setShow(true)}>Show available times</button>
            : <a className="btn btn--primary" href={url} target="_blank" rel="noopener noreferrer">See available times ↗</a>
        )}
      </div>
      {inline && show && <iframe className="booking__frame" src={src} title="Book a free strategy session" loading="lazy" />}
    </section>
  );
}
