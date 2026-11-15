import { Link, useParams } from 'react-router-dom';
import Markdown from '../components/Markdown.jsx';
import { ErrorBox, Loader } from '../components/ui.jsx';
import { useFetch } from '../useFetch.js';
import NotFound from './NotFound.jsx';

export default function AgentDetail() {
  const { slug } = useParams();
  const { data: a, error, loading } = useFetch(`/agents/${slug}`);
  if (loading) return <Loader />;
  if (error?.status === 404) return <NotFound />;
  if (error) return <div className="container section"><ErrorBox error={error} /></div>;
  return (
    <>
      <section className="page-header">
        <div className="container">
          <nav className="breadcrumb" aria-label="Breadcrumb"><Link to="/agents">Specialists</Link> / <span>{a.name}</span></nav>
          <span className="page-header__icon" aria-hidden="true">{a.emoji}</span>
          <h1>{a.name}</h1>
          <p className="page-header__lead">{a.description}</p>
          {a.vibe && <p className="vibe">“{a.vibe}”</p>}
        </div>
      </section>
      <section className="section">
        <div className="container layout-sidebar">
          <article className="card"><Markdown source={a.profile} /></article>
          <aside className="sidebar">
            <div className="card">
              <h3>Available through</h3>
              <ul className="link-list">
                {a.services.map((s) => <li key={s.slug}><Link to={`/services/${s.slug}`}>{s.icon} {s.name}</Link></li>)}
              </ul>
              <Link to={`/contact?service=${a.services[0]?.slug ?? ''}`} className="btn btn--primary btn--block mt">Work with this specialist</Link>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
