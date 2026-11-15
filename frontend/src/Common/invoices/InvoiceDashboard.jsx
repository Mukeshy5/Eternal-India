import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { voucherFile, downloadVoucherFile } from "../voucherClient";
import VoucherPdfPreview from "../VoucherPdfPreview";
import { invoiceMoney, invoiceDateLabel } from "../../../../shared/invoices.js";
import InvoiceForm from "./InvoiceForm";
import InvoiceTemplate from "./InvoiceTemplate";
import "../JourneyBilling.css";
import "./Invoices.css";

const defaults = { search: "", date: "", from: "", to: "", month: "", year: "", sort: "latest", page: 1, pageSize: 20 };
export default function InvoiceDashboard({ apiBase = "/admin", onUnauthorized }) {
  const [filters, setFilters] = useState(defaults), [search, setSearch] = useState(""), [refresh, setRefresh] = useState(0);
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState("");
  const [errors, setErrors] = useState({}), [editor, setEditor] = useState(null), [selected, setSelected] = useState(null), [preview, setPreview] = useState(null);
  const active = useRef(true), lock = useRef(false), controller = useRef(null), onAuth = useRef(onUnauthorized);
  useEffect(() => { onAuth.current = onUnauthorized; }, [onUnauthorized]);
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== "")).toString(), path = `${apiBase}/invoices`;
  const fail = useCallback((failure) => { setError(failure.message); setErrors(failure.errors || {}); if (failure.status === 401) onAuth.current?.(failure.message); }, []);
  useEffect(() => { active.current = true; return () => { active.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => { const timer = window.setTimeout(() => setFilters((old) => old.search === search.trim() ? old : { ...old, search: search.trim(), page: 1 }), 300); return () => window.clearTimeout(timer); }, [search]);
  useEffect(() => {
    const abort = new AbortController(); setLoading(true);
    api(`${path}?${query}`, { signal: abort.signal }).then((result) => { if (!abort.signal.aborted) { setData({ ...result, key: query }); setError(""); } }).catch((failure) => { if (!abort.signal.aborted) fail(failure); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [path, query, refresh, fail]);
  useEffect(() => {
    const update = () => setRefresh((value) => value + 1), visible = () => { if (!document.hidden) update(); };
    window.addEventListener("invoices-changed", update); window.addEventListener("focus", update); document.addEventListener("visibilitychange", visible);
    const timer = window.setInterval(visible, 30000);
    return () => { window.removeEventListener("invoices-changed", update); window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", visible); window.clearInterval(timer); };
  }, []);
  const selectedId = selected?._id;
  useEffect(() => {
    if (!selectedId || editor) return;
    const abort = new AbortController();
    api(`${path}/${selectedId}`, { signal: abort.signal }).then(({ invoice }) => { if (!abort.signal.aborted) setSelected(invoice); }).catch((failure) => { if (!abort.signal.aborted) { if (failure.status === 404) setSelected(null); fail(failure); } });
    return () => abort.abort();
  }, [path, selectedId, editor, refresh, fail]);
  async function perform(work) {
    if (lock.current) return; lock.current = true; setBusy(true); setError(""); setErrors({}); setSuccess("");
    const abort = new AbortController(); controller.current = abort;
    try { await work(abort.signal); } catch (failure) { if (active.current && !abort.signal.aborted) fail(failure); }
    finally { lock.current = false; if (active.current) setBusy(false); }
  }
  const changed = () => window.dispatchEvent(new window.Event("invoices-changed"));
  function save(body) {
    void perform(async (signal) => {
      const result = await api(editor?._id ? `${path}/${editor._id}` : path, { method: editor?._id ? "PUT" : "POST", body: JSON.stringify(body), signal });
      if (!active.current) return;
      setSelected(result.invoice); setEditor(null); setSuccess(editor?._id ? "Invoice updated successfully." : "Invoice saved successfully."); changed();
    });
  }
  function open(invoice, edit = false) {
    void perform(async (signal) => { const result = await api(`${path}/${invoice._id}`, { signal }); if (active.current) { setSelected(result.invoice); setEditor(edit ? result.invoice : null); } });
  }
  function remove(invoice) {
    if (!window.confirm(`Permanently delete invoice ${invoice.invoiceNumber} for ${invoice.clientName}? This cannot be undone.`)) return;
    void perform(async (signal) => { await api(`${path}/${invoice._id}`, { method: "DELETE", body: JSON.stringify({ version: invoice.version }), signal }); if (active.current) { setSelected(null); setSuccess("Invoice deleted successfully."); changed(); } });
  }
  function pdf(invoice, action) {
    void perform(async (signal) => { const blob = await voucherFile(`${path}/${invoice._id}/pdf`, signal); if (!active.current) return; if (action === "download") downloadVoucherFile(blob, `Invoice-${invoice.invoiceNumber}.pdf`); else setPreview({ blob, invoiceNumber: invoice.invoiceNumber }); });
  }
  const closePreview = useCallback(() => setPreview(null), []);
  const changeFilter = (event) => setFilters((old) => ({ ...old, [event.target.name]: event.target.value, page: 1 }));
  const rows = data?.key === query ? data.invoices : [], stats = data?.stats;
  function actions(invoice) { return <div className="invoice-row-actions"><button type="button" disabled={busy} onClick={() => open(invoice)}>View</button><button type="button" disabled={busy} onClick={() => open(invoice, true)}>Edit</button><button type="button" disabled={busy} onClick={() => pdf(invoice, "download")}>Download PDF</button><button type="button" disabled={busy} onClick={() => pdf(invoice, "preview")}>Print</button><button type="button" className="invoice-danger" disabled={busy} onClick={() => remove(invoice)}>Delete</button></div>; }
  return <section className="invoice-workspace">
    <header className="invoice-heading"><div><span className="invoice-eyebrow">ETERNAL INDIA · BILLING</span><h1>Billing / Invoice</h1><p>Create, manage and share professional invoices.</p></div>{!editor && <div className="invoice-actions"><button type="button" disabled={busy || loading} onClick={() => setRefresh((value) => value + 1)}>Refresh</button><button type="button" className="invoice-primary" disabled={busy} onClick={() => { setEditor({}); setSelected(null); setErrors({}); setError(""); setSuccess(""); }}>+ Create invoice</button></div>}</header>
    {error && <p className="invoice-error" role="alert">{error}</p>}{success && <p className="invoice-success" role="status">{success}</p>}
    {editor ? <InvoiceForm key={editor._id || "new"} invoice={editor._id ? editor : null} busy={busy} errors={errors} onSave={save} onCancel={() => { setEditor(null); setErrors({}); setError(""); }} /> : selected ? <section className="invoice-card invoice-detail"><header><div><h2>{selected.invoiceNumber}</h2><p>Created by {selected.createdBy.name} · Updated by {selected.updatedBy.name} · Version {selected.version}</p></div><button type="button" disabled={busy} onClick={() => setSelected(null)}>Back to invoices</button></header>{actions(selected)}<div className="invoice-actions invoice-detail-preview"><button type="button" disabled={busy} onClick={() => pdf(selected, "preview")}>PDF preview</button>{busy && <span role="status">Preparing invoice…</span>}</div><InvoiceTemplate invoice={selected} /></section> : <>
      <div className="invoice-stats">{[["Total invoices", stats?.total], ["Total invoice amount", stats ? invoiceMoney(stats.totalAmount) : undefined], ["Today's invoices", stats?.today], ["This month's invoices", stats?.month]].map(([label, value]) => <div className="invoice-card" key={label}><span>{label}</span><strong>{value ?? "—"}</strong><small>All saved invoices · India time</small></div>)}</div>
      <section className="invoice-card invoice-history" aria-busy={loading}><header><div><h2>Invoice register</h2><p>{data?.key === query ? `${data.total} matching invoice(s) · ${invoiceMoney(data.filteredAmount)}` : "Loading invoices…"}</p></div>{busy && <span role="status">Working…</span>}</header>
        <div className="invoice-filters"><label className="invoice-field invoice-search"><span>Search invoice number or client</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} maxLength={160} placeholder="Search invoices…" /></label><details><summary>Date filters &amp; sorting</summary><div className="invoice-filter-grid">{[["date", "Invoice date", "date"], ["from", "From", "date"], ["to", "To", "date"], ["month", "Month", "month"], ["year", "Year", "number"]].map(([name, label, type]) => <label className="invoice-field" key={name}><span>{label}</span><input name={name} type={type} value={filters[name]} onChange={changeFilter} {...(name === "year" ? { min: 1900, max: 2199, step: 1 } : {})} /></label>)}<label className="invoice-field"><span>Sort by invoice date</span><select name="sort" value={filters.sort} onChange={changeFilter}><option value="latest">Latest first</option><option value="oldest">Oldest first</option></select></label></div></details><button type="button" onClick={() => { setSearch(""); setFilters(defaults); }}>Clear filters</button></div>
        {loading && <p className="invoice-loading" role="status">Loading invoices…</p>}
        <div className="invoice-table-wrap"><table className="invoice-table"><thead><tr>{["Invoice number", "Invoice date", "Client name", "Total person", "Per person amount", "Total amount", "Created by", "Actions"].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{rows.map((invoice) => <tr key={invoice._id}><th scope="row">{invoice.invoiceNumber}</th><td>{invoiceDateLabel(invoice.invoiceDate)}</td><td>{invoice.clientName}</td><td>{invoice.totalPerson}</td><td className="invoice-money">{invoiceMoney(invoice.perPersonAmount)}</td><td className="invoice-money">{invoiceMoney(invoice.totalAmount)}</td><td>{invoice.createdBy.name}</td><td>{actions(invoice)}</td></tr>)}</tbody></table></div>
        {!loading && !rows.length && <div className="invoice-empty"><h3>{error ? "Invoices could not be loaded" : "No invoices found"}</h3><p>{error ? "Refresh to try again." : "Create an invoice or adjust your filters."}</p></div>}
        <footer className="invoice-pagination"><label>Rows per page <select name="pageSize" value={filters.pageSize} onChange={changeFilter}>{[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}</select></label><div className="invoice-actions"><button type="button" disabled={loading || (data?.page || 1) <= 1} onClick={() => setFilters((old) => ({ ...old, page: data.page - 1 }))}>Previous</button><span>Page {data?.page || 1} of {data?.pages || 1}</span><button type="button" disabled={loading || (data?.page || 1) >= (data?.pages || 1)} onClick={() => setFilters((old) => ({ ...old, page: data.page + 1 }))}>Next</button></div></footer>
      </section></>}
    {preview && <VoucherPdfPreview {...preview} onClose={closePreview} printLabel="Print invoice" filename={`Invoice-${preview.invoiceNumber}.pdf`} />}
  </section>;
}
