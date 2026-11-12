import express from "express";
import { rateLimit } from "express-rate-limit";
import { ObjectId } from "mongodb";
import { enquirySources, enquiryStatus, enquiryStatusLabels, enquirySorts } from "../../shared/enquiries.js";
import { validateEnquiry } from "../lib/validation.js";
import { canManageAccounts } from "../lib/accounts.js";
import { publicEnquiry } from "./model.js";
import { enquiryError, notificationPreferences, sha256 } from "./service.js";

export function registerWhatsAppWebhook({ app, whatsapp }) {
  const webhookLimit = rateLimit({ windowMs: 60000, limit: 300, standardHeaders: "draft-8", legacyHeaders: false, message: { message: "Too many WhatsApp webhook requests. Please retry shortly." } });
  app.get("/api/integrations/whatsapp/webhook", webhookLimit, (req, res) => res.type("text/plain").send(whatsapp.challenge(req.query)));
  app.post("/api/integrations/whatsapp/webhook", webhookLimit, express.raw({ type: "application/json", limit: "1mb" }), async (req, res) => res.json(await whatsapp.receive(req.body, req.get("X-Hub-Signature-256"))));
}

export function registerEnquiryRoutes({ app, management, db, config, requireAdmin, enquiries, whatsapp, gmail, notifications, realtime }) {
  const publicLimit = rateLimit({ windowMs: 15 * 60000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false, message: { message: "Too many enquiries. Please try again shortly." } });
  const syncLimit = rateLimit({ windowMs: 60000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false, message: { message: "Please wait before starting another inbox sync." } });
  const socketTicketLimit = rateLimit({ windowMs: 60000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false, message: { message: "Please wait before reconnecting live notifications." } });
  const notificationPanel = (req) => req.originalUrl.startsWith("/api/technical/") ? "technical" : "admin";
  management.post("/socket-ticket", socketTicketLimit, requireAdmin, async (req, res) => res.json({ ticket: await realtime.issueTicket(notificationPanel(req), req.admin._id.toString(), req.authClaims.jti) }));
  management.get("/notifications/unread-count", requireAdmin, async (req, res) => res.json({ unread: await notifications.unreadCount(notificationPanel(req), req.admin._id.toString()) }));
  management.get("/notifications", requireAdmin, async (req, res) => {
    const limit = Math.max(1, Math.min(50, Number.parseInt(req.query.limit, 10) || 20));
    res.json(await notifications.list(notificationPanel(req), req.admin._id.toString(), { cursor: req.query.cursor, limit }));
  });
  management.patch("/notifications/read-all", requireAdmin, async (req, res) => res.json({ updated: await notifications.markAllRead(notificationPanel(req), req.admin._id.toString()) }));
  management.delete("/notifications", requireAdmin, async (req, res) => res.json({ deleted: await notifications.clear(notificationPanel(req)) }));
  management.patch("/notifications/:id/read", requireAdmin, async (req, res) => {
    await notifications.markRead(req.params.id, notificationPanel(req), req.admin._id.toString());
    res.sendStatus(204);
  });
  management.delete("/notifications/:id", requireAdmin, async (req, res) => {
    await notifications.remove(req.params.id, notificationPanel(req));
    res.sendStatus(204);
  });
  app.post("/api/enquiries", publicLimit, async (req, res) => {
    const { fields, errors, submissionId } = validateEnquiry(req.body);
    if (Object.keys(errors).length) return res.status(400).json({ message: "Please check the highlighted details.", errors });
    const result = await enquiries.create({ ...fields, source: "WEBSITE", subject: `Trip enquiry — ${fields.destination}`, contactChannel: ["whatsapp", "email"].includes(req.body.contactChannel) ? req.body.contactChannel : "website" }, { submissionId, submissionHash: sha256(JSON.stringify(fields)) });
    if (result.deleted) throw enquiryError(410, "This enquiry was permanently deleted and cannot be submitted again with the same request ID.");
    res.status(result.created ? 201 : 200).json({ message: "Your enquiry has been submitted successfully.", reference: result.enquiry.reference });
  });
  management.get("/enquiries", requireAdmin, async (req, res) => {
    if (req.query.archived !== undefined && !["true", "false"].includes(req.query.archived)) throw enquiryError(400, "Choose a valid archive filter.");
    const archived = req.query.archived === "true";
    const sort = req.query.sort || "newest";
    if (typeof sort !== "string" || !Object.hasOwn(enquirySorts, sort)) throw enquiryError(400, "Choose a valid enquiry sort order.");
    const sortOrder = sort === "oldest" ? { receivedAt: 1, _id: 1 } : sort === "updated" ? { updatedAt: -1, _id: -1 } : { receivedAt: -1, _id: -1 };
    const filter = { archivedAt: archived ? { $exists: true } : { $exists: false } }, page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1)), limit = 20;
    if (req.query.status) { const status = enquiryStatus(req.query.status); if (!status) throw enquiryError(400, "Choose a valid enquiry status."); filter.status = status; }
    if (req.query.source) { if (!Object.hasOwn(enquirySources, req.query.source)) throw enquiryError(400, "Choose a valid enquiry source."); filter.source = req.query.source; }
    const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 120) : "";
    if (search) { const pattern = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); filter.$or = ["name", "email", "phone", "subject", "message", "destination", "reference", "externalMessageId"].map((key) => ({ [key]: { $regex: pattern, $options: "i" } })); }
    const collection = db.collection("enquiries"), visible = { archivedAt: { $exists: false } };
    const [entries, total, groups, sources, archivedCount] = await Promise.all([
      collection.aggregate([{ $match: filter }, { $sort: sortOrder }, { $skip: (page - 1) * limit }, { $limit: limit }, { $set: { messageTruncated: { $gt: [{ $strLenCP: { $ifNull: ["$message", ""] } }, 2000] }, message: { $substrCP: [{ $ifNull: ["$message", ""] }, 0, 2000] } } }, { $project: { originalPayload: 0, pendingEvents: 0, submissionId: 0, submissionHash: 0 } }]).toArray(),
      collection.countDocuments(filter), collection.aggregate([{ $match: visible }, { $group: { _id: "$status", count: { $sum: 1 } } }]).toArray(), collection.aggregate([{ $match: visible }, { $group: { _id: "$source", count: { $sum: 1 } } }]).toArray(), collection.countDocuments({ archivedAt: { $exists: true } }),
    ]);
    const stats = { total: 0, archived: archivedCount, ...Object.fromEntries(Object.keys(enquiryStatusLabels).map((key) => [key, 0])), sources: { WEBSITE: 0, WHATSAPP: 0, GMAIL: 0 } };
    for (const group of groups) { stats[group._id] = group.count; stats.total += group.count; }
    for (const group of sources) stats.sources[group._id] = group.count;
    Object.assign(stats, { new: stats.NEW, pending: stats.IN_PROGRESS, contacted: stats.IN_PROGRESS, confirmed: stats.RESOLVED, closed: stats.CLOSED, cancelled: 0 });
    res.json({ enquiries: entries.map(publicEnquiry), total, page, pages: Math.max(1, Math.ceil(total / limit)), stats });
  });
  management.get("/enquiries/:id", requireAdmin, async (req, res) => {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) throw enquiryError(404, "Enquiry not found.");
    const record = await db.collection("enquiries").findOne({ _id: new ObjectId(req.params.id) });
    if (!record) throw enquiryError(404, "Enquiry not found.");
    res.json({ enquiry: publicEnquiry(record) });
  });
  management.patch("/enquiries/:id", requireAdmin, async (req, res) => res.json({ message: "Enquiry updated.", enquiry: await enquiries.update(req.params.id, req.body || {}, req.admin) }));
  // Preserve the existing removal action as archiving: messages and deduplication
  // records remain permanent and a repeated external delivery cannot resurrect them.
  management.delete("/enquiries/:id", requireAdmin, async (req, res) => { await enquiries.update(req.params.id, { archive: true }, req.admin); res.sendStatus(204); });
  management.delete("/enquiries/:id/permanent", requireAdmin, async (req, res) => { await enquiries.permanentlyDelete(req.params.id, req.admin); res.sendStatus(204); });
  management.get("/enquiry-summary", requireAdmin, async (_req, res) => res.json({ unread: await db.collection("enquiries").countDocuments({ status: "NEW", archivedAt: { $exists: false } }) }));
  management.get("/enquiry-notification-settings", requireAdmin, async (req, res) => res.json({ ...notificationPreferences(req.admin), unread: await notifications.unreadCount(notificationPanel(req), req.admin._id.toString()) }));
  management.patch("/enquiry-notification-settings", requireAdmin, async (req, res) => {
    if (typeof req.body?.popup !== "boolean" || typeof req.body?.sound !== "boolean") throw enquiryError(400, "Choose valid notification settings.");
    const preferences = { popup: req.body.popup, sound: req.body.sound };
    await db.collection("admins").updateOne({ _id: req.admin._id }, { $set: { enquiryNotifications: preferences } }); res.json(preferences);
  });
  management.get("/enquiry-assignees", requireAdmin, async (_req, res) => res.json({ assignees: await db.collection("admins").find({ status: { $nin: ["pending", "disabled"] } }, { projection: { _id: 1, name: 1, email: 1 } }).sort({ email: 1 }).toArray() }));
  management.get("/enquiry-integrations", requireAdmin, async (req, res) => res.json({ whatsapp: { configured: whatsapp.configured(), retrying: await db.collection("enquiry_ingestion_jobs").countDocuments({ state: { $ne: "DONE" } }) }, gmail: await gmail.status(), canConnectGmail: req.originalUrl.startsWith("/api/admin/") && canManageAccounts(req.admin, config) }));
  management.post("/enquiry-integrations/gmail/sync", requireAdmin, syncLimit, async (_req, res) => {
    const state = await gmail.status();
    if (!state.configured || !state.connected) throw enquiryError(503, "Connect the configured business Gmail inbox before syncing.");
    void gmail.sync().catch((error) => console.error("Requested Gmail sync failed:", error.name));
    res.status(202).json({ message: "Gmail inbox sync started. Incoming enquiries will appear automatically." });
  });
  app.post("/api/admin/enquiry-integrations/gmail/connect", requireAdmin, syncLimit, async (req, res) => {
    if (!canManageAccounts(req.admin, config)) throw enquiryError(403, "Only account managers can connect the business inbox.");
    const token = req.cookies?.["eternal_india.auth"] || "";
    const url = await gmail.beginOAuth(req.admin, token);
    // Local sign-in cookies use SameSite=Strict. A short-lived, callback-only
    // HttpOnly copy lets Google's top-level return retain the same authentication.
    if (!config.production) res.cookie("eternal_india.gmail_oauth", token, { httpOnly: true, sameSite: "lax", secure: false, path: "/api/integrations/gmail/callback", maxAge: 10 * 60000 });
    res.json({ url });
  });
  app.get("/api/integrations/gmail/callback", (req, _res, next) => {
    if (!config.production && !req.cookies?.["eternal_india.auth"] && req.cookies?.["eternal_india.gmail_oauth"]) req.cookies["eternal_india.auth"] = req.cookies["eternal_india.gmail_oauth"];
    next();
  }, requireAdmin, async (req, res) => {
    if (!canManageAccounts(req.admin, config)) throw enquiryError(403, "Only account managers can connect the business inbox.");
    await gmail.completeOAuth(req.query, req.admin, req.cookies?.["eternal_india.auth"] || "");
    if (!config.production) res.clearCookie("eternal_india.gmail_oauth", { httpOnly: true, sameSite: "lax", secure: false, path: "/api/integrations/gmail/callback" });
    res.redirect(303, `${config.origins[0]}/admin?gmail=connected`);
  });
}
