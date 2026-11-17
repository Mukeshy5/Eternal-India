import { ObjectId } from "mongodb";
import { panelActivity } from "./panel-activity.js";

const recordPaths = [
  { resource: "festival settings", collection: "", pattern: /^\/(?:festival-decorations|festival-schedules|decoration-effects|decoration-settings|decoration-history)(?:\/|$)/i },
  { resource: "data control", collection: "", pattern: /^\/data-control(?:\/|$)/i },
  { resource: "invoices", collection: "billing_invoices", pattern: /^\/invoices(?:\/([a-f\d]{24}))?/i },
  { resource: "invoices", collection: "billing_invoices", pattern: /^\/staff-accounts\/[a-f\d]{24}\/invoices\/([a-f\d]{24})/i },
  { resource: "journeys", collection: "journey_billing_vouchers", pattern: /^\/vouchers(?:\/([a-f\d]{24}))?/i },
  { resource: "enquiries", collection: "enquiries", pattern: /^\/enquiries(?:\/([a-f\d]{24}))?/i },
  { resource: "staff accounts", collection: "staff_accounts", pattern: /^\/staff-accounts(?:\/([a-f\d]{24}))?/i },
  { resource: "staff attendance", collection: "staff_attendance", pattern: /^\/staff-attendance(?:\/([a-f\d]{24}))?/i },
  { resource: "staff records", collection: "staff", pattern: /^\/staff(?:\/([a-f\d]{24}))?/i },
  { resource: "hotels", collection: "hotels", pattern: /^\/hotels(?:\/([a-f\d]{24}))?/i },
  { resource: "GST settings", collection: "gst_rates", pattern: /^\/gst(?:\/([a-f\d]{24}))?/i },
  { resource: "office addresses", collection: "office_addresses", pattern: /^\/office-addresses(?:\/([a-f\d]{24}))?/i },
  { resource: "employment letters", collection: "employment_letters", pattern: /^\/letters(?:\/([a-f\d]{24}))?/i },
];

const secretField = /password|secret|token|credential|session|cookie|salary|bank|accountnumber|ifsc|qr|hash|photo|image|file|binary|authorization|requestkey|originalpayload|submission|pendingevents/i;
const isObjectId = (value) => value instanceof ObjectId;
const toPlain = (value) => isObjectId(value) ? value.toString() : value;
const searchFields = ["actor.name", "actor.employeeId", "actor.email", "resource", "label", "action", "resourceId"];

function activityFilter({ filter = {}, search = "", resource = "" } = {}) {
  const clauses = [];
  if (Object.keys(filter).length) clauses.push(filter);
  if (resource) clauses.push({ resource });
  if (search) {
    const literal = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    clauses.push({ $or: searchFields.map((key) => ({ [key]: { $regex: literal, $options: "i" } })) });
  }
  return clauses.length > 1 ? { $and: clauses } : clauses[0] || {};
}

export function sanitizeActivityValue(value, depth = 0) {
  if (value === null || value === undefined || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (value instanceof Date) return value.toISOString();
  if (isObjectId(value)) return value.toString();
  if (depth >= 5) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 25).map((item) => sanitizeActivityValue(item, depth + 1));
  if (typeof value !== "object") return String(value);
  return Object.fromEntries(Object.entries(value).slice(0, 50)
    .filter(([key]) => !secretField.test(key))
    .map(([key, item]) => [key, sanitizeActivityValue(item, depth + 1)]));
}

function normalizedPath(req) {
  return req.originalUrl.split("?")[0]
    .replace(/^\/api\/(?:admin|technical|staff)(?=\/|$)/, "")
    .replace(/^\/api(?=\/|$)/, "") || "/";
}

function mutationInfo(req) {
  const path = normalizedPath(req), activity = panelActivity({ method: req.method, path, body: req.body });
  if (!activity) return null;
  for (const descriptor of recordPaths) {
    const match = path.match(descriptor.pattern);
    if (match) return { ...descriptor, id: match[1] || "", action: activity.action, label: activity.label, path };
  }
  return { resource: "workspace", collection: "", id: "", action: activity.action, label: activity.label, path };
}

function responseRecordId(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 4) return "";
  const id = value._id || (typeof value.id === "string" && /^[a-f\d]{24}$/i.test(value.id) ? value.id : "");
  if (id && /^[a-f\d]{24}$/i.test(toPlain(id))) return toPlain(id);
  for (const nested of Object.values(value)) {
    const found = responseRecordId(nested, depth + 1);
    if (found) return found;
  }
  return "";
}

