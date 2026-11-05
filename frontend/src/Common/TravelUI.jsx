import { Link } from "react-router-dom";
import { Eyebrow, Icon } from "./SiteUI";
import TravelArtwork from "./TravelArtwork";
import "./travel.css";

export function TravelPhoto({ image, srcSet, alt, priority = false, sizes = "(max-width: 800px) calc(100vw - 40px), 550px" }) {
  return <img src={image} srcSet={srcSet} sizes={srcSet ? sizes : undefined} alt={alt} width="1280" height="900" loading={priority ? "eager" : "lazy"} decoding="async" fetchPriority={priority ? "high" : undefined} />;
}

export function TravelHero({ label, title, description, theme = "north", image, srcSet, alt, caption, children }) {
  return (
    <section className="container travel-hero" data-theme={theme}>
      <div className="travel-hero-copy">
        <Eyebrow>{label}</Eyebrow>
        <h1>{title}</h1>
        <p>{description}</p>
        {children}
      </div>
      <div className="travel-hero-art">
        {image ? <TravelPhoto image={image} srcSet={srcSet} alt={alt} priority /> : <TravelArtwork theme={theme} />}
        <span className="travel-art-caption"><Icon name="pin" size={18} />{caption || "Thoughtfully planned. Personally yours."}</span>
      </div>
    </section>
  );
}

export function TravelCard({ item, to, label, theme = "north" }) {
  return (
    <Link className="travel-card" to={to} data-theme={theme}>
      {item.image && <div className="travel-card-photo"><TravelPhoto image={item.image} srcSet={item.srcSet} alt={item.alt} sizes="(max-width: 550px) calc(100vw - 40px), (max-width: 800px) 45vw, 400px" />{item.duration && <span className="travel-duration">{item.duration}</span>}</div>}
      <div className="travel-card-body">
        <div className="travel-card-heading"><span className="small-label">{label}</span><Icon name="diagonal" size={20} /></div>
        <h3>{item.title}</h3>
        <p>{item.tagline}</p>
        {item.places && <span className="travel-card-places">{item.places.join(" · ")}</span>}
        <span className="travel-card-link">Explore this journey <Icon size={16} /></span>
      </div>
    </Link>
  );
}

export function TravelGallery({ item }) {
  if (!item.gallery || item.gallery.length < 2) return null;
  return <section className="container travel-gallery" aria-labelledby="travel-gallery-heading">
    <div className="travel-region-heading"><div><Eyebrow>A closer look</Eyebrow><h2 id="travel-gallery-heading">A little inspiration for the journey.</h2></div><p>{item.imageCaption}</p></div>
    <div className={`travel-gallery-grid${item.gallery.length > 2 ? " travel-gallery-three" : ""}`}>
      {item.gallery.map((photo, index) => <figure key={photo.src}>
        <TravelPhoto image={photo.src} srcSet={photo.srcSet} alt={`${photo.alt} — view ${index + 1}`} sizes="(max-width: 650px) calc(100vw - 40px), 600px" />
        <figcaption><Icon name="pin" size={15} />{item.imageCaption}<span>{String(index + 1).padStart(2, "0")}</span></figcaption>
      </figure>)}
    </div>
  </section>;
}
