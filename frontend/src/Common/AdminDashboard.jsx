import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "./AdminDashboard.css";

export const adminStatuses = { new: "New", pending: "Pending", confirmed: "Confirmed", cancelled: "Cancelled", contacted: "Contacted", closed: "Closed" };
const summaries = [
  { key: "total", label: "Total enquiries", hint: "Every journey starts here", icon: "inbox" },
  { key: "new", label: "New enquiries", hint: "Ready for a first reply", icon: "spark" },
  { key: "contacted", label: "In conversation", hint: "Guests you've connected with", icon: "chat" },
  { key: "closed", label: "Closed enquiries", hint: "Completed conversations", icon: "archive" },
];
const number = (value) => new Intl.NumberFormat("en-IN").format(value || 0);
const initials = (value = "") => value.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "G";
const dateLabel = (value, time = false) => {
  if (!value || Number.isNaN(new Date(value).getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", { ...(time ? { hour: "numeric", minute: "2-digit" } : { day: "numeric", month: "short", year: "numeric" }), timeZone: "Asia/Kolkata" }).format(new Date(value));
};

function DashboardIcon({ name = "inbox", size = 20, className = "" }) {
  const paths = {
    inbox: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M3 13h5l2 3h4l2-3h5M8 8h8" /></>,
    spark: <><path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3L12 3Z" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
    cancel: <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6m0-6-6 6" /></>,
    chat: <><path d="M21 11a8 8 0 0 1-8 8H8l-5 3V7a4 4 0 0 1 4-4h6a8 8 0 0 1 8 8Z" /><path d="M8 9h8M8 13h5" /></>,
    archive: <><rect x="3" y="3" width="18" height="5" rx="1" /><path d="M5 8v12h14V8M10 12h4" /></>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    diagonal: <path d="M6 18 18 6M6 6h12v12" />,
    left: <path d="m14 6-6 6 6 6" />,
    right: <path d="m10 6 6 6-6 6" />,
    down: <path d="m8 10 4 4 4-4" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    refresh: <><path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></>,
    logout: <><path d="M9 4H4v16h5M13 12h8m-4-4 4 4-4 4" /></>,
    pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z" /><circle cx="12" cy="10" r="2" /></>,
    people: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 5" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 11h18M8 15h2M14 15h2" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 6 9 7 9-7" /></>,
    phone: <path d="m7 3 3 5-2 2a15 15 0 0 0 6 6l2-2 5 3c-1 4-3 5-6 4C8 19 5 16 3 9 2 6 3 4 7 3Z" />,
  };
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.inbox}</svg>;
}

function StatusSelect({ entry, prefix = "status", updating, loading, onChange }) {
  const id = `${prefix}-${entry._id}`;
  return <div className={`dashboard-status dashboard-status-${entry.status}`}>
    <span className="dashboard-status-dot" aria-hidden="true" />
    <label className="admin-sr-only" htmlFor={id}>Status for {entry.name}</label>
    <select id={id} value={entry.status} disabled={updating === entry._id || loading} onChange={(event) => onChange(entry._id, event.target.value)}>
      {Object.entries(adminStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select><DashboardIcon name="down" size={14} />
  </div>;
}

function GuestAvatar({ name, large = false }) {
  return <span className={`dashboard-avatar dashboard-avatar-${(name?.charCodeAt(0) || 0) % 4}${large ? " dashboard-avatar-large" : ""}`} aria-hidden="true">{initials(name)}</span>;
}

function EnquiryDrawer({ entry, onClose, onUpdate, onDelete, updating, error }) {
  const dialog = useRef(null);
  useEffect(() => {
    const panel = dialog.current;
    const trigger = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.showModal();
    return () => {
      panel.close();
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  const phone = entry.phone?.replace(/[^+\d]/g, "");
  return <dialog ref={dialog} id="enquiry-details" className="dashboard-drawer" aria-labelledby="enquiry-detail-heading" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="dashboard-drawer-inner">
      <header className="dashboard-drawer-top"><span>Enquiry details</span><button className="dashboard-icon-button" type="button" aria-label="Close enquiry details" onClick={onClose}><DashboardIcon name="close" /></button></header>
      <div className="dashboard-drawer-content">
        <GuestAvatar name={entry.name} large />
        <span className="dashboard-reference">{entry.reference}</span>
        <h2 id="enquiry-detail-heading">{entry.name}</h2>
        <a className="dashboard-guest-email" href={`mailto:${entry.email}`}>{entry.email}</a>
        <div className="dashboard-drawer-status"><span>Enquiry status</span><StatusSelect entry={entry} prefix="detail-status" updating={updating} onChange={onUpdate} /></div>
        {error && <p className="admin-error" role="alert">{error}</p>}
        <section className="dashboard-trip-summary"><span className="dashboard-section-label">THE JOURNEY</span><h3><DashboardIcon name="pin" />{entry.destination}</h3><dl><div><dt><DashboardIcon name="people" size={16} />Travellers</dt><dd>{entry.travellers} {entry.travellers === 1 ? "person" : "people"}</dd></div><div><dt><DashboardIcon name="calendar" size={16} />Departure</dt><dd>{entry.date ? dateLabel(`${entry.date}T12:00:00+05:30`) : "Flexible dates"}</dd></div><div><dt>Preferred language</dt><dd>{entry.voiceLanguage === "hi" ? "Hindi" : "English"}</dd></div><div><dt>Received</dt><dd>{dateLabel(entry.createdAt)}<small>{dateLabel(entry.createdAt, true)} IST</small></dd></div></dl></section>
        <section className="dashboard-travel-notes"><span className="dashboard-section-label">TRAVEL IDEAS</span><p>{entry.message || "No additional travel details provided."}</p></section>
        <section className="dashboard-contact"><span className="dashboard-section-label">CONTACT DETAILS</span><a href={`mailto:${entry.email}`}><DashboardIcon name="mail" size={18} /><span><small>Email address</small>{entry.email}</span><DashboardIcon name="diagonal" size={15} /></a>{phone ? <a href={`tel:${phone}`}><DashboardIcon name="phone" size={18} /><span><small>Phone number</small>{entry.phone}</span><DashboardIcon name="diagonal" size={15} /></a> : <p>Phone number not provided.</p>}</section>
      </div>
      <footer className="dashboard-drawer-footer"><a className="dashboard-button dashboard-button-primary" href={`mailto:${entry.email}`}><DashboardIcon name="mail" size={17} />Email guest</a>{phone && <a className="dashboard-button" href={`tel:${phone}`}><DashboardIcon name="phone" size={17} />Call guest</a>}<button className="dashboard-button dashboard-button-danger" type="button" onClick={() => onDelete(entry._id)} disabled={updating === entry._id}>Delete</button></footer>
    </div>
  </dialog>;
}

export default function AdminDashboard({ technical = false, admin, data, loaded, loading, busy, updating, error, searchInput, search, status, page, lastUpdated, selected, onSearchInput, onSearch, onStatusFilter, onSelectStatus, onClearFilters, onPage, onOpen, onClose, onUpdate, onDelete, onRefresh, onLogout, onTool }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const viewButton = (entry) => <button className="dashboard-view dashboard-icon-button" type="button" aria-label={`View enquiry from ${entry.name}`} aria-haspopup="dialog" aria-controls="enquiry-details" onClick={() => onOpen(entry._id)}><DashboardIcon name="right" size={17} /></button>;
  const stats = data.stats;
  const count = (key) => loaded ? number(stats[key]) : "—";
  return <div className="dashboard-layout">
    <aside className="dashboard-sidebar" aria-label={technical ? "Technical workspace" : "Admin workspace"}>
      <div className="dashboard-brand"><Link to="/" aria-label="Eternal India home"><img src="/logo.webp" alt="Eternal India" width="183" height="58" /></Link><div className="dashboard-mobile-actions"><Link to="/" className="dashboard-icon-button" aria-label="View website"><DashboardIcon name="globe" size={19} /></Link><button className="dashboard-icon-button" type="button" aria-label="Sign out" onClick={onLogout} disabled={busy}><DashboardIcon name="logout" size={18} /></button></div></div>
      <div className="dashboard-workspace-label"><span className="dashboard-workspace-dot" />{technical ? "TECHNICAL WORKSPACE" : "ADMIN WORKSPACE"}</div>
      <button className="dashboard-mobile-menu" type="button" aria-expanded={menuOpen} aria-controls="admin-workspace-navigation" onClick={() => setMenuOpen((value) => !value)}><span>Workspace menu <strong>{adminStatuses[status] || "All enquiries"}</strong></span><DashboardIcon name={menuOpen ? "close" : "down"} size={19} /></button>
      <nav id="admin-workspace-navigation" className={`dashboard-status-navigation${menuOpen ? " dashboard-navigation-open" : ""}`} aria-label="Enquiry filters and tools" onClick={(event) => { if (event.target.closest("button")) { setMenuOpen(false); window.scrollTo({ top: 0, left: 0, behavior: "instant" }); } }}><span className="dashboard-nav-heading">ENQUIRIES</span>
        {[{ key: "", label: "All enquiries", icon: "inbox" }, ...Object.entries(adminStatuses).map(([key, label]) => ({ key, label, icon: { new: "spark", pending: "clock", confirmed: "check", contacted: "chat", cancelled: "cancel", closed: "archive" }[key] }))].map((item) => <button key={item.key} type="button" aria-current={status === item.key ? "true" : undefined} onClick={() => onSelectStatus(item.key)}><DashboardIcon name={item.icon} size={18} /><span>{item.label}</span><span className="dashboard-nav-count">{count(item.key || "total")}</span></button>)}
        <span className="dashboard-nav-heading dashboard-tools-heading">TOOLS</span>
        {admin.staffPermissions?.includes("view") && <>
          <button type="button" onClick={() => onTool("staff")}><DashboardIcon name="inbox" size={18} /><span>Staff Management</span></button>
          <button type="button" onClick={() => onTool("staff-attendance")}><DashboardIcon name="calendar" size={18} /><span>Staff Attendance</span></button>
          {admin.staffPermissions.includes("export") && <button type="button" onClick={() => onTool("staff-cards")}><DashboardIcon name="archive" size={18} /><span>Download ID Card</span></button>}
          <button type="button" onClick={() => onTool("staff-reports")}><DashboardIcon name="clock" size={18} /><span>Attendance Reports</span></button>
        </>}
        {technical && <button type="button" onClick={() => onTool("promotions")}><DashboardIcon name="spark" size={18} /><span>Tour amounts & offers</span></button>}
        {technical && <button type="button" onClick={() => onTool("festivals")}><DashboardIcon name="spark" size={18} /><span>Special Days & Festival Management</span></button>}
        <button type="button" onClick={() => onTool("hotels")}><DashboardIcon name="pin" size={18} /><span>Add hotel</span></button>
        <button type="button" onClick={() => onTool("vouchers")}><DashboardIcon name="calendar" size={18} /><span>Journey Voucher</span></button>
      </nav>
      <div className="dashboard-sidebar-bottom"><Link className="dashboard-form-link" to="/request-quote"><span className="dashboard-section-label">THE NEXT JOURNEY</span><strong>See the guest experience</strong><span>Open trip enquiry form<DashboardIcon name="diagonal" size={16} /></span></Link><div className="dashboard-sidebar-account"><span className="dashboard-account-avatar" aria-hidden="true">AD</span><div><strong>{technical ? "Technical administrator" : "Administrator"}</strong><span title={admin.email}>{admin.email}</span></div><button className="dashboard-sign-out dashboard-icon-button" type="button" aria-label="Sign out" title="Sign out" onClick={onLogout} disabled={busy}><DashboardIcon name="logout" size={18} /></button></div></div>
    </aside>
    <div className="dashboard-content">
      <header className="dashboard-topbar"><div><DashboardIcon name="inbox" size={18} /><span>Workspace</span><DashboardIcon name="right" size={12} /><strong>Enquiries</strong></div><div className="dashboard-topbar-actions">{!technical && <Link to="/technical">Technical panel<DashboardIcon name="diagonal" size={15} /></Link>}<Link to="/">View website<DashboardIcon name="diagonal" size={15} /></Link><button className="dashboard-button dashboard-sign-out-button" type="button" onClick={onLogout} disabled={busy}><DashboardIcon name="logout" size={16} />{busy ? "Signing out…" : "Sign out"}</button></div></header>
      <section className="dashboard-main" aria-labelledby="dashboard-heading">
        <header className="dashboard-page-heading"><div><span className="dashboard-section-label">A LITTLE ORGANISATION. A BETTER JOURNEY.</span><h1 id="dashboard-heading">Enquiry overview<span>.</span></h1><p>Keep every conversation moving towards a memorable trip.</p></div><button type="button" className="dashboard-button dashboard-refresh" disabled={loading} onClick={onRefresh}><DashboardIcon name="refresh" size={17} className={loading ? "dashboard-spin" : ""} />{loading ? "Refreshing…" : "Refresh"}</button></header>
        <div className="dashboard-stats" aria-label="Enquiry overview">{summaries.map((item) => <button key={item.key} type="button" className={`dashboard-stat dashboard-stat-${item.key}`} aria-pressed={status === (item.key === "total" ? "" : item.key)} disabled={!loaded} onClick={() => onSelectStatus(item.key === "total" ? "" : item.key)}><span className="dashboard-stat-top"><span>{item.label}</span><span className="dashboard-stat-icon"><DashboardIcon name={item.icon} size={18} /></span></span><strong>{count(item.key)}</strong><span className="dashboard-stat-hint">{item.hint}</span></button>)}</div>
        <section className="dashboard-inbox" aria-labelledby="inbox-heading">
          <div className="dashboard-inbox-heading"><div><h2 id="inbox-heading">Travel enquiries<span>{loaded ? number(data.total) : "—"}</span></h2><p>{status ? `${adminStatuses[status]} enquiries` : "All your guest requests, in one place."}</p></div><span className="dashboard-sync" role="status"><span className={loading ? "dashboard-sync-pending" : ""} />{loading ? "Fetching latest enquiries…" : lastUpdated ? `Updated ${dateLabel(lastUpdated, true)} IST` : "Not synced yet"}</span></div>
          <div className="dashboard-toolbar"><form className="dashboard-search" onSubmit={onSearch}><DashboardIcon name="search" size={18} /><label className="admin-sr-only" htmlFor="enquiry-search">Search enquiries</label><input id="enquiry-search" type="search" placeholder="Search guest, destination or reference…" maxLength={120} value={searchInput} onChange={(event) => onSearchInput(event.target.value)} /><button type="submit">Search</button></form><label className="dashboard-filter" htmlFor="enquiry-status"><span>Status</span><select id="enquiry-status" value={status} onChange={(event) => onStatusFilter(event.target.value)}><option value="">All statuses</option>{Object.entries(adminStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><DashboardIcon name="down" size={15} /></label></div>
          {(status || search) && <div className="dashboard-active-filters"><span>Showing{status ? ` ${adminStatuses[status].toLowerCase()}` : " all"} enquiries{search ? ` matching “${search}”` : ""}</span><button type="button" onClick={onClearFilters}>Clear filters<DashboardIcon name="close" size={13} /></button></div>}
          {error && !selected && <p className="admin-error dashboard-error" role="alert">{error}</p>}
          <div className="dashboard-desktop-list" aria-busy={loading}><table className="dashboard-table"><caption className="admin-sr-only">Travel enquiries submitted through Plan your trip</caption><thead><tr><th scope="col">Guest</th><th scope="col">Destination</th><th scope="col">Received</th><th scope="col">Status</th><th scope="col"><span className="admin-sr-only">View enquiry</span></th></tr></thead><tbody>{data.enquiries.map((entry) => <tr key={entry._id}><th scope="row"><div className="dashboard-guest"><GuestAvatar name={entry.name} /><div><strong>{entry.name}</strong><a href={`mailto:${entry.email}`}>{entry.email}</a><span className="dashboard-reference">{entry.reference}</span></div></div></th><td><div className="dashboard-destination"><DashboardIcon name="pin" size={15} /><strong>{entry.destination}</strong></div><span className="dashboard-trip-meta">{entry.travellers} {entry.travellers === 1 ? "traveller" : "travellers"} · {entry.date ? dateLabel(`${entry.date}T12:00:00+05:30`) : "Flexible dates"}</span></td><td><span className="dashboard-received-date">{dateLabel(entry.createdAt)}</span><span className="dashboard-received-time">{dateLabel(entry.createdAt, true)} IST</span></td><td><StatusSelect entry={entry} updating={updating} loading={loading} onChange={onUpdate} /></td><td>{viewButton(entry)}</td></tr>)}</tbody></table></div>
          <div className="dashboard-mobile-list" aria-busy={loading}>{data.enquiries.map((entry) => <article key={entry._id} className="dashboard-mobile-card"><div className="dashboard-mobile-card-top"><GuestAvatar name={entry.name} /><div><h3>{entry.name}</h3><a href={`mailto:${entry.email}`}>{entry.email}</a></div>{viewButton(entry)}</div><div className="dashboard-mobile-trip"><span className="dashboard-section-label">DESTINATION</span><strong><DashboardIcon name="pin" size={16} />{entry.destination}</strong><span>{entry.travellers} {entry.travellers === 1 ? "traveller" : "travellers"} · {entry.date ? dateLabel(`${entry.date}T12:00:00+05:30`) : "Flexible dates"}</span></div><div className="dashboard-mobile-card-bottom"><div><span className="dashboard-reference">{entry.reference}</span><span>{dateLabel(entry.createdAt)}</span></div><StatusSelect entry={entry} prefix="mobile-status" updating={updating} loading={loading} onChange={onUpdate} /></div></article>)}</div>
          {!data.enquiries.length && <div className="dashboard-empty" role={loading ? "status" : undefined}><span className={`dashboard-empty-icon${loading ? " dashboard-loading-icon" : ""}`}><DashboardIcon name={loading ? "refresh" : "inbox"} size={28} className={loading ? "dashboard-spin" : ""} /></span><h3>{loading ? "Bringing your enquiries together…" : error ? "Enquiries couldn't be loaded." : status || search ? "No matching enquiries." : "A new journey is on its way."}</h3><p>{loading ? "Your latest guest requests will be here in a moment." : error ? "Try refreshing your inbox to reconnect." : status || search ? "Try a different search or clear your filters." : "When a guest submits the trip form, their enquiry will appear here."}</p>{!loading && (error ? <button className="dashboard-button" type="button" onClick={onRefresh}>Try again<DashboardIcon name="refresh" size={16} /></button> : status || search ? <button className="dashboard-button" type="button" onClick={onClearFilters}>Clear filters</button> : <Link className="dashboard-button" to="/request-quote">View enquiry form<DashboardIcon name="diagonal" size={16} /></Link>)}</div>}
          <footer className="dashboard-pagination"><span>{loaded ? data.total ? <>Showing <strong>{(page - 1) * 20 + 1}–{Math.min(page * 20, data.total)}</strong> of <strong>{number(data.total)}</strong> enquiries</> : "No enquiries to display" : "Loading your inbox…"}</span><div><button type="button" aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => onPage(page - 1)}><DashboardIcon name="left" size={15} /><span>Previous</span></button><span>Page <strong>{page}</strong> of {data.pages}</span><button type="button" aria-label="Next page" disabled={page >= data.pages || loading} onClick={() => onPage(page + 1)}><span>Next</span><DashboardIcon name="right" size={15} /></button></div></footer>
        </section>
        <footer className="dashboard-footer"><span>Eternal India <span aria-hidden="true">/</span> {technical ? "Technical workspace" : "Admin workspace"}</span><span>Thoughtfully planned. Personally yours.</span></footer>
      </section>
    </div>
    {selected && <EnquiryDrawer entry={selected} onClose={onClose} onUpdate={onUpdate} onDelete={onDelete} updating={updating} error={error} />}
  </div>;
}
