export const enquirySources = { WEBSITE: "Direct Website", WHATSAPP: "WhatsApp", GMAIL: "Gmail" };
export const enquiryStatusLabels = { NEW: "New / Unread", IN_PROGRESS: "In Progress", RESOLVED: "Resolved", CLOSED: "Closed" };
export const enquirySorts = { newest: "Newest first", oldest: "Oldest first", updated: "Recently updated" };
export const legacyEnquiryStatuses = { new: "NEW", pending: "IN_PROGRESS", contacted: "IN_PROGRESS", confirmed: "RESOLVED", cancelled: "CLOSED", closed: "CLOSED" };
export const enquiryStatus = (value) => Object.hasOwn(enquiryStatusLabels, value) ? value : legacyEnquiryStatuses[value] || "";
