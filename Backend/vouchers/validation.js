import { calculateVoucherPrice, voucherStatuses } from "../../shared/voucherBilling.js";
export const validObjectId = (value) => typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
export const validDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= "1900-01-01" && value <= "2199-12-31" && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export function billingError(message, status = 400, errors = {}) {
  return Object.assign(new Error(message), { publicMessage: true, status, details: { errors } });
}
export function validateVoucher(body) {
  const fields = {}, errors = {};
  for (const [key, max] of [["guestName", 160], ["requirement", 6000], ["arrivalPlace", 300], ["departurePlace", 300]]) {
    fields[key] = typeof body?.[key] === "string" ? body[key].trim() : "";
    if (!fields[key] || fields[key].length > max) errors[key] = `Enter ${key} (up to ${max} characters).`;
  }
  for (const key of ["voucherDate", "checkInDate", "checkOutDate", "arrivalDate", "departureDate"]) {
    fields[key] = body?.[key];
    if (!validDate(fields[key])) errors[key] = "Enter a valid date between 1900 and 2199.";
  }
  if (!errors.checkInDate && !errors.checkOutDate && fields.checkOutDate < fields.checkInDate) errors.checkOutDate = "Check-out cannot precede check-in.";
  if (!errors.arrivalDate && !errors.departureDate && fields.departureDate < fields.arrivalDate) errors.departureDate = "Departure cannot precede arrival.";
  for (const key of ["hotelId", "gstId"]) {
    fields[key] = body?.[key];
    if (!validObjectId(fields[key])) errors[key] = "Select a saved record.";
  }
  fields.status = body?.status ?? "confirmed";
  if (!voucherStatuses.includes(fields.status)) errors.status = "Choose a valid voucher status.";
  if (!calculateVoucherPrice(body?.basePrice, 0)) errors.basePrice = "Enter an amount from 0 to 99999999.99, with at most two decimal places.";
  if (Object.keys(errors).length) throw billingError("Check the highlighted voucher fields.", 400, errors);
  return fields;
}
export function voucherFilter(query) {
  const filter = {}, clauses = [];
  const allowed = new Set(["search", "invoiceNumber", "guestName", "hotelId", "gstId", "status", "from", "to", "page", "pageSize", "format"]);
  if (Object.keys(query).some((key) => !allowed.has(key))) throw billingError("Unknown voucher filter.");
  const text = (key, max = 160) => {
    if (query[key] === undefined || query[key] === "") return "";
    if (typeof query[key] !== "string" || query[key].length > max) throw billingError(`Invalid ${key} filter.`);
    return query[key].trim();
  };
  const pattern = (value) => ({ $regex: value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" });
  const search = text("search");
  if (search) clauses.push({ $or: ["invoiceNumber", "guestName"].map((key) => ({ [key]: pattern(search) })) });
  for (const key of ["invoiceNumber", "guestName"]) { const value = text(key); if (value) filter[key] = pattern(value); }
  for (const key of ["hotelId", "gstId"]) { const value = text(key); if (value) { if (!validObjectId(value)) throw billingError(`Invalid ${key} filter.`); filter[key] = value; } }
  const status = text("status");
  if (status) { if (!voucherStatuses.includes(status)) throw billingError("Invalid status filter."); filter.status = status; }
  const from = text("from"), to = text("to");
  if (from && !validDate(from) || to && !validDate(to) || from && to && from > to) throw billingError("Choose a valid voucher date range.");
  if (from || to) filter.voucherDate = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  if (clauses.length) filter.$and = clauses;
  return filter;
}
