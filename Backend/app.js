import express from "express";
import compression from "compression";
import cookieParser from "cookie-parser";
import session from "express-session";
import MongoStore from "connect-mongo";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import { rateLimit } from "express-rate-limit";
import { ObjectId } from "mongodb";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { hashPassword, isBcryptPasswordHash, verifyPassword } from "./lib/passwords.js";
import { registerPromotions } from "./lib/promotions.js";
import { registerFestivalRoutes } from "./festivals/routes.js";
import { technicalAccess } from "./festivals/permissions.js";
import { registerStaffRoutes } from "./staff/routes.js";
import { staffAccess } from "./staff/permissions.js";
import { adminPanelAccess } from "./lib/panel-access.js";
import { sessionLifecycle } from "./lib/session-lifecycle.js";
import { canManageAccounts, registerAccounts } from "./lib/accounts.js";
import { gmailAccountFilter, gmailIdentity } from "./lib/email-identity.js";
import { registerPaymentRoutes } from "./payments/routes.js";
import { registerVoucherRoutes } from "./vouchers/routes.js";
import { registerLetterRoutes } from "./letters/routes.js";
import { registerOfficeRoutes } from "./offices/routes.js";
import { registerGstRoutes } from "./lib/gst.js";
import { createEnquirySystem } from "./enquiries/index.js";
import { registerEnquiryRoutes, registerWhatsAppWebhook } from "./enquiries/routes.js";
import { authenticatePanel } from "./lib/panel-auth.js";

