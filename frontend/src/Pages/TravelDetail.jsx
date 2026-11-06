import { Link } from "react-router-dom";
import { Eyebrow, Icon } from "../Common/SiteUI";
import { TravelHero, TravelCard, TravelGallery } from "../Common/TravelUI";
import { destinations, regions, tourPackages, indiaJourneys, destinationPath, packagePath, regionPath, indiaPath } from "../Common/travelCatalog";

export default function TravelDetail({ item, type = "destination" }) {
  const isPackage = type === "package";
  const isIndia = type === "india";
  const region = regions.find((entry) => entry.slug === item.region);
  const related = (isPackage ? tourPackages : isIndia ? indiaJourneys : destinations.filter((entry) => entry.region === item.region)).filter((entry) => entry.slug !== item.slug).slice(0, 3);
  const pathFor = isPackage ? packagePath : isIndia ? indiaPath : destinationPath;
  const collectionPath = isPackage ? "/tour-packages" : isIndia ? "/india" : regionPath(region);
  const collectionName = isPackage ? "Tour packages" : isIndia ? "India & beyond" : region.title;
  const enquiryPath = `/request-quote?destination=${encodeURIComponent(item.title)}`;
  return <>
    <nav className="container travel-breadcrumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span aria-hidden="true">/</span><Link to={collectionPath}>{collectionName}</Link><span aria-hidden="true">/</span><span aria-current="page">{item.title}</span></nav>
    <TravelHero label={item.country || collectionName} title={item.title} description={item.description} theme={region.theme} image={item.image} srcSet={item.srcSet} alt={item.alt} caption={item.imageCaption} promotionId={item.promotionId}>
      {item.duration && <span className="travel-trip-duration"><Icon name="sun" size={17} />{item.duration}</span>}
      <div className="travel-detail-actions"><Link className="button" to={enquiryPath}>Plan this journey<Icon size={18} /></Link><Link className="text-link" to={collectionPath}>Back to {collectionName}<Icon size={16} /></Link></div>
    </TravelHero>
    <section className="container travel-detail-section">
      <div className="travel-detail-main">
        <Eyebrow>{item.tagline}</Eyebrow>
        <h2>{isPackage || item.outline ? "A starting point for your itinerary." : "Start with these places."}</h2>
        <p className="travel-detail-description">{isPackage || item.outline ? "Use this outline as inspiration. Your route, accommodation and transport will be discussed with our team before you book." : "Choose the places that interest you. We’ll help you decide how to bring them together into a route that suits your time and pace."}</p>
        <ol className="travel-stop-list">
          {item.places.map((place, index) => <li key={place}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{place}</h3>{item.outline && <p>{item.outline[index]}</p>}</div><Icon name="pin" size={20} /></li>)}
        </ol>
        <h3 className="travel-interest-title">Make room for what you love.</h3>
        <div className="travel-interest-tags">{item.interests.map((interest) => <span key={interest}><Icon name="check" size={16} />{interest}</span>)}</div>
      </div>
      <aside className="travel-planning-card">
        <Icon name="compass" size={36} /><Eyebrow>Your journey, thoughtfully planned</Eyebrow><h2>Let’s make<br /><em>it yours.</em></h2><p>Tell us your travel dates, group size and the experiences you have in mind. We’ll help you plan the details.</p><Link className="button" to={enquiryPath}>Request a personal quote<Icon size={17} /></Link><a className="text-link" href="tel:+919319140846"><Icon name="phone" size={16} />+91 93191 40846</a>
      </aside>
    </section>
    <TravelGallery item={item} />
    {related.length > 0 && <section className="container travel-related"><Eyebrow>A little more inspiration</Eyebrow><h2>Keep exploring.</h2><div className="travel-grid">{related.map((entry) => <TravelCard key={entry.slug} item={entry} to={pathFor(entry)} label={isPackage ? "Tour package" : isIndia ? entry.country || "India" : region.title} theme={region.theme} />)}</div></section>}
    {related.length === 0 && <section className="container travel-related"><Link className="text-link" to="/destinations-in-india">Explore all destinations in India<Icon /></Link></section>}
  </>;
}
