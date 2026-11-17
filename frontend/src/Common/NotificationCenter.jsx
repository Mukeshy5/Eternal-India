import { useState } from "react";
import { Eyebrow } from "./SiteUI";
import NotificationList from "./NotificationList";

export default function NotificationCenter({ notifications, onOpenEnquiry }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  function clearAll() {
    if (notifications.items.length && window.confirm("Clear your notifications in both panels? Other users keep their notifications.")) {
      void notifications.clearAll();
    }
  }
  return <section className="notification-center" aria-labelledby="notification-center-heading">
    <header className="notification-center-heading">
      <div>
        <Eyebrow>Workspace updates</Eyebrow>
        <h1 id="notification-center-heading">Notifications</h1>
        <p>{notifications.unread} unread · Updates stay available across your panels.</p>
      </div>
      <div className="notification-center-actions">
        <button type="button" className="dashboard-button" disabled={!notifications.unread} onClick={() => void notifications.markAllRead()}>Mark all as read</button>
        <button type="button" className="dashboard-button" disabled={!notifications.items.length} onClick={clearAll}>Clear all</button>
      </div>
    </header>
    <form className="notification-history-filters" onSubmit={(event) => { event.preventDefault(); notifications.setFilters({ search: search.trim(), status }); }}>
      <label>Search notifications<input type="search" maxLength={120} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Title, category or message" /></label>
      <label>Read status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All notifications</option><option value="unread">Unread</option><option value="read">Read</option></select></label>
      <button type="submit" className="dashboard-button">Search</button>
      <button type="button" className="dashboard-button" onClick={() => { setSearch(""); setStatus("all"); notifications.setFilters({ search: "", status: "all" }); }}>Clear</button>
    </form>
    <div className="notification-preferences">
      <label><input type="checkbox" checked={notifications.preferences.sound} disabled={notifications.savingPreferences || notifications.loading} onChange={notifications.toggleSound} />Notification sound</label>
      <label><input type="checkbox" checked={notifications.preferences.popup} disabled={notifications.savingPreferences || notifications.loading} onChange={notifications.togglePopup} />Show popups</label>
      {notifications.preferences.sound && !notifications.soundReady && <button type="button" className="notification-enable-sound" onClick={notifications.unlockSound}>Enable sound in this browser</button>}
    </div>
    {notifications.soundNotice && <p role="status">{notifications.soundNotice}</p>}
    {notifications.error && <p className="notification-error" role="alert">{notifications.error}</p>}
    {notifications.loading && !notifications.items.length ? <p className="notification-empty" role="status">Loading notifications…</p> : <NotificationList items={notifications.items} notifications={notifications} onOpen={onOpenEnquiry} />}
    {notifications.hasMore && <button type="button" className="dashboard-button notification-load-more" disabled={notifications.loading} onClick={() => void notifications.loadMore()}>{notifications.loading ? "Loading…" : "Load more"}</button>}
  </section>;
}
