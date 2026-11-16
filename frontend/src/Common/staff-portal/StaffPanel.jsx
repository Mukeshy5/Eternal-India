import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, apiUrl } from "../api";
import PanelLayout, { PanelErrorBoundary } from "../panel/PanelLayout";
import { PanelNavigationProvider, usePanelNavigation, usePanelNavigationGuard } from "../panel/PanelNavigationContext";
import JourneyBillingWorkspace from "../JourneyBillingWorkspace";
import InvoiceTemplate from "../invoices/InvoiceTemplate";
import { downloadVoucherFile, todayInIndia, voucherFile } from "../voucherClient";
import { enquiryStatusLabels } from "../../../../shared/enquiries.js";
import { attendanceStatuses } from "../../../../shared/staff.js";
import "../../Pages/Admin.css";
import "../invoices/Invoices.css";
import "./portal.css";

export const staffSections = {
  enquiries: { label: "All Enquiries", title: "Assigned Enquiries", group: "Workspace", icon: "inbox" },
  notifications: { label: "Notifications", title: "Notifications", group: "Workspace", icon: "bell" },
  vouchers: { label: "Journey Voucher", title: "Journey Voucher", group: "Journeys", icon: "calendar" },
  "voucher-history": { label: "Journey History", title: "Journey History", group: "Journeys", icon: "archive" },
  "id-card": { label: "Download ID Card", title: "My ID Card", group: "My account", icon: "people" },
  attendance: { label: "My Attendance History", title: "My Attendance History", group: "My account", icon: "clock" },
  invoices: { label: "Billing / Invoice", title: "Billing / Invoice", group: "Journeys", icon: "archive" },
  "change-password": { label: "Change Password", title: "Change Password", group: "My account", icon: "people" },
};
const rupees = (paise) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format((paise || 0) / 100);
const dateTime = (date) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(date));
export default function StaffPanel() { return <PanelNavigationProvider><Workspace /></PanelNavigationProvider>; }

