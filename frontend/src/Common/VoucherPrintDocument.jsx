import { journeyRoute, formatKm } from "./journeyRoute";
import voucherAsset from "../assets/Journey Voucher/Journey Voucher (2).png";
import mapAsset from "../assets/Journey Voucher/Journey map.png";
import "./VoucherPrintDocument.css";

function dateLabel(value) {
  if (!value) return "To be confirmed";
  const date = new Date(`${value.slice(0, 10)}T12:00:00+05:30`);
  return Number.isNaN(date.getTime()) ? "To be confirmed" : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(date);
}

// A separate print document keeps dashboard widths, viewport breakpoints and
// interactive preview controls out of the browser's paged layout.
export default function VoucherPrintDocument({ voucher }) {
  const { points, total, complete, count } = journeyRoute(voucher.journey.from, voucher.journey.fromAddress, voucher.stops);
  return <article className="vp-document" aria-label="Printable Journey Voucher">
    <header className="vp-header">
      <img src="/logo.webp" alt="Eternal India" width="183" height="58" />
      <div><span>JOURNEY VOUCHER</span><strong>{voucher.voucherNumber}</strong><small>Issued {dateLabel(voucher.createdAt)}</small></div>
    </header>
    <section className="vp-cover">
      <div><span className="vp-eyebrow">THOUGHTFULLY PLANNED. PERSONALLY YOURS.</span><h1>A beautiful journey<br /><em>begins with you.</em></h1><p>{points[0].name} <span aria-hidden="true">→</span> {points.at(-1).name}</p></div>
      <img src={voucherAsset} alt="Journey Voucher paper plane artwork" width="2500" height="2500" />
    </section>
    <section className="vp-guest" aria-label="Guest details"><div><span>PREPARED FOR</span><strong>{voucher.billing.name}</strong></div><div><span>VISITING CARD / REFERENCE</span><strong>{voucher.billing.visitingCardNo}</strong></div></section>
    <section className="vp-route-overview" aria-label="Journey map and summary">
      <div className="vp-map-cell"><div className="vp-map"><img src={mapAsset} alt="Journey map with numbered stops matching the itinerary" width="1151" height="1370" />{points.map((point, index) => <span className="vp-map-pin" key={index} style={{ left: `${point.x}%`, top: `${point.y}%` }}>{index === 0 ? "S" : index}</span>)}</div></div>
      <div className="vp-route-summary"><span className="vp-eyebrow">THE ROAD AHEAD</span><h2>Your journey, mapped.</h2><p className="vp-route-total"><strong>{complete ? formatKm(total) : "Distance to be confirmed"}</strong><span>{count} {count === 1 ? "stop" : "stops"} along the way</span></p><dl><div><dt>DEPARTURE · S</dt><dd>{points[0].name}{points[0].address && <small>{points[0].address}</small>}</dd></div><div><dt>FINAL DESTINATION · {count}</dt><dd>{points.at(-1).name}{points.at(-1).address && <small>{points.at(-1).address}</small>}</dd></div></dl><p className="vp-map-caption">Route illustration. Numbered pins match the stops below. Distances supplied for each leg.</p></div>
    </section>
    <table className="vp-itinerary">
      <caption>YOUR ITINERARY <span>{voucher.voucherNumber}</span></caption>
      <colgroup><col className="vp-col-stop" /><col className="vp-col-place" /><col className="vp-col-stay" /><col className="vp-col-dates" /><col className="vp-col-distance" /></colgroup>
      <thead><tr><th scope="col">Stop</th><th scope="col">Place & address</th><th scope="col">Hotel / stay</th><th scope="col">Dates & duration</th><th scope="col">Distance</th></tr></thead>
      <tbody>{points.slice(1).map((stop, index) => <tr key={index}>
        <th scope="row"><span className="vp-stop-number">{String(index + 1).padStart(2, "0")}</span></th>
        <td><strong>{stop.name}</strong>{stop.address && <p>{stop.address}</p>}</td>
        <td><strong>{stop.hotel?.name || "To be confirmed"}</strong>{stop.hotel?.starRating && <small>{stop.hotel.starRating}</small>}</td>
        <td><span>Arrival: {dateLabel(stop.arrivalDate)}</span><span>Departure: {dateLabel(stop.departureDate)}</span><strong className="vp-duration">{stop.duration || "To be confirmed"}</strong></td>
        <td><strong>{stop.distanceKm !== "" && stop.distanceKm != null ? formatKm(Number(stop.distanceKm)) : "Pending"}</strong><small>from previous stop</small>{stop.cumulative != null && <small>{formatKm(stop.cumulative)} total</small>}</td>
      </tr>)}</tbody>
    </table>
    <section className="vp-message"><span className="vp-eyebrow">WITH OUR WARMEST WISHES</span><p>{voucher.message || "May every mile bring you closer to a beautiful memory."}</p></section>
    <footer className="vp-footer"><strong>Travel well. Return with stories worth telling.</strong><span>eternal-india.com · +91 93191 40846 · info@eternal-india.com</span></footer>
  </article>;
}
