import { Router } from "express";
import { ObjectId } from "mongodb";
import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { rateLimit } from "express-rate-limit";
import { hashPassword, verifyPassword } from "../lib/passwords.js";
import { technicalAccess } from "../festivals/permissions.js";
import { registerVoucherRoutes } from "../vouchers/routes.js";
import { voucherCollection } from "../vouchers/model.js";
import { invoiceCollection } from "../invoices/model.js";
import { registerInvoiceRoutes } from "../invoices/routes.js";
import { activityQuery } from "../lib/activity-log.js";
import { publicEnquiry } from "../enquiries/model.js";
import { enquiryError } from "../enquiries/service.js";
import { enquiryStatus } from "../../shared/enquiries.js";
import { indiaDate } from "../../shared/staff.js";
import { reportRange, summary } from "../staff/validation.js";
import { cardPdf } from "../staff/exports.js";
import { cardSvg } from "../staff/card.js";
import { authenticateStaff, publicStaff, staffCookie, staffJwt, staffPasswordValid } from "./auth.js";
import { ensureStaffPortalModels } from "./models.js";
import { publishStaffNotification } from "./notifications.js";
import { registerStaffLiveConnection, unregisterStaffLiveConnection, broadcastChanged } from "./livehub.js";
import { staffActivityFilter } from "./workspace.js";

const objectId = (value) => typeof value === "string" && /^[a-f\d]{24}$/i.test(value) ? new ObjectId(value) : null;
const usernameOf = (value) => typeof value === "string" ? value.trim().toLowerCase() : "";
const usernameValid = (value) => /^[a-z0-9][a-z0-9._-]{2,31}$/.test(value);
const regexOf = (value) => typeof value === "string" ? value.trim().slice(0, 120).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "";
const pageOf = (query) => Math.max(1, Math.min(100000, Number.parseInt(query.page, 10) || 1));
const safeEmployee = { _id: 1, employeeId: 1, name: 1, email: 1, phone: 1, department: 1, designation: 1, status: 1, joiningDate: 1 };
const accountProjection = { passwordHash: 0, authVersion: 0 };

