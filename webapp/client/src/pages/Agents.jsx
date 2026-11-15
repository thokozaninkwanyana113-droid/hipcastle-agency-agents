import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ErrorBox, Loader, PageHeader } from '../components/ui.jsx';
import { useFetch } from '../useFetch.js';
import Seo from '../components/Seo.jsx';

export default function Agents() {
  const [params, setParams] = useSearchParams();
  const service = params.get('service') || '';
  const [q, setQ] = useState(params.get('q') || '');
  const [debounced, setDebounced] = useState(q);
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(t); }, [q]);

  const { data: services } = useFetch('/services');
  const { data, error, loading } = useFetch(`/agents?q=${encodeURIComponent(debounced)}&service=${service}`);

  return (
    <>
      <Seo title="Specialist AI Agents" description="Meet the 160+ specialist AI agents behind Hipcastle — engineers, designers, marketers, sales and operations experts, each with a defined mission." />
      <PageHeader eyebrow="Specialists" title="Meet the Hipcastle bench">
        <p>Every specialist has a defined identity, mission, workflow and success metrics. Search the roster or filter by service line.</p>
      </PageHeader>
      <section className="section">
        <div className="container">
          <div className="toolbar">
            <input type="search" className="input" placeholder="Search specialists…" aria-label="Search specialists" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="input" aria-label="Filter by service" value={service} onChange={(e) => setParams(e.target.value ? { service: e.target.value } : {})}>
              <option value="">All services</option>
              {services?.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
            </select>
            <span className="muted">{data ? `${data.length} specialists` : ''}</span>
          </div>
          {loading && !data && <Loader />}
          <ErrorBox error={error} />
          <div className="grid grid--agents">
            {data?.map((a) => (
              <Link key={a.slug} to={`/agents/${a.slug}`} className="agent-card">
                <span className="agent-card__emoji">{a.emoji}</span>
                <strong>{a.name}</strong>
                <span className="tag">{a.division.replace('-', ' ')}</span>
                <p>{a.description}</p>
              </Link>
            ))}
          </div>
          {data?.length === 0 && <p className="empty">No specialists match “{q}”.</p>}
        </div>
      </section>
    </>
  );
}
