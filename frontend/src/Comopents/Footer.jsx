import { Link } from "react-router-dom";
import { Icon, whatsappUrl } from "../Common/SiteUI";
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
      <div className="container footer-bottom">
        <span>
          © {new Date().getFullYear()} Eternal India. All rights reserved.
        </span>
        <span>Thoughtfully planned. Personally cared for.</span>
      </div>
    </footer>
  );
}