function Workspace() {
  const navigate = useNavigate(), location = useLocation(), navigation = usePanelNavigation();
  const navigateRef = useRef(navigate); navigateRef.current = navigate;
  const [staff, setStaff] = useState(null), [checking, setChecking] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0), [connected, setConnected] = useState(false), [unread, setUnread] = useState(0), [toasts, setToasts] = useState([]);
  const path = location.pathname.replace(/\/+$/, ""), section = path === "/staff" ? "enquiries" : path.slice(7);
  const initialPath = useRef(path), lock = useRef(false);
  const unauthorized = useCallback((message) => { setStaff(null); setUnread(0); setNotice(typeof message === "string" ? message : "Your staff session expired or access was disabled. Please sign in again."); navigateRef.current("/staff/login", { replace: true }); }, []);
  const dismissToast = useCallback((id) => setToasts((current) => current.filter((item) => item.id !== id)), []);
  useEffect(() => {
    const controller = new AbortController();
    api("/staff/me", { signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return; setStaff(result.staff);
      if (initialPath.current === "/staff/login") navigateRef.current("/staff", { replace: true });
    }).catch((failure) => { if (!controller.signal.aborted) { if (failure.status !== 401) setError(failure.message); navigateRef.current("/staff/login", { replace: true }); } }).finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, []);
  const staffId = staff?.id;
  useEffect(() => {
    if (!staffId) return undefined;
    const controller = new AbortController(); let running = false, disposed = false;
    const load = async () => {
      if (running || disposed) return; running = true;
      try {
        const [profile, notifications] = await Promise.all([api("/staff/me", { signal: controller.signal }), api("/staff/notifications", { signal: controller.signal })]);
        if (!controller.signal.aborted) { setStaff(profile.staff); setUnread(notifications.unread); }
      } catch (failure) { if (!controller.signal.aborted && failure.status === 401) unauthorized(failure.message); }
      finally { running = false; }
    };
    void load(); const timer = window.setInterval(() => { void load(); }, 15000);
    const update = () => { if (disposed) return; setRefresh((value) => value + 1); window.dispatchEvent(new Event("journey-vouchers-changed")); window.dispatchEvent(new Event("journey-voucher-options-changed")); void load(); };
    let source;
    if (typeof EventSource !== "undefined") {
      source = new EventSource(apiUrl("/staff/events"), { withCredentials: true });
      source.onopen = () => setConnected(true);
      source.onerror = () => { if (!disposed) setConnected(false); };
      source.addEventListener("changed", update);
      source.addEventListener("revoked", () => { source.close(); unauthorized(); });
      source.addEventListener("notification:event", (event) => {
        if (disposed) return;
        try {
          const notification = JSON.parse(event.data);
          setToasts((current) => [notification, ...current].slice(0, 10));
          void load();
        } catch { /* ignore malformed notification events */ }
      });
    }
    const fallback = window.setInterval(() => { if (!document.hidden) update(); }, 30000);
    window.addEventListener("focus", update); window.addEventListener("online", update);
    return () => { disposed = true; controller.abort(); source?.close(); window.clearInterval(timer); window.clearInterval(fallback); window.removeEventListener("focus", update); window.removeEventListener("online", update); };
  }, [staffId, unauthorized]);
  function go(key) { if (!navigation.confirmNavigation()) return false; setError(""); navigate(key === "enquiries" ? "/staff" : `/staff/${key}`); return true; }
  async function login(credentials) {
    if (lock.current) return; lock.current = true; setBusy(true); setError(""); setNotice("");
    try { const result = await api("/staff/login", { method: "POST", body: JSON.stringify(credentials) }); setStaff(result.staff); navigate("/staff", { replace: true }); }
    catch (failure) { setError(failure.message); } finally { lock.current = false; setBusy(false); }
  }
  async function logout() {
    if (lock.current || !navigation.confirmNavigation()) return; lock.current = true; setBusy(true); setError("");
    try { await api("/staff/logout", { method: "POST", body: "{}" }); setStaff(null); setNotice("You have signed out."); navigate("/staff/login", { replace: true }); }
    catch (failure) { setError(failure.message); } finally { lock.current = false; setBusy(false); }
  }
  if (checking) return <section className="admin-checking"><h1>Staff Panel</h1><p role="status">Checking your staff session…</p></section>;
  if (!staff) return <StaffLogin busy={busy} error={error} notice={notice} onLogin={login} />;
  return <div className="admin-shell staff-shell"><PanelLayout staffPanel sections={staffSections} admin={staff} section={section} busy={busy} onNavigate={go} onLogout={logout} notifications={<button className="staff-notification-button" onClick={() => go("notifications")} aria-label={`${unread} unread notifications`}>Notifications <span>{unread}</span></button>}>
    <div className="staff-session-strip"><span>Welcome, <strong>{staff.name}</strong> · {staff.employeeId}</span><span className={connected ? "staff-live is-connected" : "staff-live"}>{connected ? "Live updates connected" : "Refreshing automatically"}</span></div>
    {error && <p className="staff-error" role="alert">{error}</p>}
    <PanelErrorBoundary key={section} onHome={() => go("enquiries")}>
      {section === "enquiries" ? <Enquiries refresh={refresh} onUnauthorized={unauthorized} /> : section === "notifications" ? <Notifications refresh={refresh} onUnauthorized={unauthorized} onChanged={() => setRefresh((value) => value + 1)} onOpen={() => go("enquiries")} /> : ["vouchers", "voucher-history"].includes(section) ? <JourneyBillingWorkspace key={section} apiBase="/staff" initialCreate={section === "vouchers"} onUnauthorized={unauthorized} /> : section === "attendance" ? <Attendance refresh={refresh} onUnauthorized={unauthorized} /> : section === "id-card" ? <IdCard staff={staff} refresh={refresh} onUnauthorized={unauthorized} /> : section === "invoices" ? <Invoices refresh={refresh} onUnauthorized={unauthorized} /> : section === "change-password" ? <PasswordForm onUnauthorized={unauthorized} onChanged={(message) => { setStaff(null); setNotice(message); navigate("/staff/login", { replace: true }); }} /> : <div className="staff-portal staff-surface"><h1>Section not found</h1><button onClick={() => go("enquiries")}>Open my enquiries</button></div>}
    </PanelErrorBoundary>
    {toasts.length > 0 && <div className="staff-toast-shell" role="status" aria-live="polite" aria-label="New notifications">{toasts.map((item) => <NotificationToast key={item.id} item={item} dismiss={dismissToast} />)}</div>}
  </PanelLayout></div>;
}

