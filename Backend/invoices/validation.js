import { calculateInvoice, invoiceNotes } from "../../shared/invoices.js";
import { billingError, validDate } from "../vouchers/validation.js";

export function validateInvoice(body) {
  const fields = {}, errors = {};
  for (const [key, limit, fallback] of [["clientName", 160, ""], ["recipientDetails", 4000, ""], ["description", 300, "Travel / Tour Services"], ["notes", 6000, invoiceNotes]]) {
    const value = body?.[key] ?? fallback;
    fields[key] = typeof value === "string" ? value.trim() : "";
    if (typeof value !== "string" || fields[key].length > limit || (["clientName", "description"].includes(key) && !fields[key])) errors[key] = `Enter ${key === "clientName" ? "a client name" : key} (up to ${limit} characters).`;
  }
  fields.invoiceDate = body?.invoiceDate;
  if (!validDate(fields.invoiceDate)) errors.invoiceDate = "Enter a valid date between 1900 and 2199.";
  fields.invoiceType = body?.invoiceType ?? "invoice";
  if (!["invoice", "tax_invoice"].includes(fields.invoiceType)) errors.invoiceType = "Choose Invoice or Tax Invoice.";
  const price = calculateInvoice(body?.totalPerson, body?.perPersonAmount);
  if (!price) {
    if (!calculateInvoice(body?.totalPerson, "1")) errors.totalPerson = "Enter a whole number of persons from 1 to 999999.";
    if (!calculateInvoice(1, body?.perPersonAmount)) errors.perPersonAmount = "Enter a positive rate up to INR 99,999,999.99 with up to two decimal places.";
    if (!errors.totalPerson && !errors.perPersonAmount) errors.perPersonAmount = "Total cannot exceed INR 9,999,999,999.99.";
  }
  if (Object.keys(errors).length) throw billingError("Check the highlighted invoice fields.", 400, errors);
  return { ...fields, ...price };
}

export function invoiceQuery(query) {
  const allowed = ["search", "invoiceNumber", "clientName", "date", "from", "to", "month", "year", "sort", "page", "pageSize"];
  if (Object.keys(query).some((key) => !allowed.includes(key))) throw billingError("Unknown invoice filter.");
  const value = (key, max = 160) => {
    if (query[key] === undefined) return "";
    if (typeof query[key] !== "string" || query[key].length > max) throw billingError(`Invalid ${key} filter.`);
    return query[key].trim();
  };
  const filter = {}, clauses = [], regex = (text) => ({ $regex: text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" });
  const search = value("search");
  if (search) clauses.push({ $or: ["invoiceNumber", "clientName"].map((key) => ({ [key]: regex(search) })) });
  for (const key of ["invoiceNumber", "clientName"]) { const text = value(key); if (text) filter[key] = regex(text); }
  const date = value("date"), from = value("from"), to = value("to"), month = value("month"), year = value("year");
  if (date && !validDate(date) || from && !validDate(from) || to && !validDate(to) || from && to && from > to) throw billingError("Choose a valid invoice date or date range.");
  if (year && !/^(19|20|21)\d{2}$/.test(year) || month && !/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw billingError("Choose a valid month or year between 1900 and 2199.");
  if (date) clauses.push({ invoiceDate: date });
  if (from || to) clauses.push({ invoiceDate: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } });
  if (month) clauses.push({ invoiceDate: { $gte: `${month}-01`, $lte: `${month}-31` } });
  if (year) clauses.push({ invoiceDate: { $gte: `${year}-01-01`, $lte: `${year}-12-31` } });
  if (clauses.length) filter.$and = clauses;
  const sort = value("sort") || "latest", page = Number(value("page") || 1), pageSize = Number(value("pageSize") || 20);
  if (!["latest", "oldest"].includes(sort) || !Number.isInteger(page) || page < 1 || page > 100000 || ![10, 20, 50, 100].includes(pageSize)) throw billingError("Choose a valid sort, page and page size.");
  return { filter, page, pageSize, direction: sort === "latest" ? -1 : 1 };
}
