import { Link } from "react-router-dom";
import { Icon, JourneyCTA } from "../Common/SiteUI";
import { TravelHero, TravelCard } from "../Common/TravelUI";
import { tourPackages, packagePath } from "../Common/travelCatalog";

export default function TourPackage() {
  const featured = tourPackages[0];
  return <>
    <TravelHero label="Eternal India tour packages" title={<>Familiar routes.<br /><em>Personal discoveries.</em></>} description="Start with a journey you love. We’ll help shape the route, stays and travel arrangements around your dates, interests and budget." image={featured.image} srcSet={featured.srcSet} alt={featured.alt} caption="Delhi · Agra · Jaipur">
      <Link className="text-link" to="/request-quote">Help me choose a journey <Icon /></Link>
    </TravelHero>
    <section className="container travel-grid travel-package-grid" aria-label="Tour packages">
      {tourPackages.map((item) => <TravelCard key={item.slug} item={item} to={packagePath(item)} label="A journey to make your own" />)}
    </section>
    <JourneyCTA />
  </>;
}
