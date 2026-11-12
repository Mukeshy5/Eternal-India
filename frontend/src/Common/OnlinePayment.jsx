import { useEffect, useState } from "react";
import { Eyebrow, Icon } from "./SiteUI";
import { bankDetails, QR_DISPLAY_MS, qrSecondsRemaining, formatQrTime } from "./payments";
import bankTransferImage from "../assets/paymentpng/banktrasfer.png";
import generateQrAnimation from "../assets/paymentpng/Generate QR.gif";
import paymentQrImage from "../assets/paymentpng/payment-QR.png";
import "./PaymentPage.css";
import RazorpayCheckout from "./RazorpayCheckout";

export default function OnlinePayment() {
  const [expiresAt, setExpiresAt] = useState(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [qrMessage, setQrMessage] = useState("");
  const [qrImageFailed, setQrImageFailed] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const qrVisible = expiresAt !== null && secondsRemaining > 0;

  useEffect(() => {
    if (expiresAt === null) return;
    const update = () => {
      const seconds = qrSecondsRemaining(expiresAt);
      setSecondsRemaining(seconds);
      if (seconds === 0) {
        setExpiresAt(null);
        setQrMessage("Your 10-minute display has ended. Select Generate QR to show it again.");
      }
    };
    update();
    const interval = window.setInterval(update, 1000);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
    };
  }, [expiresAt]);

  function generateQr() {
    setExpiresAt(Date.now() + QR_DISPLAY_MS);
    setSecondsRemaining(QR_DISPLAY_MS / 1000);
    setQrImageFailed(false);
    setQrMessage("Your payment QR is now displayed for 10 minutes.");
  }

  async function copyBankDetails() {
    try {
      await navigator.clipboard.writeText(bankDetails.map(({ label, value }) => `${label}: ${value}`).join("\n"));
      setCopyMessage("Bank details copied.");
    } catch {
      setCopyMessage("Please select and copy the bank details below.");
    }
  }

  return (
    <div className="payment-page">
      <section className="payment-hero">
        <div className="payment-hero-photo">
          <img
            src="/images/jaipur.jpg"
            alt="The golden walls of Amber Fort reflected in the lake in Jaipur"
            fetchPriority="high"
          />
        </div>
        <div className="container payment-hero-inner">
          <div className="payment-hero-copy">
            <p className="payment-breadcrumb"><a href="/">Home</a><span>/</span>Online payment</p>
            <Eyebrow light>A little closer to your journey</Eyebrow>
            <h1>Great journeys begin<br />with <em>simple steps.</em></h1>
            <p className="payment-hero-description">
              The memories are waiting. Take care of your payment,<br className="payment-desktop-break" />
              and let us take care of the journey.
            </p>
            <div className="payment-hero-actions">
              <a className="button button-light" href="#secure-checkout">Make a secure payment <Icon size={18} /></a>
              <a href="#payment-help" className="payment-hero-support"><Icon name="phone" size={17} />Here to help you</a>
            </div>
          </div>
          <div className="payment-destination-note">
            <Icon name="compass" size={31} />
            <div><span>YOUR NEXT CHAPTER</span><p>Somewhere extraordinary.</p></div>
          </div>
        </div>
      </section>

      <RazorpayCheckout />

      <section className="payment-section" id="payment-options" aria-labelledby="payment-options-title">
        <div className="container">
          <div className="payment-methods" aria-label="Payment methods">
            <a href="#bank-transfer">
              <span className="payment-method-icon"><Icon name="bank" size={25} /></span>
              <div><strong>Bank transfer</strong><span>Direct to our account</span></div>
              <Icon name="diagonal" size={18} />
            </a>
            <a href="#qr-payment">
              <span className="payment-method-icon"><Icon name="qr" size={25} /></span>
              <div><strong>Scan & pay</strong><span>A simple scan away</span></div>
              <Icon name="diagonal" size={18} />
            </a>
            <a href="#cash-payment">
              <span className="payment-method-icon"><Icon name="wallet" size={25} /></span>
              <div><strong>Cash payment</strong><span>A personal connection</span></div>
              <Icon name="diagonal" size={18} />
            </a>
          </div>

          <div className="payment-section-heading">
            <div>
              <Eyebrow>However you choose to pay</Eyebrow>
              <h2 id="payment-options-title">One journey. <em>Your way to pay.</em></h2>
            </div>
            <p><Icon name="globe" size={18} />Pay from anywhere.<br />We’re right here for you.</p>
          </div>

          <div className="payment-grid">
            <article className="bank-payment-card" id="bank-transfer" aria-labelledby="bank-title">
              <div className="bank-card-heading">
                <div>
                  <span className="small-label">01 / DIRECT & PERSONAL</span>
                  <h3 id="bank-title">Bank transfer</h3>
                  <p>Bank / wire / telex transfer</p>
                </div>
                <img src={bankTransferImage} alt="Money transferring from a mobile wallet to a bank" width="100" height="88" />
              </div>

              <div className="bank-account-card">
                <div className="bank-brand"><span className="bank-wordmark">AXIS BANK</span><Icon name="bank" size={24} /></div>
                <dl className="bank-account-number">
                  <dt>Current account no.</dt>
                  <dd>{bankDetails.find(({ label }) => label === "Current account no.").value}</dd>
                </dl>
                <div className="bank-card-holder"><span>ETERNAL INDIA</span><span>CURRENT ACCOUNT</span></div>
              </div>

              <dl className="bank-details">
                {bankDetails.filter(({ label }) => label !== "Current account no." && label !== "Bank").map(({ label, value }) => (
                  <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
                ))}
              </dl>
              <div className="bank-copy-row">
                <button className="text-link" type="button" onClick={copyBankDetails}><Icon name="copy" size={16} />Copy bank details<Icon name="arrow" size={16} /></button>
                <span role="status">{copyMessage}</span>
              </div>
              <div className="transfer-charge-note">
                <Icon name="info" size={19} />
                <div><strong>A little detail to remember</strong><p>For bank transfers, please add your local bank charges and the Indian bank’s charges to the invoice amount.</p></div>
              </div>
            </article>

            <article className="qr-payment-card" id="qr-payment" aria-labelledby="qr-title">
              <div className="qr-card-heading"><span className="small-label">02 / QUICK & CONVENIENT</span><span className="qr-method-tag"><Icon name="qr" size={14} />SCAN & PAY</span></div>
              <h3 id="qr-title">A scan today.<br /><em>A story for a lifetime.</em></h3>
              <p>Keep your invoice handy. Your next adventure<br className="payment-desktop-break" /> is just a payment away.</p>

              <div className={`qr-stage${qrVisible ? " qr-stage-active" : ""}`}>
                <div className="qr-animation" hidden={qrVisible}>
                  <span className="qr-orbit qr-orbit-one" aria-hidden="true" />
                  <span className="qr-orbit qr-orbit-two" aria-hidden="true" />
                  <div className="qr-animation-frame">
                    <span className="qr-scan-corner" aria-hidden="true" />
                    <img src={generateQrAnimation} alt="Generate QR animated payment guide" width="150" height="150" />
                  </div>
                  <span className="qr-animation-caption"><span className="availability-dot" />READY WHEN YOU ARE</span>
                </div>

                <div id="payment-qr-display" className={qrVisible ? "qr-display qr-display-open" : "qr-display"} hidden={!qrVisible}>
                  {qrVisible && <>
                    <div className="qr-countdown">
                      <span><span className="availability-dot" />Display time remaining</span>
                      <span role="timer" aria-label={`${secondsRemaining} seconds remaining`}>{formatQrTime(secondsRemaining)}</span>
                    </div>
                    <div className="qr-time-track" aria-hidden="true"><span style={{ width: `${secondsRemaining / (QR_DISPLAY_MS / 1000) * 100}%` }} /></div>
                    {qrImageFailed ? (
                      <p className="qr-image-error" role="alert">The QR image could not load. Please try again or contact our team.</p>
                    ) : (
                      <img className="actual-payment-qr" src={paymentQrImage} alt="Eternal India payment QR code — scan to pay" width="312" height="387" onError={() => setQrImageFailed(true)} />
                    )}
                    <p className="qr-payee">Beneficiary: <strong>ETERNAL INDIA</strong></p>
                    <button className="text-link qr-hide-button" type="button" onClick={() => { setExpiresAt(null); setSecondsRemaining(0); setQrMessage("QR hidden. Select Generate QR whenever you’re ready."); }}>Hide QR<Icon name="close" size={15} /></button>
                  </>}
                </div>
              </div>

              <button className="button qr-generate-button" type="button" onClick={generateQr} disabled={qrVisible} aria-controls="payment-qr-display" aria-expanded={qrVisible}>
                <Icon name="qr" size={20} />{qrVisible ? "QR displayed" : "Generate QR"}<Icon name="arrow" size={19} />
              </button>
              <p className="qr-status" role="status">{qrMessage || "Your payment QR will be displayed for 10 minutes."}</p>
              <p className="qr-display-note">The timer controls image display on this page.</p>
            </article>
          </div>

          <article className="cash-payment" id="cash-payment">
            <span className="payment-note-icon"><Icon name="wallet" size={29} /></span>
            <div><span className="small-label">03 / THE PERSONAL TOUCH</span><h3>Prefer a friendly hello? Pay in cash.</h3><p>We’d love to help. Contact our team to arrange your cash payment.</p></div>
            <a className="text-link" href="tel:+919319140846">Let’s arrange it<Icon name="diagonal" size={18} /></a>
          </article>
        </div>
      </section>

      <section className="payment-help container" id="payment-help" aria-labelledby="payment-help-title">
        <div className="payment-help-intro">
          <Eyebrow>Always a conversation away</Eyebrow>
          <h2 id="payment-help-title">A little help?<br /><em>We’re right here.</em></h2>
          <p>From the first question to the final detail,<br />there’s a real person here for you.</p>
          <a className="button button-outline" href="tel:+919319140846">Talk to our team<Icon name="phone" size={17} /></a>
        </div>
        <div className="payment-help-details">
          <div><span className="payment-contact-icon"><Icon name="pin" size={22} /></span><div><h3>A warm welcome in New Delhi</h3><address>69/70 Block N-2 Gurudwara Road,<br />Mohan Garden, Uttam Nagar,<br />New Delhi – 110059</address></div></div>
          <div><span className="payment-contact-icon"><Icon name="phone" size={20} /></span><div><h3>Give us a call</h3><a href="tel:+911141715155">011-41715155</a><a href="tel:+919319140846">+91-9319140846</a></div></div>
          <div><span className="payment-contact-icon"><Icon name="mail" size={21} /></span><div><h3>Drop us a line</h3><a href="mailto:info@eternal-india.com">info@eternal-india.com</a><a href="mailto:eternalindia5@gmail.com">eternalindia5@gmail.com</a></div></div>
        </div>
      </section>
    </div>
  );
}
