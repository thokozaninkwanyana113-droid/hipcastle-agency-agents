import { ErrorBox, Loader } from '../../components/ui.jsx';
import { useFetch } from '../../useFetch.js';
import { PanelHead } from './shared.jsx';

export default function SeoCentre() {
  const { data, error, loading } = useFetch('/admin/seo');
  if (loading) return <Loader />;
  if (error) return <ErrorBox error={error} />;
  const score = Math.round(((data.checks.filter((c) => c.ok).length / data.checks.length) * 0.5 + ((data.summary.pages - data.summary.with_issues) / data.summary.pages) * 0.5) * 100);
  return (
    <>
      <PanelHead title="SEO, AEO & GEO" sub="How search engines (SEO), answer engines (AEO) and AI assistants (GEO) see your site." />
      <div className="kpis">
        <div className="kpi"><span>Readiness score</span><strong className={score >= 80 ? 'text-success' : ''}>{score}/100</strong></div>
        <div className="kpi"><span>Indexable pages</span><strong>{data.summary.sitemap_urls}</strong><small>in sitemap.xml</small></div>
        <div className="kpi"><span>Key pages audited</span><strong>{data.summary.pages}</strong></div>
        <div className="kpi"><span>Pages with issues</span><strong className={data.summary.with_issues ? 'text-error' : 'text-success'}>{data.summary.with_issues}</strong></div>
      </div>
      <div className="grid grid--order">
        <div className="card">
          <h3>Site-wide checks</h3>
          <ul className="checks">{data.checks.map((c) => <li key={c.label} className={c.ok ? 'checks__ok' : 'checks__warn'}>{c.ok ? '✅' : '⚠️'} {c.label}</li>)}</ul>
        </div>
        <div className="card">
          <h3>Crawler & AI files</h3>
          <ul className="link-list">
            {Object.entries({ 'XML sitemap': data.links.sitemap, 'robots.txt (AI crawlers allowed)': data.links.robots, 'llms.txt (AI summary)': data.links.llms, 'llms-full.txt (full detail for AI)': data.links.llms_full, 'RSS feed': data.links.rss })
              .map(([label, href]) => <li key={href}><a href={href} target="_blank" rel="noreferrer">{label} ↗</a></li>)}
          </ul>
          <h3 className="mt">What’s built in</h3>
          <ul className="checks">
            <li className="checks__ok">✅ Server-rendered titles, meta, canonical & Open Graph on every URL</li>
            <li className="checks__ok">✅ Pre-rendered page content for non-JavaScript crawlers & AI bots</li>
            <li className="checks__ok">✅ JSON-LD: Organization, ProfessionalService, Service + ZAR Offers, FAQPage, BlogPosting, Review, BreadcrumbList</li>
            <li className="checks__ok">✅ Question-led FAQs with direct answers on every service (AEO)</li>
            <li className="checks__ok">✅ en-ZA language, geo tags, South Africa areaServed</li>
          </ul>
        </div>
      </div>
      <div className="card table-wrap mt-lg">
        <table className="table">
          <thead><tr><th>Page</th><th>Title</th><th>Description</th><th>Structured data</th><th>Issues</th></tr></thead>
          <tbody>
            {data.pages.map((p) => (
              <tr key={p.path}>
                <td><a href={p.path} target="_blank" rel="noreferrer"><code>{p.path}</code></a><small>{p.words} words</small></td>
                <td>{p.title}<small className={p.title_length > 65 ? 'text-error' : ''}>{p.title_length} chars</small></td>
                <td className="w-message">{p.description}<small className={p.description_length > 165 || p.description_length < 70 ? 'text-error' : ''}>{p.description_length} chars</small></td>
                <td>{p.schema_types.map((t) => <span key={t} className="tag">{t}</span>)}</td>
                <td>{p.issues.length ? <ul className="mini-list">{p.issues.map((i) => <li key={i} className="text-error">{i}</li>)}</ul> : <span className="text-success">✓</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
