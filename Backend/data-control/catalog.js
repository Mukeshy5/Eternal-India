import { BSON, ObjectId } from "mongodb";

export const CAPACITY = 500 * 1024 * 1024;
export const DAY = 86400000;
export const catalog = {
  enquiries: { label: "All Enquiries History", collection: "enquiries", date: "receivedAt", search: ["reference", "name", "customerName", "email", "phone", "subject", "message"], fields: ["reference", "name", "source", "status", "email", "receivedAt"], eligible: { archivedAt: { $type: "date" }, status: { $in: ["RESOLVED", "CLOSED", "CANCELLED"] }, "pendingEvents.0": { $exists: false } } },
  notifications: { label: "Notifications History", collection: "enquiry_events", date: "publishedAt", search: ["title", "message", "category", "source"], fields: ["title", "category", "source", "message", "publishedAt"], base: { type: "notification" }, eligible: { $or: [{ read: true }, { legacy: true }, { "readBy.0": { $exists: true } }] }, stringId: true },
  payments: { label: "Online Payment History", collection: "payments", date: "createdAt", search: ["receipt", "customerName", "email", "bookingId", "status"], fields: ["receipt", "customerName", "amount", "currency", "status", "createdAt"], protected: true },
  vouchers: { label: "Journey Voucher History", collection: "journey_billing_vouchers", date: "voucherDate", stringDate: true, search: ["invoiceNumber", "guestName", "guestPhone"], fields: ["invoiceNumber", "guestName", "voucherDate", "mealPlan"], protected: true },
  attendance: { label: "Staff Attendance Report History", collection: "staff_attendance", date: "date", stringDate: true, search: ["status", "remarks", "leaveType"], fields: ["staffId", "date", "status", "checkIn", "checkOut", "workingMinutes"], protected: true },
  invoices: { label: "Bill / Invoice History", collection: "billing_invoices", date: "invoiceDate", stringDate: true, search: ["invoiceNumber", "clientName", "description"], fields: ["invoiceNumber", "clientName", "invoiceDate", "totalAmount", "invoiceType"], protected: true },
};
// Explicit business allowlist. Authentication, OAuth credentials and live sessions never leave MongoDB.
export const businessCollections = [...new Set([
  ...Object.values(catalog).map(x => x.collection), "enquiry_history", "enquiry_deleted_submissions",
  "payment_webhook_events", "billing_counters", "invoice_requests", "journey_invoice_reservations",
  "hotels", "gst_rates", "office_addresses", "staff", "staff_settings", "employment_letters",
  "employment_letter_settings", "employment_letter_counters", "employment_letter_images",
  "tour_promotions", "offer_images", "festival_decorations", "festival_schedules", "decoration_assets",
  "decoration_effects", "decoration_settings", "decoration_activity",
])];
export const assetCollections = ["offer_images", "decoration_assets", "employment_letter_images", "staff", "employment_letters"];
export const fail = (status, message) => Object.assign(new Error(message), { status, publicMessage: true });
export const ejson = value => BSON.EJSON.stringify(value, { relaxed: false });
export const parse = value => BSON.EJSON.parse(value, { relaxed: false });
export const bytesOf = value => BSON.calculateObjectSize(value);
export function sectionFor(key) { if (!Object.hasOwn(catalog, key)) throw fail(400, "Choose a valid history section."); return catalog[key]; }
export function validDate(value) { const date = new Date(`${value}T00:00:00Z`); return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; }
export function buildFilter(key, input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(name => !["from", "to", "search", "status", "ids", "archived", "page", "pageSize"].includes(name))) throw fail(400, "Invalid record filter.");
  const section = sectionFor(key), clauses = [section.base || {}];
  for (const name of ["from", "to", "search", "status", "archived"]) if (input[name] !== undefined && typeof input[name] !== "string") throw fail(400, "Invalid filter value.");
  const { from, to, search, status, ids, archived } = input;
  if (from && !validDate(from) || to && !validDate(to) || from && to && from > to) throw fail(400, "Choose a valid date range.");
  if (from || to) clauses.push({ [section.date]: { ...(from ? { $gte: section.stringDate ? from : new Date(`${from}T00:00:00+05:30`) } : {}), ...(to ? section.stringDate ? { $lte: to } : { $lt: new Date(new Date(`${to}T00:00:00+05:30`).getTime() + DAY) } : {}) } });
  if (search) {
    if (search.length > 120) throw fail(400, "Search must be at most 120 characters.");
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    clauses.push({ $or: section.search.map(field => ({ [field]: { $regex: escaped, $options: "i" } })) });
  }
  if (status) { if (status.length > 60) throw fail(400, "Invalid status."); clauses.push({ status }); }
  if (archived) { if (!["true", "false"].includes(archived)) throw fail(400, "Invalid archive filter."); clauses.push({ dataControlArchivedAt: archived === "true" ? { $type: "date" } : { $exists: false } }); }
  if (ids !== undefined) {
    if (!Array.isArray(ids) || !ids.length || ids.length > 200 || ids.some(id => typeof id !== "string" || (section.stringId ? !/^notification:[\w:-]{1,200}$/.test(id) : !/^[a-f\d]{24}$/i.test(id)))) throw fail(400, "Select between 1 and 200 valid records.");
    clauses.push({ _id: { $in: ids.map(id => section.stringId ? id : new ObjectId(id)) } });
  }
  return { $and: clauses };
}
export function storageStatus(percent) { return percent >= 100 ? "critical" : percent >= 90 ? "red" : percent >= 80 ? "orange" : percent >= 60 ? "yellow" : "green"; }
export function publicRecord(record) {
  const clean = value => {
    if (value instanceof Date) return value.toISOString();
    if (value instanceof ObjectId) return value.toHexString();
    if (["Long", "Decimal128", "Int32", "Double"].includes(value?._bsontype)) return value.toString();
    if (Buffer.isBuffer(value) || value?._bsontype === "Binary") return `[binary: ${typeof value.length === "function" ? value.length() : value.length || value.byteLength || value.buffer?.length || 0} bytes]`;
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !/token|password|secret|authorization/i.test(key)).map(([key, item]) => [key, clean(item)]));
    return value;
  };
  return clean(record);
}
