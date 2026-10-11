import type { Billboard } from "./billboards";
export default function BillboardLinks({ ads }: { ads: Billboard[] }) {
  return ads.length ? (
    <section className="wardrobe" aria-label="Approved advertisements">
      <h2>Community billboards</h2>
      {ads.map((ad) => (
        <article key={ad.id}>
          <span className="eyebrow">ADVERTISEMENT</span>
          <h3>{ad.title}</h3>
          <p>{ad.description}</p>
          <a href={ad.destination} target="_blank" rel="noopener noreferrer">
            Visit advertised opportunity ↗
          </a>
        </article>
      ))}
    </section>
  ) : null;
}
