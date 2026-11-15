import { useLocation } from 'react-router-dom';
import { useSite } from '../context/SiteContext.jsx';
import { Icon } from './icons.jsx';
import { waLink } from '../format.js';

export default function WhatsAppButton() {
  const { whatsapp, business_name } = useSite();
  const { pathname } = useLocation();
  if (!whatsapp || pathname.startsWith('/admin')) return null;
  return (
    <a className="wa-float" href={waLink(whatsapp, `Hi ${business_name}, I'd like to chat about a project.`)} target="_blank" rel="noopener noreferrer" aria-label="Chat with us on WhatsApp">
      <Icon name="whatsapp" size={28} />
      <span className="wa-float__label">Chat on WhatsApp</span>
    </a>
  );
}
