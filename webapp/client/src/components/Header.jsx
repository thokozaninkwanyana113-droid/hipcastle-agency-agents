import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import Logo from './Logo.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useFetch } from '../useFetch.js';

export default function Header() {
  const { user, isStaff, logout } = useAuth();
  const { data: services } = useFetch('/services');
  const [open, setOpen] = useState(false);
  const [mega, setMega] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const megaRef = useRef(null);

  useEffect(() => { setOpen(false); setMega(false); }, [pathname]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    const onKey = (e) => e.key === 'Escape' && (setMega(false), setOpen(false));
    const onClick = (e) => megaRef.current && !megaRef.current.contains(e.target) && setMega(false);
    window.addEventListener('scroll', onScroll);
    window.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, []);

  return (
    <header className={`header ${scrolled ? 'header--scrolled' : ''}`}>
      <div className="topbar">
        <div className="container topbar__inner">
          <span>🚀 Now booking Q1 engagements — free 30-minute strategy consultation.</span>
          <Link to="/contact">Book a call →</Link>
        </div>
      </div>
      <div className="container header__inner">
        <Logo />
        <button className="nav-toggle" aria-expanded={open} aria-controls="primary-nav" onClick={() => setOpen(!open)}>
          <span className="sr-only">Menu</span><span className="burger" />
        </button>
        <nav id="primary-nav" className={`nav ${open ? 'nav--open' : ''}`} aria-label="Primary">
          <div className="nav__item" ref={megaRef}>
            <button className="nav__link nav__link--btn" aria-expanded={mega} onClick={() => setMega(!mega)}>
              Services <span aria-hidden="true">▾</span>
            </button>
            {mega && (
              <div className="mega" role="menu">
                <div className="mega__grid">
                  {services?.map((s) => (
                    <Link key={s.slug} to={`/services/${s.slug}`} className="mega__item" role="menuitem">
                      <span className="mega__icon">{s.icon}</span>
                      <span><strong>{s.name}</strong><small>{s.tagline}</small></span>
                    </Link>
                  ))}
                </div>
                <div className="mega__foot">
                  <span>Every service comes in Essential, Growth & Enterprise tiers.</span>
                  <Link to="/pricing">Compare all pricing →</Link>
                </div>
              </div>
            )}
          </div>
          <NavLink to="/pricing" className="nav__link">Pricing</NavLink>
          <NavLink to="/agents" className="nav__link">Specialists</NavLink>
          <NavLink to="/about" className="nav__link">About</NavLink>
          <NavLink to="/contact" className="nav__link">Contact</NavLink>
          <div className="nav__actions">
            {user ? (
              <>
                {isStaff && <NavLink to="/admin" className="nav__link">Admin</NavLink>}
                <NavLink to="/portal" className="btn btn--ghost btn--sm">My portal</NavLink>
                <button className="btn btn--text btn--sm" onClick={() => { logout(); navigate('/'); }}>Sign out</button>
              </>
            ) : (
              <>
                <NavLink to="/login" className="nav__link">Sign in</NavLink>
                <Link to="/contact" className="btn btn--primary btn--sm">Start a project</Link>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
