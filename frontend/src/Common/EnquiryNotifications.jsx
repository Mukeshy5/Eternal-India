import { enquirySources } from "../../../shared/enquiries.js";
import { DashboardIcon } from "./AdminDashboard";
import "./UnifiedEnquiries.css";

export default function EnquiryNotifications({ notifications, onOpen }) {
  return <>
    <details className="enquiry-notification-menu"><summary aria-label={`${notifications.unread} unread enquiries`}><DashboardIcon name="bell" size={17} /><span>{notifications.unread}</span></summary><div><strong>Enquiry notifications</strong><p>{notifications.connected ? "Live updates connected" : "Reconnecting live updates · periodic refresh remains active"}</p><button type="button" className="dashboard-button" onClick={notifications.toggleSound}>{notifications.preferences.sound && notifications.soundReady ? "Mute notification sound" : "Enable notification sound"}</button><label><input type="checkbox" checked={notifications.preferences.popup} onChange={notifications.togglePopup} />Show enquiry alerts</label>{notifications.error && <p role="alert">{notifications.error}</p>}</div></details>
    <div className="enquiry-toasts" aria-live="polite" aria-label="New enquiry notifications">{notifications.toasts.map((event) => <article key={event.id}><div><span>{enquirySources[event.source] || "Website"} enquiry</span><strong>{event.name}</strong></div><button type="button" onClick={() => { onOpen(event.enquiryId); notifications.dismiss(event.id); }}>View enquiry</button><button type="button" aria-label="Dismiss enquiry notification" onClick={() => notifications.dismiss(event.id)}>×</button></article>)}</div>
  </>;
}
