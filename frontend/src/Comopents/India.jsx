import { Link } from "react-router-dom";
import { Eyebrow, Icon, JourneyCTA } from "../Common/SiteUI";
import { TravelHero, TravelCard } from "../Common/TravelUI";
import { indiaJourneys, indiaPath } from "../Common/travelCatalog";

export default function India() {
  const featured = indiaJourneys.find((item) => item.slug === "kashmir");
  return <>
    <TravelHero label="India & beyond" title={<>A change of place.<br /><em>A world of possibility.</em></>} description="Himalayan mornings, royal cities and a little island time. Explore four Indian favourites, then look a little further to Nepal and Sri Lanka. Every journey starts with what you love." image={featured.image} srcSet={featured.srcSet} alt={featured.alt} caption="Kashmir · India">
      <Link className="text-link" to="/request-quote">Find your kind of escape<Icon /></Link>
    </TravelHero>
    <section className="container travel-collection" aria-labelledby="india-collection-title">
      <div className="travel-region-heading"><div><Eyebrow>Six journeys. Your own way.</Eyebrow><h2 id="india-collection-title">Where will curiosity take you?</h2></div><p>Choose a place. We’ll help with the details.</p></div>
      <div className="travel-grid">{indiaJourneys.map((item) => <TravelCard key={item.slug} item={item} to={indiaPath(item)} label={item.country || "India"} theme={item.region === "south-india" ? "south" : "north"} />)}</div>
    </section>
    <JourneyCTA />
  </>;
}
