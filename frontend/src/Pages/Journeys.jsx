import { Link } from "react-router-dom";
import { Eyebrow, Icon, JourneyCTA, journeys } from "../Common/SiteUI";
import { PromotionDisplay } from "../Common/Promotions";
export default function Journeys() {
  return (
    <>
      <section className="container section journeys-intro">
        <Eyebrow>India, Nepal & Bhutan</Eyebrow>
        <h1>
          Find a journey
          <br />
          that <em>feels like you.</em>
        </h1>
        <p>
          Sacred places, living traditions, and landscapes that invite you to
          slow down. Start with an idea. We'll shape the itinerary around your
          interests, travel dates, and budget.
        </p>
      </section>
      <section
        className="container journey-editorial"
        aria-label="Journey inspiration"
      >
        {journeys.map((journey, i) => (
          <article key={journey.title}>
            <div className="editorial-photo">
              <img src={journey.image} alt={journey.alt} loading="lazy" />
              <PromotionDisplay targetId={`journey:${journey.slug}`} overlay placement="bottom" />
            </div>
            <div className="editorial-copy">
              <span className="small-label">
                0{i + 1} / {journey.subtitle}
              </span>
              <h2>{journey.title}</h2>
              <p>{journey.description}</p>
              <p className="places">
                <Icon name="pin" size={17} />
                {journey.places}
              </p>
              <Link
                className="text-link"
                to={`/request-quote?destination=${encodeURIComponent(journey.title)}`}
              >
                Plan this journey <Icon />
              </Link>
            </div>
          </article>
        ))}
      </section>
      <section className="container beyond-section">
        <Icon name="globe" size={35} />
        <div>
          <h2>Looking a little further?</h2>
          <p>
            We also help you explore Nepal and Bhutan, with the same personal
            attention to your itinerary. Tell us what you have in mind.
          </p>
        </div>
        <Link
          to="/request-quote?destination=Nepal%20%26%20Bhutan"
          className="button button-outline"
        >
          Let's explore <Icon />
        </Link>
      </section>
      <JourneyCTA />
    </>
  );
}
