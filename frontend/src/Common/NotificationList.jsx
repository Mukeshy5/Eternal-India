import { DashboardIcon } from "./AdminDashboard";

function timeLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

export default function NotificationList({ items, notifications, onOpen }) {
  if (!items.length) return <p className="notification-empty">You’re all caught up.</p>;
  return <div className="notification-list">
    {items.map((item) => <article className={`notification-card${item.read ? " is-read" : " is-unread"}`} key={item.id}>
      <span className="notification-unread-dot" aria-hidden="true" />
      <div className="notification-card-content">
        <div className="notification-card-heading">
          <strong>{item.title}</strong>
          <time dateTime={item.createdAt}>{timeLabel(item.createdAt)}</time>
        </div>
        <span className="notification-category">{item.category}</span>
        <p>{item.message}</p>
        <div className="notification-card-actions">
          {item.enquiryId && <button type="button" onClick={() => { void notifications.markRead(item.id); onOpen?.(item.enquiryId); }}>View enquiry</button>}
          {!item.read && <button type="button" onClick={() => void notifications.markRead(item.id)}>Mark as read</button>}
          <button type="button" className="notification-delete-button" aria-label={`Delete notification: ${item.title}`} onClick={() => void notifications.remove(item.id)}>
            <DashboardIcon name="close" size={15} /> Delete
          </button>
        </div>
      </div>
    </article>)}
  </div>;
}
