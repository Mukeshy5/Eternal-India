import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import voucherAsset from "../assets/Journey Voucher/Journey Voucher (2).png";
import mapAsset from "../assets/Journey Voucher/Journey map.png";
import "./AdminTools.css";

const starRatings = ["1-Star (Budget)", "2-Star (Tourist Class)", "3-Star (Mid-Scale / First Class)", "4-Star (Upscale / Deluxe)", "5-Star (Luxury / Superior Deluxe)"];
const blankHotel = { name: "", starRating: starRatings[0], availableRooms: "", gst: "", amount: "" };
const blankStop = { name: "", duration: "", departureDate: "", arrivalDate: "", hotelId: "" };

function Field({ label, children }) {
  return <label className="admin-tool-field"><span>{label}</span>{children}</label>;
}

function HotelTool({ onBack, onError }) {
  const [form, setForm] = useState(blankHotel);
  const [hotels, setHotels] = useState([]);
  const [editing, setEditing] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api("/admin/hotels").then(({ hotels: result }) => setHotels(result)).catch((error) => onError(error.message)); }, [onError]);
  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  async function save(event) {
    event.preventDefault(); setBusy(true);
    try {
      const result = await api(editing ? `/admin/hotels/${editing}` : "/admin/hotels", { method: editing ? "PATCH" : "POST", body: JSON.stringify({ ...form, availableRooms: Number(form.availableRooms), gst: Number(form.gst), amount: Number(form.amount) }) });
      if (editing) setHotels((current) => current.map((hotel) => hotel._id === editing ? { ...hotel, ...form } : hotel));
      else setHotels((current) => [result.hotel, ...current]);
      setForm(blankHotel); setEditing("");
    } catch (error) { onError(error.message); } finally { setBusy(false); }
  }
  async function remove(id) {
    if (!window.confirm("Delete this hotel?")) return;
    try { await api(`/admin/hotels/${id}`, { method: "DELETE" }); setHotels((current) => current.filter((hotel) => hotel._id !== id)); } catch (error) { onError(error.message); }
  }
  return <ToolShell title="Hotel inventory" intro="Keep room categories, GST and rates ready for each journey." onBack={onBack}>
    <form className="admin-tool-card admin-tool-form" onSubmit={save}><h2>{editing ? "Edit hotel" : "Add hotel"}</h2><div className="admin-tool-grid">
      <Field label="Hotel name"><input required maxLength={160} value={form.name} onChange={(event) => change("name", event.target.value)} /></Field>
      <Field label="Hotel star category"><select value={form.starRating} onChange={(event) => change("starRating", event.target.value)}>{starRatings.map((rating) => <option key={rating}>{rating}</option>)}</select></Field>
      <Field label="Available rooms"><input required type="number" min="0" max="100000" value={form.availableRooms} onChange={(event) => change("availableRooms", event.target.value)} /></Field>
      <Field label="GST (%)"><input required type="number" min="0" max="100" step="0.01" value={form.gst} onChange={(event) => change("gst", event.target.value)} /></Field>
      <Field label="Amount (INR)"><input required type="number" min="0" step="0.01" value={form.amount} onChange={(event) => change("amount", event.target.value)} /></Field>
    </div><div className="admin-tool-actions"><button className="dashboard-button dashboard-button-primary" disabled={busy}>{busy ? "Saving…" : editing ? "Update hotel" : "Add hotel"}</button>{editing && <button type="button" className="dashboard-button" onClick={() => { setEditing(""); setForm(blankHotel); }}>Cancel</button>}</div></form>
    <section className="admin-tool-card"><h2>Saved hotels <span>{hotels.length}</span></h2><div className="admin-tool-table-wrap"><table className="admin-tool-table"><thead><tr><th>Name</th><th>Category</th><th>Rooms</th><th>GST</th><th>Amount</th><th /></tr></thead><tbody>{hotels.map((hotel) => <tr key={hotel._id}><th>{hotel.name}</th><td>{hotel.starRating}</td><td>{hotel.availableRooms}</td><td>{hotel.gst}%</td><td>₹{Number(hotel.amount).toLocaleString("en-IN")}</td><td><button type="button" onClick={() => { setEditing(hotel._id); setForm(hotel); }}>Edit</button><button type="button" onClick={() => remove(hotel._id)}>Delete</button></td></tr>)}</tbody></table>{!hotels.length && <p className="admin-tool-empty">No hotels added yet.</p>}</div></section>
  </ToolShell>;
}

