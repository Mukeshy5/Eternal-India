import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { usePanelNavigationGuard } from "./panel/PanelNavigationContext";
import { voucherOptionsChanged } from "./voucherClient";
import "./AdminTools.css";

const definitions = {
  addresses: {
    path: "office-addresses", list: "addresses", record: "address", title: "Office addresses", singular: "office address", addTitle: "Add office address",
    description: "Manage the office addresses available to both panels and journey vouchers. Issued vouchers keep their saved address details.",
    blank: { address: "" },
    fields: [{ key: "address", label: "Office address", max: 600, required: true, textarea: true }],
  },
  gst: {
    path: "gst", list: "gstRates", record: "gstRate", title: "GST numbers", singular: "GST number", addTitle: "Add GST number",
    description: "Add, update and delete company GST registration numbers. Saved numbers are available in journey vouchers.",
    blank: { gstNumber: "" },
    fields: [{ key: "gstNumber", label: "GST Number", max: 15, required: true, pattern: "[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]" }],
  },
};

export default function PanelRecordManager({ kind, apiBase, onUnauthorized }) {
  const definition = definitions[kind];
  const [records, setRecords] = useState([]), [form, setForm] = useState(definition.blank), [baseline, setBaseline] = useState(definition.blank), [editing, setEditing] = useState(null), [viewId, setViewId] = useState("");
  const [search, setSearch] = useState(""), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [errors, setErrors] = useState({}), [notice, setNotice] = useState(""), [refresh, setRefresh] = useState(0);
  const locked = useRef(false), action = useRef(null), alive = useRef(true);
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  usePanelNavigationGuard(dirty, busy, `Discard unsaved ${definition.singular} details?`);
  useEffect(() => { alive.current = true; return () => { alive.current = false; action.current?.abort(); }; }, []);
  const report = useCallback((failure) => { if (!alive.current) return; setError(failure.message); setErrors(failure.errors || {}); if (failure.status === 401) onUnauthorized?.(); }, [onUnauthorized]);
  useEffect(() => {
    const controller = new AbortController(); let pending = false, again = false;
    async function load() {
      if (pending) { again = true; return; } pending = true;
      try { do { again = false; const result = await api(`${apiBase}/${definition.path}`, { signal: controller.signal }); if (!controller.signal.aborted) setRecords(result[definition.list]); } while (again && !controller.signal.aborted); }
      catch (failure) { if (!controller.signal.aborted) report(failure); }
      finally { pending = false; if (!controller.signal.aborted) setLoading(false); }
    }
    const synchronize = () => { if (!document.hidden) void load(); };
    void load(); const timer = window.setInterval(synchronize, 15000); window.addEventListener("focus", synchronize); window.addEventListener("journey-voucher-options-changed", synchronize);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", synchronize); window.removeEventListener("journey-voucher-options-changed", synchronize); };
  }, [apiBase, definition, report, refresh]);
  function reset() { setEditing(null); setForm(definition.blank); setBaseline(definition.blank); setErrors({}); }
  async function perform(task) {
    if (locked.current) return; locked.current = true; setBusy(true); setError(""); setErrors({}); setNotice("");
    const controller = new AbortController(); action.current = controller;
    try { await task(controller.signal); } catch (failure) { if (!controller.signal.aborted) report(failure); }
    finally { locked.current = false; if (alive.current) setBusy(false); }
  }
  function save(event) {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return;
    void perform(async (signal) => {
      const result = await api(`${apiBase}/${definition.path}${editing ? `/${editing._id}` : ""}`, { method: editing ? "PATCH" : "POST", body: JSON.stringify({ ...form, ...(editing ? { version: editing.version } : {}) }), signal });
      if (signal.aborted) return;
      const record = result[definition.record]; setRecords((current) => [...current.filter((entry) => entry._id !== record._id), record]);
      reset(); setNotice(`${definition.singular[0].toUpperCase() + definition.singular.slice(1)} ${editing ? "updated" : "added"} successfully.`); voucherOptionsChanged();
    });
  }
  function edit(record) {
    if (dirty && !window.confirm(`Discard the unsaved ${definition.singular} details?`)) return;
    const values = Object.fromEntries(definition.fields.map(({ key }) => [key, record[key] || ""]));
    setForm(values); setBaseline(values); setEditing(record); setError(""); setErrors({}); setNotice("");
  }
  function remove(record) {
    const label = kind === "gst" ? record.gstNumber || "unconfigured GST record" : record.address;
    if (!window.confirm(`Delete ${label}? Existing vouchers retain their saved details. This cannot be undone.`)) return;
    void perform(async (signal) => {
      await api(`${apiBase}/${definition.path}/${record._id}`, { method: "DELETE", body: JSON.stringify({ version: record.version }), signal });
      if (signal.aborted) return;
      setRecords((current) => current.filter((entry) => entry._id !== record._id)); if (editing?._id === record._id) reset(); if (viewId === record._id) setViewId("");
      setNotice(`${definition.singular[0].toUpperCase() + definition.singular.slice(1)} deleted.`); voucherOptionsChanged();
    });
  }
  const selected = records.find((record) => record._id === viewId);
  const visible = records.filter((record) => definition.fields.some(({ key }) => String(record[key] || "").toLowerCase().includes(search.trim().toLowerCase())));
  return <section className={`admin-tools panel-record-manager ${kind}-manager`}>
    <header className="admin-tools-heading"><div><span className="dashboard-section-label">WORKSPACE / OPERATIONS</span><h1>{definition.title}</h1><p>{definition.description}</p></div><button type="button" className="dashboard-button" disabled={busy} onClick={() => { setError(""); setRefresh((value) => value + 1); }}>Refresh</button></header>
    {error && <p className="admin-error" role="alert">{error}</p>}{notice && <p className="admin-success" role="status">{notice}</p>}
    <form className="admin-tool-card admin-tool-form" aria-label={editing ? `Edit ${definition.singular}` : definition.addTitle} onSubmit={save}>
      <h2>{editing ? `Edit ${definition.singular}` : definition.addTitle}</h2><fieldset disabled={busy}><div className="admin-tool-grid">
        {definition.fields.map(({ key, label, max, required, pattern, textarea }) => <label key={key} className={`admin-tool-field${textarea ? " admin-tool-field-wide" : ""}`}><span>{label}</span>{textarea ? <textarea name={key} rows={4} maxLength={max} required={required} value={form[key]} aria-invalid={!!errors[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} /> : <input name={key} maxLength={max} required={required} pattern={pattern} value={form[key]} aria-invalid={!!errors[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: key === "gstNumber" ? event.target.value.toUpperCase() : event.target.value }))} />}{errors[key] && <small className="admin-error" role="alert">{errors[key]}</small>}</label>)}
      </div><div className="admin-tool-actions"><button type="submit" className="dashboard-button dashboard-button-primary">{busy ? "Saving…" : editing ? kind === "gst" ? "Update GST" : "Update address" : kind === "gst" ? "Add GST" : "Add address"}</button>{editing && <button type="button" className="dashboard-button" onClick={() => { if (!dirty || window.confirm("Discard unsaved changes?")) reset(); }}>Cancel</button>}</div></fieldset>
    </form>
    {selected && <section className="admin-tool-card" aria-label={`View ${definition.singular}`}><h2>{kind === "gst" ? "GST number details" : "Office address details"}</h2>{definition.fields.map(({ key, label }) => <p key={key}><strong>{label}:</strong> {selected[key] || "Not configured"}</p>)}<button type="button" className="dashboard-button" onClick={() => setViewId("")}>Close details</button></section>}
    <section className="admin-tool-card"><h2>Saved {kind === "gst" ? "GST numbers" : "office addresses"} <span>{records.length}</span></h2><label className="admin-tool-field"><span>Search {definition.title.toLowerCase()}</span><input type="search" name="recordSearch" maxLength={100} value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      {loading ? <p role="status">Loading {definition.title.toLowerCase()}…</p> : <div className="admin-tool-table-wrap"><table className="admin-tool-table"><thead><tr>{definition.fields.map(({ key, label }) => <th key={key}>{label}</th>)}<th>Actions</th></tr></thead><tbody>{visible.map((record) => <tr key={record._id}>{definition.fields.map(({ key, label }) => <td key={key} data-label={label}>{record[key] || "Not configured"}</td>)}<td data-label="Actions"><div className="gst-rate-actions"><button type="button" disabled={busy} onClick={() => setViewId(record._id)}>View</button><button type="button" disabled={busy} onClick={() => edit(record)}>Edit</button><button type="button" disabled={busy} onClick={() => remove(record)}>Delete</button></div></td></tr>)}</tbody></table>{!visible.length && <p className="admin-tool-empty">{search ? "No matching records." : `No ${definition.title.toLowerCase()} added yet.`}</p>}</div>}
    </section>
  </section>;
}
