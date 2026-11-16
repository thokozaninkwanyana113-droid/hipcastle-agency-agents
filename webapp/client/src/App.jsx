import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import { useAuth } from './context/AuthContext.jsx';
import Home from './pages/Home.jsx';
import Services from './pages/Services.jsx';
import ServiceDetail from './pages/ServiceDetail.jsx';
import Pricing from './pages/Pricing.jsx';
import Agents from './pages/Agents.jsx';
import AgentDetail from './pages/AgentDetail.jsx';
import About from './pages/About.jsx';
import Contact from './pages/Contact.jsx';
import { ForgotPassword, Login, Register, ResetPassword } from './pages/Auth.jsx';
import Checkout from './pages/Checkout.jsx';
import Portal from './pages/Portal.jsx';
import OrderDetail from './pages/OrderDetail.jsx';
import Account from './pages/Account.jsx';
import CommandCentre from './pages/admin/CommandCentre.jsx';
import Testimonials from './pages/Testimonials.jsx';
import Blog from './pages/Blog.jsx';
import BlogPost from './pages/BlogPost.jsx';
import { Privacy, Terms } from './pages/Legal.jsx';
import PaymentReturn from './pages/PaymentReturn.jsx';
import PaymentSimulate from './pages/PaymentSimulate.jsx';
import WhatsAppButton from './components/WhatsAppButton.jsx';
import ChatWidget from './components/ChatWidget.jsx';
import Help from './pages/Help.jsx';
import { SupportList, SupportTicket } from './pages/Support.jsx';
import NotFound from './pages/NotFound.jsx';

// The assistant lives on the homepage (and the Help Centre); WhatsApp is offered inside it there.
const CHAT_PAGES = ['/', '/help'];

function RequireAuth({ children, staff = false }) {
  const { user, ready, isStaff } = useAuth();
  const loc = useLocation();
  if (!ready) return <div className="page-loader"><span className="spinner" /></div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (staff && !isStaff) return <Navigate to="/portal" replace />;
  return children;
}

export default function App() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  return (
    <div className="app">
      <a className="skip-link" href="#main">Skip to content</a>
      <Header />
      <main id="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/services" element={<Services />} />
          <Route path="/services/:slug" element={<ServiceDetail />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/agents/:slug" element={<AgentDetail />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/testimonials" element={<Testimonials />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/help" element={<Help />} />
          <Route path="/payment/return" element={<RequireAuth><PaymentReturn /></RequireAuth>} />
          <Route path="/payment/simulate" element={<RequireAuth><PaymentSimulate /></RequireAuth>} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/checkout/:tierId" element={<RequireAuth><Checkout /></RequireAuth>} />
          <Route path="/portal" element={<RequireAuth><Portal /></RequireAuth>} />
          <Route path="/portal/orders/:id" element={<RequireAuth><OrderDetail /></RequireAuth>} />
          <Route path="/account" element={<RequireAuth><Account /></RequireAuth>} />
          <Route path="/portal/support" element={<RequireAuth><SupportList /></RequireAuth>} />
          <Route path="/portal/support/:id" element={<RequireAuth><SupportTicket /></RequireAuth>} />
          <Route path="/admin/*" element={<RequireAuth staff><CommandCentre /></RequireAuth>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      {!pathname.startsWith('/admin') && <Footer />}
      {CHAT_PAGES.includes(pathname) ? <ChatWidget /> : <WhatsAppButton />}
    </div>
  );
}
