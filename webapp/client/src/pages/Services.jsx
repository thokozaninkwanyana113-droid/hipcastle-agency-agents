import ServiceCard from '../components/ServiceCard.jsx';
import { ErrorBox, Loader, PageHeader } from '../components/ui.jsx';
import { useFetch } from '../useFetch.js';

export default function Services() {
  const { data, error, loading } = useFetch('/services');
  return (
    <>
      <PageHeader eyebrow="Services" title="Everything your business needs to grow">
        <p>Fourteen service lines, each staffed by dedicated specialists and offered in Essential, Growth and Enterprise tiers.</p>
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
