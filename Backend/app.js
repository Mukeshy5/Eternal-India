import express from "express";
import compression from "compression";
import session from "express-session";
import MongoStore from "connect-mongo";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { ObjectId } from "mongodb";
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { verifyPassword } from "./lib/passwords.js";
import { enquiryStatuses, validateEnquiry } from "./lib/validation.js";
import { registerPromotions } from "./lib/promotions.js";
import { registerFestivalRoutes } from "./festivals/routes.js";
import { technicalAccess } from "./festivals/permissions.js";

export function createApp({ client, db, config, schedulerOptions }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(compression());
  app.use(helmet({ strictTransportSecurity: config.production ? undefined : false, contentSecurityPolicy: { directives: { mediaSrc: ["'self'", "https:"] } } }));
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    const origin = req.get("Origin");
    let isLoopbackOrigin = false;
    if (!config.production && origin) {
      try {
        const url = new URL(origin);
        isLoopbackOrigin = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      } catch {
        isLoopbackOrigin = false;
      }
    }
    const allowed = config.origins.includes(origin) || isLoopbackOrigin;
    if (origin && !allowed) return res.status(403).json({ message: "This request origin is not allowed." });
    if (origin) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Access-Control-Allow-Credentials", "true");
      res.vary("Origin");
    }
    if (req.method === "OPTIONS") return res.set({ "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" }).sendStatus(204);
    const imageUpload = req.method === "POST" && (/^\/(admin|technical)\/offer-images$/.test(req.path) || req.path === "/technical/festival-assets") && req.is("multipart/form-data");
    if (["POST", "PUT", "PATCH"].includes(req.method) && !imageUpload && !req.is("application/json")) return res.status(415).json({ message: "Use JSON to submit this request." });
    next();
  });
  app.use(express.json({ limit: "16kb" }));

  const store = MongoStore.create({ client, dbName: config.databaseName, collectionName: "admin_sessions", ttl: 8 * 60 * 60 });
  store.on("error", () => console.error("Admin session storage is unavailable."));
  const cookie = { httpOnly: true, secure: config.production, sameSite: "strict", path: "/api", maxAge: 8 * 60 * 60 * 1000 };
  const management = express.Router();
  app.use(["/api/admin", "/api/technical"], session({ name: "eternal_india.sid", secret: config.sessionSecret, store, resave: false, saveUninitialized: false, rolling: true, cookie }));

  const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false, skipSuccessfulRequests: true, message: { message: "Too many login attempts. Please try again in 15 minutes." } });
  const enquiryLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false, message: { message: "Too many enquiries. Please try again shortly." } });
  const publicAdmin = (admin) => { const access = technicalAccess(admin, config); return { id: admin._id.toString(), email: admin.email, roles: access.roles, technicalPermissions: access.permissions }; };
  async function requireAdmin(req, res, next) {
    if (!ObjectId.isValid(req.session?.adminId || "")) return res.status(401).json({ message: "Please sign in to continue." });
    const admin = await db.collection("admins").findOne({ _id: new ObjectId(req.session.adminId) });
    if (!admin || (admin.passwordChangedAt && new Date(req.session.signedInAt) <= admin.passwordChangedAt)) return res.status(401).json({ message: "Please sign in again." });
    if (req.originalUrl.startsWith("/api/technical/") && !technicalAccess(admin, config).technical) return res.status(403).json({ message: "This account is not authorized for the Technical Panel." });
    req.admin = admin;
    next();
  }

  app.get("/api/health", async (_req, res) => {
    await db.command({ ping: 1 });
    res.json({ status: "ok", service: "eternal-india-api" });
  });
  app.post("/api/enquiries", enquiryLimit, async (req, res) => {
    const { fields, errors, submissionId } = validateEnquiry(req.body);
    if (Object.keys(errors).length) return res.status(400).json({ message: "Please check the highlighted details.", errors });
    const submissionHash = createHash("sha256").update(JSON.stringify(fields)).digest("hex");
    const entry = { ...fields, submissionId, submissionHash, reference: `EI-${randomBytes(6).toString("hex").toUpperCase()}`, status: "new", createdAt: new Date(), updatedAt: new Date() };
    let created = true;
    try {
      await db.collection("enquiries").insertOne(entry);
    } catch (error) {
      if (error.code !== 11000) throw error;
      const saved = await db.collection("enquiries").findOne({ submissionId });
      if (!saved || saved.submissionHash !== submissionHash) return res.status(409).json({ message: "These details changed. Refresh the form before submitting again." });
      entry.reference = saved.reference;
      created = false;
    }
    if (created) {
      await db.collection("enquiry_history").insertOne({ enquiryId: entry._id, reference: entry.reference, action: "created", status: entry.status, changedAt: entry.createdAt });
    }
    res.status(created ? 201 : 200).json({ message: "Your enquiry has been submitted successfully.", reference: entry.reference });
  });
  management.post("/login", loginLimit, async (req, res, next) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase().slice(0, 200) : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!email || !password || password.length > 256) return res.status(401).json({ message: "Email or password is incorrect." });
    const admin = await db.collection("admins").findOne({ email });
    if (!admin || !await verifyPassword(password, admin.passwordHash)) return res.status(401).json({ message: "Email or password is incorrect." });
    if (req.originalUrl.startsWith("/api/technical/") && !technicalAccess(admin, config).technical) return res.status(403).json({ message: "This account is not authorized for the Technical Panel." });
    req.session.regenerate((error) => {
      if (error) return next(error);
      req.session.adminId = admin._id.toString();
      req.session.signedInAt = new Date().toISOString();
      req.session.save((saveError) => saveError ? next(saveError) : res.json({ admin: publicAdmin(admin) }));
    });
  });
  management.get("/me", requireAdmin, (req, res) => res.json({ admin: publicAdmin(req.admin) }));
  management.post("/logout", (req, res, next) => {
    req.session.destroy((error) => {
      if (error) return next(error);
      res.clearCookie("eternal_india.sid", { path: "/api", httpOnly: true, sameSite: "strict", secure: config.production });
      res.sendStatus(204);
    });
  });
  management.get("/enquiries", requireAdmin, async (req, res) => {
    const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
    const limit = 20;
    const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 120) : "";
    const filter = {};
    if (enquiryStatuses.includes(req.query.status)) filter.status = req.query.status;
    if (search) {
      const pattern = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = ["name", "email", "phone", "destination", "reference"].map((key) => ({ [key]: { $regex: pattern, $options: "i" } }));
    }
    const collection = db.collection("enquiries");
    const [entries, total, counts] = await Promise.all([
      collection.find(filter, { projection: { submissionId: 0, submissionHash: 0 } }).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
      collection.countDocuments(filter),
      collection.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]).toArray(),
    ]);
    const stats = { total: 0, new: 0, pending: 0, confirmed: 0, cancelled: 0, contacted: 0, closed: 0 };
    for (const group of counts) { stats[group._id] = group.count; stats.total += group.count; }
    res.json({ enquiries: entries, total, page, pages: Math.max(1, Math.ceil(total / limit)), stats });
  });
  management.get("/history", requireAdmin, async (req, res) => {
    const history = await db.collection("enquiry_history").find({}, { projection: { _id: 0 } }).sort({ changedAt: -1 }).limit(200).toArray();
    res.json({ history });
  });
  const hotelStars = ["1-Star (Budget)", "2-Star (Tourist Class)", "3-Star (Mid-Scale / First Class)", "4-Star (Upscale / Deluxe)", "5-Star (Luxury / Superior Deluxe)"];
  const parseMoney = (value) => Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.round(Number(value) * 100) / 100 : null;
  const parseHotel = (body) => {
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 160) : "";
    const starRating = typeof body?.starRating === "string" ? body.starRating : "";
    const gst = parseMoney(body?.gst);
    const amount = parseMoney(body?.amount);
    if (!name || !hotelStars.includes(starRating) || gst === null || gst > 100 || amount === null) return null;
    return { name, starRating, gst, amount };
  };
  management.get("/hotels", requireAdmin, async (_req, res) => {
    const hotels = await db.collection("hotels").find({}, { projection: { name: 1, starRating: 1, gst: 1, amount: 1, createdAt: 1, updatedAt: 1 } }).sort({ updatedAt: -1 }).limit(500).toArray();
    res.json({ hotels });
  });
  management.post("/hotels", requireAdmin, async (req, res) => {
    const hotel = parseHotel(req.body);
    if (!hotel) return res.status(400).json({ message: "Enter a valid hotel name, category, GST and amount." });
    const now = new Date();
    const result = await db.collection("hotels").insertOne({ ...hotel, createdAt: now, updatedAt: now });
    res.status(201).json({ hotel: { _id: result.insertedId, ...hotel, createdAt: now, updatedAt: now } });
  });
  management.patch("/hotels/:id", requireAdmin, async (req, res) => {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ message: "Choose a valid hotel." });
    const hotel = parseHotel(req.body);
    if (!hotel) return res.status(400).json({ message: "Enter a valid hotel name, category, GST and amount." });
    const updatedAt = new Date();
    const result = await db.collection("hotels").updateOne({ _id: new ObjectId(req.params.id) }, { $set: { ...hotel, updatedAt } });
    if (!result.matchedCount) return res.status(404).json({ message: "Hotel not found." });
    res.json({ message: "Hotel updated." });
  });
  management.delete("/hotels/:id", requireAdmin, async (req, res) => {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ message: "Choose a valid hotel." });
    const result = await db.collection("hotels").deleteOne({ _id: new ObjectId(req.params.id) });
    if (!result.deletedCount) return res.status(404).json({ message: "Hotel not found." });
    res.status(204).send();
  });
  management.get("/vouchers", requireAdmin, async (_req, res) => {
    const vouchers = await db.collection("journey_vouchers").find({}, { projection: { billing: 1, journey: 1, stops: 1, message: 1, voucherNumber: 1, createdAt: 1 } }).sort({ createdAt: -1 }).limit(200).toArray();
    res.json({ vouchers });
  });
  management.post("/vouchers", requireAdmin, async (req, res) => {
    const billing = req.body?.billing;
    const journey = req.body?.journey;
    const stops = Array.isArray(req.body?.stops) ? req.body.stops : [];
    const name = typeof billing?.name === "string" ? billing.name.trim().slice(0, 160) : "";
    const visitingCardNo = typeof billing?.visitingCardNo === "string" ? billing.visitingCardNo.trim().slice(0, 80) : "";
    const from = typeof journey?.from === "string" ? journey.from.trim().slice(0, 160) : "";
    const fromAddress = typeof journey?.fromAddress === "string" ? journey.fromAddress.trim().slice(0, 300) : "";
    const message = typeof req.body?.message === "string" ? req.body.message.trim().slice(0, 500) : "";
    const cleanStops = stops.map((stop) => ({
      name: typeof stop?.name === "string" ? stop.name.trim().slice(0, 160) : "",
      address: typeof stop?.address === "string" ? stop.address.trim().slice(0, 300) : "",
      distanceKm: stop?.distanceKm === "" || stop?.distanceKm == null ? null : typeof stop.distanceKm === "number" || typeof stop.distanceKm === "string" ? Number(stop.distanceKm) : NaN,
      duration: typeof stop?.duration === "string" ? stop.duration.trim().slice(0, 80) : "",
      departureDate: typeof stop?.departureDate === "string" ? stop.departureDate.slice(0, 10) : "",
      arrivalDate: typeof stop?.arrivalDate === "string" ? stop.arrivalDate.slice(0, 10) : "",
      hotelId: typeof stop?.hotelId === "string" ? stop.hotelId : "",
    })).filter((stop) => stop.name);
    if (stops.length > 20 || cleanStops.some((stop) => stop.distanceKm !== null && (!Number.isFinite(stop.distanceKm) || stop.distanceKm < 0 || stop.distanceKm > 100000))) return res.status(400).json({ message: "Use up to 20 stops and a distance between 0 and 100,000 km for each leg." });
    const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    if (cleanStops.some((stop) => !validDate(stop.arrivalDate) || !validDate(stop.departureDate) || stop.departureDate < stop.arrivalDate)) return res.status(400).json({ message: "Enter valid arrival and departure dates. Departure cannot be before arrival." });
    if (!name || !visitingCardNo || !from || !cleanStops.length || cleanStops.some((stop) => !stop.duration || !stop.departureDate || !stop.arrivalDate || !/^[a-f\d]{24}$/i.test(stop.hotelId))) return res.status(400).json({ message: "Complete billing details, journey stops and hotels for every stop." });
    const hotelIds = cleanStops.map((stop) => new ObjectId(stop.hotelId));
    const hotels = await db.collection("hotels").find({ _id: { $in: hotelIds } }, { projection: { name: 1, starRating: 1, gst: 1, amount: 1 } }).toArray();
    const hotelsById = new Map(hotels.map((hotel) => [hotel._id.toString(), hotel]));
    for (const stop of cleanStops) {
      const hotel = hotelsById.get(stop.hotelId);
      if (!hotel) return res.status(400).json({ message: "Select a valid saved hotel for every stop." });
      stop.hotel = { name: hotel.name, starRating: hotel.starRating, gst: hotel.gst, amount: hotel.amount };
    }
    const now = new Date();
    const voucher = { voucherNumber: `EIV-${now.getFullYear()}-${randomBytes(4).toString("hex").toUpperCase()}`, billing: { name, visitingCardNo }, journey: { from, fromAddress }, stops: cleanStops, message: message || "May every mile bring you closer to a beautiful memory." , createdAt: now };
    const result = await db.collection("journey_vouchers").insertOne(voucher);
    res.status(201).json({ voucher: { _id: result.insertedId, ...voucher } });
  });
  management.patch("/enquiries/:id", requireAdmin, async (req, res) => {
    if (!/^[a-f\d]{24}$/i.test(req.params.id) || !enquiryStatuses.includes(req.body?.status)) return res.status(400).json({ message: "Choose a valid enquiry and status." });
    const enquiryId = new ObjectId(req.params.id);
    const changedAt = new Date();
    const current = await db.collection("enquiries").findOne({ _id: enquiryId }, { projection: { reference: 1, status: 1 } });
    if (!current) return res.status(404).json({ message: "Enquiry not found." });
    const result = await db.collection("enquiries").updateOne({ _id: enquiryId }, { $set: { status: req.body.status, updatedAt: changedAt } });
    if (!result.matchedCount) return res.status(404).json({ message: "Enquiry not found." });
    if (current.status !== req.body.status) await db.collection("enquiry_history").insertOne({ enquiryId, reference: current.reference, action: "status_changed", from: current.status, status: req.body.status, changedAt });
    res.json({ message: "Enquiry status updated." });
  });
  management.delete("/enquiries/:id", requireAdmin, async (req, res) => {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ message: "Choose a valid enquiry." });
    const enquiryId = new ObjectId(req.params.id);
    const current = await db.collection("enquiries").findOne({ _id: enquiryId }, { projection: { reference: 1, status: 1 } });
    if (!current) return res.status(404).json({ message: "Enquiry not found." });
    const deletedAt = new Date();
    await db.collection("enquiries").deleteOne({ _id: enquiryId });
    await db.collection("enquiry_history").insertOne({ enquiryId, reference: current.reference, action: "deleted", from: current.status, changedAt: deletedAt });
    res.status(204).send();
  });
  const festivals = registerFestivalRoutes({ app, db, requireAdmin, config, schedulerOptions });
  registerPromotions({ app, management, db, requireAdmin });
  app.use(["/api/admin", "/api/technical"], management);
  app.use("/api", (_req, res) => res.status(404).json({ message: "API endpoint not found." }));

  const frontend = fileURLToPath(new URL("../frontend/dist/", import.meta.url));
  if (existsSync(`${frontend}/index.html`)) {
    app.use(express.static(frontend, {
      setHeaders: (res, filePath) => {
        if (/[\\/]assets[\\/]/i.test(filePath)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    }));
    app.get("/{*path}", (_req, res) => res.sendFile(`${frontend}/index.html`));
  }
  app.use((error, _req, res, _next) => {
    if (error.type === "entity.parse.failed") return res.status(400).json({ message: "Invalid JSON request." });
    if (error.type === "entity.too.large") return res.status(413).json({ message: "This enquiry is too large." });
    console.error("Request failed:", error.name);
    res.status(503).json({ message: "We couldn't save your request. Please try again shortly." });
  });
  return { app, store, decorationScheduler: festivals.scheduler, decorationsReady: festivals.ready };
}
