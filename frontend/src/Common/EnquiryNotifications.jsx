import { enquirySources } from "../../../shared/enquiries.js";
import { DashboardIcon } from "./AdminDashboard";
import NotificationList from "./NotificationList";
import "./UnifiedEnquiries.css";

export default function EnquiryNotifications({ notifications, onOpen, onOpenAll }) {
  function clearAll() {
    if (notifications.items.length && window.confirm("Clear your notification history in both panels? Other users keep their notifications.")) void notifications.clearAll();
  }
  return <>
    <details className="enquiry-notification-menu">
      <summary aria-label={`${notifications.unread} unread notifications`}>
        <DashboardIcon name="bell" size={18} />
        {notifications.unread > 0 && <span className="notification-badge">{notifications.unread > 99 ? "99+" : notifications.unread}</span>}
      </summary>
      <div className="enquiry-notification-dropdown">
        <div className="notification-dropdown-heading">
          <strong>Notifications</strong>
          <span>{notifications.connected ? "Live" : "Reconnecting"}</span>
        </div>
        <div className="notification-dropdown-actions">
          <button type="button" disabled={!notifications.unread} onClick={() => void notifications.markAllRead()}>Mark all as read</button>
          <button type="button" disabled={!notifications.items.length} onClick={clearAll}>Clear all</button>
        </div>
        <p role="status">{notifications.connected ? "Real-time updates are connected." : notifications.connectionNotice || "Updates will resume when you reconnect."}</p>
        <div className="notification-preferences">
          <label><input type="checkbox" disabled={notifications.savingPreferences || notifications.loading} checked={notifications.preferences.sound} onChange={() => void notifications.toggleSound()} />Notification sound</label>
          <label><input type="checkbox" disabled={notifications.savingPreferences || notifications.loading} checked={notifications.preferences.popup} onChange={notifications.togglePopup} />Show new-alert popups</label>
        </div>
        {notifications.preferences.sound && !notifications.soundReady && <button type="button" className="notification-enable-sound" onClick={notifications.unlockSound}>Enable sound in this browser</button>}
        {notifications.soundNotice && <p role="status">{notifications.soundNotice}</p>}
        {notifications.error && <p className="notification-error" role="alert">{notifications.error}</p>}
        {notifications.error && <button type="button" onClick={() => void notifications.refresh()}>Retry notifications</button>}
        <div className="notification-dropdown-list">
          <NotificationList
            items={notifications.items}
            notifications={notifications}
            onOpen={onOpen}
          />
        </div>
        {notifications.hasMore && <button className="notification-load-more" type="button" disabled={notifications.loading} onClick={() => void notifications.loadMore()}>Load older</button>}
        <button className="notification-view-all" type="button" onClick={onOpenAll}>View all notifications</button>
      </div>
    </details>
    <div className="enquiry-toasts" aria-live="polite" aria-label="New notifications">{notifications.toasts.map((event) => (
      <article key={event.id}>
        <div>
          <span>{event.enquiryId && event.source ? `${enquirySources[event.source] || event.source} enquiry` : event.category}</span>
          <strong>{event.title}</strong>
          <p>{event.message}</p>
        </div>
        {event.enquiryId && <button type="button" onClick={() => { void notifications.markRead(event.id); onOpen(event.enquiryId); notifications.dismiss(event.id); }}>View enquiry</button>}
        <button type="button" aria-label="Dismiss notification" onClick={() => notifications.dismiss(event.id)}>×</button>
      </article>
    ))}</div>
  </>;
}
