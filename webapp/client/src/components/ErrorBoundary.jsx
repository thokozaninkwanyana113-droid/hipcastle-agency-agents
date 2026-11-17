// Catches rendering crashes so one broken component doesn't blank the whole site, and reports
// them to the server (which alerts the team).
import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    try {
      fetch('/api/client-error', {
        method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: String(error?.message || error).slice(0, 500), path: window.location.pathname, stack: `${error?.stack || ''}\n${info?.componentStack || ''}`.slice(0, 4000) }),
      }).catch(() => {});
    } catch { /* never throw from the boundary */ }
  }
  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null }); // navigating away recovers
  }
  render() {
    if (!this.state.error) return this.props.children;
    // A new build was deployed while this tab was open: the old code chunk no longer exists.
    const stale = /dynamically imported module|Loading chunk|Importing a module script failed/i.test(String(this.state.error?.message));
    return (
      <section className="section">
        <div className="container container--narrow card empty-state" role="alert">
          <span aria-hidden="true">🛠️</span>
          <h1 className="h2">{stale ? 'We’ve just updated the site' : 'Something went wrong on this page'}</h1>
          <p>{stale ? 'Reload to get the latest version.' : 'Our team has been notified. Try reloading — or go back to the home page.'}</p>
          <p><button className="btn btn--primary" onClick={() => window.location.reload()}>Reload</button> <a className="btn btn--ghost" href="/">Home</a></p>
        </div>
      </section>
    );
  }
}
