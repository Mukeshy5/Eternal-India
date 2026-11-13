import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Eyebrow, Icon } from "../Common/SiteUI";
import { buildEnquiryUrl } from "../Common/enquiries";
import { api } from "../Common/api";
import QuoteVoice, { useQuoteVoice } from "../Common/QuoteVoice";
import planTripImage from "../assets/Plan your trip/Plan your trip.png";
export default function RequestQuote() {
  const [params] = useSearchParams();
  const [prepared, setPrepared] = useState(null);
  const [language, setLanguage] = useState("en");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const submissionId = useRef(null);
  const pending = useRef(null);
  const formRef = useRef(null);
  const voice = useQuoteVoice();
  useEffect(() => () => pending.current?.abort(), []);
  const today = new Date();
  const minimumDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  async function submitEnquiry(event) {
    event.preventDefault();
    if (pending.current || !event.currentTarget.reportValidity()) return;
    const data = new FormData(event.currentTarget);
    const channel = event.nativeEvent.submitter?.value || "submit";
    const fields = Object.fromEntries(data);
    submissionId.current ||= crypto.randomUUID();
    const controller = new AbortController();
    pending.current = controller;
    setSubmitting(true);
    const url = channel === "submit" ? null : buildEnquiryUrl(fields, channel);
    setPrepared(url ? { channel, url } : null);
    setError("");
    setFieldErrors({});
    try {
      // Start persistence first, then hand off during this same user gesture.
      // Waiting for the database can lose the browser's activation permission.
      const saving = api("/enquiries", { method: "POST", body: JSON.stringify({ ...fields, enquiryKind: params.get("source") === "contact" ? "CONTACT" : "PLAN_TRIP", contactChannel: channel, voiceLanguage: language, submissionId: submissionId.current }), signal: controller.signal, keepalive: true });
      if (url) {
        try {
          if (channel === "email") window.location.assign(url);
          else window.open(url, "_blank", "noopener,noreferrer");
        } catch {
          // The visible app link stays available even if a browser blocks handoff.
        }
      }
      const saved = await saving;
      if (controller.signal.aborted) return;
      formRef.current?.reset();
      submissionId.current = null;
      setPrepared({ channel, url, reference: saved.reference });
      voice.play(language);
    } catch (failure) {
      if (controller.signal.aborted) return;
      setError(failure.message);
      setFieldErrors(failure.errors || {});
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setSubmitting(false);
    }
  }
  function changed() {
    setPrepared(null);
    setError("");
    setFieldErrors({});
    submissionId.current = null;
  }
  return (
    <section className="container quote-section">
      <div className="quote-intro">
        <Eyebrow>Your next chapter starts here</Eyebrow>
        <h1>
          A few details.
          <br />
          <em>Endless possibilities.</em>
        </h1>
        <p>
          Tell us a little about the trip you're dreaming of. Our team will help
          with destinations, stays, transport, and an itinerary that fits you.
        </p>
        <div className="quote-care">
          <Icon name="sun" size={30} />
          <div>
            <h3>Real people. Personal advice.</h3>
            <p>Available 24/7, before and during your journey.</p>
          </div>
        </div>
        <a className="text-link" href="tel:+919319140846">
          <Icon name="phone" size={18} /> +91 93191 40846
        </a>
        <div className="quote-photo quote-plan-art">
          <img
            src={planTripImage}
            alt="Stay connected with your personal Eternal India trip planning team"
            width="1792"
            height="889"
          />
          <span>Your journey. Our personal care.</span>
        </div>
      </div>
      <form
        ref={formRef}
        className="enquiry-form"
        onSubmit={submitEnquiry}
        onChange={changed}
        aria-busy={submitting}
      >
        <h2>Let's plan your trip.</h2>
        <p>
          Complete your details and submit your enquiry. Our team will help
          turn your ideas into a journey.
        </p>
        <fieldset className="enquiry-fields" disabled={submitting}>
        <QuoteVoice voice={voice} language={language} onLanguageChange={setLanguage} />
        <div className="form-grid">
          <label>
            Your name <span aria-hidden="true">*</span>
            <input
              name="name"
              aria-invalid={Boolean(fieldErrors.name)}
              autoComplete="name"
              placeholder="Full name"
              required
              maxLength={100}
              pattern=".*\S.*"
            />
            {fieldErrors.name && <small className="field-error">{fieldErrors.name}</small>}
          </label>
          <label>
            Email address <span aria-hidden="true">*</span>
            <input
              type="email"
              name="email"
              aria-invalid={Boolean(fieldErrors.email)}
              autoComplete="email"
              placeholder="you@example.com"
              required
              maxLength={200}
            />
            {fieldErrors.email && <small className="field-error">{fieldErrors.email}</small>}
          </label>
          <label>
            Phone number
            <input
              type="tel"
              name="phone"
              aria-invalid={Boolean(fieldErrors.phone)}
              autoComplete="tel"
              placeholder="Include country code"
              maxLength={30}
            />
            {fieldErrors.phone && <small className="field-error">{fieldErrors.phone}</small>}
          </label>
          <label>
            Number of travellers <span aria-hidden="true">*</span>
            <input
              type="number"
              name="travellers"
              aria-invalid={Boolean(fieldErrors.travellers)}
              min="1"
              max="100"
              step="1"
              defaultValue="2"
              required
            />
            {fieldErrors.travellers && <small className="field-error">{fieldErrors.travellers}</small>}
          </label>
          <label className="form-wide">
            Where would you like to go? <span aria-hidden="true">*</span>
            <input
              name="destination"
              aria-invalid={Boolean(fieldErrors.destination)}
              defaultValue={params.get("destination") || ""}
              placeholder="e.g. Varanasi, Rajasthan, or help me decide"
              required
              maxLength={200}
              pattern=".*\S.*"
            />
            {fieldErrors.destination && <small className="field-error">{fieldErrors.destination}</small>}
          </label>
          <label className="form-wide">
            Preferred departure date
            <input type="date" name="date" min={minimumDate} aria-invalid={Boolean(fieldErrors.date)} />
            {fieldErrors.date && <small className="field-error">{fieldErrors.date}</small>}
            <small>Leave blank if your dates are flexible.</small>
          </label>
          <label className="form-wide">
            Tell us about your trip
            <textarea
              name="message"
              aria-invalid={Boolean(fieldErrors.message)}
              rows="4"
              maxLength={2000}
              placeholder="Trip length, interests, preferred stays, budget, or anything else we should know…"
            />
            {fieldErrors.message && <small className="field-error">{fieldErrors.message}</small>}
          </label>
        </div>
        <p className="form-note">
          Fields marked * are required. Submit sends your enquiry directly to
          our team. WhatsApp and email options open your chosen app and also
          save your enquiry here. Review and send the message in that app.
        </p>
        <div className="form-actions">
          <button className="button enquiry-submit" type="submit" name="channel" value="submit" disabled={submitting}>
            <Icon name="arrow" size={18} />{submitting ? "Submitting…" : "Submit enquiry"}
          </button>
          <button
            className="button"
            type="submit"
            name="channel"
            value="whatsapp"
          >
            <Icon name="chat" size={18} /> Enquire on WhatsApp
          </button>
          <button
            className="button button-outline"
            type="submit"
            name="channel"
            value="email"
          >
            <Icon name="mail" size={18} /> Enquire by email
          </button>
        </div>
        </fieldset>
        {error && <p className="enquiry-error" role="alert">{error} Your details have been kept so you can try again.</p>}
        {prepared && (
          <div className="enquiry-status" role="status">
            <strong>{prepared.reference ? "Your enquiry has been submitted successfully." : submitting ? "Saving your enquiry…" : "Your enquiry has not been saved yet. Please retry."}</strong>
            {prepared.reference && <p>Reference: <strong>{prepared.reference}</strong>. Our team will review your travel plans and get in touch.</p>}
            {prepared.url &&
            <p>
              Review and send your message in{" "}
              {prepared.channel === "email" ? "your email app" : "WhatsApp"} to
              reach our team. If it didn't open, check that an app is set up and{" "}
              <a
                href={prepared.url}
                target={prepared.channel === "email" ? undefined : "_blank"}
                rel="noreferrer"
              >
                open your enquiry here
              </a>
              .
            </p>}
          </div>
        )}
      </form>
    </section>
  );
}
