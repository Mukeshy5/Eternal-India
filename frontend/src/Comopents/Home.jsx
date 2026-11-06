import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Eyebrow, Icon, JourneyCTA, journeys } from "../Common/SiteUI";
import sliderImageOne from "../assets/SliderImg/slider.jpg";
import sliderImageTwo from "../assets/SliderImg/slider (2).jpg";
import sliderImageThree from "../assets/SliderImg/slider (3).jpg";
import sliderImageFour from "../assets/SliderImg/slider (4).jpg";

const heroSlides = [
  { image: sliderImageOne, location: "India · Where stories begin" },
  { image: sliderImageTwo, location: "India · Beyond the familiar" },
  { image: sliderImageThree, location: "India · Moments to remember" },
  { image: sliderImageFour, location: "India · Your journey starts here" },
];

export default function Home() {
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSlide((currentSlide) => (currentSlide + 1) % heroSlides.length);
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

  const slide = heroSlides[activeSlide];

  return (
    <>
      <section className="home-hero">
        <div className="container home-hero-inner">
          <div className="home-hero-photo" aria-live="polite">
            <img
              key={slide.image}
              src={slide.image}
              alt={`${slide.location} travel view`}
              fetchPriority="high"
            />
            <span className="photo-caption">
              <Icon name="pin" size={16} /> {slide.location}
            </span>
            <div className="hero-photo-label">
              More than a place.
              <br />
              <em>A feeling.</em>
            </div>
            <div className="hero-slide-dots" aria-label="Hero image slides">
              {heroSlides.map((heroSlide, index) => (
                <button
                  type="button"
                  key={heroSlide.image}
                  className={index === activeSlide ? "active" : ""}
                  aria-label={`Show hero image ${index + 1}`}
                  aria-current={index === activeSlide ? "true" : undefined}
                  onClick={() => setActiveSlide(index)}
                />
              ))}
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
            <Eyebrow>Follow your curiosity</Eyebrow>
            <h2>
              A country of possibilities.
              <br />A journey that's yours.
            </h2>
          </div>
          <Link className="text-link" to="/tours">
            Discover our journeys <Icon />
          </Link>
        </div>
        <div className="journey-grid">
          {journeys.map((journey) => (
            <Link
              className="journey-card"
              key={journey.title}
              to={`/request-quote?destination=${encodeURIComponent(journey.title)}`}
            >
              <div className="journey-image">
                <img src={journey.image} alt={journey.alt} loading="lazy" />
                <span className="round-arrow">
                  <Icon name="diagonal" />
                </span>
              </div>
              <span className="small-label">{journey.subtitle}</span>
              <h3>{journey.title}</h3>
              <p>{journey.places}</p>
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
      <JourneyCTA />
    </>
  );
}
