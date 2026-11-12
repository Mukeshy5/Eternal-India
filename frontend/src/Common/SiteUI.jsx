import { journeyContent } from "../../../shared/travelCatalog.js";
import { Link } from "react-router-dom";

export { whatsappUrl } from "./enquiries";
export function Icon({ name = "arrow", size = 20, ...props }) {
  const paths = {
    bank: <><path d="m3 9 9-6 9 6H3ZM3 21h18M5 18v-6M10 18v-6M14 18v-6M19 18v-6" /></>,
    qr: <><path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h2v2h-2zM19 15h2v6h-6v-2M12 3v3M12 10v3H9M3 12h3M15 12h6M12 16v5" /></>,
    wallet: <><path d="M20 8V5H5a2 2 0 0 0 0 4h16v11H5a2 2 0 0 1-2-2V7M21 12h-6v5h6" /><circle cx="17" cy="14.5" r=".5" /></>,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V3H3v13h5" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7v.5" /></>,
    arrow: <path d="M4 12h15M13 5l7 7-7 7" />,
    diagonal: <path d="M6 18 18 6M6 6h12v12" />,
    plane: <path d="M12 2c-1 0-2 1-2 3v4l-7 4v3l7-2v5l-3 2v1l5-1 5 1v-1l-3-2v-5l7 2v-3l-7-4V5c0-2-1-3-2-3Z" />,
    phone: (
      <path d="m7 3 3 5-2 2a15 15 0 0 0 6 6l2-2 5 3c-1 4-3 5-6 4C8 19 5 16 3 9 2 6 3 4 7 3Z" />
    ),
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 6 9 7 9-7" />
      </>
    ),
    pin: (
      <>
        <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    chat: (
      <>
        <path d="M21 11a9 9 0 0 1-9 9 10 10 0 0 1-4-1l-6 2 2-6a10 10 0 0 1-1-4 9 9 0 0 1 18 0Z" />
        <path d="m8 7 2 3-1 1 3 3 1-1 3 2" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <ellipse cx="12" cy="12" rx="4" ry="9" />
        <path d="M3 12h18" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 1v2M12 21v2M1 12h2M21 12h2M4 4l2 2M18 18l2 2M4 20l2-2M18 6l2-2" />
      </>
    ),
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    compass: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m16 8-2 6-6 2 2-6Z" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name] || paths.arrow}
    </svg>
  );
}
export function Eyebrow({ children, light = false }) {
  return (
    <p className={`eyebrow${light ? " eyebrow-light" : ""}`}>
      <span />
      {children}
    </p>
  );
}
export function PageIntro({ label, title, children }) {
  return (
    <section className="page-intro container">
      <div className="intro-copy">
        <Eyebrow>{label}</Eyebrow>
        <h1>{title}</h1>
        <div className="intro-description">{children}</div>
      </div>
      <div className="intro-photo">
        <img
          src="/images/varanasi.jpg"
          alt="Boats along the historic ghats of Varanasi"
          fetchPriority="high"
        />
        <span className="photo-caption">
          <Icon name="pin" size={15} /> Varanasi, India
        </span>
        <span className="photo-note">
          <Icon name="sun" size={26} />
          <span>
            A little local knowledge.
            <br />
            <strong>A world of difference.</strong>
          </span>
        </span>
      </div>
    </section>
  );
}
export function JourneyCTA() {
  return (
    <section className="cta-section">
      <div className="container cta-inner">
        <div>
          <Eyebrow light>Your journey, thoughtfully planned</Eyebrow>
          <h2>
            Tell us where your heart
            <br />
            wants to go.
          </h2>
        </div>
        <div>
          <p>
            From the first idea to the last mile,
            <br />
            we're here to take care of the details.
          </p>
          <Link to="/request-quote" className="button button-light">
            Let's plan your trip <Icon />
          </Link>
        </div>
      </div>
    </section>
  );
}
export const offices = [
  {
    city: "Varanasi",
    state: "UTTAR PRADESH",
    address:
      "AF 2/20 Imlak II, Opposite Taksal Cinema, Nadser, Varanasi – 221002",
    email: "varanasi@eternal-india.com",
    phone: "7408469374",
  },
  {
    city: "Bodhgaya",
    state: "BIHAR",
    address:
      "No. 07 Arya Complex, Near Mahabodhi Temple, Bodhgaya, Gaya, Bihar – 824231",
    email: "bodhgaya@eternal-india.com",
    phone: "7408469374",
  },
  {
    city: "Ayodhya",
    state: "UTTAR PRADESH",
    address:
      "2nd Floor, Shahpur Market, In front of ITI, Ayodhya–Faizabad Road – 224001",
    email: "ayodhya@eternal-india.com",
  },
  {
    city: "Buxar",
    state: "BIHAR",
    address:
      "Bimla Niwas Commercial Complex, Panday Patti Railway Crossing, Buxar, Bihar – 802103",
    email: "operations@eternal-india.com",
  },
];
export const journeys = journeyContent;
