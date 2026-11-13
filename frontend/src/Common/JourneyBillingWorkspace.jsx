import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { usePanelNavigationGuard } from "./panel/PanelNavigationContext";
import VoucherEditor from "./VoucherEditor";
import BillingDocument from "./BillingDocument";
import VoucherPdfPreview from "./VoucherPdfPreview";
import { date, money, voucherFile, downloadVoucherFile, vouchersChanged } from "./voucherClient";
import "./JourneyBilling.css";

const emptyFilters = { search: "", invoiceNumber: "", guestName: "", hotelId: "", gstId: "", from: "", to: "", status: "" };
export default function JourneyBillingWorkspace({ apiBase = "/admin", initialCreate = false, onUnauthorized }) {
  const [editor, setEditor] = useState(initialCreate ? { key: crypto.randomUUID(), voucher: null } : null), [selected, setSelected] = useState(null);
  const [filters, setFilters] = useState(emptyFilters), [query, setQuery] = useState(emptyFilters), [page, setPage] = useState(1), [pageSize, setPageSize] = useState(20), [data, setData] = useState(null), [options, setOptions] = useState(null);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [refresh, setRefresh] = useState(0), [pdf, setPdf] = useState(null);
  const lock = useRef(false), alive = useRef(true), operation = useRef(null), detail = useRef(null), editorTop = useRef(null);
  usePanelNavigationGuard(false, busy || Boolean(pdf));
  useEffect(() => { alive.current = true; return () => { alive.current = false; operation.current?.abort(); }; }, []);
  const fail = useCallback((failure) => { if (!alive.current || failure.name === "AbortError") return; setError(failure.message || "The request failed. Please retry."); if (failure.status === 401) onUnauthorized?.(); }, [onUnauthorized]);
  useEffect(() => {
    const controller = new AbortController(); let inFlight = false;
    async function load() {
      if (inFlight) return; inFlight = true; setLoading(true);
      try {
        const params = new URLSearchParams({ ...query, page: String(page), pageSize: String(pageSize) });
        const [result, config] = await Promise.all([api(`${apiBase}/vouchers?${params}`, { signal: controller.signal }), api(`${apiBase}/vouchers/options`, { signal: controller.signal })]);
        if (!controller.signal.aborted) { setData(result); setOptions(config); if (page !== result.page) setPage(result.page); }
      } catch (failure) { if (!controller.signal.aborted) fail(failure); }
      finally { inFlight = false; if (!controller.signal.aborted) setLoading(false); }
    }
    const refreshHistory = () => { if (document.visibilityState !== "hidden") void load(); };
    void load(); const timer = window.setInterval(refreshHistory, 15000);
    window.addEventListener("focus", refreshHistory); window.addEventListener("journey-vouchers-changed", refreshHistory);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", refreshHistory); window.removeEventListener("journey-vouchers-changed", refreshHistory); };
  }, [apiBase, query, page, pageSize, refresh, fail]);
  async function run(action) {
    if (lock.current) return; lock.current = true; setBusy(true); setError("");
    const controller = new AbortController(); operation.current = controller;
    try { await action(controller.signal); } catch (failure) { if (!controller.signal.aborted) fail(failure); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  function open(voucher, edit = false) { return run(async (signal) => { const { voucher: saved } = await api(`${apiBase}/vouchers/${voucher._id}`, { signal }); if (signal.aborted) return; setNotice(""); if (edit) { setSelected(null); setEditor({ key: saved._id + saved.revision, voucher: saved }); window.setTimeout(() => editorTop.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); } else { setSelected(saved); window.setTimeout(() => detail.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); } }); }
  function remove(voucher) {
    if (lock.current || !window.confirm(`Permanently delete invoice #${voucher.invoiceNumber} for ${voucher.guestName}? This removes the saved voucher and cannot be undone.`)) return;
    void run(async (signal) => { await api(`${apiBase}/vouchers/${voucher._id}?revision=${voucher.revision}`, { method: "DELETE", signal }); if (signal.aborted) return; setSelected((current) => current?._id === voucher._id ? null : current); setNotice(`Invoice #${voucher.invoiceNumber} deleted.`); vouchersChanged(); setRefresh((value) => value + 1); });
  }
  function file(voucher, print = false) { return run(async (signal) => { const blob = await voucherFile(`${apiBase}/vouchers/${voucher._id}/pdf`, signal); if (signal.aborted) return; if (print) setPdf({ blob, invoiceNumber: voucher.invoiceNumber }); else downloadVoucherFile(blob, `journey-voucher-${voucher.invoiceNumber}.pdf`); }); }
  function exportHistory(format) { return run(async (signal) => { const params = new URLSearchParams({ ...query, format }); const blob = await voucherFile(`${apiBase}/vouchers/export?${params}`, signal); if (!signal.aborted) downloadVoucherFile(blob, `journey-voucher-history.${format}`); }); }
  const closePdf = useCallback(() => setPdf(null), []);
  function actions(voucher) { return <div className="billing-row-actions"><button type="button" disabled={busy || Boolean(editor)} onClick={() => open(voucher)}>View</button><button type="button" disabled={busy || Boolean(editor)} onClick={() => open(voucher, true)}>Edit</button><button type="button" disabled={busy || Boolean(editor)} onClick={() => file(voucher, true)}>Print</button><button type="button" disabled={busy || Boolean(editor)} onClick={() => file(voucher)}>Download PDF</button><button type="button" className="billing-danger" disabled={busy || Boolean(editor)} onClick={() => remove(voucher)}>Delete</button></div>; }
  const hotelChoices = [...new Map([...(options?.usedHotels || []), ...(options?.hotels || [])].map((item) => [item._id, item])).values()];
  const gstChoices = [...new Map([...(options?.usedGst || []), ...(options?.gstRates || []).filter((item) => item.gstNumber)].map((item) => [item._id, item])).values()];
  return <div className="billing-workspace">
    <header className="billing-heading"><div><span className="billing-eyebrow">OPERATIONS / JOURNEY BILLING</span><h1>{initialCreate ? "Journey Voucher" : "Journey Voucher History"}</h1><p>Create, manage and reprint your guest’s journey billing.</p></div><button type="button" className="billing-primary" disabled={busy || Boolean(editor)} onClick={() => { setSelected(null); setNotice(""); setEditor({ key: crypto.randomUUID(), voucher: null }); }}>+ Create new voucher</button></header>
    {error && <div role="alert" className="billing-error">{error}<button type="button" disabled={busy || loading} onClick={() => { setError(""); setRefresh((value) => value + 1); }}>Retry</button></div>}{notice && <p role="status" className="billing-success">{notice}</p>}{busy && <p role="status" className="billing-info">Preparing your request…</p>}
    {editor && <div ref={editorTop}><VoucherEditor key={editor.key} apiBase={apiBase} voucher={editor.voucher} onUnauthorized={onUnauthorized} onCancel={() => setEditor(null)} onSaved={(voucher) => { setEditor(null); setSelected(voucher); setNotice(`Invoice #${voucher.invoiceNumber} ${editor.voucher ? "updated" : "created"} successfully.`); setRefresh((value) => value + 1); }} /></div>}
    {selected && <section ref={detail} className="billing-detail" aria-label="Saved voucher details"><header><div><span className="billing-eyebrow">SAVED VOUCHER</span><h2>Invoice #{selected.invoiceNumber}</h2></div><button type="button" disabled={busy} onClick={() => setSelected(null)}>Close details</button></header>{actions(selected)}<BillingDocument voucher={selected} /></section>}
    <div className="billing-stats"><div><span>Total vouchers</span><strong>{data?.total ?? "—"}</strong><small>Matching current filters</small></div><div><span>Total billing amount</span><strong>{data ? money(data.totalBillingPaise) : "—"}</strong><small>Saved totals · all matching statuses</small></div><div><span>Document format</span><strong>A4 / INR</strong><small>Server generated print & PDF</small></div></div>
    <section className="billing-history"><header><div><span className="billing-eyebrow">VOUCHER REGISTER</span><h2>Saved journey vouchers</h2></div><div className="billing-actions"><button type="button" disabled={busy || loading || !data} onClick={() => exportHistory("xlsx")}>Export Excel</button><button type="button" disabled={busy || loading || !data} onClick={() => exportHistory("pdf")}>Export PDF</button></div></header>
      <form className="billing-filters" onSubmit={(event) => { event.preventDefault(); if (!event.currentTarget.reportValidity()) return; setQuery({ ...filters }); setPage(1); setError(""); }}>
        <label className="billing-field billing-search"><span>Search vouchers</span><input type="search" name="search" maxLength={160} placeholder="Search invoice number or guest name" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} /></label>
        <details><summary>Advanced filters</summary><div className="billing-filter-grid">
          {[['Invoice number', 'invoiceNumber'], ['Guest name', 'guestName']].map(([label, key]) => <label className="billing-field" key={key}><span>{label}</span><input name={key} maxLength={160} value={filters[key]} onChange={(event) => setFilters((current) => ({ ...current, [key]: event.target.value }))} /></label>)}
          <label className="billing-field"><span>Hotel</span><select name="hotelFilter" value={filters.hotelId} onChange={(event) => setFilters((current) => ({ ...current, hotelId: event.target.value }))}><option value="">All hotels</option>{hotelChoices.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
          <label className="billing-field"><span>GST number</span><select name="gstFilter" value={filters.gstId} onChange={(event) => setFilters((current) => ({ ...current, gstId: event.target.value }))}><option value="">All GST numbers</option>{gstChoices.map((item) => <option key={item._id} value={item._id}>{item.gstNumber}</option>)}</select></label>
          <label className="billing-field"><span>Voucher date from</span><input name="from" type="date" min="1900-01-01" max={filters.to || "2199-12-31"} value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} /></label>
          <label className="billing-field"><span>Voucher date to</span><input name="to" type="date" min={filters.from || "1900-01-01"} max="2199-12-31" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} /></label>
          <label className="billing-field"><span>Status</span><select name="statusFilter" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="">All statuses</option><option value="draft">Draft</option><option value="confirmed">Confirmed</option><option value="cancelled">Cancelled</option></select></label>
        </div></details><div className="billing-actions"><button type="submit" className="billing-primary" disabled={busy}>Apply filters</button><button type="button" disabled={busy} onClick={() => { setFilters(emptyFilters); setQuery(emptyFilters); setPage(1); setError(""); }}>Clear filters</button><button type="button" disabled={busy || loading} onClick={() => setRefresh((value) => value + 1)}>Refresh history</button></div>
      </form>
      <div className="billing-table-wrap" role="region" aria-label="Voucher history table" tabIndex={0} aria-busy={loading}><table className="billing-table"><thead><tr>{["Invoice number", "Voucher date", "Guest name", "Hotel name", "GST number", "Check-in", "Check-out", "Arrival place", "Departure place", "Total amount", "Status", "Actions"].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{data?.vouchers.map((v) => <tr key={v._id}><th scope="row">#{v.invoiceNumber}</th><td>{date(v.voucherDate)}</td><td>{v.guestName}</td><td>{v.hotel.name}</td><td>{v.gst.gstNumber}</td><td>{date(v.checkInDate)}</td><td>{date(v.checkOutDate)}</td><td>{v.arrivalPlace}</td><td>{v.departurePlace}</td><td className="billing-amount"><strong>{money(v.pricing.totalPaise)}</strong><small>Base {money(v.pricing.basePaise)}<br />GST {money(v.pricing.gstPaise)}</small></td><td><span className={`billing-status billing-status-${v.status}`}>{v.status}</span></td><td>{actions(v)}</td></tr>)}</tbody></table></div>
      {loading && <p className="billing-empty" role="status">Loading voucher history…</p>}{!loading && !data?.total && <div className="billing-empty"><h3>No vouchers found</h3><p>Create your first voucher or change the filters.</p></div>}
      {data && <footer className="billing-pagination"><span>{data.total} saved vouchers · Page {data.page} of {data.pages}</span><div className="billing-actions"><label>Rows <select aria-label="Rows per page" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select></label><button type="button" disabled={busy || loading || data.page <= 1} onClick={() => setPage(data.page - 1)}>Previous</button><button type="button" disabled={busy || loading || data.page >= data.pages} onClick={() => setPage(data.page + 1)}>Next</button></div></footer>}
    </section>
    {pdf && <VoucherPdfPreview {...pdf} onClose={closePdf} />}
  </div>;
}