export function createActivityLog(db, { onRecorded } = {}) {
  const collection = db.collection("panel_activity_history");
  const pendingWrites = new Set();
  let ready;
  const initialize = () => {
    ready ??= Promise.all([
      collection.createIndex({ createdAt: -1, _id: -1 }),
      collection.createIndex({ "actor.type": 1, "actor.id": 1, createdAt: -1 }),
      collection.createIndex({ resource: 1, createdAt: -1 }),
    ]);
    return ready;
  };
  async function captureBefore(req) {
    const info = req.activityMutation;
    if (!info?.collection || !info.id) return;
    req.activityBefore = await db.collection(info.collection).findOne({ _id: new ObjectId(info.id) });
  }
  function middleware(req, res, next) {
    if (req.activityMutation) return next();
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
    const info = mutationInfo(req);
    if (!info) return next();
    req.activityMutation = info;
    const json = res.json.bind(res);
    res.json = (body) => { req.activityResponse = body; return json(body); };
    res.once("finish", () => {
      if (res.statusCode < 200 || res.statusCode >= 300) return;
      const account = req.admin;
      const staffAccount = req.staffAccount;
      const employee = req.employee;
      if (!account && !staffAccount) return;
      const actor = account
        ? { type: "admin", id: account._id.toString(), name: account.name || account.email, email: account.email }
        : { type: "staff", id: staffAccount._id.toString(), staffId: employee?._id.toString(), employeeId: employee?.employeeId || "", name: employee?.name || "", email: employee?.email || "" };
      const panel = account ? (req.originalUrl.startsWith("/api/technical/") ? "technical" : "admin") : "staff";
      let write;
      write = record({
        info,
        actor,
        panel,
        before: req.activityBefore,
        response: req.activityResponse,
        body: req.body,
        statusCode: res.statusCode,
      }).then((entry) => onRecorded?.(entry))
        .catch((error) => console.error("Panel activity history could not be saved:", error.name))
        .finally(() => pendingWrites.delete(write));
      pendingWrites.add(write);
    });
    next();
  }
  async function record({ info, actor, panel, before = null, response = null, body = null, statusCode = 200 }) {
    await initialize();
    const id = info.id || responseRecordId(response);
    let updated = null;
    if (info.collection && id) {
      updated = await db.collection(info.collection).findOne({ _id: new ObjectId(id) });
    }
    if (!updated && !info.collection && body && Object.keys(body).length) updated = body;
    const entry = {
      actor,
      panel,
      action: info.action,
      resource: info.resource,
      label: info.label,
      resourceId: id,
      path: info.path,
      previous: sanitizeActivityValue(before),
      updated: sanitizeActivityValue(updated),
      statusCode,
      createdAt: new Date(),
    };
    const result = await collection.insertOne(entry);
    return { ...entry, _id: result.insertedId };
  }
  async function recordEvent({ actor, panel, action, resource = "session", resourceId = "", previous = null, updated = null }) {
    await initialize();
    const entry = { actor, panel, action, resource, resourceId, previous: sanitizeActivityValue(previous), updated: sanitizeActivityValue(updated), statusCode: 200, createdAt: new Date() };
    const result = await collection.insertOne(entry);
    const saved = { ...entry, _id: result.insertedId };
    await onRecorded?.(saved);
    return saved;
  }
  async function list({ filter = {}, search = "", resource = "", page = 1, pageSize = 25 } = {}) {
    await initialize();
    const query = activityFilter({ filter, search, resource });
    const [items, total] = await Promise.all([
      collection.find(query, { projection: { path: 0 } }).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
      collection.countDocuments(query),
    ]);
    return { activities: items, total, page, pages: Math.max(1, Math.ceil(total / pageSize)) };
  }
  async function remove(id, { filter = {} } = {}) {
    await initialize();
    const scoped = activityFilter({ filter });
    return collection.deleteOne(Object.keys(scoped).length ? { $and: [{ _id: id }, scoped] } : { _id: id });
  }
  async function removeMatching(options = {}) {
    await initialize();
    return collection.deleteMany(activityFilter(options));
  }
  async function drain() {
    while (pendingWrites.size) await Promise.all([...pendingWrites]);
  }
  return { initialize, middleware, captureBefore, recordEvent, list, remove, removeMatching, drain };
}

export function activityQuery(query = {}) {
  if (query.search !== undefined && (typeof query.search !== "string" || query.search.length > 120)) throw new Error("Enter a valid activity search of up to 120 characters.");
  if (query.resource !== undefined && typeof query.resource !== "string") throw new Error("Choose a valid activity category.");
  const search = (query.search || "").trim(), resource = query.resource || "";
  const resources = new Set(["", ...recordPaths.map((item) => item.resource), "workspace"]);
  const page = query.page === undefined ? 1 : typeof query.page === "string" && /^\d{1,6}$/.test(query.page) ? Number(query.page) : NaN;
  const pageSize = query.pageSize === undefined ? 25 : typeof query.pageSize === "string" && /^\d{1,3}$/.test(query.pageSize) ? Number(query.pageSize) : NaN;
  if (!resources.has(resource) || !Number.isInteger(page) || page < 1 || page > 100000 || ![10, 25, 50, 100].includes(pageSize)) throw new Error("Choose valid activity filters, page and page size.");
  return { search, resource, page, pageSize };
}
