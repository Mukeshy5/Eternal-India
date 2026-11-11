import { Icon } from "./SiteUI";
import { whatsappUrl } from "./enquiries";
import "./FloatingWhatsApp.css";

export default function FloatingWhatsApp() {
  return (
    <nav className="floating-contact-links" aria-label="Contact us">
      <a
        className="line-float"
        href="https://line.me/ti/p/V2uvq8z3q0"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with Eternal India on LINE (opens in a new tab)"
        title="Chat on LINE"
      >
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d="M24 5.5C13.2 5.5 4.5 12.6 4.5 21.4c0 5 2.9 9.5 7.7 12.2l-1.7 7 8.1-4.1c1.7.4 3.5.7 5.4.7 10.8 0 19.5-7.1 19.5-15.8S34.8 5.5 24 5.5Z" />
          <text x="24" y="24.5">LINE</text>
        </svg>
      </a>
      <a
        className="whatsapp-float"
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with Eternal India on WhatsApp at +91 93191 40846 (opens in a new tab)"
      >
        <span className="whatsapp-popup" aria-hidden="true">
          <strong>Chat on WhatsApp</strong>
          <span>+91 93191 40846</span>
        </span>
        <Icon name="chat" size={32} />
      </a>
    </nav>
  );
}
