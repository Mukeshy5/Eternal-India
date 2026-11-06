import { useEffect, useState } from "react";
import { api } from "./api";
import JourneyVoucher from "./JourneyVoucher";
import "./AdminTools.css";

const starRatings = ["1-Star (Budget)", "2-Star (Tourist Class)", "3-Star (Mid-Scale / First Class)", "4-Star (Upscale / Deluxe)", "5-Star (Luxury / Superior Deluxe)"];
const blankHotel = { name: "", starRating: starRatings[0], gst: "", amount: "" };

function Field({ label, children }) {
  return <label className="admin-tool-field"><span>{label}</span>{children}</label>;
}

function HotelTool({ apiBase, technical, onBack, onError, error }) {
  const [form, setForm] = useState(blankHotel);
  const [hotels, setHotels] = useState([]);
  const [editing, setEditing] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => { api(`${apiBase}/hotels`).then(({ hotels: result }) => setHotels(result)).catch((error) => onError(error.message)); }, [onError, apiBase]);
  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  async function save(event) {
    event.preventDefault(); setBusy(true); setNotice(""); onError("");
    try {
      const result = await api(editing ? `${apiBase}/hotels/${editing}` : `${apiBase}/hotels`, { method: editing ? "PATCH" : "POST", body: JSON.stringify({ ...form, gst: Number(form.gst), amount: Number(form.amount) }) });
      const { hotels: latestHotels } = await api(`${apiBase}/hotels`);
      setHotels(latestHotels);
      setForm(blankHotel); setEditing("");
      setNotice(editing ? "Hotel updated successfully." : `Hotel "${result.hotel.name}" added successfully.`);
    } catch (error) { onError(error.message); } finally { setBusy(false); }
  }
  async function remove(id) {
    if (!window.confirm("Delete this hotel?")) return;
    try { await api(`${apiBase}/hotels/${id}`, { method: "DELETE" }); setHotels((current) => current.filter((hotel) => hotel._id !== id)); } catch (error) { onError(error.message); }
  }
  return <ToolShell technical={technical} title="Hotel inventory" intro="Keep room categories, GST and rates ready for each journey." onBack={onBack} error={error}>
    <form className="admin-tool-card admin-tool-form" onSubmit={save}><h2>{editing ? "Edit hotel" : "Add hotel"}</h2>{notice && <p className="admin-success" role="status">{notice}</p>}<div className="admin-tool-grid">
      <Field label="Hotel name"><input required maxLength={160} value={form.name} onChange={(event) => change("name", event.target.value)} /></Field>
      <Field label="Hotel star category"><select value={form.starRating} onChange={(event) => change("starRating", event.target.value)}>{starRatings.map((rating) => <option key={rating}>{rating}</option>)}</select></Field>
      <Field label="GST (%)"><input required type="number" min="0" max="100" step="0.01" value={form.gst} onChange={(event) => change("gst", event.target.value)} /></Field>
      <Field label="Amount (INR)"><input required type="number" min="0" step="0.01" value={form.amount} onChange={(event) => change("amount", event.target.value)} /></Field>
    </div><div className="admin-tool-actions"><button className="dashboard-button dashboard-button-primary" disabled={busy}>{busy ? "Saving…" : editing ? "Update hotel" : "Add hotel"}</button>{editing && <button type="button" className="dashboard-button" onClick={() => { setEditing(""); setForm(blankHotel); }}>Cancel</button>}</div></form>
    <section className="admin-tool-card"><h2>Saved hotels <span>{hotels.length}</span></h2><div className="admin-tool-table-wrap"><table className="admin-tool-table"><thead><tr><th scope="col">Name</th><th scope="col">Category</th><th scope="col">GST</th><th scope="col">Amount</th><th scope="col"><span className="admin-sr-only">Actions</span></th></tr></thead><tbody>{hotels.map((hotel) => <tr key={hotel._id}><th scope="row">{hotel.name}</th><td data-label="Category">{hotel.starRating}</td><td data-label="GST">{hotel.gst}%</td><td data-label="Amount">₹{Number(hotel.amount).toLocaleString("en-IN")}</td><td><button type="button" onClick={() => { setEditing(hotel._id); setForm(hotel); }}>Edit</button><button type="button" onClick={() => remove(hotel._id)}>Delete</button></td></tr>)}</tbody></table>{!hotels.length && <p className="admin-tool-empty">No hotels added yet.</p>}</div></section>
  </ToolShell>;
}

function ToolShell({ technical, title, intro, onBack, error, children }) {
  return <div className="admin-tools"><header className="admin-tools-heading"><div><span className="dashboard-section-label">{technical ? "TECHNICAL WORKSPACE" : "ADMIN WORKSPACE"}</span><h1>{title}</h1><p>{intro}</p></div><button className="dashboard-button" type="button" onClick={onBack}>← Back to enquiries</button></header>{error && <p className="admin-error admin-tool-error" role="alert">{error}</p>}{children}</div>;
}

export default function AdminTools({ apiBase = "/admin", technical = false, tool, onBack, onError, error }) {
  return tool === "hotels" ? <HotelTool apiBase={apiBase} technical={technical} onBack={onBack} onError={onError} error={error} /> : <JourneyVoucher apiBase={apiBase} technical={technical} onBack={onBack} onError={onError} error={error} />;
}
