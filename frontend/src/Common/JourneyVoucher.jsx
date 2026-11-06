import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "./api";
import { formatKm, journeyRoute } from "./journeyRoute";
import voucherAsset from "../assets/Journey Voucher/Journey Voucher (2).png";
import mapAsset from "../assets/Journey Voucher/Journey map.png";
import VoucherPrintDocument from "./VoucherPrintDocument";

const blankStop = { name: "", address: "", distanceKm: "", duration: "", departureDate: "", arrivalDate: "", hotelId: "" };
const dateLabel = (value) => value ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(`${value.slice(0, 10)}T12:00:00+05:30`)) : "Dates to be confirmed";
function Field({ label, children, wide = false }) {
  return <label className={`admin-tool-field${wide ? " admin-tool-field-wide" : ""}`}><span>{label}</span>{children}</label>;
}

export default function JourneyVoucher({ apiBase = "/admin", technical = false, onBack, onError, error }) {
  const [billing, setBilling] = useState({ name: "", visitingCardNo: "" });
  const [journey, setJourney] = useState({ from: "", fromAddress: "" });
  const [stops, setStops] = useState([{ ...blankStop, key: 0 }]);
  const nextKey = useRef(1);
  const [message, setMessage] = useState("May every mile bring you closer to a beautiful memory.");
  const [hotels, setHotels] = useState([]);
  const [loadingHotels, setLoadingHotels] = useState(true);
  const [voucher, setVoucher] = useState(null);
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  const printDocument = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    const loadHotels = () => api(`${apiBase}/hotels`, { signal: controller.signal }).then(({ hotels: result }) => setHotels(result)).catch((failure) => { if (!controller.signal.aborted) onError(failure.message); }).finally(() => { if (!controller.signal.aborted) setLoadingHotels(false); });
    loadHotels();
    window.addEventListener("focus", loadHotels);
    return () => { controller.abort(); window.removeEventListener("focus", loadHotels); };
  }, [onError, apiBase]);
  const draft = useMemo(() => ({ billing, journey, stops: stops.map((stop) => ({ ...stop, hotel: hotels.find((hotel) => hotel._id === stop.hotelId) })), message }), [billing, journey, stops, hotels, message]);
  const route = useMemo(() => journeyRoute(journey.from, journey.fromAddress, stops), [journey, stops]);
  const changed = () => { setVoucher(null); onError(""); };
  function updateStop(index, key, value) {
    changed();
    setStops((current) => current.map((stop, position) => position === index ? { ...stop, [key]: value } : stop));
  }
  async function save(event) {
    event.preventDefault();
    if (busy || !event.currentTarget.reportValidity()) return;
    setBusy(true); onError("");
    try {
      const result = await api(`${apiBase}/vouchers`, { method: "POST", body: JSON.stringify({ billing, journey, stops: stops.map(({ key: _key, ...stop }) => stop), message }) });
      setVoucher(result.voucher);
    } catch (failure) { onError(failure.message); }
    finally { setBusy(false); }
  }
  async function print() {
    if (printing || !voucher || !printDocument.current) return;
    setPrinting(true); onError("");
    try {
      await Promise.all([...printDocument.current.querySelectorAll("img")].map((img) => img.decode()));
      await document.fonts?.ready;
      window.print();
    } catch { onError("The voucher artwork could not load. Please retry printing once the images appear."); }
    finally { setPrinting(false); }
  }
  return <div className="admin-tools admin-voucher-workspace">
    <header className="admin-tools-heading"><div><span className="dashboard-section-label">{technical ? "TECHNICAL WORKSPACE" : "ADMIN WORKSPACE"} / JOURNEYS</span><h1>Journey Voucher<span>.</span></h1><p>A personal itinerary. Every stop, beautifully mapped.</p></div><button className="dashboard-button" type="button" onClick={onBack}>← Back to enquiries</button></header>
    {error && <p className="admin-error admin-tool-error" role="alert">{error}</p>}
    <div className="voucher-workspace-grid">
      <form className="admin-tool-card admin-tool-form voucher-editor" onSubmit={save}>
        <fieldset disabled={busy}>
          <div className="voucher-section-heading"><span>01</span><div><h2>Guest & departure</h2><p>The beginning of a memorable journey.</p></div></div>
          <div className="admin-tool-grid">
            <Field label="Guest name *"><input name="guestName" required maxLength={160} pattern=".*\S.*" placeholder="Full name" value={billing.name} onChange={(event) => { changed(); setBilling({ ...billing, name: event.target.value }); }} /></Field>
            <Field label="Visiting card no. *"><input name="visitingCardNo" required maxLength={80} pattern=".*\S.*" placeholder="Guest / booking reference" value={billing.visitingCardNo} onChange={(event) => { changed(); setBilling({ ...billing, visitingCardNo: event.target.value }); }} /></Field>
            <Field label="Journey from *"><input name="from" required maxLength={160} pattern=".*\S.*" placeholder="e.g. New Delhi" value={journey.from} onChange={(event) => { changed(); setJourney({ ...journey, from: event.target.value }); }} /></Field>
            <Field label="Starting address"><input name="fromAddress" maxLength={300} placeholder="Airport, station or pickup address" value={journey.fromAddress} onChange={(event) => { changed(); setJourney({ ...journey, fromAddress: event.target.value }); }} /></Field>
          </div>
          <div className="voucher-section-heading"><span>02</span><div><h2>Build the route</h2><p>Enter each leg's distance in km. Map pins follow your distances.</p></div></div>
          <div className="admin-stops-list">{stops.map((stop, index) => <section className="admin-stop" key={stop.key} aria-label={`Stop ${index + 1}`}>
            <header className="admin-stop-heading"><strong><span>{String(index + 1).padStart(2, "0")}</span>{index === stops.length - 1 ? "Final destination" : "Journey stop"}</strong><div>{stops.length > 1 && <><button type="button" className="admin-stop-move" aria-label={`Move stop ${index + 1} earlier`} disabled={index === 0} onClick={() => { changed(); setStops((current) => { const reordered = [...current]; [reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]]; return reordered.map((item) => ({ ...item, distanceKm: "" })); }); }}>↑</button><button type="button" className="admin-stop-remove" aria-label={`Remove stop ${index + 1}`} onClick={() => { changed(); setStops((current) => current.filter((_, position) => position !== index).map((item) => ({ ...item, distanceKm: "" }))); }}>Remove</button></>}</div></header>
            <div className="admin-tool-grid">
              <Field label="Place / stop name *"><input name={`stop-${index}-name`} required maxLength={160} pattern=".*\S.*" placeholder="e.g. Jaipur" value={stop.name} onChange={(event) => updateStop(index, "name", event.target.value)} /></Field>
              <Field label={`Distance from ${index ? stops[index - 1].name || "previous stop" : journey.from || "start"} (km) *`}><input name={`stop-${index}-distance`} required type="number" inputMode="decimal" min="0" max="100000" step="any" placeholder="e.g. 280" value={stop.distanceKm} onChange={(event) => updateStop(index, "distanceKm", event.target.value)} /></Field>
              <Field label="Stop address" wide><input name={`stop-${index}-address`} maxLength={300} placeholder="Hotel, landmark or complete address" value={stop.address} onChange={(event) => updateStop(index, "address", event.target.value)} /></Field>
              <Field label="Arrival date *"><input name={`stop-${index}-arrival`} required type="date" value={stop.arrivalDate} onChange={(event) => updateStop(index, "arrivalDate", event.target.value)} /></Field>
              <Field label="Departure date *"><input name={`stop-${index}-departure`} required type="date" min={stop.arrivalDate || undefined} value={stop.departureDate} onChange={(event) => updateStop(index, "departureDate", event.target.value)} /></Field>
              <Field label="Stopover duration *"><input name={`stop-${index}-duration`} required maxLength={80} pattern=".*\S.*" placeholder="2 nights / 1 day" value={stop.duration} onChange={(event) => updateStop(index, "duration", event.target.value)} /></Field>
              <Field label="Stay / saved hotel *"><select name={`stop-${index}-hotel`} required value={stop.hotelId} onChange={(event) => updateStop(index, "hotelId", event.target.value)}><option value="">Select hotel</option>{hotels.map((hotel) => <option key={hotel._id} value={hotel._id}>{hotel.name} · {hotel.starRating}</option>)}</select></Field>
            </div>
            {stop.hotelId && (() => { const hotel = hotels.find((item) => item._id === stop.hotelId); return hotel ? <div className="admin-stop-hotel-details"><strong>{hotel.name}</strong><span>{hotel.starRating}</span><span>GST {hotel.gst}% · ₹{Number(hotel.amount).toLocaleString("en-IN")}</span></div> : null; })()}
          </section>)}</div>
          <div className="voucher-add-stop"><button type="button" className="dashboard-button" disabled={stops.length >= 20} onClick={() => { changed(); const key = nextKey.current++; setStops((current) => [...current, { ...blankStop, key }]); }}>+ Add another stop</button><span>{stops.length} / 20 stops</span></div>
          <p className="voucher-distance-note">Distances are entered by you. Reordering or removing a stop clears leg distances so you can update the route.</p>
          {!hotels.length && <p className="admin-tool-empty">{loadingHotels ? "Loading saved hotels…" : "Add a hotel in Hotel inventory before saving your voucher."}</p>}
          <div className="voucher-section-heading"><span>03</span><div><h2>A personal touch</h2><p>A few words for the road ahead.</p></div></div>
          <Field label="Journey message"><textarea maxLength={500} value={message} onChange={(event) => { changed(); setMessage(event.target.value); }} /></Field>
          <div className="admin-tool-actions"><button className="dashboard-button dashboard-button-primary" disabled={busy || !hotels.length}>{busy ? "Saving journey…" : voucher ? "Save another copy" : "Save Journey Voucher"}</button><button type="button" className="dashboard-button" disabled={!voucher || printing} onClick={print}>{printing ? "Preparing artwork…" : "Print / Save PDF"}</button></div>
          <p className="voucher-save-status" role="status">{voucher ? `Saved as ${voucher.voucherNumber}. Ready to print.` : "Live preview updates as you type. Save your completed voucher to print."}</p>
        </fieldset>
      </form>
      <section className="voucher-preview-panel" aria-label="Journey voucher preview"><div className="voucher-preview-label"><span><i /> LIVE PREVIEW</span><span>{route.count} stops · {route.complete ? formatKm(route.total) : "Distances pending"}</span></div><VoucherPreview voucher={voucher || draft} saved={Boolean(voucher)} /></section>
    </div>
    {voucher && createPortal(<div id="journey-voucher-print-root" ref={printDocument}><VoucherPrintDocument voucher={voucher} /></div>, document.body)}
  </div>;
}

