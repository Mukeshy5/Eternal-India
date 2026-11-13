import { voucherCompany as company } from "../../../shared/voucherBilling.js";
import { date, money } from "./voucherClient";
import "./BillingDocument.css";
export default function BillingDocument({ voucher: v }) {
  return <article className="billing-document" aria-label={`Voucher ${v.invoiceNumber}`}>
    <header className="billing-document-brand"><img src="/logo.webp" alt="Eternal India logo" /><div><h2>{company.name}</h2><p>{company.subtitle}</p><p>{company.address}</p><p>{company.phone}</p></div></header>
    <div className="billing-document-title"><h3>JOURNEY VOUCHER</h3><span className={`billing-status billing-status-${v.status}`}>{v.status}</span></div>
    <dl className="billing-document-facts">{[
      ["Invoice number", `#${v.invoiceNumber}`], ["Voucher date", date(v.voucherDate)], ["Guest name", v.guestName], ["Hotel name", v.hotel.name],
      ["GST number", `${v.gst.gstNumber} · ${v.gst.rate}%`], ["Hotel address", v.hotel.address],
      ["Check-in date", date(v.checkInDate)], ["Check-out date", date(v.checkOutDate)],
      ["Arrival", `${date(v.arrivalDate)} · ${v.arrivalPlace}`], ["Departure", `${date(v.departureDate)} · ${v.departurePlace}`],
    ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <section className="billing-requirement"><h4>Your requirement</h4><p>{v.requirement}</p></section>
    <dl className="billing-document-totals"><div><dt>Base price</dt><dd>{money(v.pricing.basePaise)}</dd></div><div><dt>GST ({v.pricing.gstRate}%)</dt><dd>{money(v.pricing.gstPaise)}</dd></div><div><dt>Total amount</dt><dd>{money(v.pricing.totalPaise)}</dd></div></dl>
    <div className="billing-signature">Authorized Signatory</div><p className="billing-document-note">{company.note}</p>
    <footer><p><b>Address:</b> {company.address}</p><p><b>Phone:</b> {company.phone} <span> | </span> <b>Website:</b> {company.website}</p></footer>
  </article>;
}