export function createApp({ client, db, config, schedulerOptions, sendPasswordReset, paymentGateway, gmailProviderFactory }) {
  const app = express();
  app.disable("x-powered-by");
  if (config.render) app.set("trust proxy", 1);
  app.use(compression());
  app.use(helmet({ strictTransportSecurity: config.production ? undefined : false, contentSecurityPolicy: { directives: { mediaSrc: ["'self'", "https:"], scriptSrc: ["'self'", "https://checkout.razorpay.com"], frameSrc: ["'self'", "blob:", "https://*.razorpay.com", "https://*.razorpay.in"], connectSrc: ["'self'", "https://*.razorpay.com", "https://*.razorpay.in"], imgSrc: ["'self'", "data:", "https:"] } } }));
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
    if (req.method === "OPTIONS") return res.set({ "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" }).sendStatus(204);
    const imageUpload = req.is("multipart/form-data") && ((req.method === "POST" && (/^\/(admin|technical)\/offer-images$/.test(req.path) || req.path === "/technical/festival-assets")) || (["POST", "PATCH"].includes(req.method) && /^\/(admin|technical)\/staff(?:\/[a-f\d]{24})?$/i.test(req.path)));
    if (["POST", "PUT", "PATCH"].includes(req.method) && !imageUpload && !req.is("application/json")) return res.status(415).json({ message: "Use JSON to submit this request." });
    next();
  });
  const store = MongoStore.create({ client, dbName: config.databaseName, collectionName: "admin_sessions", ttl: 8 * 60 * 60 });
  const drainSessions = sessionLifecycle(store);
  store.on("error", () => console.error("Admin session storage is unavailable."));
  const cookie = { httpOnly: true, secure: config.production, sameSite: config.production ? "none" : "strict", path: "/api", maxAge: 8 * 60 * 60 * 1000 };
  const tokenCookieName = "eternal_india.auth";
  const management = express.Router();
  app.use(cookieParser());
  app.use(["/api/admin", "/api/technical", "/api/auth"], session({ name: "eternal_india.sid", secret: config.sessionSecret, store, resave: false, saveUninitialized: false, rolling: true, cookie }));

  // JSON is parsed for ordinary routes after the raw Razorpay webhook route.
  // Payment admin handlers use the same cookie/JWT authentication as the panel.
  registerPaymentRoutes({ app, db, config, requireAdmin, gateway: paymentGateway });
  const enquirySystem = createEnquirySystem({ db, config, gmailProviderFactory });
  registerWhatsAppWebhook({ app, whatsapp: enquirySystem.whatsapp });
  app.use(["/api/admin/staff-attendance/bulk", "/api/technical/staff-attendance/bulk"], express.json({ limit: "128kb" }));
  app.use(["/api/admin/vouchers", "/api/technical/vouchers"], express.json({ limit: "64kb" }));
  app.use(["/api/admin/letters", "/api/technical/letters"], express.json({ limit: "128kb" }));
  app.use(express.json({ limit: "16kb" }));

  const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false, skipSuccessfulRequests: true, message: { message: "Too many login attempts. Please try again in 15 minutes." } });
  const publicAdmin = (admin) => { const access = technicalAccess(admin, config); return { id: admin._id.toString(), name: admin.name || "", username: admin.username || "", email: admin.email, roles: access.roles, canManageAccounts: canManageAccounts(admin, config), technicalPermissions: access.permissions, staffPermissions: staffAccess(admin, config) }; };
  const verifyToken = (token) => {
    try { return jwt.verify(token, config.authTokenSecret, { algorithms: ["HS256"], issuer: "eternal-india", audience: "eternal-india-panels" }); }
    catch { return null; }
  };
  async function requireAdmin(req, res, next) {
    const result = await authenticatePanel({ db, config, token: req.cookies?.[tokenCookieName], panel: req.originalUrl.startsWith("/api/technical/") ? "technical" : "admin" });
    if (!result.admin) return res.status(result.status).json({ message: result.status === 403 ? "This account is not authorized for this panel." : "Please sign in to continue." });
    req.admin = result.admin;
    req.authClaims = result.claims;
    next();
  }

  management.use((req, res, next) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
    res.once("finish", () => {
      if (res.statusCode < 200 || res.statusCode >= 300 || !req.admin) return;
      const path = req.path;
      if (/^\/(?:notifications(?:\/|$)|socket-ticket|enquiry-notification-settings|accounts(?:\/|$)|register(?:\/|$)|login(?:\/|$)|logout(?:\/|$))/.test(path)) return;
      const panel = req.originalUrl.startsWith("/api/technical/") ? "technical" : "admin";
      const label = path.includes("staff-attendance") || path.includes("staff-calendar")
        ? "staff attendance"
        : path.includes("/staff") ? "staff records"
          : path.includes("/enquiries") ? "an enquiry"
            : path.includes("festival") || path.includes("decoration") ? "festival settings"
              : path.includes("promotion") || path.includes("offer-image") ? "tour pricing or offers"
                : path.includes("/letters") ? "employment letters"
                : path.includes("voucher") ? "a journey voucher"
                  : path.includes("hotel") ? "hotel details"
                    : path.includes("/gst") ? "GST rates"
                      : "workspace settings";
      void enquirySystem.notifications.publish({
        id: `panel:${randomUUID()}`,
        category: panel === "technical" ? "Technical panel activity" : "Admin panel activity",
        title: panel === "technical" ? "Technical panel activity" : "Admin panel activity",
        message: `${req.admin.name || req.admin.email} updated ${label}.`,
        audience: ["admin", "technical"],
        actorId: req.admin._id,
      }).catch((error) => console.error("Panel activity notification could not be saved:", error.name));
    });
    next();
  });

  app.get("/api/health", async (_req, res) => {
    await db.command({ ping: 1 });
    res.json({ status: "ok", service: "eternal-india-api" });
  });
  management.post("/login", loginLimit, async (req, res, next) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase().slice(0, 200) : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!email || !password || password.length > 256) return res.status(401).json({ message: "Email or password is incorrect." });
    const identity = gmailIdentity(email);
    const admin = await db.collection("admins").findOne(identity ? gmailAccountFilter(identity) : { email });
    if (!admin || !await verifyPassword(password, admin.passwordHash)) return res.status(401).json({ message: "Email or password is incorrect." });
    if (!isBcryptPasswordHash(admin.passwordHash)) {
      const passwordHash = await hashPassword(password);
      const upgraded = await db.collection("admins").updateOne({ _id: admin._id, passwordHash: admin.passwordHash }, { $set: { passwordHash } });
      if (!upgraded.modifiedCount) return res.status(401).json({ message: "Your credentials changed. Please sign in again." });
      admin.passwordHash = passwordHash;
    }
    if (["pending", "disabled"].includes(admin.status)) return res.status(403).json({ message: "Your account is awaiting administrator approval or has been disabled." });
    if (req.originalUrl.startsWith("/api/technical/")) {
      if (!technicalAccess(admin, config).technical) return res.status(403).json({ message: "This account is not authorized for the Technical Panel." });
    } else if (!adminPanelAccess(admin, config)) {
      return res.status(403).json({ message: "This account is not authorized for the Admin Panel." });
    }
    const previousClaims = verifyToken(req.cookies?.[tokenCookieName] || "");
    if (previousClaims?.jti) await db.collection("admin_tokens").deleteOne({ _id: previousClaims.jti });
    const now = new Date(), issuedAt = Math.floor(now.getTime() / 1000), expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000), tokenId = randomBytes(24).toString("hex");
    const authToken = jwt.sign({}, config.authTokenSecret, { algorithm: "HS256", subject: admin._id.toString(), jwtid: tokenId, issuer: "eternal-india", audience: "eternal-india-panels", expiresIn: "8h" });
    await db.collection("admin_tokens").insertOne({ _id: tokenId, adminId: admin._id, createdAt: now, expiresAt });
    req.session.regenerate((error) => {
      if (error) { void db.collection("admin_tokens").deleteOne({ _id: tokenId }); return next(error); }
      req.session.adminId = admin._id.toString();
      req.session.signedInAt = new Date(issuedAt * 1000).toISOString();
      req.session.save((saveError) => {
        if (saveError) { void db.collection("admin_tokens").deleteOne({ _id: tokenId }); return next(saveError); }
        res.cookie(tokenCookieName, authToken, cookie);
        res.json({ admin: publicAdmin(admin) });
      });
    });
  });
  management.get("/me", requireAdmin, (req, res) => res.json({ admin: publicAdmin(req.admin) }));
  management.post("/logout", async (req, res, next) => {
    const claims = verifyToken(req.cookies?.[tokenCookieName] || "");
    if (claims?.jti) await db.collection("admin_tokens").deleteOne({ _id: claims.jti });
    req.session.destroy((error) => {
      if (error) return next(error);
      res.clearCookie("eternal_india.sid", { path: "/api", httpOnly: true, sameSite: config.production ? "none" : "strict", secure: config.production });
      res.clearCookie(tokenCookieName, { path: "/api", httpOnly: true, sameSite: config.production ? "none" : "strict", secure: config.production });
      res.sendStatus(204);
    });
  });
  management.get("/history", requireAdmin, async (req, res) => {
    const history = await db.collection("enquiry_history").find({}, { projection: { _id: 0 } }).sort({ changedAt: -1 }).limit(200).toArray();
    res.json({ history });
  });
  const hotelStars = ["1-Star (Budget)", "2-Star (Tourist Class)", "3-Star (Mid-Scale / First Class)", "4-Star (Upscale / Deluxe)", "5-Star (Luxury / Superior Deluxe)"];
  const parseMoney = (value) => Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.round(Number(value) * 100) / 100 : null;
  const parseHotel = (body) => {
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 160) : "";
    const address = typeof body?.address === "string" ? body.address.trim().slice(0, 300) : "";
    const starRating = typeof body?.starRating === "string" ? body.starRating : "";
    const amount = parseMoney(body?.amount);
    if (!name || !address || !hotelStars.includes(starRating) || amount === null) return null;
    return { name, address, starRating, amount };
  };
  management.get("/hotels", requireAdmin, async (_req, res) => {
    const hotels = await db.collection("hotels").find({}, { projection: { name: 1, address: 1, starRating: 1, amount: 1, createdAt: 1, updatedAt: 1 } }).sort({ updatedAt: -1 }).limit(500).toArray();
    res.json({ hotels });
  });
  management.post("/hotels", requireAdmin, async (req, res) => {
    const hotel = parseHotel(req.body);
    if (!hotel) return res.status(400).json({ message: "Enter a valid hotel name, address, category and amount." });
    const now = new Date();
    const result = await db.collection("hotels").insertOne({ ...hotel, createdAt: now, updatedAt: now });
    res.status(201).json({ hotel: { _id: result.insertedId, ...hotel, createdAt: now, updatedAt: now } });
  });
  management.patch("/hotels/:id", requireAdmin, async (req, res) => {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ message: "Choose a valid hotel." });
    const hotel = parseHotel(req.body);
    if (!hotel) return res.status(400).json({ message: "Enter a valid hotel name, address, category and amount." });
    const updatedAt = new Date();
    const saved = await db.collection("hotels").findOneAndUpdate({ _id: new ObjectId(req.params.id) }, { $set: { ...hotel, updatedAt }, $unset: { gst: "" } }, { returnDocument: "after", projection: { name: 1, address: 1, starRating: 1, amount: 1, createdAt: 1, updatedAt: 1 } });
    if (!saved) return res.status(404).json({ message: "Hotel not found." });
    res.json({ message: "Hotel updated.", hotel: saved });
  });
  management.delete("/hotels/:id", requireAdmin, async (req, res) => {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ message: "Choose a valid hotel." });
    const result = await db.collection("hotels").deleteOne({ _id: new ObjectId(req.params.id) });
    if (!result.deletedCount) return res.status(404).json({ message: "Hotel not found." });
    res.status(204).send();
  });
  registerVoucherRoutes({ management, db, requireAdmin, config });
  registerEnquiryRoutes({ app, management, db, config, requireAdmin, ...enquirySystem });
  registerAccounts({ app, management, db, requireAdmin, config, sendPasswordReset, notifications: enquirySystem.notifications });
  const festivals = registerFestivalRoutes({ app, db, requireAdmin, config, schedulerOptions });
  registerPromotions({ app, management, db, requireAdmin });
  registerGstRoutes({ management, db, requireAdmin, realtime: enquirySystem.realtime });
  registerOfficeRoutes({ management, db, requireAdmin, realtime: enquirySystem.realtime });
  registerStaffRoutes({ management, db, requireAdmin, config });
  registerLetterRoutes({ management, db, requireAdmin, config });
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
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === "entity.parse.failed") return res.status(400).json({ message: "Invalid JSON request." });
    if (error.type === "entity.too.large") return res.status(413).json({ message: "This request is too large." });
    if (error.publicMessage && Number.isInteger(error.status)) {
      if (error.details?.retryAfter) res.set("Retry-After", String(error.details.retryAfter));
      return res.status(error.status).json({ message: error.message, ...error.details });
    }
    console.error("Request failed:", req.method, req.path, error.name, Number.isInteger(error.code) ? error.code : "");
    const unavailable = /^Mongo(?:Network|ServerSelection|TopologyClosed|NotConnected)/.test(error.name);
    res.status(unavailable ? 503 : 500).json({ message: "We couldn't complete your request. Please try again shortly." });
  });
  return { app, store, drainSessions, enquirySystem, decorationScheduler: festivals.scheduler, decorationsReady: festivals.ready };
}
