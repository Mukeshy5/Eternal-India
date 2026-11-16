import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { enquirySources } from "../../../shared/enquiries.js";
import { DashboardIcon } from "./AdminDashboard";
import NotificationList from "./NotificationList";
import "./UnifiedEnquiries.css";

const notificationPopupDuration = 10000;
function NotificationToast({ item, notifications, onOpen }) {
  const [paused, setPaused] = useState(false);
  const dismiss = notifications.dismiss;
  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => dismiss(item.id), notificationPopupDuration);
    return () => window.clearTimeout(timer);
  }, [item.id, dismiss, paused]);
  return <article onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}>
    <div><span>{item.category || (item.enquiryId ? `${enquirySources[item.source] || "Website"} enquiry` : "Workspace update")}</span><strong>{item.title}</strong><p>{item.message}</p></div>
    {item.enquiryId && <button type="button" onClick={() => { if (onOpen?.(item.enquiryId) !== false) void notifications.markRead(item.id); }}>View enquiry</button>}
    <button type="button" aria-label={`Dismiss notification: ${item.title}`} onClick={() => dismiss(item.id)}>×</button>
  </article>;
}

export default function EnquiryNotifications({ notifications, onOpen, onOpenAll }) {
  const menu = useRef(null);
  useEffect(() => {
    const closeOutside = (event) => { if (!menu.current?.contains(event.target)) menu.current?.removeAttribute("open"); };
    const escape = (event) => { if (event.key === "Escape" && menu.current?.open) { menu.current.removeAttribute("open"); menu.current.querySelector("summary")?.focus(); } };
    document.addEventListener("pointerdown", closeOutside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", escape); };
  }, []);
  const open = (id) => { const result = onOpen?.(id); if (result !== false) menu.current?.removeAttribute("open"); return result; };
  function clearAll() {
    if (notifications.items.length && window.confirm("Clear your notification history in both panels? Other users keep their notifications.")) void notifications.clearAll();
  }
  return <>
    <details ref={menu} className="enquiry-notification-menu">
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
            onOpen={open}
          />
        </div>
        {notifications.hasMore && <button className="notification-load-more" type="button" disabled={notifications.loading} onClick={() => void notifications.loadMore()}>Load older</button>}
        <button className="notification-view-all" type="button" onClick={() => { if (onOpenAll?.() !== false) menu.current?.removeAttribute("open"); }}>View all notifications</button>
      </div>
    </details>
    {typeof document !== "undefined" && createPortal(<div className="admin-shell enquiry-toast-shell"><div className="enquiry-toasts" role="status" aria-live="polite" aria-relevant="additions" aria-label="New notifications">{notifications.toasts.map((item) => <NotificationToast key={item.id} item={item} notifications={notifications} onOpen={open} />)}</div></div>, document.body)}
  </>;
}
