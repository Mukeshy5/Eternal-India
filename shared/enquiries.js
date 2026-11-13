export const enquirySources = { WEBSITE: "Direct Website", WHATSAPP: "WhatsApp", GMAIL: "Gmail" };
export const enquiryStatusLabels = { NEW: "New / Unread", PENDING: "Pending", IN_PROGRESS: "In Progress", FOLLOW_UP: "Follow-up", RESOLVED: "Completed", CANCELLED: "Cancelled", CLOSED: "Closed" };
export const enquirySorts = { newest: "Newest first", oldest: "Oldest first", status: "Status", updated: "Recently updated" };
export const enquiryKinds = { DIRECT: "Direct enquiry", WHATSAPP_LINK: "WhatsApp enquiry", EMAIL: "Email enquiry", CONTACT: "Contact enquiry", PLAN_TRIP: "Plan your trip" };
export function enquiryKind(entry) {
  if (entry.source === "WHATSAPP" || entry.source === "GMAIL") return entry.source;
  if (entry.contactChannel === "whatsapp") return "WHATSAPP_LINK";
  if (entry.contactChannel === "email") return "EMAIL";
  return ["CONTACT", "PLAN_TRIP"].includes(entry.enquiryKind) ? entry.enquiryKind : "DIRECT";
}
export const legacyEnquiryStatuses = { new: "NEW", pending: "IN_PROGRESS", contacted: "IN_PROGRESS", confirmed: "RESOLVED", cancelled: "CLOSED", closed: "CLOSED" };
export const enquiryStatus = (value) => Object.hasOwn(enquiryStatusLabels, value) ? value : legacyEnquiryStatuses[value] || "";
