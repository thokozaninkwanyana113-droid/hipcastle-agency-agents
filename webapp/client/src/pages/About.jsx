import { Link } from 'react-router-dom';
import { PageHeader } from '../components/ui.jsx';

const VALUES = [
  ['🎯', 'Specialised, not generic', 'Every specialist has a narrow, deep remit — the right expert for each task.'],
  ['📋', 'Deliverable-focused', 'We measure ourselves on shipped outcomes and the metrics you care about.'],
  ['🔍', 'Evidence over opinion', 'Our QA “reality checkers” require proof before anything is called done.'],
  ['🤝', 'Human accountability', 'A named Hipcastle lead owns every engagement end-to-end.'],
];

export default function About() {
  return (
    <>
      <PageHeader eyebrow="About Hipcastle" title="A modern agency, built like a castle">
        <p>Strong foundations, specialist towers, one gate. We bring together senior strategists and a roster of specialist AI agents to deliver agency work faster, more consistently and more transparently.</p>
      </PageHeader>
      <section className="section">
        <div className="container grid grid--2 align-center">
          <div>
            <span className="eyebrow">Our story</span>
            <h2>Built on an open roster of specialists</h2>
            <p>Hipcastle grew from an open-source collection of meticulously crafted agent personalities — engineers, designers, marketers, researchers and operators — each with its own identity, workflows and success metrics.</p>
            <p>We turned that roster into an operating agency: packaged service lines, transparent tiers, a NEXUS orchestration method for multi-team programmes, and a client portal that shows every milestone, invoice and message.</p>
            <Link to="/agents" className="btn btn--primary mt">Meet the specialists</Link>
          </div>
          <div className="grid grid--2">
            {VALUES.map(([i, t, d]) => <div key={t} className="card value"><span>{i}</span><h3>{t}</h3><p>{d}</p></div>)}
          </div>
        </div>
      </section>
      <section className="section section--alt">
        <div className="container container--narrow legal">
          <h2 id="privacy">Privacy</h2>
          <p>We collect only the information needed to respond to enquiries and deliver engagements: your name, contact details, company and project brief. We never sell your data. You may request access or deletion at any time by contacting hello@hipcastle.agency.</p>
          <h2 id="terms">Terms</h2>
          <p>Project engagements require a 50% deposit with the balance due on delivery. Retainers are billed monthly in advance and may be cancelled with 30 days’ notice. Intellectual property transfers to the client on full payment.</p>
        </div>
      </section>
    </>
  );
}
