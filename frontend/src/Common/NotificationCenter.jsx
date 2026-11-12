import { Eyebrow } from "./SiteUI";
import NotificationList from "./NotificationList";

export default function NotificationCenter({ notifications, onOpenEnquiry }) {
  function clearAll() {
    if (notifications.items.length && window.confirm("Clear all notifications? This removes them from both panels.")) {
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
    {notifications.error && <p className="notification-error" role="alert">{notifications.error}</p>}
    {notifications.loading && !notifications.items.length ? <p className="notification-empty" role="status">Loading notifications…</p> : <NotificationList items={notifications.items} notifications={notifications} onOpen={onOpenEnquiry} />}
    {notifications.hasMore && <button type="button" className="dashboard-button notification-load-more" disabled={notifications.loading} onClick={() => void notifications.loadMore()}>{notifications.loading ? "Loading…" : "Load more"}</button>}
  </section>;
}