export function VoucherPreview({ voucher, saved = true }) {
  const route = journeyRoute(voucher.journey.from, voucher.journey.fromAddress, voucher.stops);
  const [activePin, setActivePin] = useState(null);
  const pin = route.points[activePin] || route.points[0];
  return <article className="journey-voucher-print">
    <header className="voucher-brand"><img src="/logo.webp" alt="Eternal India" width="183" height="58" /><div><span>JOURNEY VOUCHER</span><strong>{voucher.voucherNumber || "YOUR JOURNEY, PERSONALLY PLANNED"}</strong><small>{saved && voucher.createdAt ? `Issued ${dateLabel(voucher.createdAt)}` : "Draft · preview"}</small></div></header>
    <section className="voucher-cover"><div><span className="voucher-eyebrow">THOUGHTFULLY PLANNED. PERSONALLY YOURS.</span><h2>A beautiful journey<br /><em>begins with you.</em></h2><p>{voucher.journey.from || "Your starting point"}{route.count > 0 && <> → {route.points.at(-1).name}</>}</p></div><img className="voucher-asset" src={voucherAsset} alt="Pink paper plane tracing a heart, Journey Voucher artwork" width="2500" height="2500" /></section>
    <div className="voucher-billing"><div><small>PREPARED FOR</small><strong>{voucher.billing.name || "Guest name"}</strong></div><div><small>VISITING CARD / REFERENCE</small><strong>{voucher.billing.visitingCardNo || "Your reference"}</strong></div></div>
    <section className="voucher-journey-section"><header className="voucher-route-heading"><div><span className="voucher-eyebrow">THE ROAD AHEAD</span><h3>Your journey, mapped.</h3></div><div className="voucher-distance-total"><strong>{route.complete ? formatKm(route.total) : "— km"}</strong><span>{route.count} {route.count === 1 ? "stop" : "stops"} along the way</span></div></header>
      <p className="voucher-map-note">{route.complete ? "Pins follow the distances entered for each leg. Route illustration." : "Pins show stop order. Add all leg distances for proportional placement."}</p>
      <div className="voucher-route-layout"><div className="voucher-map-column"><div className="voucher-map"><img src={mapAsset} alt="Winding road illustration with numbered journey stops" width="1151" height="1370" /><div className={`voucher-route${route.points.length > 5 ? " voucher-route-dense" : ""}`}>{route.points.map((point, index) => <button key={index} type="button" className={`voucher-map-pin${index === activePin ? " is-active" : ""}`} style={{ left: `${point.x}%`, top: `${point.y}%` }} aria-label={`${index === 0 ? "Start" : `Stop ${index}`}: ${point.name}${point.address ? `, ${point.address}` : ""}${point.cumulative != null ? `, ${formatKm(point.cumulative)} from start` : ""}`} aria-pressed={index === activePin} title={`${point.name}${point.address ? ` · ${point.address}` : ""}`} onClick={() => setActivePin(index)}><b>{index === 0 ? "S" : index}</b><span>{point.name.length > 18 ? `${point.name.slice(0, 17)}…` : point.name}</span></button>)}</div></div><div className="voucher-pin-detail" aria-live="polite"><small>{activePin ? `STOP ${activePin}` : "DEPARTURE"}{pin.cumulative != null && ` · ${formatKm(pin.cumulative)}`}</small><strong>{pin.name}</strong>{pin.address && <span>{pin.address}</span>}</div></div>
      <ol className="voucher-stops">{route.points.map((stop, index) => <li key={index}><span className="voucher-stop-number">{index === 0 ? "S" : String(index).padStart(2, "0")}</span><div><div className="voucher-stop-title"><button type="button" className="voucher-stop-select" aria-pressed={index === activePin} onClick={() => setActivePin(index)}>{stop.name}</button>{index > 0 && <span>{stop.distanceKm !== "" && stop.distanceKm != null ? `+${formatKm(Number(stop.distanceKm))}` : "km pending"}</span>}</div>{stop.address && <p className="voucher-stop-address">{stop.address}</p>}{index === 0 ? <small>Starting point · 0 km</small> : <><p className="voucher-stop-hotel">{stop.hotel?.name || "Stay to be selected"}</p>{stop.hotel?.starRating && <small>{stop.hotel.starRating}</small>}<small>{dateLabel(stop.arrivalDate)}{stop.departureDate && ` – ${dateLabel(stop.departureDate)}`}</small><span className="voucher-stop-duration">{stop.duration || "Duration to be confirmed"}{stop.cumulative != null && ` · ${formatKm(stop.cumulative)} from start`}</span></>}</div></li>)}</ol></div>
    </section>
    <div className="voucher-message"><span>WITH OUR WARMEST WISHES</span><p>{voucher.message || "May every mile bring you closer to a beautiful memory."}</p></div>
    <footer><strong>Travel well. Return with stories worth telling.</strong><span>eternal-india.com · +91 93191 40846 · info@eternal-india.com</span></footer>
  </article>;
}
