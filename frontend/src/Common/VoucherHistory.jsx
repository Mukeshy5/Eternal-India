import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "./api";
import { VoucherPreview } from "./JourneyVoucher";
import VoucherPrintDocument from "./VoucherPrintDocument";
import { usePanelNavigationGuard } from "./panel/PanelNavigationContext";
import "./AdminTools.css";

export default function VoucherHistory({ apiBase, onUnauthorized }) {
  const [data, setData] = useState(null), [selected, setSelected] = useState(null), [search, setSearch] = useState(""), [query, setQuery] = useState(""), [page, setPage] = useState(1);
  const [error, setError] = useState(""), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [printing, setPrinting] = useState(false), [refresh, setRefresh] = useState(0);
  const printDocument = useRef(null);
  usePanelNavigationGuard(false, busy || printing);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true);
    api(`${apiBase}/vouchers?${new URLSearchParams({ page: String(page), search: query })}`, { signal: controller.signal }).then((result) => { if (!controller.signal.aborted) { setData(result); if (page > result.pages) setPage(result.pages); } }).catch((failure) => { if (!controller.signal.aborted) { setError(failure.message); if (failure.status === 401) onUnauthorized(); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [apiBase, page, query, refresh, onUnauthorized]);
  async function remove(voucher) {
    if (busy || !window.confirm(`Permanently delete voucher ${voucher.voucherNumber}?`)) return;
    setBusy(true); setError("");
    try { await api(`${apiBase}/vouchers/${voucher._id}`, { method: "DELETE" }); if (selected?._id === voucher._id) setSelected(null); setRefresh((value) => value + 1); }
    catch (failure) { setError(failure.message); if (failure.status === 401) onUnauthorized(); }
    finally { setBusy(false); }
  }
  async function print() {
    if (!printDocument.current || printing) return;
    setPrinting(true); setError("");
    try { await Promise.all([...printDocument.current.querySelectorAll("img")].map((img) => img.decode())); await document.fonts?.ready; window.print(); }
    catch { setError("The voucher artwork could not load. Retry after the images appear."); }
    finally { setPrinting(false); }
  }
  return <div className="admin-tools"><header className="admin-tools-heading"><div><span className="dashboard-section-label">OPERATIONS / SAVED JOURNEYS</span><h1>Journey Voucher History</h1><p>Find saved vouchers, view their itinerary or print another copy.</p></div></header>
    {error && <p className="admin-error" role="alert">{error}</p>}
    <form className="admin-tool-card admin-tool-actions" onSubmit={(event) => { event.preventDefault(); setQuery(search.trim()); setPage(1); }}><label className="admin-tool-field"><span>Search vouchers</span><input type="search" value={search} maxLength={120} placeholder="Guest, voucher number or departure" onChange={(event) => setSearch(event.target.value)} /></label><button className="dashboard-button" disabled={loading}>Search</button><button type="button" className="dashboard-button" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Refresh</button></form>
    <section className="admin-tool-card panel-records" aria-label="Saved journey vouchers">{loading ? <p role="status">Loading voucher history…</p> : <><p>{data?.total || 0} saved vouchers</p>{data?.vouchers.map((voucher) => <article className="panel-record-row" key={voucher._id}><div><strong>{voucher.billing.name}</strong><p>{voucher.voucherNumber} · {new Date(voucher.createdAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</p><p>{[voucher.journey.from, ...voucher.stops.map((stop) => stop.name)].join(" → ")}</p></div><div className="admin-tool-actions"><button className="dashboard-button" disabled={busy || printing} onClick={() => setSelected(voucher)}>View voucher</button><button className="dashboard-button dashboard-button-danger" disabled={busy || printing} onClick={() => remove(voucher)}>Delete</button></div></article>)}{data && <div className="admin-tool-actions"><button className="dashboard-button" disabled={page <= 1 || busy} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {data.page} of {data.pages}</span><button className="dashboard-button" disabled={page >= data.pages || busy} onClick={() => setPage((value) => value + 1)}>Next</button></div>}</>}</section>
    {selected && <section className="admin-tool-card panel-records"><div className="admin-tool-actions"><h2>{selected.voucherNumber}</h2><button className="dashboard-button dashboard-button-primary" disabled={printing} onClick={print}>{printing ? "Preparing…" : "Print / Save PDF"}</button><button className="dashboard-button" disabled={printing} onClick={() => setSelected(null)}>Close voucher</button></div><VoucherPreview voucher={selected} /></section>}
    {selected && createPortal(<div id="journey-voucher-print-root" ref={printDocument}><VoucherPrintDocument voucher={selected} /></div>, document.body)}
  </div>;
}
