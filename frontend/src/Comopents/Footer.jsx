import { Link } from "react-router-dom";
import { Icon, whatsappUrl } from "../Common/SiteUI";

const companyCertificationImages = [
  "WhatsApp Image 2026-11-13 at 3.24.55 PM.jpeg",
  "WhatsApp Image 2026-11-13 at 3.26.32 PM.jpeg",
  "WhatsApp Image 2026-11-13 at 3.27.28 PM.jpeg",
  "WhatsApp Image 2026-11-13 at 3.30.30 PM.jpeg",
  "WhatsApp Image 2026-11-13 at 3.33.46 PM.jpeg",
].map((fileName) => ({
  src: new URL(`../assets/CompanyCertification/${fileName}`, import.meta.url).href,
  alt: `Company certification ${fileName}`,
}));

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <Link to="/" aria-label="Eternal India home">
            <img
              src="/logo.webp"
              alt="Eternal India — Mystic Journeys"
              width="190"
              height="60"
            />
          </Link>
          <p>
            Meaningful journeys. Local connections.
            <br />
            Memories that stay with you.
          </p>
          <span className="footer-location">
            <Icon name="pin" size={16} /> Rooted in India. Ready to explore.
          </span>
        </div>
        <div>
          <h3>Explore with us</h3>
          <Link to="/about">Our story</Link>
          <Link to="/blog">Blog</Link>
          <Link to="/tours">Our journeys</Link>
          <Link to="/tour-packages">Tour packages</Link>
          <Link to="/destinations-in-india">Destinations in India</Link>
          <Link to="/contact">Our offices</Link>
          <Link to="/request-quote">Request a quote</Link>
          <Link to="/online-payment">Online payment</Link>
        </div>
        <div>
          <h3>Our offices</h3>
          <Link to="/contact#varanasi">Varanasi</Link>
          <Link to="/contact#bodhgaya">Bodhgaya</Link>
          <Link to="/contact#ayodhya">Ayodhya</Link>
          <Link to="/contact#buxar">Buxar</Link>
        </div>
        <div>
          <h3>Policies</h3>
          <Link to="/privacy-policy">Our Privacy Policy</Link>
          <Link to="/terms-and-conditions">Terms &amp; Conditions</Link>
        </div>
        <div className="footer-contact">
          <h3>Let's talk travel</h3>
          <a href={whatsappUrl} target="_blank" rel="noreferrer">
            <Icon name="chat" size={17} /> +91 93191 40846
          </a>
          <a href="mailto:info@eternal-india.com">info@eternal-india.com</a>
          <a href="mailto:eternalindia5@gmail.com">eternalindia5@gmail.com</a>
          <p>
            <span className="availability-dot" /> Available 24 hours, every day
          </p>
        </div>
      </div>

      <div className="container footer-certification-wrap">
        <div className="footer-certification-header">
          <span>Company Certification</span>
        </div>
        <div
          className="footer-certification-marquee"
          role="region"
          aria-label="Company certifications"
        >
          <div className="footer-certification-track">
            {[false, true].map((isDuplicate) => (
              <div
                className="footer-certification-group"
                key={isDuplicate ? "duplicate" : "original"}
                aria-hidden={isDuplicate || undefined}
              >
                {companyCertificationImages.map((image) => (
                  <div className="footer-certification-item" key={image.src}>
                    <img src={image.src} alt={isDuplicate ? "" : image.alt} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="container footer-bottom">
        <span>
          © {new Date().getFullYear()} Eternal India. All rights reserved.
        </span>
        <span>Thoughtfully planned. Personally cared for.</span>
      </div>
    </footer>
  );
}
