import { Link } from "react-router-dom";
import { Eyebrow, Icon, JourneyCTA, journeys } from "../Common/SiteUI";
import { destinationPath, destinations } from "../Common/travelCatalog";
import { PromotionDisplay } from "../Common/Promotions";
import heroImage from "../assets/SliderImg/slider (2).jpg";
import mobileHeroImage from "../assets/SliderImg/Phone view.jpg";

const homeRegions = [
  {
    title: "North India",
    promotionId: "region:north-india",
    description: "Palaces, sacred rivers and mountain horizons.",
    image: heroImage,
    path: "/destinations-in-india/regions/north-india",
  },
  {
    title: "South India",
    promotionId: "region:south-india",
    description: "Backwaters, temples and a slower coastal rhythm.",
    image: journeys[2].image,
    path: "/destinations-in-india/regions/south-india",
  },
  {
    title: "East India",
    promotionId: "region:east-india",
    description: "Living traditions, highland scenery and new perspectives.",
    image: journeys[1].image,
    path: "/destinations-in-india/regions/east-india",
  },
];

export default function Home() {
  const availablePlaces = destinations.filter((destination) => destination.image).slice(0, 4);

  return (
    <>
      <section className="home-hero">
        <div className="container home-hero-inner">
          <div className="home-hero-photo" aria-live="polite">
            <picture>
              <source media="(max-width: 550px)" srcSet={mobileHeroImage} />
              <img src={heroImage} alt="India travel view" width="1280" height="900" decoding="async" fetchPriority="high" />
            </picture>
            <span className="photo-caption">
              <Icon name="pin" size={16} /> India · Where stories begin
            </span>
            <div className="hero-photo-label">
              More than a place.
              <br />
              <em>A feeling.</em>
            </div>
          </div>
          <div className="home-hero-copy">
            <Eyebrow>Welcome to Eternal India</Eyebrow>
            <h1>
              Some journeys
              <br />
              stay with you.
              <br />
              <em>Make yours one.</em>
            </h1>
            <p>
              Discover the soul of India, Nepal, and Bhutan through journeys
              shaped around you, with people who know the way.
            </p>
            <div className="hero-actions">
              <Link to="/tours" className="button">
                Explore our journeys <Icon />
              </Link>
              <Link to="/contact" className="text-link">
                Talk to our team <Icon name="diagonal" size={17} />
              </Link>
            </div>
            <div className="hero-reassurance">
              <Icon name="sun" />
              <span>Local expertise. Personal care. Support, 24/7.</span>
            </div>
          </div>
        </div>
      </section>
      <section className="trust-strip">
        <div className="container">
          <span>
            <Icon name="globe" />
            30 associates across India
          </span>
          <span>
            <Icon name="pin" />4 local offices
          </span>
          <span>
            <Icon name="chat" />
            Multilingual guides
          </span>
          <span>
            <Icon name="sun" />
            24/7 travel assistance
          </span>
        </div>
      </section>
      <section className="section container">
        <div className="section-heading">
          <div>
            <Eyebrow>Available places</Eyebrow>
            <h2>
              Follow your curiosity.
              <br />Find your next journey.
            </h2>
          </div>
          <Link className="text-link" to="/destinations-in-india">
            Explore all destinations <Icon />
          </Link>
        </div>
        <div className="journey-grid">
          {availablePlaces.map((destination) => (
            <Link
              className="journey-card"
              key={destination.slug}
              to={destinationPath(destination)}
            >
              <div className="journey-image">
                <img src={destination.image} alt={destination.alt} loading="lazy" />
                <span className="round-arrow">
                  <Icon name="diagonal" />
                </span>
              </div>
              <span className="small-label">{destination.tagline}</span>
              <h3>{destination.title}</h3>
              <p>{destination.places.join(" · ")}</p>
              <div className="promotion-card-footer"><PromotionDisplay targetId={destination.promotionId} /></div>
            </Link>
          ))}
        </div>
      </section>
      <section className="home-about container">
        <div>
          <Eyebrow>The people behind your journey</Eyebrow>
          <h2>
            Rooted in India.
            <br />
            <em>Inspired by you.</em>
          </h2>
        </div>
        <div>
          <p>
            At Eternal India, we believe a memorable trip begins with
            understanding you. Our local offices, experienced guides, and
            network of hotel and transport partners bring your travel plans to
            life.
          </p>
          <p>
            From budget stays to luxury escapes, iconic destinations to paths
            less travelled, we take care of the details so you can enjoy the
            discovery.
          </p>
          <Link to="/about" className="text-link">
            Get to know us <Icon />
          </Link>
        </div>
      </section>
      <section className="home-regions section">
        <div className="container">
          <div className="section-heading">
            <div>
              <Eyebrow>Choose your direction</Eyebrow>
              <h2>
                Start anywhere.
                <br />
                Go deeper.
              </h2>
            </div>
            <Link className="text-link" to="/destinations-in-india">
              View all destinations <Icon />
            </Link>
          </div>
          <div className="region-grid">
            {homeRegions.map((region) => (
              <Link className="region-card" to={region.path} key={region.title}>
                <div className="region-image">
                  <img src={region.image} alt={region.title} loading="lazy" />
                  <span className="round-arrow">
                    <Icon name="diagonal" />
                  </span>
                </div>
                <Eyebrow>{region.title}</Eyebrow>
                <p>{region.description}</p>
                <div className="promotion-card-footer"><PromotionDisplay targetId={region.promotionId} /></div>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <section className="home-process container">
        <div>
          <Eyebrow>How we make it personal</Eyebrow>
          <h2>
            The details matter.
            <br />
            <em>So do the moments.</em>
          </h2>
          <p>
            Tell us what you are curious about, and we will help turn the idea
            into a journey that feels effortless from the first conversation.
          </p>
        </div>
        <div className="process-list">
          <div className="process-step">
            <span>01</span>
            <div>
              <h3>Share your ideas</h3>
              <p>Tell us where you want to go, how you like to travel and what you want to feel.</p>
            </div>
          </div>
          <div className="process-step">
            <span>02</span>
            <div>
              <h3>Shape the route</h3>
              <p>Our local team brings together the right places, people and pace for you.</p>
            </div>
          </div>
          <div className="process-step">
            <span>03</span>
            <div>
              <h3>Travel with confidence</h3>
              <p>Enjoy thoughtful details and reliable support, before and throughout your journey.</p>
            </div>
          </div>
        </div>
      </section>
      <JourneyCTA />
    </>
  );
}
