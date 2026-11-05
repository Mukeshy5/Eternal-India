import { Link } from "react-router-dom";
import { Eyebrow, Icon, JourneyCTA } from "../Common/SiteUI";
import { TravelHero, TravelCard } from "../Common/TravelUI";
import { regions, destinations, destinationPath, regionPath } from "../Common/travelCatalog";

export default function DestinationsInIndia({ region }) {
  const visibleRegions = region ? [region] : regions;
  const featured = region || regions[0];
  return <>
    <TravelHero label={region ? "Destinations in India" : "Follow your curiosity"} title={region ? <>{region.title}.<br /><em>Your kind of journey.</em></> : <>One country.<br /><em>So many ways to explore.</em></>} description={region?.description || "Discover our destinations across five regional collections. Choose a state, find a little inspiration and let us help turn your ideas into a personal journey."} theme={region?.theme || "central"} image={featured.image} srcSet={featured.srcSet} alt={featured.alt} caption={featured.imageCaption}>
      <div className="travel-region-shortcuts">
        {regions.map((item) => <Link key={item.slug} to={regionPath(item)} aria-current={region?.slug === item.slug ? "page" : undefined}>{item.title}<Icon name="diagonal" size={14} /></Link>)}
      </div>
    </TravelHero>
    <div className="container travel-region-sections">
      {visibleRegions.map((item) => <section key={item.slug} className="travel-region-section" aria-labelledby={`region-${item.slug}`}>
        <div className="travel-region-heading"><div><Eyebrow>{item.tagline}</Eyebrow><h2 id={`region-${item.slug}`}>{item.title}</h2></div>{!region && <Link className="text-link" to={regionPath(item)}>Explore the region<Icon size={17} /></Link>}</div>
        <div className="travel-grid">
          {destinations.filter((place) => place.region === item.slug).map((place) => <TravelCard key={place.slug} item={place} to={destinationPath(place)} label={item.title} theme={item.theme} />)}
        </div>
      </section>)}
    </div>
    <JourneyCTA />
  </>;
}
