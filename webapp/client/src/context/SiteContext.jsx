import { createContext, useContext } from 'react';
import { useFetch } from '../useFetch.js';
import { setSiteUrl } from '../siteUrl.js';

const FALLBACK = {
  business_name: 'Hipcastle Agency', tagline: 'Specialist teams for South African entrepreneurs', email: 'hello@hipcastle.agency', site_url: 'https://www.hipcastle.agency',
  phone: '', whatsapp: '', office_hours: 'Mon–Fri, 08:00–17:00 SAST', announcement: '', vat_registered: false, vat_rate: 15,
  address_locality: 'Johannesburg', address_region: 'Gauteng', social: {}, payment_methods: [], provinces: [], orders_enabled: true,
};
const SiteContext = createContext(FALLBACK);

export function SiteProvider({ children }) {
  const { data, reload } = useFetch('/site');
  if (data?.site_url) setSiteUrl(data.site_url);
  return <SiteContext.Provider value={{ ...FALLBACK, ...data, reloadSite: reload }}>{children}</SiteContext.Provider>;
}
export const useSite = () => useContext(SiteContext);