function StaffLogin({ busy, error, notice, onLogin }) {
  const [username, setUsername] = useState(""), [password, setPassword] = useState(""), [show, setShow] = useState(false);
  return <section className="admin-page staff-login"><header className="admin-header"><Link to="/"><img src="/logo.webp" alt="Eternal India" width="183" height="58" /></Link><span className="admin-header-label">Staff Panel</span><Link to="/">View website</Link></header>
    <div className="admin-login-layout"><div className="admin-login-story"><span className="admin-eyebrow">ETERNAL INDIA / OUR PEOPLE</span><h1>Your journeys.<br /><em>Your workspace.</em></h1><p>Keep your enquiries, journeys and personal staff records together in one secure place.</p><div className="admin-story-foot">Connected to your Eternal India team.</div></div>
      <form className="admin-login-form" onSubmit={(event) => { event.preventDefault(); onLogin({ username, password }); }}><span className="admin-eyebrow">STAFF PANEL</span><h2>Sign in to your workspace</h2><p>Use the username and password assigned by your Technical Panel administrator.</p>{error && <p className="staff-error" role="alert">{error}</p>}{notice && <p className="staff-success" role="status">{notice}</p>}
        <fieldset disabled={busy}><label htmlFor="staff-username">Username</label><input id="staff-username" name="username" required autoComplete="username" maxLength={32} value={username} onChange={(event) => setUsername(event.target.value)} /><label htmlFor="staff-password">Password</label><div className="admin-password-field"><input id="staff-password" name="password" required autoComplete="current-password" maxLength={256} type={show ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" onClick={() => setShow((value) => !value)}>{show ? "Hide" : "Show"}</button></div><button type="submit" className="admin-login-button">{busy ? "Signing in…" : "Sign in"}</button></fieldset>
        <p className="admin-login-note">Need access or a password reset? Contact your Technical Panel administrator.</p>
      </form>
    </div>
  </section>;
}

function NotificationToast({ item, dismiss }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => dismiss(item.id), 10000);
    return () => window.clearTimeout(timer);
  }, [item.id, dismiss, paused]);
  return <article onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} className="staff-notification-toast">
    <div><strong>{item.title}</strong><p>{item.message}</p></div>
    {item.enquiryId && <button type="button" onClick={() => { dismiss(item.id); return false; }}>View enquiries</button>}
    <button type="button" aria-label={`Dismiss notification: ${item.title}`} onClick={() => dismiss(item.id)}>×</button>
  </article>;
}