function VoucherTool({ onBack, onError }) {
  const [billing, setBilling] = useState({ name: "", visitingCardNo: "" });
  const [from, setFrom] = useState("");
  const [stops, setStops] = useState([{ ...blankStop }]);
  const [message, setMessage] = useState("May every mile bring you closer to a beautiful memory.");
  const [hotels, setHotels] = useState([]);
  const [voucher, setVoucher] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const loadHotels = () => api("/admin/hotels").then(({ hotels: result }) => { if (active) setHotels(result); }).catch((error) => { if (active) onError(error.message); });
    loadHotels();
    window.addEventListener("focus", loadHotels);
    return () => { active = false; window.removeEventListener("focus", loadHotels); };
  }, [onError]);
  const points = useMemo(() => stops.filter((stop) => stop.name), [stops]);
  const updateStop = (index, key, value) => setStops((current) => current.map((stop, position) => position === index ? { ...stop, [key]: value } : stop));
  async function save(event) {
    event.preventDefault(); setBusy(true);
    try { const result = await api("/admin/vouchers", { method: "POST", body: JSON.stringify({ billing, journey: { from }, stops, message }) }); setVoucher(result.voucher); } catch (error) { onError(error.message); } finally { setBusy(false); }
  }
  return <ToolShell title="Journey Voucher" intro="Create a print-ready billing voucher with a clear route and thoughtful travel note." onBack={onBack}>
    <form className="admin-tool-card admin-tool-form" onSubmit={save}><div className="admin-tool-grid"><Field label="Guest name"><input required maxLength={160} value={billing.name} onChange={(event) => setBilling({ ...billing, name: event.target.value })} /></Field><Field label="Visiting card no."><input required maxLength={80} value={billing.visitingCardNo} onChange={(event) => setBilling({ ...billing, visitingCardNo: event.target.value })} /></Field><Field label="Journey from"><input required maxLength={160} value={from} onChange={(event) => setFrom(event.target.value)} /></Field></div><h2>Stops</h2>{stops.map((stop, index) => <div className="admin-stop" key={index}><strong>Stop {index + 1}</strong><Field label="Via / stop name"><input required value={stop.name} onChange={(event) => updateStop(index, "name", event.target.value)} /></Field><Field label="Stopover duration"><input required placeholder="2 nights / 1 day" value={stop.duration} onChange={(event) => updateStop(index, "duration", event.target.value)} /></Field><Field label="Departure date"><input required type="date" value={stop.departureDate} onChange={(event) => updateStop(index, "departureDate", event.target.value)} /></Field><Field label="Arrival date"><input required type="date" value={stop.arrivalDate} onChange={(event) => updateStop(index, "arrivalDate", event.target.value)} /></Field><Field label="Hotel for this stop"><select required value={stop.hotelId} onChange={(event) => updateStop(index, "hotelId", event.target.value)}><option value="">Select saved hotel</option>{hotels.map((hotel) => <option key={hotel._id} value={hotel._id}>{hotel.name} · {hotel.starRating}</option>)}</select></Field>{stop.hotelId && (() => { const hotel = hotels.find((item) => item._id === stop.hotelId); return hotel ? <div className="admin-stop-hotel-details"><strong>{hotel.name}</strong><span>{hotel.starRating}</span><span>{hotel.availableRooms} rooms available</span><span>GST {hotel.gst}% · ₹{Number(hotel.amount).toLocaleString("en-IN")}</span></div> : null; })()}{stops.length > 1 && <button type="button" className="admin-stop-remove" onClick={() => setStops((current) => current.filter((_, position) => position !== index))}>Remove</button>}</div>)}{!hotels.length && <p className="admin-tool-empty">No saved hotels found. Add a hotel first, then return here.</p>}<button type="button" className="dashboard-button" onClick={() => setStops((current) => [...current, { ...blankStop }])}>+ Add stop</button><Field label="Special message for a good journey"><textarea required maxLength={500} value={message} onChange={(event) => setMessage(event.target.value)} /></Field><div className="admin-tool-actions"><button className="dashboard-button dashboard-button-primary" disabled={busy || !hotels.length}>{busy ? "Creating…" : "Create Journey Voucher"}</button>{voucher && <button type="button" className="dashboard-button" onClick={() => window.print()}>Print voucher</button>}</div></form>
    {voucher && <VoucherPreview voucher={voucher} points={points} />}
  </ToolShell>;
}

function VoucherPreview({ voucher, points }) {
  return <article className="journey-voucher-print"><header><img src="/logo.webp" alt="Eternal India" /><div><span>JOURNEY VOUCHER</span><strong>{voucher.voucherNumber}</strong></div></header><img className="voucher-asset" src={voucherAsset} alt="" /><div className="voucher-billing"><div><small>Guest name</small><strong>{voucher.billing.name}</strong></div><div><small>Visiting card no.</small><strong>{voucher.billing.visitingCardNo}</strong></div></div><section className="voucher-map"><img src={mapAsset} alt="Journey route map" /><div className="voucher-route">{[voucher.journey.from, ...points.map((stop) => stop.name)].map((place, index) => <span key={`${place}-${index}`} style={{ "--route-position": `${12 + index * (76 / Math.max(points.length, 1))}%` }}><i />{place}</span>)}</div></section><ol className="voucher-stops">{voucher.journey.from && <li><strong>Start</strong>{voucher.journey.from}</li>}{voucher.stops.map((stop) => <li key={`${stop.name}-${stop.arrivalDate}`}><strong>{stop.name}</strong>{stop.hotel?.name || "Hotel not selected"}<small>{stop.hotel?.starRating} · {stop.duration} · {stop.arrivalDate} to {stop.departureDate}</small></li>)}</ol><p className="voucher-message">{voucher.message}</p><footer>Travel well. Return with stories worth telling.</footer></article>;
}

function ToolShell({ title, intro, onBack, children }) {
  return <div className="admin-tools"><header className="admin-tools-heading"><div><span className="dashboard-section-label">ADMIN WORKSPACE</span><h1>{title}</h1><p>{intro}</p></div><button className="dashboard-button" type="button" onClick={onBack}>← Back to enquiries</button></header>{children}</div>;
}

export default function AdminTools({ tool, onBack, onError }) {
  return tool === "hotels" ? <HotelTool onBack={onBack} onError={onError} /> : <VoucherTool onBack={onBack} onError={onError} />;
}
