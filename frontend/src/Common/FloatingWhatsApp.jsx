import { Icon } from "./SiteUI";
import { whatsappUrl } from "./enquiries";
import "./FloatingWhatsApp.css";

export default function FloatingWhatsApp() {
  return (
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
  );
}