function useRecords(path, refresh, onUnauthorized) {
  const [data, setData] = useState(null), [error, setError] = useState(""), [loading, setLoading] = useState(true), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(""); setData(null);
    api(`/staff${path}`, { signal: controller.signal }).then((result) => { if (!controller.signal.aborted) setData(result); }).catch((failure) => { if (!controller.signal.aborted) { setError(failure.message); if (failure.status === 401) onUnauthorized?.(failure.message); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [path, refresh, retry, onUnauthorized]);
  return { data, error, loading, reload: () => setRetry((value) => value + 1) };
}
function LoadState({ state }) { return <>{state.loading && <p role="status">Loading records…</p>}{state.error && <p className="staff-error" role="alert">{state.error} <button onClick={state.reload}>Retry</button></p>}</>; }
function Pagination({ data, page, onPage, loading }) { return <div className="staff-pagination"><button disabled={loading || page <= 1} onClick={() => onPage(page - 1)}>Previous</button><span>{data?.total ?? "—"} records · Page {data?.page || page} of {data?.pages || 1}</span><button disabled={loading || page >= (data?.pages || 1)} onClick={() => onPage(page + 1)}>Next</button></div>; }
function Heading({ title, children }) { return <header className="staff-page-heading"><div><span className="staff-eyebrow">MY STAFF WORKSPACE</span><h1>{title}</h1><p>{children}</p></div></header>; }
function Search({ onSearch }) { const [value, setValue] = useState(""); return <form className="staff-fields" onSubmit={(event) => { event.preventDefault(); onSearch(value); }}><label>Search<input type="search" maxLength={120} value={value} onChange={(event) => setValue(event.target.value)} /></label><button>Search</button><button type="button" onClick={() => { setValue(""); onSearch(""); }}>Clear</button></form>; }
function useOperation(onUnauthorized) {
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), lock = useRef(false), controller = useRef(null);
  useEffect(() => () => controller.current?.abort(), []);
  const run = async (action) => {
    if (lock.current) return; lock.current = true; setBusy(true); setError(""); controller.current = new AbortController(); const signal = controller.current.signal;
    try { await action(signal); } catch (failure) { if (!signal.aborted) { setError(failure.message); if (failure.status === 401) onUnauthorized?.(failure.message); } }
    finally { lock.current = false; if (!signal.aborted) setBusy(false); }
  };
  return { error, busy, run };
}
function OperationState({ operation }) { usePanelNavigationGuard(false, operation.busy); return <>{operation.error && <p className="staff-error" role="alert">{operation.error}</p>}{operation.busy && <p role="status">Saving your request…</p>}</>; }

function Enquiries({ refresh, onUnauthorized }) {
  const [search, setSearch] = useState(""), [status, setStatus] = useState(""), [page, setPage] = useState(1), [revision, setRevision] = useState(0), [selected, setSelected] = useState(null), [notice, setNotice] = useState("");
  const state = useRecords(`/enquiries?${new URLSearchParams({ search, status, page })}`, `${refresh}:${revision}`, onUnauthorized), operation = useOperation(onUnauthorized);
  useEffect(() => { setSelected(null); }, [refresh]);
  return <section className="staff-portal"><Heading title="All Enquiries">View and manage enquiries assigned to you by your team.</Heading><section className="staff-surface"><Search onSearch={(value) => { setSearch(value); setPage(1); }} /><label className="staff-status-filter">Status <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option>{Object.entries(enquiryStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><LoadState state={state} /><OperationState operation={operation} />{notice && <p role="status" className="staff-success">{notice}</p>}
    <div className="staff-table-wrap"><table><thead><tr><th>Reference / guest</th><th>Contact</th><th>Destination</th><th>Status</th><th>Actions</th></tr></thead><tbody>{state.data?.enquiries.map((enquiry) => <tr key={enquiry._id}><td><strong>{enquiry.name}</strong><small>{enquiry.reference}</small></td><td>{enquiry.email}<small>{enquiry.phone}</small></td><td>{enquiry.destination || enquiry.subject}</td><td><form className="staff-actions" onSubmit={(event) => { event.preventDefault(); const value = new FormData(event.currentTarget).get("status"); void operation.run(async (signal) => { await api(`/staff/enquiries/${enquiry._id}`, { method: "PATCH", body: JSON.stringify({ status: value, revision: enquiry.revision }), signal }); if (!signal.aborted) { setNotice("Enquiry status updated."); setRevision((current) => current + 1); } }); }}><select aria-label={`Status for ${enquiry.reference}`} name="status" key={`${enquiry._id}:${enquiry.revision}`} defaultValue={enquiry.status}>{Object.entries(enquiryStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><button disabled={operation.busy}>Save</button></form></td><td><button disabled={operation.busy} onClick={() => void operation.run(async (signal) => { const result = await api(`/staff/enquiries/${enquiry._id}`, { signal }); if (!signal.aborted) setSelected(result.enquiry); })}>View details</button></td></tr>)}</tbody></table></div>
    {state.data?.total === 0 && <p className="staff-empty">No assigned enquiries match your filters.</p>}<Pagination {...{ data: state.data, page, onPage: setPage, loading: state.loading }} />
  </section>{selected && <article className="staff-surface"><div className="staff-section-heading"><h2>{selected.reference} · {selected.name}</h2><button onClick={() => setSelected(null)}>Close details</button></div><p>{selected.subject}</p><p>{selected.email} · {selected.phone}</p><p>{selected.destination}</p><p className="staff-message">{selected.message}</p></article>}</section>;
}

function Notifications({ refresh, onUnauthorized, onChanged, onOpen }) {
  const [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const state = useRecords(`/notifications?page=${page}`, `${refresh}:${revision}`, onUnauthorized), operation = useOperation(onUnauthorized);
  const mutate = (path, method) => void operation.run(async (signal) => { await api(`/staff/notifications${path}`, { method, body: method === "PATCH" ? "{}" : undefined, signal }); if (!signal.aborted) { setRevision((value) => value + 1); onChanged(); } });
  return <section className="staff-portal"><Heading title="Notifications">Your enquiry, attendance and account updates, saved in your workspace.</Heading><section className="staff-surface"><div className="staff-section-heading"><h2>{state.data?.unread ?? "—"} unread updates</h2><button disabled={operation.busy || !state.data?.unread} onClick={() => mutate("/read-all", "PATCH")}>Mark all as read</button></div><LoadState state={state} /><OperationState operation={operation} />
    {state.data?.notifications.map((item) => <article className={`staff-notification ${item.read ? "is-read" : ""}`} key={item._id}><div className="staff-section-heading"><strong>{item.title}</strong><time dateTime={item.createdAt}>{dateTime(item.createdAt)}</time></div><p>{item.message}</p><div className="staff-actions">{item.enquiryId && <button onClick={onOpen}>Open my enquiries</button>}{!item.read && <button disabled={operation.busy} onClick={() => mutate(`/${encodeURIComponent(item._id)}/read`, "PATCH")}>Mark as read</button>}<button disabled={operation.busy} onClick={() => mutate(`/${encodeURIComponent(item._id)}`, "DELETE")}>Dismiss</button></div></article>)}
    {state.data?.total === 0 && <p className="staff-empty">You’re all caught up. New updates will appear here automatically.</p>}<Pagination data={state.data} page={page} onPage={setPage} loading={state.loading} /></section></section>;
}

function Attendance({ refresh, onUnauthorized }) {
  const [from, setFrom] = useState(`${todayInIndia().slice(0, 7)}-01`), [to, setTo] = useState(todayInIndia()), [query, setQuery] = useState({ from, to }), [page, setPage] = useState(1);
  const state = useRecords(`/attendance?${new URLSearchParams({ ...query, page })}`, refresh, onUnauthorized);
  return <section className="staff-portal"><Heading title="My Attendance History">Your recorded attendance and working hours, maintained by your team.</Heading><section className="staff-surface"><form className="staff-fields" onSubmit={(event) => { event.preventDefault(); setQuery({ from, to }); setPage(1); }}><label>From<input type="date" required value={from} max={to} onChange={(event) => setFrom(event.target.value)} /></label><label>To<input type="date" required value={to} min={from} max={todayInIndia()} onChange={(event) => setTo(event.target.value)} /></label><button>View history</button></form><LoadState state={state} />
    <div className="staff-summary">{[["Recorded days", state.data?.summary.totalRecordedDays], ["Present", state.data?.summary.present], ["Absent", state.data?.summary.absent], ["Half days", state.data?.summary.half_day], ["Leave", state.data?.summary.leave], ["Working hours", state.data?.summary.totalWorkingHours]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value ?? "—"}</strong></div>)}</div>
    <div className="staff-table-wrap"><table><thead><tr><th>Date</th><th>Status</th><th>Check-in</th><th>Check-out</th><th>Hours</th><th>Remarks</th></tr></thead><tbody>{state.data?.records.map((record) => <tr key={record._id}><td>{record.date}</td><td>{attendanceStatuses[record.status] || record.status}</td><td>{record.checkIn || "—"}</td><td>{record.checkOut || "—"}</td><td>{(record.workingMinutes / 60).toFixed(2)}</td><td>{record.remarks || record.leaveType || "—"}</td></tr>)}</tbody></table></div>{state.data?.total === 0 && <p className="staff-empty">No attendance has been recorded for this period.</p>}<Pagination data={state.data} page={page} onPage={setPage} loading={state.loading} /></section></section>;
}

function IdCard({ staff, refresh, onUnauthorized }) {
  const [preview, setPreview] = useState(""), [error, setError] = useState(""), [loading, setLoading] = useState(true), [retry, setRetry] = useState(0), operation = useOperation(onUnauthorized);
  useEffect(() => {
    const controller = new AbortController(); let url; setError(""); setLoading(true); setPreview("");
    voucherFile("/staff/id-card/preview", controller.signal).then((blob) => { if (!controller.signal.aborted) { url = URL.createObjectURL(blob); setPreview(url); } }).catch((failure) => { if (!controller.signal.aborted) { setError(failure.message); if (failure.status === 401) onUnauthorized(failure.message); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [refresh, retry, onUnauthorized]);
  return <section className="staff-portal"><Heading title="Download ID Card">Your current employee ID card in a print-ready PDF.</Heading><section className="staff-surface staff-card-view"><div>{loading && <p role="status">Preparing your ID card…</p>}{error && <p role="alert" className="staff-error">{error} <button onClick={() => setRetry((value) => value + 1)}>Retry</button></p>}{preview && <img src={preview} alt={`Employee ID card for ${staff.name}`} />}</div><div><h2>{staff.name}</h2><p>{staff.designation} · {staff.department}</p><p>{staff.employeeId}</p><p>Print at 100% scale to preserve the ID card dimensions.</p><OperationState operation={operation} /><button className="staff-primary" disabled={operation.busy} onClick={() => void operation.run(async (signal) => { const blob = await voucherFile("/staff/id-card", signal); if (!signal.aborted) downloadVoucherFile(blob, `${staff.employeeId}-card.pdf`); })}>Download printable PDF</button></div></section></section>;
}

function Invoices({ refresh, onUnauthorized }) {
  const [search, setSearch] = useState(""), [page, setPage] = useState(1), [selected, setSelected] = useState(null), operation = useOperation(onUnauthorized);
  const state = useRecords(`/invoices?${new URLSearchParams({ search, page })}`, refresh, onUnauthorized);
  useEffect(() => { setSelected(null); }, [refresh]);
  return <section className="staff-portal"><Heading title="Billing / Invoice">View and download invoices authorized by your Technical Panel administrator.</Heading><section className="staff-surface"><Search onSearch={(value) => { setSearch(value); setPage(1); }} /><LoadState state={state} /><OperationState operation={operation} /><div className="staff-table-wrap"><table><thead><tr><th>Invoice</th><th>Date</th><th>Client</th><th>Amount</th><th>Actions</th></tr></thead><tbody>{state.data?.invoices.map((invoice) => <tr key={invoice._id}><td>{invoice.invoiceNumber}</td><td>{invoice.invoiceDate}</td><td>{invoice.clientName}</td><td>{rupees(invoice.totalPaise)}</td><td><div className="staff-actions"><button disabled={operation.busy} onClick={() => void operation.run(async (signal) => { const result = await api(`/staff/invoices/${invoice._id}`, { signal }); if (!signal.aborted) setSelected(result.invoice); })}>View invoice</button><button disabled={operation.busy} onClick={() => void operation.run(async (signal) => { const blob = await voucherFile(`/staff/invoices/${invoice._id}/pdf`, signal); if (!signal.aborted) downloadVoucherFile(blob, `${invoice.invoiceNumber}.pdf`); })}>Download PDF</button></div></td></tr>)}</tbody></table></div>{state.data?.total === 0 && <p className="staff-empty">No invoices have been authorized for your account.</p>}<Pagination data={state.data} page={page} onPage={setPage} loading={state.loading} /></section>{selected && <section className="staff-surface"><button onClick={() => setSelected(null)}>Close invoice</button><div className="staff-invoice-preview"><InvoiceTemplate invoice={selected} /></div></section>}</section>;
}

function PasswordForm({ onUnauthorized, onChanged }) {
  const [currentPassword, setCurrentPassword] = useState(""), [password, setPassword] = useState(""), [confirmPassword, setConfirmPassword] = useState(""), operation = useOperation(onUnauthorized);
  usePanelNavigationGuard(Boolean(currentPassword || password || confirmPassword), operation.busy);
  return <section className="staff-portal"><Heading title="Change Password">Choose a strong password. You will sign in again after saving.</Heading><form className="staff-surface staff-password-form" onSubmit={(event) => { event.preventDefault(); void operation.run(async (signal) => { const result = await api("/staff/change-password", { method: "POST", body: JSON.stringify({ currentPassword, password, confirmPassword }), signal }); if (!signal.aborted) onChanged(result.message); }); }}><OperationState operation={operation} /><fieldset disabled={operation.busy}><label>Current password<input type="password" autoComplete="current-password" required maxLength={256} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label><label>New password<input type="password" autoComplete="new-password" required minLength={12} maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} /><small>12+ characters, uppercase, lowercase, number and symbol.</small></label><label>Confirm new password<input type="password" autoComplete="new-password" required minLength={12} maxLength={256} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label><button className="staff-primary">{operation.busy ? "Updating…" : "Update password"}</button></fieldset></form></section>;
}
