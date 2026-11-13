import { voucherCompany as company } from "../../../shared/voucherBilling.js";
import { date } from "./voucherClient";
import "./BillingDocument.css";
export default function BillingDocument({ voucher: v }) {
  return <article className="billing-document" aria-label={`Voucher ${v.invoiceNumber}`}>
    <img className="billing-document-watermark" src="/logo.webp" alt="" aria-hidden="true" />
    <header className="billing-document-brand">
      <img src="/logo.webp" alt="Eternal India logo" />
      <p className="billing-document-subtitle">{company.subtitle}</p><p>{company.address}</p><p>{company.phone} <span> | </span> {company.website}</p>
      <p className="billing-document-gst"><b>GST No.</b> {v.gst.gstNumber}</p>
    </header>
    <dl className="billing-document-meta">
      <div><dt>Invoice number</dt><dd>#{v.invoiceNumber}</dd></div>
      <div><dt>Voucher date</dt><dd>{date(v.voucherDate)}</dd></div>
      <div><dt>Booking status</dt><dd><span className={`billing-status billing-status-${v.status}`}>{v.status}</span></dd></div>
    </dl>
    <section className="billing-document-hotel" aria-label="Hotel details"><p>HOTEL / ACCOMMODATION</p><h2>{v.hotel.name}</h2><p>{v.hotel.address}</p></section>
    <dl className="billing-document-facts">{[
      ["Guest name", v.guestName],
      ["Check-in date", date(v.checkInDate)], ["Check-out date", date(v.checkOutDate)],
      ["Arrival", `${date(v.arrivalDate)} · ${v.arrivalPlace}`], ["Departure", `${date(v.departureDate)} · ${v.departurePlace}`],
    ].map(([label, value]) => <div key={label} className={label === "Guest name" ? "billing-document-guest" : undefined}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <section className="billing-requirement"><h4>Your requirement</h4><p>{v.requirement}</p></section>
    <div className="billing-signature">Authorized Signatory</div><p className="billing-document-note">{company.note}</p>
    <footer><p><b>Address:</b> {company.address}</p><p><b>Phone:</b> {company.phone} <span> | </span> <b>Website:</b> {company.website}</p></footer>
  </article>;
}
