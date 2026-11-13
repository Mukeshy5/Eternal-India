import { useEffect, useState } from "react";
import { api } from "./api";
import { usePanelNavigationGuard } from "./panel/PanelNavigationContext";
import "./AdminTools.css";

const blank = { name: "", rate: "", gstNumber: "" };
const sortedRates = (rates) => [...rates].sort((a, b) => a.rate - b.rate || a.name.localeCompare(b.name));

export default function GstManager({ apiBase, onUnauthorized }) {
  const [gstRates, setGstRates] = useState([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dirty = form.name !== blank.name || form.rate !== blank.rate || form.gstNumber !== blank.gstNumber;
  usePanelNavigationGuard(dirty, busy, "Discard unsaved GST rate details?");

  useEffect(() => {
    const controller = new AbortController();
    api(`${apiBase}/gst`, { signal: controller.signal }).then(({ gstRates: savedRates }) => {
      if (!controller.signal.aborted) setGstRates(savedRates);
    }).catch((failure) => {
      if (!controller.signal.aborted) {
        setError(failure.message);
        if (failure.status === 401) onUnauthorized();
      }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [apiBase, onUnauthorized]);

  function reset() {
    setForm(blank);
    setEditingId("");
    setNotice("");
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const method = editingId ? "PATCH" : "POST";
    try {
      const result = await api(`${apiBase}/gst${editingId ? `/${editingId}` : ""}`, {
        method,
        body: JSON.stringify({ name: form.name, rate: Number(form.rate), gstNumber: form.gstNumber }),
      });
      setGstRates((current) => sortedRates([...current.filter((item) => item._id !== result.gstRate._id), result.gstRate]));
      reset();
      setNotice(editingId ? "GST rate updated." : "GST rate added.");
    } catch (failure) {
      setError(failure.message);
      if (failure.status === 401) onUnauthorized();
    } finally { setBusy(false); }
  }

  async function remove(gstRate) {
    if (busy || !window.confirm(`Delete "${gstRate.name}" (${gstRate.rate}%)? This cannot be undone.`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`${apiBase}/gst/${gstRate._id}`, { method: "DELETE" });
      setGstRates((current) => current.filter((item) => item._id !== gstRate._id));
      if (editingId === gstRate._id) reset();
      setNotice("GST rate deleted.");
    } catch (failure) {
      setError(failure.message);
      if (failure.status === 401) onUnauthorized();
    } finally { setBusy(false); }
  }

  return <section className="admin-tools">
    <header className="admin-tools-heading"><div><span className="dashboard-section-label">WORKSPACE / OPERATIONS</span><h1>GST management</h1><p>Add, update and remove GST tax rates. Add the company GST number to use a rate on journey vouchers.</p></div></header>
    {error && <p className="admin-error" role="alert">{error}</p>}
    <form className="admin-tool-card admin-tool-form" onSubmit={save}>
      <h2>{editingId ? "Edit GST rate" : "Add GST rate"}</h2>
      {notice && <p className="admin-success" role="status">{notice}</p>}
      <fieldset disabled={busy}>
        <div className="admin-tool-grid">
          <label className="admin-tool-field"><span>GST name</span><input name="name" required maxLength={80} placeholder="e.g. Standard GST" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
          <label className="admin-tool-field"><span>Rate (%)</span><input name="rate" type="number" required min="0" max="100" step="0.01" value={form.rate} onChange={(event) => setForm((current) => ({ ...current, rate: event.target.value }))} /></label>
          <label className="admin-tool-field"><span>Company GST number (for vouchers)</span><input name="gstNumber" maxLength={15} pattern="[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]" placeholder="15-character GSTIN" value={form.gstNumber} onChange={(event) => setForm((current) => ({ ...current, gstNumber: event.target.value.toUpperCase() }))} /></label>
        </div>
        <div className="admin-tool-actions">
          <button type="submit" className="dashboard-button dashboard-button-primary">{busy ? "Saving…" : editingId ? "Update GST" : "Add GST"}</button>
          {editingId && <button type="button" className="dashboard-button" onClick={reset}>Cancel</button>}
        </div>
      </fieldset>
    </form>
    <section className="admin-tool-card">
      <h2>Saved GST rates <span>{gstRates.length}</span></h2>
      {loading ? <p role="status">Loading GST rates…</p> : <div className="admin-tool-table-wrap"><table className="admin-tool-table">
        <thead><tr><th>Name</th><th>Rate</th><th>Company GST number</th><th>Actions</th></tr></thead>
        <tbody>{gstRates.map((gstRate) => <tr key={gstRate._id}>
          <th scope="row">{gstRate.name}</th>
          <td data-label="Rate">{gstRate.rate}%</td>
          <td data-label="Company GST number">{gstRate.gstNumber || "Not configured"}</td>
          <td data-label="Actions"><div className="gst-rate-actions">
            <button type="button" disabled={busy} onClick={() => { setForm({ name: gstRate.name, rate: String(gstRate.rate), gstNumber: gstRate.gstNumber || "" }); setEditingId(gstRate._id); setNotice(""); setError(""); }}>Edit</button>
            <button type="button" disabled={busy} onClick={() => remove(gstRate)}>Delete</button>
          </div></td>
        </tr>)}</tbody>
      </table>{!gstRates.length && !error && <p className="admin-tool-empty">No GST rates added yet.</p>}</div>}
    </section>
  </section>;
}
