import { Link } from "react-router-dom";
import { Eyebrow, Icon, JourneyCTA, PageIntro } from "../Common/SiteUI";
const services = [
  {
    number: "01",
    title: "A network that knows India",
    text: "We partner with hotels from budget to luxury and transportation providers across India. Our 30 associates in key cities, multilingual guides, and local offices work together to keep your tour running smoothly.",
  },
  {
    number: "02",
    title: "People who find a way",
    text: "Our experienced team handles your questions with creativity and care. Equipped with modern technology and local knowledge, we work professionally and on time to bring your plans together.",
  },
  {
    number: "03",
    title: "Bookings made personal",
    text: "Our centralised Computer Reservation System (CRS) helps us manage and confirm hotel bookings and tour packages. Our team responds promptly with itineraries, travel tips, and answers to your travel questions.",
  },
  {
    number: "04",
    title: "By your side, around the clock",
    text: "Our 24-hour assistance team supports you before and during your tour. Skilled executives are ready to help with last-minute requests and the practical details that matter along the way.",
  },
];
const commitments = [
  [
    "Relationships that last",
    "We build long-term client relationships and let your expectations guide the standard of our service.",
  ],
  [
    "The right details",
    "We select accommodation, transportation, sightseeing, and excursions to suit your taste, with specialist knowledge at your disposal.",
  ],
  [
    "Care in every commitment",
    "We work towards excellence and customer satisfaction through efficient service and competitive pricing.",
  ],
  [
    "A timely response",
    "We respond to your questions and requests with a sense of urgency.",
  ],
  [
    "The India beyond the familiar",
    "Alongside traditional highlights, we help you discover offbeat destinations and experience the life and character of India.",
  ],
  [
    "Advice from people who know",
    "Our caring travel professionals understand the destinations and offer practical suggestions for every place you visit.",
  ],
];
export default function AboutUs() {
  return (
    <>
      <PageIntro
        label="Our story. Your next chapter."
        title={
          <>
            Journeys with soul.
            <br />
            People who <em>care.</em>
          </>
        }
      >
        <p>
          We are Eternal India. A team of travel professionals bringing local
          knowledge, thoughtful planning, and personal care to your journey
          through India and the subcontinent.
        </p>
      </PageIntro>
      <section className="vision-section">
        <div className="container vision-inner">
          <div>
            <Eyebrow>Our vision</Eyebrow>
            <h2>
              Extraordinary experiences.
              <br />
              <em>Thoughtfully within reach.</em>
            </h2>
          </div>
          <div>
            <p>
              Our vision is to offer the best tour packages at competitive
              prices, with comprehensive, professional service for every
              customer. We use the best available resources and technology to
              make travel planning effective and suited to your needs.
            </p>
            <p>
              We nurture a culture of commitment and growth within our team and
              with our partners. Our ambition is to become India's largest and
              most reliable travel company, recognised for professionalism and
              service you can trust.
            </p>
          </div>
        </div>
      </section>
      <section className="section container">
        <div className="section-heading">
          <div>
            <Eyebrow>What makes it all possible</Eyebrow>
            <h2>
              Local knowledge.
              <br />
              Connected care.
            </h2>
          </div>
          <p>
            From your first enquiry to your journey home,
            <br />a team that takes care of the details.
          </p>
        </div>
        <div className="service-list">
          {services.map((service) => (
            <article key={service.number}>
              <span className="office-number">{service.number}</span>
              <h3>{service.title}</h3>
              <p>{service.text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="commitments-section">
        <div className="container">
          <Eyebrow>Our promise to you</Eyebrow>
          <h2>
            Travel is personal.
            <br />
            So is our commitment.
          </h2>
          <div className="commitment-grid">
            {commitments.map(([title, text]) => (
              <article key={title}>
                <Icon name="check" />
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="section container reach-section">
        <div>
          <Eyebrow>Reach us for</Eyebrow>
          <h2>
            A little wonder.
            <br />
            <em>In every direction.</em>
          </h2>
        </div>
        <div>
          <p>
            Explore the mystique of South Asia: India, Nepal, and Bhutan.
            Discover Delhi, Agra, Jaipur, and Rajasthan; the beaches of Goa and
            the backwaters of Kerala; the forests of Eastern India and the hills
            of Leh, Ladakh, and Uttarakhand.
          </p>
          <p>
            From grand temples and monuments to Buddhist pilgrimage
            destinations, our journeys connect you with the places, cultures,
            and stories that speak to you.
          </p>
          <Link to="/tours" className="text-link">
            Find your inspiration <Icon />
          </Link>
        </div>
      </section>
      <JourneyCTA />
    </>
  );
}
