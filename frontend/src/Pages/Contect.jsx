import { Link } from "react-router-dom";
import {
  Eyebrow,
  Icon,
  PageIntro,
  offices,
  whatsappUrl,
} from "../Common/SiteUI";
export default function Contact() {
  return (
    <>
      <PageIntro
        label="We'd love to hear from you"
        title={
          <>
            Every great journey
            <br />
            starts with a <em>hello.</em>
          </>
        }
      >
        <p>
          Have a question or ready to book your tour? Just call us. Our team is
          available 24/7 to help you find the best deal for your trip.
        </p>
        <a className="text-link" href="#support">
          Let's get in touch <Icon />
        </a>
      </PageIntro>
      <section className="support-section" id="support">
        <div className="container">
          <div className="section-heading">
            <div>
              <Eyebrow>Always a conversation away</Eyebrow>
              <h2>How can we help you?</h2>
            </div>
            <p>
              A quick question or a big adventure.
              <br />
              We're here for both.
            </p>
          </div>
          <Link className="button" to="/request-quote?source=contact">Send a contact enquiry <Icon name="arrow" /></Link>
          <div className="support-grid">
            <a
              className="support-option"
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
            >
              <span className="icon-box">
                <Icon name="chat" size={25} />
              </span>
              <div>
                <span className="small-label">DIRECT WHATSAPP SUPPORT</span>
                <h3>Let's chat</h3>
                <span>+91 93191 40846</span>
              </div>
              <Icon name="diagonal" />
            </a>
            <a className="support-option" href="mailto:info@eternal-india.com">
              <span className="icon-box">
                <Icon name="mail" size={25} />
              </span>
              <div>
                <span className="small-label">EMAIL OUR TEAM</span>
                <h3>Drop us a line</h3>
                <span>info@eternal-india.com</span>
              </div>
              <Icon name="diagonal" />
            </a>
            <a className="support-option" href="mailto:eternalindia5@gmail.com">
              <span className="icon-box">
                <Icon name="mail" size={25} />
              </span>
              <div>
                <span className="small-label">DIRECT GMAIL SUPPORT</span>
                <h3>Say hello</h3>
                <span>eternalindia5@gmail.com</span>
              </div>
              <Icon name="diagonal" />
            </a>
          </div>
        </div>
      </section>
      <section className="section container offices-section">
        <div className="section-heading">
          <div>
            <Eyebrow>Local roots. Personal connections.</Eyebrow>
            <h2>Find us along the way.</h2>
          </div>
          <p>
            Four offices. One dedicated team.
            <br />A warm welcome, wherever you meet us.
          </p>
        </div>
        <div className="office-grid">
          {offices.map((office, i) => (
            <article
              className="office-card"
              id={office.city.toLowerCase()}
              key={office.city}
            >
              <div className="office-top">
                <span className="office-number">0{i + 1}</span>
                <span className="small-label">{office.state}</span>
                <Icon name="pin" size={24} />
              </div>
              <h3>
                {office.city}
                <span> — Eternal India</span>
              </h3>
              <address>{office.address}</address>
              <div className="office-links">
                <a href={`mailto:${office.email}`}>
                  <Icon name="mail" size={17} />
                  {office.email}
                </a>
                {office.phone && (
                  <a href={`tel:+91${office.phone}`}>
                    <Icon name="phone" size={17} />
                    +91 {office.phone}
                  </a>
                )}
              </div>
              <a
                className="text-link office-map"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${office.address}, India`)}`}
                target="_blank"
                rel="noreferrer"
              >
                Find on Google Maps <Icon name="diagonal" size={16} />
              </a>
            </article>
          ))}
        </div>
      </section>
      <section className="contact-callout container">
        <span className="icon-box">
          <Icon name="compass" size={32} />
        </span>
        <div>
          <h2>Have a destination in mind?</h2>
          <p>
            Share your ideas. We'll help turn them into a journey you'll
            remember.
          </p>
        </div>
        <Link className="button" to="/request-quote">
          Plan your trip <Icon />
        </Link>
      </section>
    </>
  );
}
