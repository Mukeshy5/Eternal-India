import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { usePanelNavigationGuard } from "./panel/PanelNavigationContext";

const ratings = ["1-Star (Budget)", "2-Star (Tourist Class)", "3-Star (Mid-Scale / First Class)", "4-Star (Upscale / Deluxe)", "5-Star (Luxury / Superior Deluxe)"];
const blank = { name: "", starRating: ratings[0], gst: "", amount: "" };
export default function HotelManager({ apiBase, technical, onBack, onError, onUnauthorized, error }) {
  const [form, setForm] = useState(blank), [hotels, setHotels] = useState([]), [editing, setEditing] = useState("");
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [notice, setNotice] = useState("");
  const baseline = useRef(blank), lock = useRef(false), action = useRef(null), mounted = useRef(true);
  const dirty = Object.keys(blank).some((key) => String(form[key]) !== String(baseline.current[key]));
  usePanelNavigationGuard(dirty, busy, "Discard unsaved hotel details?");
  const failure = useCallback((cause) => { onError(Object.values(cause.errors || {}).join(" ") || cause.message); if (cause.status === 401) onUnauthorized?.(); }, [onError, onUnauthorized]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; action.current?.abort(); }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    api(`${apiBase}/hotels`, { signal: controller.signal }).then(({ hotels: records }) => { if (!controller.signal.aborted) setHotels(records); }).catch((cause) => { if (!controller.signal.aborted) failure(cause); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [apiBase, failure]);
  async function perform(path, options, success) {
    if (lock.current) return; lock.current = true; setBusy(true); onError(""); setNotice("");
    const controller = new AbortController(); action.current = controller;
    try { const result = await api(`${apiBase}${path}`, { ...options, signal: controller.signal }); if (mounted.current && !controller.signal.aborted) success(result); }
    catch (cause) { if (mounted.current && !controller.signal.aborted) failure(cause); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  const reset = () => { setEditing(""); setForm(blank); baseline.current = blank; };
  function save(event) {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return;
    void perform(`/hotels${editing ? `/${editing}` : ""}`, { method: editing ? "PATCH" : "POST", body: JSON.stringify({ ...form, gst: Number(form.gst), amount: Number(form.amount) }) }, ({ hotel }) => {
      setHotels((previous) => editing ? previous.map((entry) => entry._id === hotel._id ? hotel : entry) : [hotel, ...previous]);
      setNotice(editing ? "Hotel updated successfully." : `Hotel "${hotel.name}" added successfully.`); reset();
    });
  }
  function remove(hotel) {
    if (lock.current || !window.confirm(`Delete ${hotel.name}?`)) return;
    void perform(`/hotels/${hotel._id}`, { method: "DELETE" }, () => { setHotels((records) => records.filter((entry) => entry._id !== hotel._id)); if (editing === hotel._id) reset(); setNotice("Hotel deleted."); });
  }
  return <div className="admin-tools"><header className="admin-tools-heading"><div><span className="dashboard-section-label">{technical ? "TECHNICAL" : "ADMIN"} / OPERATIONS</span><h1>Hotel inventory</h1><p>Manage room categories, GST and rates for your journeys.</p></div><button className="dashboard-button" disabled={busy} onClick={onBack}>← Back to enquiries</button></header>
    {error && <p className="admin-error" role="alert">{error}</p>}
    <form className="admin-tool-card admin-tool-form" onSubmit={save}><h2>{editing ? "Edit hotel" : "Add hotel"}</h2>{notice && <p className="admin-success" role="status">{notice}</p>}<fieldset disabled={busy}><div className="admin-tool-grid">{[["name", "Hotel name", "text"], ["gst", "GST (%)", "number"], ["amount", "Amount (INR)", "number"]].map(([key, label, type]) => <label className="admin-tool-field" key={key}><span>{label}</span><input required name={key} type={type} min={type === "number" ? 0 : undefined} max={key === "gst" ? 100 : undefined} step={type === "number" ? "0.01" : undefined} maxLength={key === "name" ? 160 : undefined} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></label>)}<label className="admin-tool-field"><span>Hotel star category</span><select value={form.starRating} onChange={(event) => setForm({ ...form, starRating: event.target.value })}>{ratings.map((rating) => <option key={rating}>{rating}</option>)}</select></label></div><div className="admin-tool-actions"><button className="dashboard-button dashboard-button-primary" disabled={busy}>{busy ? "Saving…" : editing ? "Update hotel" : "Add hotel"}</button>{editing && <button type="button" className="dashboard-button" onClick={reset}>Cancel</button>}</div></fieldset></form>
    <section className="admin-tool-card"><h2>Saved hotels <span>{hotels.length}</span></h2>{loading ? <p role="status">Loading hotel inventory…</p> : <div className="admin-tool-table-wrap"><table className="admin-tool-table"><thead><tr><th>Name</th><th>Category</th><th>GST</th><th>Amount</th><th>Actions</th></tr></thead><tbody>{hotels.map((hotel) => <tr key={hotel._id}><th scope="row">{hotel.name}</th><td>{hotel.starRating}</td><td>{hotel.gst}%</td><td>₹{Number(hotel.amount).toLocaleString("en-IN")}</td><td><button disabled={busy} onClick={() => { if (dirty && !window.confirm("Discard the current hotel changes?")) return; baseline.current = hotel; setEditing(hotel._id); setForm(hotel); }}>Edit</button><button disabled={busy} onClick={() => remove(hotel)}>Delete</button></td></tr>)}</tbody></table>{!hotels.length && !error && <p className="admin-tool-empty">No hotels added yet.</p>}</div>}</section>
  </div>;
}