export function registerStaffPortal({ app, management, db, config, requireAdmin, enquiries, activityLog, realtime }) {
  const router = Router(), accounts = db.collection("staff_accounts"), people = db.collection("staff"), tokens = db.collection("staff_tokens");
  let ready;
  const readiness = async (_req, _res, next) => { ready ??= ensureStaffPortalModels(db).catch((error) => { ready = undefined; throw error; }); await ready; next(); };
  const technical = [requireAdmin, (req, res, next) => {
    if (!req.originalUrl.startsWith("/api/technical/") || !technicalAccess(req.admin, config).technical) return res.status(403).json({ message: "Only Technical Panel administrators can manage Staff Login accounts." });
    next();
  }, readiness];
  const cookieOptions = { httpOnly: true, secure: config.production, sameSite: config.production ? "none" : "strict", path: "/api/staff", maxAge: 8 * 60 * 60 * 1000 };
  const staffNotificationFilter = (req) => ({ staffId: { $in: [req.employee._id, req.employee._id.toString()] } });
  const clearCookie = (res) => { const { maxAge: _max, ...options } = cookieOptions; res.clearCookie(staffCookie, options); };
  const audit = (req, action, account) => db.collection("staff_account_audit").insertOne({ action, accountId: account._id, staffId: account.staffId, actorId: req.admin._id, at: new Date() });
  const findAccount = async (id) => { const account = objectId(id) && await accounts.findOne({ _id: objectId(id) }); if (!account) throw enquiryError(404, "Staff Login account not found."); return account; };
  const checkVersion = (req, account) => { if (!Number.isInteger(req.body?.version) || req.body.version !== account.version) throw enquiryError(409, "This account changed. Refresh before saving."); };

  management.get("/staff-account-employee", ...technical, async (req, res) => {
    const employeeId = typeof req.query.employeeId === "string" ? req.query.employeeId.trim().toUpperCase() : "";
    if (!/^EI-[A-F0-9]{12}$/.test(employeeId)) throw enquiryError(400, "Enter a valid Employee ID from Staff Management.");
    const employee = await people.findOne({ employeeId, status: "active", deletedAt: null }, { projection: safeEmployee });
    if (!employee) throw enquiryError(404, "No active employee matches this Employee ID.");
    res.json({ employee, hasAccount: Boolean(await accounts.findOne({ staffId: employee._id }, { projection: { _id: 1 } })) });
  });
  management.post("/staff-credentials", ...technical, (_req, res) => res.json({ username: `staff.${randomBytes(6).toString("hex")}`, password: `Ei7!${randomBytes(18).toString("base64url")}` }));
  management.get("/staff-accounts", ...technical, async (req, res) => {
    const search = regexOf(req.query.search), page = pageOf(req.query);
    const filter = search ? { $or: ["employeeId", "username"].map((key) => ({ [key]: { $regex: search, $options: "i" } })) } : {};
    const [rows, total] = await Promise.all([accounts.find(filter, { projection: accountProjection }).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 20).limit(20).toArray(), accounts.countDocuments(filter)]);
    const employees = await people.find({ _id: { $in: rows.map((row) => row.staffId) } }, { projection: safeEmployee }).toArray();
    res.json({ accounts: rows.map((row) => ({ ...row, employee: employees.find((person) => person._id.equals(row.staffId)) || null })), page, pages: Math.max(1, Math.ceil(total / 20)), total });
  });
  management.post("/staff-accounts", ...technical, async (req, res) => {
    const employeeId = typeof req.body?.employeeId === "string" ? req.body.employeeId.trim().toUpperCase() : "", username = usernameOf(req.body?.username), password = req.body?.password;
    const errors = {};
    if (!/^EI-[A-F0-9]{12}$/.test(employeeId)) errors.employeeId = "Enter a valid Employee ID.";
    if (!usernameValid(username)) errors.username = "Use 3–32 letters, numbers, dots, underscores or hyphens.";
    if (!staffPasswordValid(password)) errors.password = "Use 12–256 characters with uppercase, lowercase, a number and a symbol.";
    if (Object.keys(errors).length) throw enquiryError(400, "Please check the account details.", { errors });
    const employee = await people.findOne({ employeeId, status: "active", deletedAt: null });
    if (!employee) throw enquiryError(400, "Only valid, active employees can receive an account.", { errors: { employeeId: "Active employee not found." } });
    const now = new Date(), record = { _id: new ObjectId(), staffId: employee._id, employeeId: employee.employeeId, username, usernameKey: username, passwordHash: await hashPassword(password), status: "active", canViewActivity: false, version: 1, authVersion: 1, createdAt: now, updatedAt: now, createdBy: req.admin._id };
    try { await accounts.insertOne(record); }
    catch (error) { if (error.code !== 11000) throw error; throw enquiryError(409, "This employee already has a Staff Login account, or the username is already taken."); }
    await audit(req, "created", record);
    await publishStaffNotification(db, { id: `account:${record._id}`, staffId: employee._id, title: "Welcome to your Staff Panel", message: "Your Technical Panel administrator has activated your staff workspace." });
    void broadcastChanged(employee._id.toString());
    res.status(201).json({ message: "Staff Login account created. Share the assigned credentials securely.", account: { _id: record._id, staffId: record.staffId, employeeId: record.employeeId, username, status: record.status, version: 1 } });
  });
  management.patch("/staff-accounts/:id", ...technical, async (req, res) => {
    const account = await findAccount(req.params.id); checkVersion(req, account);
    if (!req.body || Object.keys(req.body).some((key) => !["version", "status", "password", "canViewActivity"].includes(key)) || req.body.status === undefined && req.body.password === undefined && req.body.canViewActivity === undefined) throw enquiryError(400, "Choose an account status, new password or activity-history permission.");
    if (req.body.canViewActivity !== undefined && typeof req.body.canViewActivity !== "boolean") throw enquiryError(400, "Choose a valid activity-history permission.");
    const set = { updatedAt: new Date(), updatedBy: req.admin._id };
    if (req.body.status !== undefined) {
      if (!["active", "inactive"].includes(req.body.status)) throw enquiryError(400, "Choose Active or Inactive.");
      if (req.body.status === "active" && !await people.findOne({ _id: account.staffId, employeeId: account.employeeId, status: "active", deletedAt: null })) throw enquiryError(400, "Activate the employee in Staff Management first.");
      set.status = req.body.status;
    }
    if (req.body.password !== undefined) { if (!staffPasswordValid(req.body.password)) throw enquiryError(400, "Use 12–256 characters with uppercase, lowercase, a number and a symbol."); set.passwordHash = await hashPassword(req.body.password); }
    if (req.body.canViewActivity !== undefined) set.canViewActivity = req.body.canViewActivity;
    const revokeSessions = req.body.status !== undefined || req.body.password !== undefined;
    const saved = await accounts.findOneAndUpdate({ _id: account._id, version: account.version }, { $set: set, $inc: { version: 1, ...(revokeSessions ? { authVersion: 1 } : {}) } }, { returnDocument: "after", projection: accountProjection });
    if (!saved) throw enquiryError(409, "This account changed. Refresh before saving.");
    if (revokeSessions) await tokens.deleteMany({ accountId: account._id });
    await audit(req, "updated", account);
    if (req.body.canViewActivity !== undefined) void broadcastChanged(account.staffId.toString());
    res.json({ message: "Staff Login updated. Existing sessions have been revoked.", account: saved });
  });
  management.delete("/staff-accounts/:id", ...technical, async (req, res) => {
    const account = await findAccount(req.params.id); checkVersion(req, account);
    if (!(await accounts.deleteOne({ _id: account._id, version: account.version })).deletedCount) throw enquiryError(409, "This account changed. Refresh before deleting.");
    await tokens.deleteMany({ accountId: account._id }); await audit(req, "deleted", account);
    res.sendStatus(204);
  });
  management.get("/staff-invoice-options", ...technical, async (req, res) => {
    const search = regexOf(req.query.search);
    const filter = search ? { $or: ["invoiceNumber", "clientName"].map((key) => ({ [key]: { $regex: search, $options: "i" } })) } : {};
    res.json({ invoices: await db.collection(invoiceCollection).find(filter, { projection: { invoiceNumber: 1, clientName: 1, invoiceDate: 1, authorizedStaffIds: 1 } }).sort({ invoiceDate: -1, _id: -1 }).limit(50).toArray() });
  });
  management.get("/staff-accounts/:id/invoices", ...technical, async (req, res) => {
    const account = await findAccount(req.params.id);
    res.json({ invoices: await db.collection(invoiceCollection).find({ authorizedStaffIds: account.staffId.toString() }, { projection: { invoiceNumber: 1, clientName: 1 } }).sort({ invoiceDate: -1 }).limit(500).toArray() });
  });
  management.patch("/staff-accounts/:id/invoices/:invoiceId", ...technical, async (req, res) => {
    const account = await findAccount(req.params.id), invoiceId = objectId(req.params.invoiceId);
    if (!invoiceId || typeof req.body?.authorized !== "boolean") throw enquiryError(400, "Choose an invoice and a valid alert setting.");
    const invoice = await db.collection(invoiceCollection).findOneAndUpdate({ _id: invoiceId }, { [req.body.authorized ? "$addToSet" : "$pull"]: { authorizedStaffIds: account.staffId.toString() }, $set: { updatedAt: new Date() }, $inc: { version: 1 } }, { returnDocument: "after" });
    if (!invoice) throw enquiryError(404, "Invoice not found.");
    await audit(req, `invoice-${req.body.authorized ? "granted" : "revoked"}:${invoiceId}`, account);
    await publishStaffNotification(db, { id: `invoice:${invoiceId}:${account.staffId}:${invoice.version}`, staffId: account.staffId, title: "Invoice alerts updated", message: `${invoice.invoiceNumber}: update alerts ${req.body.authorized ? "enabled" : "disabled"} by the Technical Panel.` });
    void broadcastChanged(account.staffId.toString());
    res.json({ message: "Invoice update alerts changed." });
  });

  const loginLimit = rateLimit({ windowMs: 15 * 60000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false, skipSuccessfulRequests: true, message: { message: "Too many login attempts. Please try again in 15 minutes." } });
  const socketTicketLimit = rateLimit({ windowMs: 60000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false, message: { message: "Please wait before reconnecting live notifications." } });
  router.use(readiness);
  router.use(activityLog.middleware);
  router.post("/login", loginLimit, async (req, res) => {
    const username = usernameOf(req.body?.username), password = req.body?.password;
    if (!usernameValid(username) || typeof password !== "string" || password.length > 256 || !password) throw enquiryError(401, "Username or password is incorrect, or the account is inactive.");
    const account = await accounts.findOne({ usernameKey: username });
    // Do equivalent hashing work for unknown usernames to avoid a timing oracle.
    const valid = account ? await verifyPassword(password, account.passwordHash) : (await hashPassword(password), false);
    const employee = account && await people.findOne({ _id: account.staffId, employeeId: account.employeeId, status: "active", deletedAt: null }, { projection: safeEmployee });
    if (!valid || account?.status !== "active" || !employee) throw enquiryError(401, "Username or password is incorrect, or the account is inactive.");
    const now = new Date(), tokenId = randomBytes(24).toString("hex"), expiresAt = new Date(now.getTime() + cookieOptions.maxAge);
    const token = jwt.sign({ role: "staff", version: account.authVersion }, config.authTokenSecret, { algorithm: "HS256", issuer: staffJwt.issuer, audience: staffJwt.audience, subject: account._id.toString(), jwtid: tokenId, expiresIn: "8h" });
    await tokens.insertOne({ _id: tokenId, accountId: account._id, authVersion: account.authVersion, createdAt: now, expiresAt });
    // Check again after credential verification in case an administrator revoked access.
    if (!await authenticateStaff({ db, config, token })) { await tokens.deleteOne({ _id: tokenId }); throw enquiryError(401, "Account access changed. Please sign in again."); }
    const previous = await authenticateStaff({ db, config, token: req.cookies?.[staffCookie] });
    if (previous) await tokens.deleteOne({ _id: previous.claims.jti });
    await activityLog.recordEvent({ actor: { type: "staff", id: account._id.toString(), staffId: employee._id.toString(), employeeId: employee.employeeId, name: employee.name, email: employee.email }, panel: "staff", action: "logged in" });
    res.cookie(staffCookie, token, cookieOptions).json({ staff: publicStaff(account, employee) });
  });
  async function requireStaff(req, res, next) {
    const auth = await authenticateStaff({ db, config, token: req.cookies?.[staffCookie] });
    if (req.aborted || res.destroyed) return;
    if (!auth) { clearCookie(res); return res.status(401).json({ message: "Your staff session expired or access was disabled. Please sign in again." }); }
    req.staffAccount = auth.account; req.employee = auth.employee; req.staffClaims = auth.claims;
    await activityLog.captureBefore(req);
    next();
  }
  router.post("/logout", async (req, res) => {
    const auth = await authenticateStaff({ db, config, token: req.cookies?.[staffCookie] });
    let claims; try { claims = jwt.verify(req.cookies?.[staffCookie] || "", config.authTokenSecret, staffJwt); } catch { /* Already expired. */ }
    if (claims?.jti) await tokens.deleteOne({ _id: claims.jti });
    if (auth) await activityLog.recordEvent({ actor: { type: "staff", id: auth.account._id.toString(), staffId: auth.employee._id.toString(), employeeId: auth.employee.employeeId, name: auth.employee.name, email: auth.employee.email }, panel: "staff", action: "logged out" });
    clearCookie(res); res.sendStatus(204);
  });
  router.get("/me", requireStaff, (req, res) => res.json({ staff: publicStaff(req.staffAccount, req.employee) }));
  router.post("/socket-ticket", socketTicketLimit, requireStaff, async (req, res) => {
    res.json({ ticket: await realtime.issueTicket("staff", req.staffAccount._id.toString(), req.staffClaims.jti) });
  });
  router.get("/activity", requireStaff, async (req, res) => {
    try {
      const options = activityQuery(req.query);
      const filter = staffActivityFilter(req.staffAccount);
      res.json(await activityLog.list({ ...options, filter }));
    } catch (error) {
      res.status(400).json({ message: error.message || "Choose valid activity filters." });
    }
  });
  router.delete("/activity/:id", requireStaff, async (req, res) => {
    const id = objectId(req.params.id);
    if (!id) throw enquiryError(400, "Choose a valid activity record.");
    const result = await activityLog.remove(id, { filter: { "actor.type": "staff", "actor.id": req.staffAccount._id.toString() } });
    if (!result.deletedCount) throw enquiryError(404, "Activity record not found or you cannot delete it.");
    res.sendStatus(204);
  });
  router.delete("/activity", requireStaff, async (req, res) => {
    try {
      const { search, resource } = activityQuery(req.query);
      const result = await activityLog.removeMatching({
        filter: { "actor.type": "staff", "actor.id": req.staffAccount._id.toString() },
        search,
        resource,
      });
      res.json({ deletedCount: result.deletedCount });
    } catch (error) {
      res.status(400).json({ message: error.message || "Choose valid activity filters." });
    }
  });
  router.post("/change-password", requireStaff, loginLimit, async (req, res) => {
    const { currentPassword, password, confirmPassword } = req.body || {};
    if (typeof currentPassword !== "string" || currentPassword.length > 256 || !await verifyPassword(currentPassword, req.staffAccount.passwordHash)) throw enquiryError(400, "Current password is incorrect.");
    if (!staffPasswordValid(password) || password !== confirmPassword || password === currentPassword) throw enquiryError(400, "Choose a different password of 12–256 characters with uppercase, lowercase, a number and a symbol. Both new passwords must match.");
    const saved = await accounts.updateOne({ _id: req.staffAccount._id, authVersion: req.staffAccount.authVersion, status: "active" }, { $set: { passwordHash: await hashPassword(password), updatedAt: new Date() }, $inc: { version: 1, authVersion: 1 } });
    if (!saved.modifiedCount) throw enquiryError(409, "Your account changed. Please sign in again.");
    await tokens.deleteMany({ accountId: req.staffAccount._id }); clearCookie(res);
    res.json({ message: "Password changed. Sign in with your new password." });
  });
  const enquiryScope = () => ({ archivedAt: { $exists: false } });
  const staffEnquiry = (row, req) => ({ ...publicEnquiry(row), canEdit: row.assignedTo?.id === req.staffAccount._id.toString() && !row.archivedAt });
  router.get("/enquiries", requireStaff, async (req, res) => {
    const filter = enquiryScope(req), search = regexOf(req.query.search), page = pageOf(req.query);
    if (req.query.status) { const status = enquiryStatus(req.query.status); if (!status) throw enquiryError(400, "Choose a valid status."); filter.status = status; }
    if (search) filter.$or = ["name", "reference", "email", "phone", "destination"].map((key) => ({ [key]: { $regex: search, $options: "i" } }));
    const [rows, total] = await Promise.all([db.collection("enquiries").find(filter, { projection: { originalPayload: 0, pendingEvents: 0, submissionHash: 0, submissionId: 0, changes: 0 } }).sort({ receivedAt: -1, _id: -1 }).skip((page - 1) * 20).limit(20).toArray(), db.collection("enquiries").countDocuments(filter)]);
    res.json({ enquiries: rows.map((row) => staffEnquiry(row, req)), page, pages: Math.max(1, Math.ceil(total / 20)), total });
  });
  router.get("/enquiries/:id", requireStaff, async (req, res) => {
    const row = objectId(req.params.id) && await db.collection("enquiries").findOne({ _id: objectId(req.params.id), ...enquiryScope(req) });
    if (!row) throw enquiryError(404, "Enquiry not found."); res.json({ enquiry: staffEnquiry(row, req) });
  });
  router.patch("/enquiries/:id", requireStaff, async (req, res) => {
    if (Object.keys(req.body || {}).some((key) => !["status", "revision"].includes(key)) || !Number.isInteger(req.body?.revision) || !enquiryStatus(req.body?.status)) throw enquiryError(400, "Choose a status and the current enquiry revision.");
    res.json({ message: "Enquiry updated.", enquiry: await enquiries.update(req.params.id, req.body, { _id: req.staffAccount._id, staffAccountId: req.staffAccount._id.toString() }) });
    void broadcastChanged(req.employee._id.toString());
  });
  router.get("/attendance", requireStaff, async (req, res) => {
    const range = reportRange(req.query.from || req.query.to || req.query.month ? req.query : { month: indiaDate().slice(0, 7) });
    if (!range) throw enquiryError(400, "Choose a valid date range of up to 366 days.");
    const filter = { staffId: req.employee._id, date: { $gte: range.from, $lte: range.to } }, page = pageOf(req.query);
    const [records, total, groups] = await Promise.all([db.collection("staff_attendance").find(filter, { projection: { createdBy: 0, updatedBy: 0 } }).sort({ date: -1 }).skip((page - 1) * 31).limit(31).toArray(), db.collection("staff_attendance").countDocuments(filter), db.collection("staff_attendance").aggregate([{ $match: filter }, { $group: { _id: "$status", count: { $sum: 1 }, minutes: { $sum: "$workingMinutes" } } }]).toArray()]);
    res.json({ records, ...range, total, page, pages: Math.max(1, Math.ceil(total / 31)), summary: summary(groups) });
  });
  router.get(["/id-card", "/id-card/preview"], requireStaff, async (req, res) => {
    const employee = await people.findOne({ _id: req.employee._id, status: "active", deletedAt: null });
    if (!employee) throw enquiryError(401, "Employee access is inactive.");
    if (req.path.endsWith("/preview")) return res.type("image/svg+xml").send(await cardSvg(employee));
    res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${employee.employeeId}-card.pdf"` }).send(await cardPdf(employee));
  });
  registerInvoiceRoutes({ router, db, requireAccount: requireStaff, realtime, staffMode: true });
  registerVoucherRoutes({ management: router, db, requireAdmin: requireStaff, config, realtime, staffMode: true });
  const notifications = db.collection("staff_notifications");
  router.get("/notifications", requireStaff, async (req, res) => {
    const page = pageOf(req.query), filter = staffNotificationFilter(req);
    const search = regexOf(req.query.search);
    if (req.query.status && !["all", "read", "unread"].includes(req.query.status)) throw enquiryError(400, "Choose a valid notification status filter.");
    if (req.query.status === "read") filter.read = true;
    if (req.query.status === "unread") filter.read = false;
    if (search) filter.$and = [{ $or: ["title", "message", "category"].map((key) => ({ [key]: { $regex: search, $options: "i" } })) }];
    const [items, total, unread] = await Promise.all([notifications.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 20).limit(20).toArray(), notifications.countDocuments(filter), notifications.countDocuments({ ...filter, read: false })]);
    res.json({ notifications: items, total, unread, page, pages: Math.max(1, Math.ceil(total / 20)) });
  });
  router.patch("/notifications/read-all", requireStaff, async (req, res) => { await notifications.updateMany({ ...staffNotificationFilter(req), read: false }, { $set: { read: true, updatedAt: new Date() } }); void broadcastChanged(req.employee._id.toString()); res.sendStatus(204); });
  router.patch("/notifications/:id/read", requireStaff, async (req, res) => {
    if (!(await notifications.updateOne({ _id: req.params.id, ...staffNotificationFilter(req) }, { $set: { read: true, updatedAt: new Date() } })).matchedCount) throw enquiryError(404, "Notification not found."); void broadcastChanged(req.employee._id.toString()); res.sendStatus(204);
  });
  router.delete("/notifications/:id", requireStaff, async (req, res) => {
    if (!(await notifications.deleteOne({ _id: req.params.id, ...staffNotificationFilter(req) })).deletedCount) throw enquiryError(404, "Notification not found."); void broadcastChanged(req.employee._id.toString()); res.sendStatus(204);
  });
  // Shared business records participate in revision recovery, while personal
  // records and notifications remain scoped to the authenticated employee.
  const connections = new Map();
  router.get("/events", requireStaff, async (req, res) => {
    const key = req.employee._id.toString();
    if ((connections.get(key) || 0) >= 5) throw enquiryError(429, "Too many live workspace connections. Close another staff tab.");
    connections.set(key, (connections.get(key) || 0) + 1);
    res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" }); res.flushHeaders();
    registerStaffLiveConnection(key, res);
    let closed = false, running = false, previous = "", timer;
    const connectedAt = new Date(), sentNotifications = new Set();
    const send = (event, value) => { if (!closed) { res.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`); res.flush?.(); } };
    const tick = async () => {
      if (closed || running) return; running = true;
      try {
        const authenticated = await authenticateStaff({ db, config, token: req.cookies?.[staffCookie] });
        if (!authenticated) { send("revoked", {}); res.end(); return; }
        const activityFilter = staffActivityFilter(authenticated.account);
        const scopes = [["staff", { _id: req.employee._id }], ["enquiries", enquiryScope(req)], ["staff_attendance", { staffId: req.employee._id }], [voucherCollection, {}], [invoiceCollection, {}], ["staff_notifications", staffNotificationFilter(req)], ["panel_activity_history", activityFilter], ["hotels", {}], ["gst_rates", {}], ["office_addresses", {}]];
        const state = await Promise.all(scopes.map(async ([name, filter]) => {
          const collection = db.collection(name);
          const [total, latest] = await Promise.all([collection.countDocuments(filter), collection.find(filter, { projection: { updatedAt: 1, createdAt: 1, version: 1, revision: 1 } }).sort({ updatedAt: -1, createdAt: -1, _id: -1 }).limit(1).toArray()]);
          return [total, latest];
        }));
        state.push(await notifications.countDocuments({ ...staffNotificationFilter(req), read: false }));
        const revision = createHash("sha256").update(JSON.stringify(state)).digest("hex");
        if (revision !== previous) { previous = revision; send("changed", { revision }); } else { res.write(": heartbeat\n\n"); res.flush?.(); }
        for await (const notification of notifications.find({ ...staffNotificationFilter(req), read: false, createdAt: { $gte: connectedAt } }).sort({ createdAt: -1, _id: -1 }).limit(50)) {
          if (sentNotifications.has(notification._id)) continue;
          sentNotifications.add(notification._id);
          if (sentNotifications.size > 1000) sentNotifications.delete(sentNotifications.values().next().value);
          send("notification:event", { ...notification, id: notification._id });
        }
      } catch { send("retry", { message: "Live updates interrupted. Reconnecting…" }); res.end(); }
      finally { running = false; }
    };
    res.once("close", () => { closed = true; clearInterval(timer); unregisterStaffLiveConnection(key, res); const count = (connections.get(key) || 1) - 1; if (count) connections.set(key, count); else connections.delete(key); });
    timer = setInterval(() => void tick(), 3000); timer.unref?.(); await tick();
  });
  app.use("/api/staff", router);
}
