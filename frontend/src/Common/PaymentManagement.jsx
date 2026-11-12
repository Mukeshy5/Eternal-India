import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { paymentMoney } from "./razorpay";
import "./PaymentManagement.css";

const statuses = ["PENDING", "CREATED", "AUTHORIZED", "PAID", "FAILED", "REFUNDED"];
const date = (value) => value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value)) : "—";
const Badge = ({ status }) => <span className={`payment-status-badge payment-badge-${status.toLowerCase()}`}>{status}</span>;
export default function PaymentManagement({ onUnauthorized }) {
  const [filters, setFilters] = useState({ search: "", status: "", from: "", to: "" }), [query, setQuery] = useState({ search: "", status: "", from: "", to: "", page: 1 });
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState(""), [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState(""), [detail, setDetail] = useState(null), [detailError, setDetailError] = useState("");
  const detailsHeading = useRef(null);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    api(`/admin/payments?${new URLSearchParams(query)}`, { signal: controller.signal }).then((result) => { if (!controller.signal.aborted) { setData(result); if (query.page > result.pages) setQuery((value) => ({ ...value, page: result.pages })); } }).catch((failure) => { if (!controller.signal.aborted) { setError(failure.message); if (failure.status === 401) onUnauthorized(); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, refresh, onUnauthorized]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController(); setDetail(null); setDetailError("");
    api(`/admin/payments/${selected}`, { signal: controller.signal }).then((result) => { if (!controller.signal.aborted) setDetail(result.payment); }).catch((failure) => { if (!controller.signal.aborted) { setDetailError(failure.message); if (failure.status === 401) onUnauthorized(); } });
    return () => controller.abort();
  }, [selected, refresh, onUnauthorized]);
  useEffect(() => { if (detail) detailsHeading.current?.focus(); }, [detail]);
  useEffect(() => {
    const reload = () => { if (!document.hidden) setRefresh((value) => value + 1); };
    const timer = window.setInterval(reload, 30000); window.addEventListener("focus", reload);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", reload); };
  }, []);
  const stats = data?.stats;
  return <section className="payment-management">
    <header className="payment-management-header"><div><span className="secure-kicker">PAYMENTS & RECONCILIATION</span><h1>Online Payments</h1><p>Verified Razorpay transactions · All amounts in INR · Dates in Asia/Kolkata</p></div><button className="dashboard-button" onClick={() => setRefresh((value) => value + 1)} disabled={loading}>Refresh payments</button></header>
    <div className="payment-statistics">{[["Successful payments", stats?.successful], ["Pending payments", stats?.pending], ["Failed payments", stats?.failed], ["Total collected", stats ? paymentMoney(stats.collectedAmount) : null]].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value ?? "—"}</strong></article>)}</div>
    <p className="payment-summary-note">Totals reflect the current filters. Successful includes refunded transactions. {stats && <>Refunded: {paymentMoney(stats.refundedAmount)} · Net collected: {paymentMoney(stats.collectedAmount - stats.refundedAmount)}</>}</p>
    <form className="payment-admin-filters" onSubmit={(event) => { event.preventDefault(); setSelected(""); setQuery({ ...filters, page: 1 }); }}>
      <label className="payment-search">Search transactions<input type="search" aria-label="Search payments" placeholder="Name, email, phone or transaction ID" maxLength={120} value={filters.search} onChange={(event) => setFilters((value) => ({ ...value, search: event.target.value }))} /></label>
      <label>Payment status<select value={filters.status} onChange={(event) => setFilters((value) => ({ ...value, status: event.target.value }))}><option value="">All statuses</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
      <label>From date<input type="date" value={filters.from} onChange={(event) => setFilters((value) => ({ ...value, from: event.target.value }))} /></label>
      <label>To date<input type="date" min={filters.from || undefined} value={filters.to} onChange={(event) => setFilters((value) => ({ ...value, to: event.target.value }))} /></label>
      <button className="dashboard-button dashboard-button-primary" type="submit" disabled={loading}>Apply filters</button>
      <button className="dashboard-button" type="button" onClick={() => { const empty = { search: "", status: "", from: "", to: "" }; setFilters(empty); setQuery({ ...empty, page: 1 }); setSelected(""); }}>Clear</button>
    </form>
    {error && <p className="admin-error" role="alert">{error}</p>}
    {loading && <p role="status">Loading transactions…</p>}
    <div className="payment-admin-table" aria-busy={loading}><table><caption>{data ? `${data.total} online payment${data.total === 1 ? "" : "s"}` : "Online payment transactions"}</caption><thead><tr>{["Customer", "Booking / Invoice", "Amount", "Razorpay references", "Method", "Transaction date", "Status", "Details"].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{(data?.payments || []).map((row) => <tr key={row._id}><td data-label="Customer"><strong>{row.customerName}</strong><span>{row.email}</span><span>{row.phone}</span></td><td data-label="Booking / Invoice">{row.bookingId || "—"}</td><td data-label="Amount"><strong>{paymentMoney(row.amount)}</strong>{row.refundStatus !== "NONE" && <span>Refund: {row.refundStatus} · {paymentMoney(row.refundedAmount)}</span>}</td><td data-label="Razorpay references" className="payment-reference-cell"><span>{row.razorpayOrderId || "Order pending"}</span><span>{row.razorpayPaymentId || "—"}</span><small>{row.receipt}</small></td><td data-label="Method">{row.paymentMethod || "—"}</td><td data-label="Transaction date">{date(row.transactionDate || row.createdAt)}</td><td data-label="Status"><Badge status={row.status} /><small>{row.mode === "test" ? "Test Mode" : "Live Mode"}</small></td><td data-label="Details"><button className="dashboard-button" type="button" aria-label={`View transaction ${row.receipt}`} onClick={() => setSelected(row._id)}>View</button></td></tr>)}{!loading && !data?.payments?.length && <tr><td colSpan={8}>No payments match these filters.</td></tr>}</tbody></table></div>
    <div className="payment-admin-pagination"><span>Page {data?.page || 1} of {data?.pages || 1}</span><button className="dashboard-button" disabled={loading || !data || data.page <= 1} onClick={() => setQuery((value) => ({ ...value, page: value.page - 1 }))}>Previous</button><button className="dashboard-button" disabled={loading || !data || data.page >= data.pages} onClick={() => setQuery((value) => ({ ...value, page: value.page + 1 }))}>Next</button></div>
    {selected && <section className="payment-admin-detail" aria-label="Transaction details"><header><h2 ref={detailsHeading} tabIndex={-1}>Transaction details</h2><button className="dashboard-button" type="button" onClick={() => { setSelected(""); setDetail(null); }}>Close details</button></header>{detailError ? <p role="alert">{detailError}</p> : !detail ? <p role="status">Loading transaction details…</p> : <>
      <Badge status={detail.status} /><dl>{[["Reference", detail.receipt], ["Customer", detail.customerName], ["Email", detail.email], ["Phone", detail.phone], ["Booking / Invoice ID", detail.bookingId], ["Purpose", detail.description], ["Amount", paymentMoney(detail.amount)], ["Currency", detail.currency], ["Razorpay order", detail.razorpayOrderId], ["Payment ID", detail.razorpayPaymentId], ["Payment method", detail.paymentMethod], ["Transaction date", date(detail.transactionDate)], ["Created", date(detail.createdAt)], ["Verified", date(detail.verifiedAt)], ["Failure reason", detail.failureReason], ["Refund status", detail.refundStatus], ["Refunded amount", paymentMoney(detail.refundedAmount)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "—"}</dd></div>)}</dl>
      <h3>Transaction history</h3><ol>{(detail.history || []).map((entry, index) => <li key={index}><Badge status={entry.status} /> <span>{date(entry.at)} · {entry.source}</span></li>)}</ol>
      <h3>Processed refunds</h3>{detail.refunds?.length ? <ul>{detail.refunds.map((refund) => <li key={refund.id}>{refund.id} · {paymentMoney(refund.amount)} · {refund.status} · {date(refund.processedAt)}</li>)}</ul> : <p>No processed refunds recorded. Refunds initiated in Razorpay are tracked here after confirmation.</p>}
    </>}</section>}
  </section>;
}
