import { Link } from 'react-router-dom';
import Seo from '../components/Seo.jsx';

export default function NotFound() {
  return (
    <section className="section center">
      <Seo title="Page not found" noindex />
      <div className="container container--narrow">
        <p className="big-404">404</p>
        <h1>This tower doesn’t exist</h1>
        <p className="muted">The page you’re looking for has moved or never existed.</p>
        <Link to="/" className="btn btn--primary mt">Back to home</Link>
      </div>
    </section>
  );
}
