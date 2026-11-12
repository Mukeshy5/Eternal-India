import { Link } from "react-router-dom";
import { Eyebrow, Icon, JourneyCTA, PageIntro } from "../Common/SiteUI";

const services = [
  {
    number: "01",
    title: "Network",
    text: "We at Eternal India have established partnerships with hotels across categories, from budget to luxury, along with transportation providers across India. We have well-versed guides with knowledge and experience in many languages. We have a network of 30 associates across important Indian cities for smooth tour operations. Our local offices are always ready to support smooth tours.",
  },
  {
    number: "02",
    title: "Creativity",
    text: "We have well-versed staff on our team to handle and solve client queries. Our offices are fully equipped with modern technology and the people needed to complete work on time and professionally.",
  },
  {
    number: "03",
    title: "Bookings",
    text: "Our experienced staff provide quick replies. We have a centralized CRS (Computer Reservation System) to manage and confirm hotel bookings and tour packages. Our team responds to customers' queries with tour details, itinerary information, and travel tips.",
  },
  {
    number: "04",
    title: "Emergency Contacts",
    text: "Eternal India has a 24-hour contact cell to assist customers before and during tours. Our skilled team of executives is ready to cater to last-minute special requests.",
  },
];

const commitments = [
  "We are dedicated to developing long-term client relationships, as we understand that our customers define the standard of our services.",
  "We want your trip to be truly memorable. We select the best possible accommodation, transportation, sightseeing, and excursions to suit your taste, and put our specialist knowledge at your disposal to perfect your travel plans.",
  "We are committed to doing our best to achieve excellence in our undertakings and provide customer satisfaction by being efficient and competitive.",
  "We always respond to clients with a sense of urgency.",
  "Our primary aim is to assist in the development of offbeat India travel destinations, helping visitors see and feel the real India alongside traditional destinations.",
  "We have efficient and caring travel professionals who understand the destinations and offer practical suggestions for every place you visit.",
];

export default function AboutUs() {
  return (
    <>
      <PageIntro label="Eternal India" title="About" />
      <section className="vision-section">
        <div className="container vision-inner">
          <div>
            <h2>Vision</h2>
          </div>
          <div>
            <p>
              To provide the best tour packages at competitive prices to all
              our customers through comprehensive and professionally effective
              service, using the best available resources and technology. We
              aim to make our services effective and suitable, and to nurture a
              work culture and environment, internally and externally, that
              promotes total commitment and growth. Our vision is to become the
              largest and most reliable travel company in India, with
              distinctive standards of professionalism and reliability for our
              customers.
            </p>
          </div>
        </div>
      </section>
      <section className="section container">
        <div className="section-heading">
          <div>
            <h2>Network, Creativity,<br />Bookings &amp; Emergency Contacts</h2>
          </div>
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
      <section className="section container reach-section">
        <div>
          <h2>Reach Us for</h2>
        </div>
        <div>
          <p>
            We take you on a journey to mystic destinations. Explore the
            mystique of South Asia with tours to fascinating destinations in
            India and the subcontinent, including Nepal and Bhutan. In India,
            explore Delhi, Agra, Jaipur, Rajasthan, Goa, South India and the
            backwaters of Kerala, the forests of Eastern India, and the exotic
            hills of Leh-Ladakh and Uttarakhand. You may explore grand temples
            and monuments on cultural tours and visit Buddhist pilgrimage
            destinations.
          </p>
          <Link to="/tours" className="text-link">
            Explore our tours <Icon />
          </Link>
        </div>
      </section>
      <section className="commitments-section">
        <div className="container">
          <Eyebrow>Our commitments</Eyebrow>
          <h2>Dedicated to your journey.</h2>
          <div className="commitment-grid">
            {commitments.map((commitment) => (
              <article key={commitment}>
                <Icon name="check" />
                <div><p>{commitment}</p></div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <JourneyCTA />
    </>
  );
}
