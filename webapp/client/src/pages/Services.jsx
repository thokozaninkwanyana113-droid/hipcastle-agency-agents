import ServiceCard from '../components/ServiceCard.jsx';
import { ErrorBox, Loader, PageHeader } from '../components/ui.jsx';
import { useFetch } from '../useFetch.js';
import Seo, { breadcrumbSchema } from '../components/Seo.jsx';

export default function Services() {
  const { data, error, loading } = useFetch('/services');
  return (
    <>
      <Seo title="Digital Agency Services in South Africa" description="Web development, design, digital marketing & SEO, paid ads, sales, operations and strategy services for South African businesses — with fixed rand pricing." schema={[breadcrumbSchema([{ name: 'Services', path: '/services' }])]} />
      <PageHeader eyebrow="Services" title="Everything your business needs to grow">
        <p>Fourteen service lines for South African businesses, each staffed by dedicated specialists and offered in Essential, Growth and Enterprise tiers — priced in rand.</p>
      </PageHeader>
      <section className="section">
        <div className="container">
          {loading && <Loader />}
          <ErrorBox error={error} />
          <div className="grid grid--services">{data?.map((s) => <ServiceCard key={s.slug} service={s} />)}</div>
        </div>
      </section>
    </>
  );
}
