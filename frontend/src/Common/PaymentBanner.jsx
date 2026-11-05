import { Link } from "react-router-dom";

import { Eyebrow, Icon } from "./SiteUI";
import paymentBanner from "../assets/paymentpng/PAY-1.webp";
import "./payments.css";

export default function PaymentBanner() {
  return (
    <section className="payment-banner container" aria-labelledby="payment-banner-title">
      <div className="payment-banner-copy"><Eyebrow>Ready for your next chapter?</Eyebrow><h2 id="payment-banner-title">Pay from <em>anywhere.</em></h2><p>A few simple steps. One unforgettable journey.<br />Explore our payment options, wherever you are.</p><Link className="button" to="/online-payment">Click here <Icon name="diagonal" size={18} /></Link></div>
      <Link className="payment-banner-image" to="/online-payment" aria-label="Pay from anywhere — click here to open online payment"><img src={paymentBanner} alt="Pay from anywhere. Click here for Eternal India online payment options." width="1280" height="720" loading="lazy" /></Link>
    </section>
  );
}
